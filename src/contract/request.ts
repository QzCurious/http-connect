import type { StandardSchemaV1, StandardTypedV1 } from "@standard-schema/spec";
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

// Materialize interface properties for JSON's string index signature, including nested interfaces.
type JsonFields<T> = T extends
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  ? T
  : T extends object
    ? { [K in keyof T]: JsonFields<T[K]> }
    : T;

type BodySchemaFor<
  Key extends RequestEncoderKey,
  Schema extends StandardSchemaV1,
> = Key extends "json"
  ? [JsonFields<StandardSchemaV1.InferOutput<Schema>>] extends [RequestEncoderInputMap["json"]]
    ? Schema
    : StandardTypedV1<unknown, RequestEncoderInputMap["json"]>
  : StandardTypedV1<unknown, RequestEncoderInputMap[Key]>;

// Infer the intersection of schema requirements when more than one encoder is possible.
type ExpectedRequestBodySchema<Key extends RequestEncoderKey, Schema extends StandardSchemaV1> = (
  Key extends unknown ? (schema: BodySchemaFor<Key, Schema>) => void : never
) extends (schema: infer Expected) => void
  ? Expected
  : never;
