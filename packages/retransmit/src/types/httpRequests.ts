import { HttpResponse, HttpRequest, HttpMethods } from ".";

/*
  RouteHandler Config
*/
export type HttpRouteConfig = {
  services: {
    [key: string]: HttpHandlerConfig;
  };
  onRequest?: (
    request: HttpRequest
  ) => Promise<
    | { handled: true; response: HttpResponse }
    | { handled: false; request: HttpRequest }
  >;
  onResponse?: (
    response: HttpResponse,
    request: HttpRequest
  ) => Promise<HttpResponse>;
  mergeResponses?: (
    responses: FetchedHttpHandlerResponse[],
    request: HttpRequest
  ) => Promise<FetchedHttpHandlerResponse[]>;
  genericErrors?: boolean;
  onError?: (
    responses: FetchedHttpHandlerResponse[],
    request: HttpRequest
  ) => any;
};

/*
  Result of Service Invocation
*/
export type InvokeServiceResult =
  | { skip: true }
  | { skip: false; response: FetchedHttpHandlerResponse };

/*
  Output of processMessage()
*/
export type FetchedHttpHandlerResponse = {
  type: "http" | "redis";
  id: string;
  service: string;
  time: number;
  path: string;
  method: HttpMethods;
  response: HttpResponse;
};

/*
  Http Requests and Responses for Redis-based Services
*/
export type RedisServiceHttpRequestBase = {
  id: string;
  request: HttpRequest;
};

export type RedisServiceHttpRequest = RedisServiceHttpRequestBase &
  (
    | {
        type: "request";
        responseChannel: string;
      }
    | {
        type: "rollback";
      }
  );

export type RedisServiceHttpResponse = {
  id: string;
  service: string;
  response: HttpResponse;
};

/*
  Service Configuration
*/
export type HttpHandlerConfigBase = {
  awaitResponse?: boolean;
  merge?: boolean;
  timeout?: number;
  mergeField?: string;
};

export type HttpServiceHttpHandlerConfig = {
  type: "http";
  url: string;
  rollbackUrl?: string;
  onRequest?: (
    request: HttpRequest
  ) => Promise<
    | {
        handled: true;
        response: HttpResponse;
      }
    | { handled: false; request: HttpRequest }
  >;
  onResponse?: (
    response: HttpResponse,
    request: HttpRequest
  ) => Promise<HttpResponse>;
  onRollbackRequest?: (
    request: HttpRequest
  ) => Promise<
    | {
        handled: true;
      }
    | { handled: false; request: HttpRequest }
  >;
  onError?: (response: HttpResponse | undefined, request: HttpRequest) => any;
} & HttpHandlerConfigBase;

export type RedisServiceHttpHandlerConfig = {
  type: "redis";
  requestChannel: string;
  numRequestChannels?: number;
  onRequest?: (
    request: RedisServiceHttpRequest
  ) => Promise<
    | {
        handled: true;
        response: HttpResponse;
      }
    | { handled: false; request: string }
  >;
  onResponse?: (
    response: string,
    request: HttpRequest
  ) => Promise<RedisServiceHttpResponse>;
  onRollbackRequest?: (
    request: RedisServiceHttpRequest
  ) => Promise<
    | {
        handled: true;
      }
    | { handled: false; request: string }
  >;
  onError?: (response: string | undefined, request: HttpRequest) => any;
} & HttpHandlerConfigBase;

export type HttpHandlerConfig =
  | RedisServiceHttpHandlerConfig
  | HttpServiceHttpHandlerConfig;
