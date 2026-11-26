import type { ResponseDecoderOutputMap } from "../codec/codecs";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  ExpectedObjectSchema,
  Invalid,
  IsUnion,
  NoExtraPropertiesConstraint,
  Prettify,
  StandardObjectSchema,
} from "../internal";

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type StatusClassDigit = 1 | 2 | 3 | 4 | 5;

export type HttpStatusCode =
  `${StatusClassDigit}${Digit}${Digit}` extends `${infer Code extends number}` ? Code : never;

export type ResponseDecoderKey = Prettify<keyof ResponseDecoderOutputMap>;

type ResponseShapeInput = {
  status: HttpStatusCode;
  headers?: StandardObjectSchema;
  decodeAs?: ResponseDecoderKey;
  body?: StandardSchemaV1;
};

export type ResponseShape = ResponseShapeInput &
  ({ decodeAs?: never; body?: never } | { decodeAs: ResponseDecoderKey; body: StandardSchemaV1 });

export function response<const Shape extends ResponseShapeInput>(
  shape: Shape &
    (true extends IsUnion<Shape>
      ? Invalid<"Error: unions of Response Shapes are not supported.">
      : ResponseShapeConstraint<Shape>),
): Readonly<Shape> {
  return shape;
}

export type ResponseShapeConstraint<T extends ResponseShapeInput> = [T] extends [ResponseShape]
  ? NoExtraPropertiesConstraint<T, keyof ResponseShape> &
      HeadersResponseConstraint<T> &
      ResponseBodyConstraint<T>
  : ResponseShape;

type HeadersResponseConstraint<T extends ResponseShape> = T extends {
  headers: StandardObjectSchema;
}
  ? { headers: ExpectedResponseHeaderSchema<T["headers"]> }
  : {};

type ExpectedResponseHeaderSchema<Schema extends StandardObjectSchema> = ExpectedObjectSchema<
  Schema,
  unknown,
  string | undefined
>;

type ResponseBodyConstraint<T extends ResponseShape> = T extends {
  decodeAs: ResponseDecoderKey;
  body: StandardSchemaV1;
}
  ? { body: ExpectedResponseBodySchema<T["decodeAs"], T["body"]> }
  : {};

type ExpectedResponseBodySchema<
  DecodeAs extends string,
  Schema extends StandardSchemaV1,
> = DecodeAs extends keyof ResponseDecoderOutputMap
  ? StandardSchemaV1.InferInput<Schema> extends ResponseDecoderOutputMap[DecodeAs]
    ? Schema
    : Invalid<`Error: response body schema input is incompatible with "${DecodeAs}".`>
  : Schema;
