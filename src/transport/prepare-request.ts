import type { RequestEncoderInputMap } from "../codec/codecs";
import { resolvePath } from "./resolve-path";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { URLSearchParamsObject } from "../codec/search-params";
import type { EndpointContract } from "../contract/endpoint";
import type { PathParamValue, ResolvedPath } from "../contract/path";
import type { RequestEncoderKey, RequestHeaders, RequestShape } from "../contract/request";
import type { Prettify } from "../internal";
import { CallInputValidationError, type CallInput } from "./call-input";

export async function prepareRequest<const Contract extends EndpointContract>(
  endpoint: Contract,
  callInput?: CallInput<Contract>,
): Promise<PreparedRequestFor<Contract>> {
  const shape = endpoint.request;
  const input = (callInput ?? {}) as Partial<
    Record<"params" | "query" | "headers" | "body", unknown>
  >;

  const resolvedPath = await resolvePath(endpoint.path, input.params);

  let query: URLSearchParamsObject | undefined;
  if (shape.query !== undefined) {
    const result = await shape.query["~standard"].validate(input.query);

    if (result.issues) {
      throw new CallInputValidationError("query", result.issues);
    }

    query = result.value as URLSearchParamsObject;
  }

  let headers: Record<string, string> | undefined;
  if (shape.headers !== undefined) {
    const result = await shape.headers["~standard"].validate(input.headers);

    if (result.issues) {
      throw new CallInputValidationError("headers", result.issues);
    }

    headers = Object.fromEntries(
      Object.entries(result.value as RequestHeaders)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name.toLowerCase(), String(value)]),
    );
  }

  let preparedBody: PreparedRequestBody = {};
  if (shape.body !== undefined) {
    const result = await shape.body["~standard"].validate(input.body);

    if (result.issues) {
      throw new CallInputValidationError("body", result.issues);
    }

    preparedBody = { encodeAs: shape.encodeAs, body: result.value } as PreparedRequestBody;
  }

  const preparedRequest: PreparedRequest = {
    method: endpoint.method,
    resolvedPath,
    ...(shape.query !== undefined ? { query } : {}),
    ...(shape.headers !== undefined ? { headers } : {}),
    ...preparedBody,
  };

  return preparedRequest as PreparedRequestFor<Contract>;
}

export type PreparedRequestFor<Contract extends EndpointContract> = Contract extends unknown
  ? ExactPreparedRequest<Contract, Contract["request"]>
  : never;

export type PreparedRequest = {
  readonly method: EndpointContract["method"];
  readonly resolvedPath: string;
  readonly query?: URLSearchParamsObject;
  readonly headers?: Readonly<Record<string, string>>;
} & PreparedRequestBody;

type PreparedRequestBody =
  | {
      readonly encodeAs: "form-data";
      readonly body: RequestEncoderInputMap["form-data"];
    }
  | {
      readonly encodeAs: "form-urlencoded";
      readonly body: RequestEncoderInputMap["form-urlencoded"];
    }
  | {
      readonly encodeAs: Exclude<RequestEncoderKey, "form-data" | "form-urlencoded">;
      readonly body: unknown;
    }
  | {
      readonly encodeAs?: never;
      readonly body?: never;
    };

type ExactPathParams<Path extends EndpointContract["path"]> = Path extends {
  params: StandardSchemaV1;
}
  ? Extract<StandardSchemaV1.InferOutput<Path["params"]>, Record<string, PathParamValue>>
  : never;

type ExactPreparedQuery<Request extends RequestShape> = Request extends {
  query: StandardSchemaV1;
}
  ? { query: StandardSchemaV1.InferOutput<Request["query"]> }
  : { query?: never };

type PreparedHeaders<Headers> = Prettify<
  {
    [K in keyof Headers as undefined extends Headers[K] ? never : Lowercase<K & string>]: string;
  } & {
    [K in keyof Headers as undefined extends Headers[K] ? Lowercase<K & string> : never]?: string;
  }
>;

type ExactPreparedHeaders<Request extends RequestShape> = Request extends {
  headers: StandardSchemaV1;
}
  ? { headers: PreparedHeaders<StandardSchemaV1.InferOutput<Request["headers"]>> }
  : { headers?: never };

type PreparedBodyForEncoding<Encoding, Output> = Encoding extends "form-data" | "form-urlencoded"
  ? { encodeAs: Encoding; body: unknown extends Output ? RequestEncoderInputMap[Encoding] : Output }
  : { encodeAs: Encoding; body: Output };

type ExactPreparedBody<Request extends RequestShape> = Request extends {
  body: StandardSchemaV1;
}
  ? PreparedBodyForEncoding<Request["encodeAs"], StandardSchemaV1.InferOutput<Request["body"]>>
  : { encodeAs?: never; body?: never };

type ExactPreparedRequest<
  Contract extends EndpointContract,
  Request extends RequestShape,
> = Prettify<
  {
    method: Contract["method"];
    resolvedPath: ResolvedPath<Contract["path"]["template"], ExactPathParams<Contract["path"]>>;
  } & ExactPreparedQuery<Request> &
    ExactPreparedHeaders<Request> &
    ExactPreparedBody<Request>
>;
