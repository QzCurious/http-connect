import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { RequestEncoderInputMap } from "../codec/codecs";
import type { URLSearchParamsValue } from "../codec/search-params";
import type {
  ExpectedObjectSchema,
  Invalid,
  IsUnion,
  NoExtraPropertiesConstraint,
  Prettify,
  StandardObjectSchema,
} from "../internal";

export type RequestEncoderKey = Prettify<keyof RequestEncoderInputMap>;

export type RequestShapeInput = {
  query?: StandardObjectSchema;
  headers?: StandardObjectSchema;
  encodeAs?: RequestEncoderKey;
  body?: StandardSchemaV1;
};

export type RequestShape = RequestShapeInput &
  ({ encodeAs?: never; body?: never } | { encodeAs: RequestEncoderKey; body: StandardSchemaV1 });

export function request<const Shape extends RequestShapeInput>(
  shape: Shape &
    (true extends IsUnion<Shape>
      ? Invalid<"Error: unions of Request Shapes are not supported.">
      : RequestShapeConstraint<Shape>),
): Readonly<Shape> {
  return shape;
}

export type RequestShapeConstraint<T extends RequestShapeInput> = [T] extends [RequestShape]
  ? NoExtraPropertiesConstraint<T, keyof RequestShape> &
      QueryRequestConstraint<T> &
      HeadersRequestConstraint<T> &
      BodyRequestConstraint<T>
  : RequestShape;

type QueryRequestConstraint<T extends RequestShape> = T extends {
  query: StandardObjectSchema;
}
  ? { query: ExpectedObjectSchema<T["query"], URLSearchParamsValue, unknown> }
  : {};

type RequestHeaderValue = Prettify<string | number | boolean | undefined>;

export type RequestHeaders = {
  readonly [name: string]: RequestHeaderValue;
};

type HeadersRequestConstraint<T extends RequestShape> = T extends {
  headers: StandardObjectSchema;
}
  ? {
      headers: ExpectedRequestHeaderSchema<
        T["headers"],
        T extends { encodeAs: infer Encoding } ? Encoding : never
      >;
    }
  : {};

type ExpectedRequestHeaderSchema<
  Schema extends StandardObjectSchema,
  Encoding,
> = ExpectedObjectSchema<Schema, RequestHeaderValue, unknown> &
  ("form-data" extends Encoding
    ? Extract<
        Lowercase<
          Extract<
            | KeysOfUnion<StandardSchemaV1.InferOutput<Schema>>
            | KeysOfUnion<StandardSchemaV1.InferInput<Schema>>,
            string
          >
        >,
        "content-type"
      > extends never
      ? unknown
      : Invalid<"Error: form-data generates its own Content-Type header.">
    : unknown);

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

type BodyRequestConstraint<T extends RequestShape> = T extends {
  encodeAs: RequestEncoderKey;
  body: StandardSchemaV1;
}
  ? { body: ExpectedRequestBodySchema<T["encodeAs"], T["body"]> }
  : {};

type ExpectedRequestBodySchema<Key extends RequestEncoderKey, Schema extends StandardSchemaV1> = [
  Key extends unknown ? SupportsEncoding<Key, StandardSchemaV1.InferOutput<Schema>> : never,
] extends [true]
  ? Schema
  : Invalid<`Error: all request body schema outputs must support "${Key}".`>;

type SupportsEncoding<Key extends RequestEncoderKey, Output> =
  false extends Certain<Output>
    ? false
    : Key extends "json"
      ? undefined extends Output
        ? false
        : false extends JsonCompatible<Output>
          ? false
          : true
      : [Output] extends [RequestEncoderInputMap[Key]]
        ? true
        : false;

// A subtype can add unsafe properties. Only an exact prior type is a recursive
// revisit; assignability to an ancestor is not enough to stop inspecting it.
type SeenType<T, Seen extends readonly unknown[]> = Seen extends readonly [
  infer Head,
  ...infer Tail,
]
  ? (<V>() => V extends T ? 1 : 2) extends <V>() => V extends Head ? 1 : 2
    ? true
    : SeenType<T, Tail>
  : false;

// Assignability alone admits any inside structured values. Inspect certainty
// separately, terminating on recursive types and treating native values as leaves.
type Certain<T, Seen extends readonly unknown[] = []> = 0 extends 1 & T
  ? false
  : unknown extends T
    ? false
    : T extends unknown
      ? SeenType<T, Seen> extends true
        ? true
        : T extends ReadableStream<infer Chunk>
          ? Certain<Chunk, [...Seen, T]>
          : T extends Blob | ArrayBuffer | Uint8Array | FormData | URLSearchParams
            ? true
            : T extends readonly (infer V)[]
              ? Certain<V, [...Seen, T]>
              : T extends object
                ? { [K in keyof T]-?: Certain<T[K], [...Seen, T]> }[keyof T]
                : true
      : never;

// Check properties structurally so interface-based schemas do not need an
// artificial string index signature. Optional/nested undefined stays supported.
type JsonCompatible<T, Seen extends readonly unknown[] = []> = T extends unknown
  ? SeenType<T, Seen> extends true
    ? true
    : T extends null | boolean | number | string | undefined
      ? true
      : T extends (...args: never[]) => unknown
        ? false
        : T extends readonly (infer Value)[]
          ? JsonCompatible<Value, [...Seen, T]>
          : T extends object
            ? keyof T extends never
              ? false
              : {
                  [K in keyof T]-?: JsonCompatible<T[K], [...Seen, T]>;
                }[keyof T]
            : false
  : never;
