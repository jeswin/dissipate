import WebSocket from "ws";
import { WebSocketProxyConfig } from "../../../../types";
import { getPublisher } from "../../../../lib/redis/clients";
import { getChannelForService } from "../../../../lib/redis/getChannelForService";
import {
  RedisServiceWebSocketRequest,
  RedisServiceWebSocketMessageRequest,
  WebSocketMessageRequest,
} from "../../../../types/webSocketRequests";
import * as configModule from "../../../../config";
import { ActiveWebSocketConnection } from "../../activeConnections";
import respondToWebSocketClient from "../../respond";

export default async function sendToService(
  request: WebSocketMessageRequest,
  conn: ActiveWebSocketConnection,
  websocketConfig: WebSocketProxyConfig
) {
  const config = configModule.get();
  const routeConfig = websocketConfig.routes[request.route];

  const alreadyPublishedChannels: string[] = [];

  for (const service of Object.keys(routeConfig.services)) {
    const serviceConfig = routeConfig.services[service];

    if (serviceConfig.type === "redis") {
      const redisRequest: RedisServiceWebSocketMessageRequest = {
        ...request,
        responseChannel: `${serviceConfig.requestChannel}.${config.instanceId}`,
      };

      const requestChannel = getChannelForService(
        serviceConfig.requestChannel,
        serviceConfig.numRequestChannels
      );

      const onRequestResult = serviceConfig.onRequest
        ? await serviceConfig.onRequest(redisRequest)
        : { handled: false as false, request: redisRequest };

      if (onRequestResult.handled) {
        if (onRequestResult.response) {
          respondToWebSocketClient(request.id, onRequestResult.response, conn, websocketConfig);
        }
      } else {
        if (!alreadyPublishedChannels.includes(requestChannel)) {
          alreadyPublishedChannels.push(requestChannel);
          getPublisher().publish(
            requestChannel,
            JSON.stringify(onRequestResult.request)
          );
        }
      }
    }
  }
}
