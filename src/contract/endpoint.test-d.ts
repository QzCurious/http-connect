import { path } from "./path";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { endpoint, type EndpointContract } from "./endpoint";
import { request } from "./request";
import { response, type ResponseShape } from "./response";
import type { CallInput } from "../transport/call-input";
import type { RuntimeResult } from "../transport/fetcher";

const getRequest = {};
const okResponse = { status: 200 } as const;

test("invalid native request fields preserve independent response inference", () => {
  const params = z.object({ id: z.string().transform(Number) });
  const inline = endpoint({
    method: "GET",
    path: path("/users/{id}", params),
    request: {
      // @ts-expect-error - an unknown encoder must not widen responses
      encodeAs: "jsonx",
    },
    response: [{ status: 200 }, { status: 404 }],
  });
  expectTypeOf(inline.response).toEqualTypeOf<
    [{ readonly status: 200 }, { readonly status: 404 }]
  >();
});

test("incomplete request bodies preserve request and response inference", () => {
  const params = z.object({ id: z.string() });
  const inline = endpoint({
    method: "GET",
    path: path("/users/{id}", params), // @ts-expect-error - the request object is missing encodeAs
    request: {
      body: z.undefined(),
    },
    response: [{ status: 200, decodeAs: "json", body: z.string() }, { status: 404 }],
  });
  expectTypeOf(inline.path.template).toEqualTypeOf<"/users/{id}">();
  expectTypeOf(inline.path.params).toEqualTypeOf<typeof params>();
  expectTypeOf(inline.response).toEqualTypeOf<
    [
      { readonly status: 200; readonly decodeAs: "json"; readonly body: z.ZodString },
      { readonly status: 404 },
    ]
  >();
});

test("rejects unions of individually valid inline Request Shapes", () => {
  const bodyless = { headers: z.object({}) } as const;
  const withBody = { ...bodyless, encodeAs: "text", body: z.string() } as const;
  const shape = {} as typeof bodyless | typeof withBody;

  // @ts-expect-error - unions of Request Shapes are not supported
  endpoint({ method: "GET", path: path("/users"), request: shape, response: okResponse });
});

test("accepts narrowed requests and schema unions in inline authoring", () => {
  const post = {
    encodeAs: "json",
    body: z.union([z.string(), z.number()]),
  } as const;
  const shape = {} as typeof getRequest | typeof post;

  // @ts-expect-error - unions of Request Shapes are not supported
  endpoint({ method: "GET", path: path("/users"), request: shape, response: okResponse });
  if (!("body" in shape)) {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: shape,
      response: okResponse,
    });
    expectTypeOf(contract.request).toEqualTypeOf<typeof getRequest>();
  } else {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: shape,
      response: okResponse,
    });
    expectTypeOf(contract.request).toEqualTypeOf<typeof post>();
  }
});

test("accepts single shapes and preserves their literals", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: okResponse,
  });
  expectTypeOf(contract).toMatchTypeOf<EndpointContract>();
  expectTypeOf(contract.request).toEqualTypeOf<typeof getRequest>();
  expectTypeOf(contract.response).toEqualTypeOf<typeof okResponse>();
});

test("preserves a single request and a tuple of response alternatives", () => {
  const postRequest = {
    encodeAs: "json",
    body: z.object({ name: z.string() }),
  } as const;
  const createdResponse = {
    status: 201,
    decodeAs: "json",
    body: z.object({ id: z.string() }),
  } as const;
  const contract = endpoint({
    method: "POST",
    path: path("/users"),
    request: postRequest,
    response: [okResponse, createdResponse],
  });
  expectTypeOf(contract.request).toEqualTypeOf<typeof postRequest>();
  expectTypeOf(contract.response).toEqualTypeOf<[typeof okResponse, typeof createdResponse]>();
});

test("accepts inline request and response shapes", () => {
  endpoint({
    method: "GET",
    path: path("/users/{id}", z.object({ id: z.string() })),
    request: {},
    response: [{ status: 200, decodeAs: "json", body: z.string() }, { status: 404 }],
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: {},
    response: { status: 204 },
  });
});

test("accepts readonly response tuples", () => {
  const responses = [okResponse] as const;
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: responses,
  });
  expectTypeOf(contract.request).toEqualTypeOf<typeof getRequest>();
  expectTypeOf(contract.response).toEqualTypeOf<typeof responses>();
});

test("requires one Request Shape and at least one Response Shape", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    // @ts-expect-error - request must be a single shape
    request: [getRequest],
    response: okResponse,
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - empty response tuple
    response: [],
  });
  const maybeEmpty = [] as readonly [] | readonly [typeof okResponse];
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - the empty member of a tuple union is invalid
    response: maybeEmpty,
  });
});

test("validates the inline request and every response alternative", () => {
  endpoint({
    method: "GET",
    // @ts-expect-error - params are required for the placeholder
    path: path("/users/{id}"),
    request: {},
    response: okResponse,
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - text decoding cannot feed a number schema
    response: [{ status: 200, decodeAs: "text", body: z.number() }],
  });
  endpoint({
    method: "GET",
    path: path("/"), // @ts-expect-error - unknown nested request property
    request: { extra: true },
    response: okResponse,
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - unknown nested response property
    response: [{ status: 200, extra: true }],
  });
  // @ts-expect-error - invalid status
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: { status: 600 } });
});

test("rejects extra endpoint keys", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: okResponse,
    // @ts-expect-error - unknown endpoint property
    extra: true,
  });
});

test("invalid response encoding preserves inline request inference", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/users"),
    request: {
      encodeAs: "json",
      body: z.object({ name: z.string() }),
    },
    response: {
      status: 201,
      // @ts-expect-error - report the invalid decoder on this field
      decodeAs: "xxx",
      body: z.string(),
    },
  });

  expectTypeOf(contract.method).toEqualTypeOf<"POST">();
  expectTypeOf(contract.path.template).toEqualTypeOf<"/users">();
  expectTypeOf(contract.request.encodeAs).toEqualTypeOf<"json">();
  expectTypeOf<z.input<typeof contract.request.body>>().toEqualTypeOf<{
    name: string;
  }>();
});

test("reports invalid inline array decoders on their fields", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: {},
    response: [
      { status: 200, decodeAs: "json", body: z.string() },
      {
        status: 404,
        // @ts-expect-error - target the decoder, not the element or response array
        decodeAs: "xxx",
        body: z.string(),
      },
      {
        status: 500,
        // @ts-expect-error - diagnose each invalid element independently
        decodeAs: "yyy",
        body: z.string(),
      },
    ],
  });
  expectTypeOf(contract.path.template).toEqualTypeOf<"/users">();
});

test("preserves exact inline response types and their schema inputs and outputs", () => {
  const body = z.string().transform((value) => value.length);
  const headers = z.object({ trace: z.string().optional() });
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: [{ status: 200, decodeAs: "text", body, headers }, { status: 204 }],
  });
  expectTypeOf(contract.response).toEqualTypeOf<
    [
      {
        readonly status: 200;
        readonly decodeAs: "text";
        readonly body: typeof body;
        readonly headers: typeof headers;
      },
      { readonly status: 204 },
    ]
  >();
  expectTypeOf<z.input<(typeof contract.response)[0]["body"]>>().toEqualTypeOf<string>();
  expectTypeOf<z.output<(typeof contract.response)[0]["body"]>>().toEqualTypeOf<number>();
});

test("preserves mutable and readonly response containers", () => {
  const tuple: [typeof okResponse] = [okResponse];
  expectTypeOf(
    endpoint({ method: "GET", path: path("/users"), request: getRequest, response: tuple })
      .response,
  ).toEqualTypeOf<typeof tuple>();
  const array: (typeof okResponse)[] = [okResponse];
  expectTypeOf(
    endpoint({ method: "GET", path: path("/users"), request: getRequest, response: array })
      .response,
  ).toEqualTypeOf<typeof array>();
  const readonlyArray: readonly (typeof okResponse)[] = array;
  expectTypeOf(
    endpoint({ method: "GET", path: path("/users"), request: getRequest, response: readonlyArray })
      .response,
  ).toEqualTypeOf<typeof readonlyArray>();
  const emptyArray: ResponseShape[] = [];
  expectTypeOf(
    endpoint({ method: "GET", path: path("/users"), request: getRequest, response: emptyArray })
      .response,
  ).toEqualTypeOf<typeof emptyArray>();
});

test("requires body and decoder together for single and alternative responses", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - body is required with a decoder
    response: { status: 200, decodeAs: "json" },
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - a body requires a decoder
    response: { status: 200, body: z.string() },
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: [
      { status: 204 },
      // @ts-expect-error - each alternative requires a body with its decoder
      { status: 200, decodeAs: "json" },
      // @ts-expect-error - each alternative requires a decoder with its body
      { status: 400, body: z.string() },
    ],
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: { status: 204, decodeAs: undefined, body: undefined },
  });
});

test("validates response schemas independently of structural inference", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: {
      status: 200,
      decodeAs: "text",
      // @ts-expect-error - text decoding cannot feed a number schema
      body: z.number(),
    },
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: [
      { status: 204 },
      {
        status: 200,
        decodeAs: "blob",
        // @ts-expect-error - blob decoding cannot feed a string schema
        body: z.string(),
      },
      {
        status: 201,
        // @ts-expect-error - headers must accept string values
        headers: z.object({ retryAfter: z.number() }),
      },
    ],
  });
  const invalidBody = {
    status: 200,
    decodeAs: "text",
    body: z.number(),
  } as const;
  // @ts-expect-error - passing a variable retains the schema constraint
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: invalidBody });
  const invalidArray: (typeof invalidBody)[] = [invalidBody];
  // @ts-expect-error - widened arrays retain each item's schema constraint
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: invalidArray });
});

test("validates single response keys and structure", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: {
      status: 204,
      // @ts-expect-error - unknown response key
      extra: true,
    },
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    // @ts-expect-error - status is required
    response: {},
  });
  endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: [
      okResponse,
      // @ts-expect-error - nested arrays are not Response Shapes
      [okResponse],
    ],
  });
});

test("invalid requests preserve independent response inference", () => {
  const contract = endpoint({
    method: "GET",
    // @ts-expect-error - placeholder requires params
    path: path("/users/{id}"),
    request: {},
    response: [{ status: 200, decodeAs: "text", body: z.string() }],
  });
  expectTypeOf(contract.response).toEqualTypeOf<
    [
      {
        readonly status: 200;
        readonly decodeAs: "text";
        readonly body: z.ZodString;
      },
    ]
  >();
  const invalidPath = endpoint({
    method: "GET",
    // @ts-expect-error - an invalid path must not widen responses
    path: 123,
    request: {},
    response: [{ status: 204 }],
  });
  expectTypeOf(invalidPath.response).toEqualTypeOf<[{ readonly status: 204 }]>();
});

test("preserves single response unions", () => {
  const shape = {} as typeof okResponse | { readonly status: 204 };
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: shape,
  });
  expectTypeOf(contract.response).toEqualTypeOf<typeof shape>();
  expectTypeOf(contract.response).toMatchTypeOf<ResponseShape>();
  const alternatives = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: [shape],
  });
  expectTypeOf(alternatives.response).toEqualTypeOf<[typeof shape]>();
});

test("preserves a union of single and array response forms", () => {
  const shape = {} as { readonly status: 204 } | readonly [typeof okResponse];
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: getRequest,
    response: shape,
  });
  expectTypeOf(contract.response).toEqualTypeOf<typeof shape>();
});

test("rejects unions containing invalid response alternatives", () => {
  const missingBody = {} as
    | typeof okResponse
    | {
        readonly status: 400;
        readonly decodeAs: "text";
      };
  // @ts-expect-error - a union must not drop its structurally invalid member
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: missingBody });
  const badBody = {} as
    | typeof okResponse
    | {
        readonly status: 400;
        readonly decodeAs: "text";
        readonly body: z.ZodNumber;
      };
  // @ts-expect-error - each member must satisfy its decoder's input constraint
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: badBody });
  const extraKey = {} as
    | typeof okResponse
    | {
        readonly status: 400;
        readonly extra: true;
      };
  // @ts-expect-error - each union member must satisfy exact-key validation
  endpoint({ method: "GET", path: path("/users"), request: getRequest, response: extraKey });
});

test("keeps all response constraints active beside an invalid decoder", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/users"),
    request: {
      encodeAs: "json",
      body: z.object({ name: z.string() }),
    },
    response: [
      { status: 204 },
      {
        status: 200,
        decodeAs: "text",
        // @ts-expect-error - response decoding constrains schema input
        body: z.number().transform(String),
      },
      {
        status: 400,
        // @ts-expect-error - decoder error must still describe allowed values
        decodeAs: "xml",
        body: z.string(),
      },
      {
        status: 404,
        // @ts-expect-error - response headers must accept string input values
        headers: z.object({ count: z.number() }),
      },
      {
        status: 500,
        // @ts-expect-error - exact-key validation remains independent
        extra: true,
      },
    ],
  });
  expectTypeOf(contract.method).toEqualTypeOf<"POST">();
  expectTypeOf(contract.path.template).toEqualTypeOf<"/users">();
  expectTypeOf<z.input<typeof contract.request.body>>().toEqualTypeOf<{
    name: string;
  }>();
});

test("schema transformations retain caller input and runtime output types", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/users"),
    request: {
      encodeAs: "text",
      body: z.number().transform(String),
    },
    response: [
      { status: 200, decodeAs: "text", body: z.string().transform(Number) },
      { status: 404 },
    ],
  });
  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    body: number;
  }>();
  expectTypeOf<RuntimeResult<typeof contract>>().toEqualTypeOf<
    { status: 200; body: number } | { status: 404 }
  >();
});

test("requires a method and path on the endpoint", () => {
  // @ts-expect-error - missing method
  endpoint({ path: path("/"), request: {}, response: okResponse });
  // @ts-expect-error - missing path
  endpoint({ method: "GET", request: {}, response: okResponse });
  endpoint({
    // @ts-expect-error - unsupported method
    method: "GTE",
    path: path("/"),
    request: {},
    response: okResponse,
  });
});

test("helpers return shallow readonly views of mutable drafts", () => {
  const requestDraft = { encodeAs: "text" as const, body: z.string() };
  const responseDraft: { status: 200 | 201 } = { status: 200 };
  const draft = {
    method: "POST" as const,
    path: path("/notes"),
    request: requestDraft,
    response: responseDraft,
  };

  const shape = request(requestDraft);
  const result = response(responseDraft);
  const contract = endpoint(draft);

  requestDraft.body = z.string().trim();
  responseDraft.status = 201;
  draft.method = "POST";
  contract.response.status = 200; // The endpoint helper is shallow.

  // @ts-expect-error - the path helper returns a readonly view
  draft.path.template = "/notes";
  // @ts-expect-error - the request helper returns a readonly view
  shape.body = requestDraft.body;
  // @ts-expect-error - the response helper returns a readonly view
  result.status = 201;
  // @ts-expect-error - the endpoint helper returns a readonly view
  contract.method = "POST";
});
