import { path } from "./path";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { endpoint, type FormDataObject, type URLSearchParamsObject } from "../public";
import type { URLSearchParamsNativeInput } from "../codec/search-params";

const empty = { status: 204 } as const;

test("supports every encoder and native/project data, independent of media type", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.object({
        optional: z.string().optional(),
        nested: z.array(z.undefined().or(z.string())),
      }),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: { encodeAs: "json", body: z.object({}) },
    response: empty,
  });
  type Recursive = { value: string; children?: Recursive[] };
  interface RecursiveInterface {
    value: string;
    children?: RecursiveInterface[];
  }
  endpoint({
    method: "POST",
    path: path("/"),
    request: { encodeAs: "json", body: z.custom<RecursiveInterface>() },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: { encodeAs: "json", body: z.custom<Recursive>() },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-data",
      body: z.union([z.instanceof(FormData), z.custom<FormDataObject>()]),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-urlencoded",
      body: z.union([
        z.instanceof(URLSearchParams),
        z.custom<URLSearchParamsNativeInput>(),
        z.custom<URLSearchParamsObject>(),
      ]),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "binary",
      body: z.union([z.instanceof(Blob), z.instanceof(ArrayBuffer), z.instanceof(Uint8Array)]),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "stream",
      body: z.custom<ReadableStream<Uint8Array>>(),
    },
    response: empty,
  });
});

test("checks every output, rejecting uncertain and unsupported members", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `unknown` output leaves JSON compatibility unproven
      body: z.unknown(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `json` rejects unconstrained `any` output
      body: z.any(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `object` permits functions and other non-JSON values
      body: z.custom<object>(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `{}` permits non-nullish values such as `bigint`
      body: z.custom<{}>(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - a property typed as `any` leaves JSON compatibility unproven
      body: z.object({ value: z.any() }),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - an optional schema can output top-level `undefined`, which `json` rejects
      body: z.string().optional(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `json` rejects raw `bigint` schema output
      body: z.bigint(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `Date` output needs conversion to a JSON-compatible value
      body: z.date(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `json` rejects function-valued properties in schema output
      body: z.custom<{ callback: () => string }>(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      // @ts-expect-error - `text` requires string output from every union member
      body: z.union([z.string(), z.number()]),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "stream",
      // @ts-expect-error - `stream` requires `Uint8Array` chunks and rejects `ReadableStream<any>`
      body: z.custom<ReadableStream<any>>(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      // @ts-expect-error - an optional schema can output `undefined`, which `text` rejects
      body: z.string().optional(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "binary",
      // @ts-expect-error - `binary` requires `Blob`, `ArrayBuffer`, or `Uint8Array` output
      body: z.instanceof(DataView),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json" as "json" | "binary",
      // @ts-expect-error - `binary` is a possible encoder and rejects string output
      body: z.string(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: { encodeAs: "json", body: z.bigint().transform(String) },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.date().transform((value) => value.toISOString()),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      // @ts-expect-error - `text` rejects unconstrained `any` output
      body: z.any(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `json` rejects top-level `undefined` output
      body: z.undefined(),
    },
    response: empty,
  });
});

test("requires paired declarations, with no extension keys or callbacks", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - `contentType` is an unknown Request Shape field
      contentType: "text/plain",
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - `xml` is outside the built-in `encodeAs` key set
      encodeAs: "xml",
      body: z.string(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - `encodeAs` requires a built-in Request Encoder key
      encodeAs: () => "text",
      body: z.string(),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    // @ts-expect-error - `encodeAs` requires a `body` schema
    request: { encodeAs: "text" },
    response: empty,
  });
});

test("reserves Content-Type only for form-data", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-data",
      // @ts-expect-error - `form-data` generates `Content-Type` with its multipart boundary
      headers: z.object({ "CoNtEnT-TyPe": z.string() }),
      body: z.instanceof(FormData),
    },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: { headers: z.object({ "Content-Type": z.string() }) },
    response: empty,
  });
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      headers: z.object({ "CONTENT-TYPE": z.string() }),
      body: z.string(),
    },
    response: empty,
  });
});

test("checks nested recursive outputs without hiding unsafe subtypes", () => {
  type UnsafeTree = { child?: UnsafeTree & { unsupported: bigint } };
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `bigint` in the recursive subtype makes the JSON output invalid
      body: z.custom<UnsafeTree>(),
    },
    response: empty,
  });
  type UncertainTree = { child?: UncertainTree & { value: any } };
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      // @ts-expect-error - `any` in the recursive subtype leaves JSON compatibility unproven
      body: z.custom<UncertainTree>(),
    },
    response: empty,
  });
});

test("rejects reserved headers in every schema output alternative", () => {
  const headers = z.union([
    z.object({ ordinary: z.string() }),
    z.object({ "CONTENT-TYPE": z.string() }),
  ]);
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-data",
      body: z.instanceof(FormData),
      // @ts-expect-error - every header schema union member must omit `Content-Type` for `form-data`
      headers,
    },
    response: empty,
  });
});

test("preserves header input and output inference", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      headers: z.object({
        "Content-Type": z.literal("application/xml").default("application/xml"),
      }),
      body: z.string(),
    },
    response: empty,
  }).request;
  expectTypeOf<z.input<typeof shape.headers>>().toEqualTypeOf<{
    "Content-Type"?: "application/xml" | undefined;
  }>();
  expectTypeOf<z.output<typeof shape.headers>>().toEqualTypeOf<{
    "Content-Type": "application/xml";
  }>();
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      body: z.string(),
      // @ts-expect-error - `contentType` is an unknown Request Shape field even with a valid body
      contentType: "text/plain",
    },
    response: empty,
  });
});
