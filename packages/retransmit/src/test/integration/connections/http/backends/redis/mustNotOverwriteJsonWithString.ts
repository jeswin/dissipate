import { TestAppInstance } from "../../../../../test";
import got from "got/dist/source";
import { createClient } from "redis";
import { startWithConfiguration } from "../../../../../..";
import random from "../../../../../../lib/random";
import { getResponse } from "../../../../../utils/http";
import { IAppConfig } from "../../../../../../types";

export default async function (app: TestAppInstance) {
  it(`must not overwrite json content with string content`, async () => {
    const config: IAppConfig = {
      instanceId: random(),
      http: {
        routes: {
          "/users": {
            POST: {
              services: {
                userservice: {
                  type: "redis" as "redis",
                  requestChannel: "input",
                },
                messagingservice: {
                  type: "redis" as "redis",
                  requestChannel: "input",
                },
              },
            },
          },
        },
        redis: {
          responseChannel: "output",
        },
      },
    };

    const servers = await startWithConfiguration(undefined, undefined, config);

    app.servers = servers;

    let subscriberCb: (channel: string, message: string) => void = (a, b) => {};

    const subscriber = createClient();
    subscriber.subscribe("input");
    subscriber.on("message", (c, m) => subscriberCb(c, m));

    let promisedInputMessage = new Promise<{
      channel: string;
      message: string;
    }>((success) => {
      subscriberCb = (channel, message) => success({ channel, message });
    });

    // Make the http request.
    const { port } = app.servers.httpServer.address() as any;

    const promisedServerRespose = got(`http://localhost:${port}/users`, {
      method: "POST",
      retry: 0,
    });

    const inputMessage = await promisedInputMessage;
    const redisInput = JSON.parse(inputMessage.message);

    const publisher = createClient();

    publisher.publish(
      redisInput.responseChannel,
      JSON.stringify({
        id: redisInput.id,
        service: "userservice",
        response: {
          content: {
            user: 1,
          },
        },
      })
    );

    publisher.publish(
      redisInput.responseChannel,
      JSON.stringify({
        id: redisInput.id,
        service: "messagingservice",
        response: {
          content: "Hello world",
        },
      })
    );

    const serverResponse = await getResponse(promisedServerRespose);
    serverResponse.statusCode.should.equal(500);
    serverResponse.body.should.equal(
      "messagingservice returned a response which will overwrite current response."
    );
  });
}
