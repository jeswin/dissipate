import { UserAppConfig } from "../../../types";

const config: UserAppConfig = {
  http: {
    routes: {
      "/users": {
        GET: {
          services: {
            userservice: {
              type: "http" as "http",
              url: "http://localhost:6666/users",
            },
          },
        },
      },
    },
  },
};

module.exports = config;
