import type {
  ExpectedObject,
  Invalid,
  IsUnion,
  NoExtraPropertiesConstraint,
  Prettify,
} from "../internal";
import type { PathShape } from "./path";
import type { RequestShape, RequestShapeConstraint, RequestShapeInput } from "./request";
import type { ResponseShape, ResponseShapeConstraint } from "./response";

export type HttpMethod = Prettify<"GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE">;

export interface EndpointContract {
  method: HttpMethod;
  path: PathShape;
  request: RequestShape;
  response: ResponseShape | readonly ResponseShape[];
}

/** Preserve the Request Shape and single or alternative Response Shapes. */
export function endpoint<
  // Infer each side independently so an invalid response cannot widen the request.
  const Method extends HttpMethod,
  const Path extends EndpointContract["path"],
  const Request extends RequestShapeInput,
  const Responses,
  const Contract extends {
    method: Method;
    path: Path;
    request: Request;
    // Retain independent response inference when the request is invalid and let
    // the per-item check supply expected types for invalid response fields.
    response: Extract<Responses, readonly []> extends never
      ? [Responses] extends [EndpointContract["response"]]
        ? Responses
        : EndpointContract["response"]
      : EndpointContract["response"] &
          Invalid<"Error: endpoint response must contain at least one response.">;
  },
>(
  contract: Contract &
    NoExtraPropertiesConstraint<Contract, keyof EndpointContract> & {
      method: Method;
      path: Path;
      request: true extends IsUnion<Request>
        ? Invalid<"Error: unions of Request Shapes are not supported.">
        : Request & RequestShapeConstraint<Request>;
      response: CheckedResponses<Responses>;
    },
): Readonly<Contract> {
  return contract;
}

type CheckedResponses<Responses> = Responses extends readonly unknown[]
  ? { [Key in keyof Responses]: CheckedResponseItem<Responses[Key]> }
  : CheckedResponseItem<Responses>;

// Keep direct inference for valid shapes (including unions). For invalid shapes,
// ExpectedObject supplies field expectations without intersecting invalid literals back in.
type CheckedResponseItem<T> = T extends ResponseShape
  ? T & ResponseShapeConstraint<T>
  : ExpectedObject<T, ResponseShape>;
