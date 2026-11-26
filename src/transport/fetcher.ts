import type { EndpointContract } from "../contract/endpoint";
import type { RequiredCodecs } from "../codec/codecs";
import type { CallInput } from "./call-input";
import { prepareRequest, type PreparedRequest } from "./prepare-request";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { DefinedField, Prettify } from "../internal";
import type { TransportConfig } from "./transport";
import { discardResponseBody, validateResponse } from "./validate-response";

export type FetchOptions = Omit<RequestInit, "method" | "headers" | "body" | "duplex">;

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

export type Fetcher<Endpoint extends EndpointContract> =
  KeysOfUnion<CallInput<Endpoint>> extends never
    ? (options?: FetchOptions) => Promise<RuntimeResult<Endpoint>>
    : (input: CallInput<Endpoint>, options?: FetchOptions) => Promise<RuntimeResult<Endpoint>>;

export function createFetcher<const Endpoint extends EndpointContract>(
  endpoint: Endpoint,
  {
    baseUrl,
    fetch,
    codecs,
  }: Required<TransportConfig> & { codecs: NoInfer<RequiredCodecs<Endpoint>> },
): Fetcher<Endpoint> {
  const { encoders = {}, decoders = {} } = codecs;
  const responseShapes = "status" in endpoint.response ? [endpoint.response] : endpoint.response;
  const shape = endpoint.request;
  const hasCallInput =
    endpoint.path.params !== undefined ||
    shape.query !== undefined ||
    shape.headers !== undefined ||
    shape.body !== undefined;

  async function fetcher(...rawArgs: unknown[]): Promise<RuntimeResult<Endpoint>> {
    const callInput = hasCallInput ? (rawArgs[0] as CallInput<Endpoint> | undefined) : undefined;
    const options = (hasCallInput ? rawArgs[1] : rawArgs[0]) as FetchOptions | undefined;

    const preparedRequest: PreparedRequest = await prepareRequest(endpoint, callInput);

    const url = new URL(preparedRequest.resolvedPath, baseUrl);
    if (preparedRequest.query && encoders.query) {
      url.search = encoders.query(preparedRequest.query).toString();
    }

    const headers = normalizeHeaders(preparedRequest);

    const encoder = preparedRequest.encodeAs && encoders[preparedRequest.encodeAs];
    const body = await encoder?.(preparedRequest.body as never);

    const init: RequestInit & { duplex?: "half" } = {
      ...options,
      method: preparedRequest.method,
      headers,
      body,
    };
    if (body instanceof ReadableStream) init.duplex = "half";

    const response = await fetch(new Request(url, init));

    try {
      for (const shape of responseShapes) {
        const result = await validateResponse({ shape, response, decoders });
        if (result !== undefined) return result as RuntimeResult<Endpoint>;
      }

      throw new UnknownResponseError(response.status);
    } finally {
      discardResponseBody(response);
    }
  }

  return fetcher as Fetcher<Endpoint>;
}

function normalizeHeaders(preparedRequest: PreparedRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(preparedRequest.headers ?? {})) {
    if (value === undefined) continue;
    if (preparedRequest.encodeAs === "form-data" && name.toLowerCase() === "content-type") {
      console.warn("Ignoring supplied Content-Type because Fetch generates the form-data boundary.");
      continue;
    }
    headers.set(name, String(value));
  }
  if (preparedRequest.encodeAs === "json" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

export type RuntimeResult<Endpoint extends EndpointContract = EndpointContract> = ResponseResult<
  Endpoint["response"]
>;

/** The observed HTTP response matched none of the declared Response Shapes. */
export class UnknownResponseError extends Error {
  constructor(readonly status: number) {
    super(`No declared response shape matched the response with status ${status}.`);
    this.name = "UnknownResponseError";
  }
}

type ResponseField<Shape, Name extends "headers" | "body"> =
  Shape extends Record<Name, StandardSchemaV1>
    ? DefinedField<Name, StandardSchemaV1.InferOutput<Shape[Name]>>
    : {};

type ResponseResult<
  Declaration extends EndpointContract["response"],
  Shape = Declaration extends readonly (infer Item)[] ? Item : Declaration,
> = Shape extends { status: number }
  ? Prettify<
      { status: Shape["status"] } & ResponseField<Shape, "headers"> & ResponseField<Shape, "body">
    >
  : never;
