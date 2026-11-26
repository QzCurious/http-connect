import { codecs } from "../public";
import type { RequiredCodecs } from "../codec/codecs";
import { path } from "../contract/path";
import { expectTypeOf, test, vi } from "vitest";
import { z } from "zod";
import { endpoint, type EndpointContract } from "../contract/endpoint";
import { type HttpStatusCode } from "../contract/response";
import { createFetcher, type FetchOptions, type Fetcher } from "./fetcher";
import type { PreparedRequestFor } from "./prepare-request";
import { createTransport } from "./transport";

function createTestTransport() {
  return createTransport({
    codecs,
    baseUrl: "https://api.example.com",
    fetch: vi.fn() as unknown as typeof fetch,
  });
}

test("requires the decoders for every declared response alternative", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/value"),
    request: {},
    response: [
      { status: 200, decodeAs: "json", body: z.number() },
      { status: 400, decodeAs: "text", body: z.string() },
      { status: 204 },
    ],
  });
  const config = { baseUrl: "https://example.com", fetch: vi.fn<() => Promise<Response>>() };
  createFetcher(contract, {
    ...config,
    codecs: { decoders: { json: codecs.decoders.json, text: codecs.decoders.text } },
  });
  // @ts-expect-error - the 400 response also requires a text decoder.
  createFetcher(contract, { ...config, codecs: { decoders: { json: codecs.decoders.json } } });
});

test("infers codec requirements across possible endpoints", () => {
  const write = endpoint({
    method: "POST",
    path: path("/value"),
    request: { encodeAs: "text", body: z.string(), query: z.object({ tag: z.string() }) },
    response: { status: 204 },
  });
  const read = endpoint({
    method: "GET",
    path: path("/value"),
    request: {},
    response: { status: 200, decodeAs: "json", body: z.number() },
  });
  type Required = RequiredCodecs<typeof write | typeof read>;
  const registrations = {
    encoders: { query: codecs.encoders.query, text: codecs.encoders.text },
    decoders: { json: codecs.decoders.json },
  } satisfies Required;
  const missingQuery: Required = {
    // @ts-expect-error - the write endpoint requires a query encoder.
    encoders: { text: codecs.encoders.text },
    decoders: registrations.decoders,
  };
});

test("rejects unknown fetcher binding options", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/health"),
    request: {},
    response: { status: 204 },
  });

  // @ts-expect-error - unknown binding option
  createTestTransport().createFetcher(contract, { extra: true });
});

test("does not require call input when the endpoint declares no sections", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/health"),
      request: {},
      response: { status: 204 },
    }),
  );

  expectTypeOf(fetcher.prepare).parameters.toEqualTypeOf<[]>();
  expectTypeOf(fetcher.prepare).returns.resolves.toEqualTypeOf<{
    method: "GET";
    resolvedPath: "/health";
    query?: never;
    headers?: never;
    encodeAs?: never;
    body?: never;
  }>();
  expectTypeOf<Extract<Awaited<ReturnType<typeof fetcher>>, Error>>().toEqualTypeOf<never>();
  expectTypeOf<Parameters<typeof fetcher>>().toEqualTypeOf<[options?: FetchOptions]>();
});

test("requires call input when the endpoint declares sections", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/users/{id}", z.object({ id: z.string() })),
      request: {},
      response: { status: 200 },
    }),
  );

  expectTypeOf(fetcher.prepare).parameters.toEqualTypeOf<[input: { params: { id: string } }]>();
  type Prepared = Awaited<ReturnType<typeof fetcher.prepare>>;
  expectTypeOf<Prepared>().toEqualTypeOf<{
    method: "GET";
    resolvedPath: `/users/${string}`;
    query?: never;
    headers?: never;
    encodeAs?: never;
    body?: never;
  }>();
  expectTypeOf(fetcher.execute).toBeCallableWith({ method: "GET", resolvedPath: "/users/1" });
  expectTypeOf(fetcher.execute).returns.toEqualTypeOf<ReturnType<typeof fetcher>>();
  expectTypeOf<Parameters<typeof fetcher>>().toEqualTypeOf<
    [input: { params: { id: string } }, options?: FetchOptions]
  >();
});

test("a generic fetcher can execute its prepared request", () => {
  function replay<E extends EndpointContract>(
    fetcher: Fetcher<E>,
    prepared: PreparedRequestFor<E>,
  ) {
    return fetcher.execute(prepared);
  }
  expectTypeOf(replay).toBeFunction();
});

test("execute accepts only sections declared by the receiving endpoint", async () => {
  const route = { method: "POST", path: path("/search"), response: { status: 204 } } as const;
  const transport = createTestTransport();
  const plain = transport.createFetcher(endpoint({ ...route, request: {} }));
  const withBody = endpoint({
    ...route,
    request: { encodeAs: "json", body: z.object({ term: z.string() }) },
  });
  const withQuery = endpoint({ ...route, request: { query: z.object({ term: z.string() }) } });
  const withHeaders = endpoint({ ...route, request: { headers: z.object({ lang: z.string() }) } });

  const body = await transport.createFetcher(withBody).prepare({ body: { term: "cats" } });
  const query = await transport.createFetcher(withQuery).prepare({ query: { term: "cats" } });
  const headers = await transport.createFetcher(withHeaders).prepare({ headers: { lang: "en" } });
  plain.execute({ method: "POST", resolvedPath: "/search" });
  // @ts-expect-error - the receiving endpoint declares no body or encoding
  plain.execute(body);
  // @ts-expect-error - the receiving endpoint declares no query
  plain.execute(query);
  // @ts-expect-error - the receiving endpoint declares no headers
  plain.execute(headers);

  const either = transport.createFetcher(Math.random() < 0.5 ? withBody : withQuery);
  either.execute(body);
  either.execute(query);
  const combined = { ...body, ...query };
  // @ts-expect-error - neither endpoint declares both sections
  either.execute(combined);
});

test("requires call input when declared section values may be undefined", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "POST",
      path: path("/users"),
      request: {
        encodeAs: "json",
        body: z
          .object({ name: z.string() })
          .optional()
          .transform((value) => value ?? null),
      },
      response: { status: 204 },
    }),
  );

  expectTypeOf<Parameters<typeof fetcher>>().toEqualTypeOf<
    [input: { body: { name: string } | undefined }, options?: FetchOptions]
  >();
  fetcher({ body: undefined });
  // @ts-expect-error - accepting undefined does not make a declared section optional
  fetcher({});
  // @ts-expect-error - a declared section still requires the input argument
  fetcher();
});

test.each(["GET", "HEAD"] as const)("rejects a %s body at fetcher creation", (method) => {
  createTestTransport().createFetcher(
    // @ts-expect-error - GET or HEAD with a body is fetch-incompatible.
    endpoint({
      method,
      path: path("/users"),
      request: {
        encodeAs: "json",
        body: z.object({ id: z.string() }),
      },
      response: { status: 200 },
    }),
  );
});

test("runtime results do not expose preparedRequest publicly", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/users"),
      request: {},
      response: { status: 200 },
    }),
  );

  type Result = Awaited<ReturnType<typeof fetcher>>;
  type HasPreparedRequest = "preparedRequest" extends keyof Result ? true : false;

  expectTypeOf<HasPreparedRequest>().toEqualTypeOf<false>();
});

test("fetcher input uses request-schema input while defined response uses response-schema output", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/users"),
      request: {
        headers: z.object({
          retryAfter: z.string().transform((value) => Number(value)),
        }),
      },
      response: {
        status: 200,
        headers: z.object({
          retryAfter: z.string().transform((value) => Number(value)),
        }),
      },
    }),
  );

  type Params = Parameters<typeof fetcher>;
  type Result = Awaited<ReturnType<typeof fetcher>>;
  expectTypeOf<Extract<Awaited<ReturnType<typeof fetcher>>, Error>>().toEqualTypeOf<never>();
  type Success = Extract<Result, { status: 200 }>;

  expectTypeOf<Params>().toEqualTypeOf<
    [input: { headers: { retryAfter: string } }, options?: FetchOptions]
  >();

  expectTypeOf<Success["headers"]>().toEqualTypeOf<{ retryAfter: number }>();
});

test("defined response status types are exact declared statuses", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/users"),
      request: {},
      response: [{ status: 200 }, { status: 404 }],
    }),
  );

  type Result = Awaited<ReturnType<typeof fetcher>>;
  type Ok = Extract<Result, { status: 200 }>;
  type NotFound = Extract<Result, { status: 404 }>;
  type Created = Extract<Result, { status: 201 }>;

  expectTypeOf<Ok["status"]>().toEqualTypeOf<200>();
  expectTypeOf<NotFound["status"]>().toEqualTypeOf<404>();
  expectTypeOf<Created>().toEqualTypeOf<never>();
});

test("requires proof of Fetch compatibility for every endpoint alternative", () => {
  const transport = createTestTransport();
  function bind(method: "GET" | "POST", choice: boolean) {
    const withBody = endpoint({
      method: "POST",
      path: path("/"),
      request: { encodeAs: "text", body: z.string() },
      response: { status: 200 },
    });
    const withoutBody = endpoint({
      method,
      path: path("/"),
      request: {},
      response: { status: 204 },
    });
    transport.createFetcher(choice ? withBody : withoutBody);
    const maybeGetWithBody = endpoint({
      method,
      path: path("/"),
      request: withBody.request,
      response: withBody.response,
    });
    // @ts-expect-error - this authored contract could pair GET with a body.
    transport.createFetcher(maybeGetWithBody);
    // @ts-expect-error - one authored alternative could pair GET with a body.
    transport.createFetcher(choice ? withoutBody : maybeGetWithBody);

    const widenedPost: EndpointContract & { method: "POST" } = withBody;
    transport.createFetcher(widenedPost);
    const widened: EndpointContract = choice ? withBody : withoutBody;
    // @ts-expect-error - widening removes the proof that every GET is bodyless.
    transport.createFetcher(widened);
  }
});

test("widened endpoint contracts retain defined response statuses", () => {
  const contract: EndpointContract & { method: "POST" } = endpoint({
    method: "POST",
    path: path("/users"),
    request: {},
    response: { status: 200 },
  });
  const fetcher = createTestTransport().createFetcher(contract);

  type Result = Awaited<ReturnType<typeof fetcher>>;

  expectTypeOf<Extract<Awaited<ReturnType<typeof fetcher>>, Error>>().toEqualTypeOf<never>();
  expectTypeOf<Result>().not.toEqualTypeOf<never>();
  expectTypeOf<Result["status"]>().toEqualTypeOf<HttpStatusCode>();
});

test("checks body values, undeclared sections, and transport options", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "POST",
      path: path("/"),
      request: {
        encodeAs: "json",
        body: z.string(),
      },
      response: { status: 204 },
    }),
  );
  // @ts-expect-error - a declared body requires Call Input
  fetcher();
  // @ts-expect-error - a declared body section is required
  fetcher({});
  fetcher({ body: "hello" }, { signal: AbortSignal.abort() });
  // @ts-expect-error - body values must satisfy the schema input
  fetcher({ body: 123 });
  // @ts-expect-error - undefined is not accepted by this body schema
  fetcher({ body: undefined });
  // @ts-expect-error - an undeclared query section cannot be supplied
  fetcher({ body: "hello", query: {} });
  const wrongBody = { body: 123 };
  // @ts-expect-error - variables retain their visible section types
  fetcher(wrongBody);
  // @ts-expect-error - transport options keep their own type in the second argument
  fetcher({ body: "hello" }, { signal: "aborted" });
});

test("checks extra sections on inline Call Input literals", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: { query: z.object({}) },
      response: { status: 204 },
    }),
  );

  fetcher({ query: {} });
  // @ts-expect-error - a body key is present even when its value is undefined
  fetcher({ query: {}, body: undefined });
  // @ts-expect-error - body is not a declared section
  fetcher({ query: {}, body: "hello" });
  // @ts-expect-error - undefined does not make an undeclared headers key absent
  fetcher({ query: {}, headers: undefined });
  // @ts-expect-error - fixed request facts are not Call Input sections
  fetcher({ query: {}, method: "GET" });

  const mixed = { query: {}, body: "hello" };
  fetcher(mixed);
  const optionalBody: { query: {}; body?: undefined } = { query: {} };
  fetcher(optionalBody);
});

test("checks every member of Call Input unions", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: {
        query: z.union([z.object({ search: z.string() }), z.object({ page: z.number() })]),
      },
      response: { status: 204 },
    }),
  );

  const valid = {} as { query: { search: string } } | { query: { page: number } };
  fetcher(valid);
  const withExtraSection = {} as
    | { query: { search: string } }
    | { query: { page: number }; body: undefined };
  fetcher(withExtraSection);
  const mixed = {} as { query: { search: string } } | { query: { page: string } };
  // @ts-expect-error - every union member must satisfy the schema input
  fetcher(mixed);
});

test("keeps every declared section required even when its value can be undefined", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "POST",
      path: path("/"),
      request: {
        query: z.object({}),
        encodeAs: "text",
        body: z
          .string()
          .optional()
          .transform((value) => value ?? ""),
      },
      response: { status: 204 },
    }),
  );

  fetcher({ query: {}, body: "hello" });
  fetcher({ query: {}, body: undefined });
  // @ts-expect-error - declaring an optional body still requires its section
  fetcher({ query: {} });
  // @ts-expect-error - declaring a query still requires its section
  fetcher({ body: undefined });
  // @ts-expect-error - supplied values must conform to their schemas
  fetcher({ query: {}, body: 123 });
});

test("uses native excess property checks inside inline schema values", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: {
        query: z.object({ search: z.string() }),
      },
      response: { status: 204 },
    }),
  );

  fetcher({
    query: {
      search: "hello",
      // @ts-expect-error - inline query values use the schema's input type
      extra: true,
    },
  });
  const input = { query: { search: "hello", extra: true } };
  fetcher(input);
});

test("preserves contextual types for schema input callbacks", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "POST",
      path: path("/"),
      request: {
        encodeAs: "text",
        body: z
          .custom<(value: string) => number>()
          .transform((callback) => String(callback("hello"))),
      },
      response: { status: 204 },
    }),
  );

  fetcher({
    body: (value) => {
      expectTypeOf(value).toEqualTypeOf<string>();
      return value.length;
    },
  });
});

test("preserves discriminant literal inference within a body schema", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "POST",
      path: path("/"),
      request: {
        encodeAs: "json",
        body: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("create"), name: z.string() }),
          z.object({ kind: z.literal("delete"), id: z.string() }),
        ]),
      },
      response: { status: 204 },
    }),
  );

  fetcher({ body: { kind: "create", name: "Ada" } });
  fetcher({ body: { kind: "delete", id: "123" } });
  // @ts-expect-error - a discriminant still selects its required schema values
  fetcher({ body: { kind: "create", id: "123" } });
});

test("explicitly undefined sections do not create a call input argument", () => {
  const fetcher = createTestTransport().createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: {
        query: undefined,
        headers: undefined,
      },
      response: { status: 204 },
    }),
  );
  expectTypeOf<Parameters<typeof fetcher>>().toEqualTypeOf<[options?: FetchOptions]>();
});

test("accepts generic schema values without weakening section checks", () => {
  const bodyShape = {
    encodeAs: "text",
    body: z.string(),
  } as const;
  const single = createTestTransport().createFetcher(
    endpoint({ method: "POST", path: path("/"), request: bodyShape, response: { status: 204 } }),
  );
  function forward<T extends string>(body: T) {
    single({ body });
    // @ts-expect-error - generic values do not permit undeclared section keys
    single({ body, query: undefined });
  }
  forward("hello");
});
