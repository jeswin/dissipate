import { TestAppInstance } from "../../../../";
import got from "got";
import { createClient } from "redis";
import { getResponse } from "../../../../../utils/http";
import { UserAppConfig } from "../../../../../../types";
import startTestApp from "../../../../startTestApp";

export default async function (app: TestAppInstance) {
  it(`must not overwrite json content with string content`, async () => {
    const config: UserAppConfig = {
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

    const appControl = await startTestApp({ config });

    app.appControl = appControl;

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
    const { port } = appControl;

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
          body: {
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
          body: "Hello world",
        },
      })
    );

    const serverResponse = await getResponse(promisedServerRespose);
    serverResponse.statusCode.should.equal(500);
    serverResponse.body.should.equal(
      "Cannot merge multiple types of content. messagingservice is returned a string response while the current response is an object."
    );
  });
}
