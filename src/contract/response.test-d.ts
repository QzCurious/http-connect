import { path } from "./path";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { endpoint } from "./endpoint";
import type { ResponseShape } from "./response";

test("ResponseShape satisfies authoring requires body and decodeAs together", () => {
  const withoutBody = {
    status: 204,
    headers: z.object({ "x-request-id": z.string() }),
  } satisfies ResponseShape;

  const withBody = {
    status: 200,
    decodeAs: "json",
    body: z.object({ id: z.string() }),
  } satisfies ResponseShape;

  const decodeOnly = { status: 200, decodeAs: "json" };
  // @ts-expect-error - ResponseShape requires body with decodeAs
  decodeOnly satisfies ResponseShape;

  const bodyOnly = {
    status: 200,
    body: z.object({ ok: z.boolean() }),
  };
  // @ts-expect-error - ResponseShape requires decodeAs with body
  bodyOnly satisfies ResponseShape;

  expectTypeOf(withoutBody).toMatchTypeOf<ResponseShape>();
  expectTypeOf(withBody.decodeAs).toEqualTypeOf<"json">();
});

test("requires an exact HTTP status", () => {
  // @ts-expect-error - response status is required
  endpoint({ method: "GET", path: path("/"), request: {}, response: {} });

  // @ts-expect-error - response status must be in the HTTP status range
  endpoint({ method: "GET", path: path("/"), request: {}, response: { status: 600 } });

  const invalidStatus = { status: 600 };
  // @ts-expect-error - ResponseShape independently constrains its status
  invalidStatus satisfies ResponseShape;

  const shape = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: { status: 599 },
  }).response;

  expectTypeOf(shape.status).toEqualTypeOf<599>();
});

test("allows content-type inside headers", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: { status: 200, headers: z.object({ "Content-Type": z.string() }) },
  });
});

test("rejects extra top-level response keys", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      // @ts-expect-error - unknown response shape key
      extra: true,
    },
  });
});

test("allows transforming response header schemas", () => {
  const shape = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      headers: z.object({
        retryAfter: z.string().transform((value) => Number(value)),
      }),
    },
  }).response;

  expectTypeOf<z.output<typeof shape.headers>>().toEqualTypeOf<{
    retryAfter: number;
  }>();
});

test("rejects response header schemas with non-string input values", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      // @ts-expect-error - response headers must accept string or undefined values
      headers: z.object({ retryAfter: z.number() }),
    },
  });
});

test("rejects unsupported response decode keys", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      // @ts-expect-error - decodeAs is limited to built-in response decoding keys
      decodeAs: "csv",
      body: z.string(),
    },
  });
});

test("rejects incompatible built-in response body decoder input types", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      decodeAs: "text",
      // @ts-expect-error - text response bodies must accept string input
      body: z.object({ message: z.string() }),
    },
  });
});

test("allows blob response body input shapes", () => {
  const shape = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      decodeAs: "blob",
      body: z.instanceof(Blob),
    },
  }).response;

  expectTypeOf(shape.decodeAs).toEqualTypeOf<"blob">();
});

test("rejects incompatible blob response body input shapes", () => {
  endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      decodeAs: "blob",
      // @ts-expect-error - blob response bodies must accept Blob input
      body: z.string(),
    },
  });
});

test("allows response body transforms after decode", () => {
  const shape = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: {
      status: 200,
      decodeAs: "text",
      body: z.string().transform((value) => value.length),
    },
  }).response;

  expectTypeOf<z.output<typeof shape.body>>().toEqualTypeOf<number>();
});
