import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { EndpointContract } from "../contract/endpoint";
import type { RequestShape } from "../contract/request";
import { formatValidationIssues, type Prettify } from "../internal";

export type CallInput<Endpoint extends EndpointContract> = Endpoint extends unknown
  ? Prettify<PathInput<Endpoint["path"]> & RequestInput<Endpoint["request"]>>
  : never;

export type PathInput<Path extends EndpointContract["path"]> = Path extends {
  params: infer S extends StandardSchemaV1;
}
  ? { params: StandardSchemaV1.InferInput<S> }
  : {};

export type RequestInput<Request extends RequestShape> = Request extends unknown
  ? Prettify<QueryCallInput<Request> & HeadersCallInput<Request> & BodyCallInput<Request>>
  : never;

type QueryCallInput<Request extends RequestShape> = Request extends {
  query: StandardSchemaV1;
}
  ? { query: StandardSchemaV1.InferInput<Request["query"]> }
  : {};

type HeadersCallInput<Request extends RequestShape> = Request extends {
  headers: StandardSchemaV1;
}
  ? { headers: StandardSchemaV1.InferInput<Request["headers"]> }
  : {};

type BodyCallInput<Request extends RequestShape> = Request extends {
  body: StandardSchemaV1;
}
  ? { body: StandardSchemaV1.InferInput<Request["body"]> }
  : {};

/** A Call Input section failed Standard Schema validation before transport execution. */
export class CallInputValidationError extends Error {
  constructor(
    readonly section: "params" | "query" | "headers" | "body",
    readonly issues: readonly StandardSchemaV1.Issue[],
  ) {
    super(`Invalid call input for "${section}": ${formatValidationIssues(issues)}`);
    this.name = "CallInputValidationError";
  }
}
