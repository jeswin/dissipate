import Koa = require("koa");
import bodyParser = require("koa-bodyparser");
import Router, { IRouterContext } from "koa-router";
import { IncomingMessage } from "http";
import { ServerResponse } from "http";
import {
  HttpMethods,
  HttpRequest,
  AppConfig,
  HttpServiceAppConfig,
} from "../../types";
import randomId from "../../utils/random";

import * as httpPlugin from "./plugins/http";
import * as redisPlugin from "./plugins/redis";

import mergeResponses from "./mergeResponses";
import responseIsError from "../../utils/http/responseIsError";

import {
  FetchedHttpRequestHandlerResponse,
  InvokeServiceResult,
  HttpRequestHandlerPlugin,
  HttpRequestHandlerConfig,
} from "../../types/http";
import applyRateLimiting from "../modules/rateLimiting";
import { copyHeadersFromContext } from "./copyHeadersFromContext";
import { sendResponse } from "./sendResponse";
import { getFromCache } from "./modules/caching";
import authenticate from "./modules/authentication";
import { isTripped } from "./modules/circuitBreaker";

const cors = require("@koa/cors");

const plugins: {
  [name: string]: HttpRequestHandlerPlugin;
} = {
  http: {
    init: httpPlugin.init,
    handleRequest: httpPlugin.handleRequest,
    rollback: httpPlugin.rollback,
  },
  redis: {
    init: redisPlugin.init,
    handleRequest: redisPlugin.handleRequest,
    rollback: redisPlugin.rollback,
  },
};

export type CreateHttpRequestHandler = (
  method: HttpMethods
) => (ctx: IRouterContext) => void;

export default async function init(config: AppConfig) {
  const koa = new Koa();

  if (config.cors) {
    koa.use(cors(config.cors));
  }

  koa.use(bodyParser());

  if (isHttpServiceAppConfig(config)) {
    // Load other plugins.
    if (config.http.plugins) {
      for (const pluginName of Object.keys(config.http.plugins)) {
        plugins[pluginName] = require(config.http.plugins[pluginName].path);
      }
    }

    for (const pluginName of Object.keys(plugins)) {
      await plugins[pluginName].init(config);
    }

    const router = new Router();

    for (const route of Object.keys(config.http.routes)) {
      const routeConfig = config.http.routes[route];

      if (routeConfig.GET) {
        router.get(route, createHandler(route, "GET", config));
      }

      if (routeConfig.POST) {
        router.post(route, createHandler(route, "POST", config));
      }

      if (routeConfig.PUT) {
        router.put(route, createHandler(route, "PUT", config));
      }

      if (routeConfig.DELETE) {
        router.del(route, createHandler(route, "DELETE", config));
      }

      if (routeConfig.PATCH) {
        router.patch(route, createHandler(route, "PATCH", config));
      }
    }

    koa.use(router.routes());
    koa.use(router.allowedMethods());
  }

  const koaRequestHandler = koa.callback();

  return function httpRequestHandler(
    req: IncomingMessage,
    res: ServerResponse
  ) {
    koaRequestHandler(req, res);
  };
}

function createHandler(route: string, method: HttpMethods, config: AppConfig) {
  return async function httpHandler(ctx: IRouterContext) {
    return await handler(ctx, route, method, config);
  };
}

async function handler(
  ctx: IRouterContext,
  route: string,
  method: HttpMethods,
  config: AppConfig
) {
  if (isHttpServiceAppConfig(config)) {
    const requestTime = Date.now();

    const originalRequest = makeHttpRequestFromContext(ctx);

    const requestId = randomId(32);

    const routeConfig = config.http.routes[route][method];

    const authConfig =
      routeConfig?.authentication || config.http.authentication;

    const authResponse = await authenticate(originalRequest, authConfig);
    if (authResponse) {
      sendResponse(
        ctx,
        route,
        method,
        requestTime,
        originalRequest,
        authResponse,
        routeConfig,
        config
      );
      return;
    }

    if (routeConfig) {
      const entryFromCache = await getFromCache(
        route,
        method,
        originalRequest,
        routeConfig,
        config
      );

      if (entryFromCache) {
        sendResponse(
          ctx,
          route,
          method,
          requestTime,
          originalRequest,
          entryFromCache,
          routeConfig,
          config,
          true
        );
        return;
      }

      const rateLimitedResponse = await applyRateLimiting(
        ctx.path,
        method,
        ctx.ip,
        routeConfig,
        config.http,
        config
      );

      if (rateLimitedResponse !== undefined) {
        const response = {
          status: rateLimitedResponse.status,
          body: rateLimitedResponse.body,
        };
        sendResponse(
          ctx,
          route,
          method,
          requestTime,
          originalRequest,
          response,
          routeConfig,
          config
        );
        return;
      }

      const circuitBreakerResponse = await isTripped(
        route,
        method,
        routeConfig,
        config
      );

      if (circuitBreakerResponse !== undefined) {
        const response = {
          status: circuitBreakerResponse.status,
          body: circuitBreakerResponse.body,
        };
        sendResponse(
          ctx,
          route,
          method,
          requestTime,
          originalRequest,
          response,
          routeConfig,
          config
        );
        return;
      }
    }

    // Are there custom handlers for the request?
    const onRequest = routeConfig?.onRequest || config.http.onRequest;

    const modResult = (onRequest && (await onRequest(originalRequest))) || {
      handled: false as false,
      request: originalRequest,
    };

    if (modResult.handled) {
      sendResponse(
        ctx,
        route,
        method,
        requestTime,
        originalRequest,
        modResult.response,
        routeConfig,
        config
      );
    } else {
      if (routeConfig) {
        const modifiedRequest = modResult.request;

        let stages: StageConfig[] = (function sortIntoStages() {
          const unsortedStages = Object.keys(routeConfig.services).reduce(
            (acc, serviceName) => {
              const serviceConfig = routeConfig.services[serviceName];
              const existingStage = acc.find(
                (x) => x.stage === serviceConfig.stage
              );
              if (!existingStage) {
                const newStage = {
                  stage: serviceConfig.stage,
                  services: {
                    [serviceName]: serviceConfig,
                  },
                };
                return acc.concat(newStage);
              } else {
                existingStage.services[serviceName] = serviceConfig;
                return acc;
              }
            },
            [] as StageConfig[]
          );

          return unsortedStages.sort(
            (x, y) => (x.stage || Infinity) - (y.stage || Infinity)
          );
        })();

        const validResponses = await invokeRequestHandling(
          requestId,
          modifiedRequest,
          route,
          method,
          stages,
          config
        );

        const fetchedResponses =
          (routeConfig.mergeResponses &&
            (await routeConfig.mergeResponses(
              validResponses,
              originalRequest
            ))) ||
          validResponses;

        let response = mergeResponses(fetchedResponses, config);

        if (responseIsError(response)) {
          const onError = routeConfig.onError || config.http.onError;
          if (onError) {
            onError(fetchedResponses, originalRequest);
          }
          for (const pluginName of Object.keys(plugins)) {
            plugins[pluginName].rollback(
              requestId,
              modifiedRequest,
              route,
              method,
              config
            );
          }
        }

        // Are there custom handlers for the response?
        const onResponse = routeConfig.onResponse || config.http.onResponse;
        const responseToSend =
          (onResponse && (await onResponse(response, originalRequest))) ||
          response;

        sendResponse(
          ctx,
          route,
          method,
          requestTime,
          originalRequest,
          responseToSend,
          routeConfig,
          config
        );
      }
    }
  }
}

type StageConfig = {
  stage: number | undefined;
  services: {
    [name: string]: HttpRequestHandlerConfig;
  };
};

async function invokeRequestHandling(
  requestId: string,
  modifiedRequest: HttpRequest,
  route: string,
  method: HttpMethods,
  stages: StageConfig[],
  config: HttpServiceAppConfig
) {
  function responseIsNotSkipped(
    x: InvokeServiceResult
  ): x is { skip: false; response: FetchedHttpRequestHandlerResponse } {
    return !x.skip;
  }

  let responses: FetchedHttpRequestHandlerResponse[] = [];

  for (const stage of stages) {
    let promises: Promise<InvokeServiceResult>[] = [];

    for (const pluginName of Object.keys(plugins)) {
      promises = promises.concat(
        plugins[pluginName].handleRequest(
          requestId,
          modifiedRequest,
          route,
          method,
          stage.stage,
          responses,
          stage.services,
          config
        )
      );
    }

    const allResponses = await Promise.all(promises);

    const validResponses = allResponses
      .filter(responseIsNotSkipped)
      .map((x) => x.response);

    for (const response of validResponses) {
      responses.push(response);
    }
  }

  return responses;
}

function isHttpServiceAppConfig(
  config: AppConfig
): config is HttpServiceAppConfig {
  return typeof config.http !== "undefined";
}

function makeHttpRequestFromContext(ctx: IRouterContext): HttpRequest {
  return {
    path: ctx.path,
    method: ctx.method as HttpMethods,
    params: ctx.params,
    query: ctx.query,
    body: ctx.method === "GET" ? undefined : ctx.request.body,
    headers: copyHeadersFromContext(ctx.headers),
    remoteAddress: ctx.ip, // This handles 'X-Forwarded-For' etc.
    remotePort: ctx.req.socket.remotePort,
  };
}
