import { WebSocketProxyConfig } from "../../../../types";
import {
  RedisServiceWebSocketHandlerConfig,
  WebSocketDisconnectRequest,
} from "../../../../types/webSocketRequests";
import { getPublisher } from "../../../../lib/redis/clients";
import { getChannelForService } from "../../../../lib/redis/getChannelForService";
import { ActiveWebSocketConnection } from "../../activeConnections";

export default async function disconnect(
  requestId: string,
  conn: ActiveWebSocketConnection,
  serviceConfig: RedisServiceWebSocketHandlerConfig,
  websocketConfig: WebSocketProxyConfig
) {
  const channel = getChannelForService(
    serviceConfig.requestChannel,
    serviceConfig.numRequestChannels
  );

  const request: WebSocketDisconnectRequest = {
    id: requestId,
    route: conn.route,
    type: "disconnect",
  };

  const onRequestResult = serviceConfig.onRequest
    ? await serviceConfig.onRequest(request)
    : { handled: false as false, request: JSON.stringify(request) };

  if (!onRequestResult.handled) {
    getPublisher().publish(channel, onRequestResult.request);
  }
}
