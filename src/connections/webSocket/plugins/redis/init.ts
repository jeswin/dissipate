import redis = require("redis");
import processMessage from "./processMessage";
import { AppConfig } from "../../../../types";
import { init as initPublisher } from "./publish";

let subscriber: redis.RedisClient;

export default async function init(config: AppConfig) {
  if (config.webSocket?.redis) {
    subscriber = redis.createClient(config.redis?.options);

    subscriber.on("message", processMessage(config.webSocket));
    subscriber.subscribe(
      `${config.webSocket.redis.responseChannel}.${config.instanceId}`
    );

    initPublisher(config);
  }
}
