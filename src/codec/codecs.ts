import type { JsonValue } from "../internal";
import type { EndpointContract } from "../contract/endpoint";
import { toFormData, type FormDataObject } from "./form-data";
import {
  toURLSearchParams,
  type URLSearchParamsNativeInput,
  type URLSearchParamsObject,
} from "./search-params";

export type RequestEncoderInputMap = {
  json: JsonValue;
  text: string;
  "form-data": FormData | FormDataObject;
  "form-urlencoded": URLSearchParams | URLSearchParamsNativeInput | URLSearchParamsObject;
  binary: Blob | ArrayBuffer | Uint8Array;
  stream: ReadableStream<Uint8Array>;
};

type RequestEncoderOutputMap = {
  json: string;
  text: string;
  "form-data": FormData;
  "form-urlencoded": URLSearchParams;
  binary: Blob | ArrayBuffer;
  stream: ReadableStream<Uint8Array>;
};

export type ResponseDecoderOutputMap = {
  json: unknown;
  text: string;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  bytes: Uint8Array;
  formData: FormData;
};

type MaybePromise<T> = T | Promise<T>;

type Encoders = { query: (query: URLSearchParamsObject) => URLSearchParams } & {
  [K in keyof RequestEncoderInputMap]: (
    value: RequestEncoderInputMap[K],
  ) => MaybePromise<RequestEncoderOutputMap[K]>;
};
type Decoders = {
  [K in keyof ResponseDecoderOutputMap]: (
    response: Response,
  ) => MaybePromise<ResponseDecoderOutputMap[K]>;
};

export type Codecs = {
  encoders?: Partial<Encoders>;
  decoders?: Partial<Decoders>;
};

export const codecs = {
  encoders: {
    query: toURLSearchParams,
    json: (value) => JSON.stringify(value),
    text: (value) => value,
    "form-data": toFormData,
    "form-urlencoded": toURLSearchParams,
    binary: (value) => (value instanceof Uint8Array ? Uint8Array.from(value).buffer : value),
    stream: (value) => value,
  },
  decoders: {
    json: (response) => response.json() as Promise<unknown>,
    text: (response) => response.text(),
    blob: (response) => response.blob(),
    arrayBuffer: (response) => response.arrayBuffer(),
    bytes: async (response) => new Uint8Array(await response.arrayBuffer()),
    formData: (response) => response.formData(),
  },
} satisfies { encoders: Encoders; decoders: Decoders };

type ElementOrSelf<T> = T extends readonly (infer Item)[] ? Item : T;
type RequiredProperty<T, P extends PropertyKey> =
  T extends Record<P, infer Key extends PropertyKey> ? Key : never;

type EndpointEncoders<E extends EndpointContract> = Pick<
  Encoders,
  | RequiredProperty<E["request"], "encodeAs">
  | (E["request"] extends EndpointContract["request"] & { query?: undefined } ? never : "query")
>;

type ResponseDecoders<Shapes extends EndpointContract["response"]> = Pick<
  Decoders,
  RequiredProperty<ElementOrSelf<Shapes>, "decodeAs">
>;

// A registration covers a key only if every possible registration provides it.
type CodecOverrides<Needed, Available> = Partial<Needed> & {
  [K in keyof Needed as [Available] extends [Pick<Needed, K>] ? never : K]: Needed[K];
};

// Omit empty groups and require a group only when it has required members.
type CodecField<Name extends string, Value> = keyof Value extends never
  ? {}
  : {} extends Value
    ? { [K in Name]?: Value }
    : { [K in Name]: Value };

/** Endpoint-specific overrides, with registrations missing from defaults required. */
export type RequiredCodecs<
  Endpoint extends EndpointContract,
  Defaults extends Codecs = {},
> = CodecField<"encoders", CodecOverrides<EndpointEncoders<Endpoint>, Defaults["encoders"]>> &
  CodecField<
    "decoders",
    CodecOverrides<ResponseDecoders<Endpoint["response"]>, Defaults["decoders"]>
  >;

type FetcherOptions<Overrides> = keyof Overrides extends never
  ? []
  : {} extends Overrides
    ? [options?: { codecs?: Overrides }]
    : [options: { codecs: Overrides }];

export type CodecOptions<
  Endpoint extends EndpointContract,
  Defaults extends Codecs,
> = FetcherOptions<RequiredCodecs<Endpoint, Defaults>>;
