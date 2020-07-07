import { HttpRequest, HttpRequestBodyEncoding } from "../../types";
import { Options } from "got/dist/source/core";

export function makeGotOptions(
  request: HttpRequest,
  encoding: HttpRequestBodyEncoding | undefined,
  timeout?: number
): Options {
  const basicOptions = {
    searchParams: request.query,
    method: request.method,
    headers: request.headers,
    followRedirect: false,
    retry: 0,
    timeout,
  };

  const options =
    typeof request.body === "string"
      ? {
          ...basicOptions,
          body: request.body,
        }
      : typeof request.body === "object"
      ? encoding === "application/x-www-form-urlencoded"
        ? {
            ...basicOptions,
            form: request.body,
          }
        : {
            ...basicOptions,
            json: request.body,
          }
      : basicOptions;

  return options;
}
