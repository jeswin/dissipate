import "mocha";
import "should";
import WebSocket from "ws";

import httpHttpMethods from "./backends/http/httpMethods";
import httpMergeResults from "./backends/http/mergeResults";
import httpDontMergeIgnored from "./backends/http/dontMergeIgnored";
import httpMustNotOverwriteJsonWithString from "./backends/http/mustNotOverwriteJsonWithString";
import httpRollsback from "./backends/http/rollsback";

import redisHttpMethods from "./backends/redis/httpMethods";
import redisMergeResults from "./backends/redis/mergeResults";
import redisDontMergeIgnored from "./backends/redis/dontMergeIgnored";
import redisShowGenericErrors from "./backends/redis/showGenericErrors";
import redisMustNotOverwriteJsonWithString from "./backends/redis/mustNotOverwriteJsonWithString";
import redisRollsback from "./backends/redis/rollsback";

import { Server } from "http";
import { TestAppInstance } from "../../../test";

export default function run(app: TestAppInstance) {
  describe("Http connections (integration)", () => {
    describe("http", () => {
      httpDontMergeIgnored(app);
      httpHttpMethods(app);
      httpMergeResults(app);
      httpMustNotOverwriteJsonWithString(app);
      httpRollsback(app);
    });

    describe("redis", () => {
      redisDontMergeIgnored(app);
      redisHttpMethods(app);
      redisMergeResults(app);
      redisMustNotOverwriteJsonWithString(app);
      redisRollsback(app);
      redisShowGenericErrors(app);
    });
  });
}
