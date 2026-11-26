import { path } from "../contract/path";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { CallInput } from "./call-input";
import { endpoint } from "../contract/endpoint";
import { prepareRequest, type PreparedRequest, type PreparedRequestFor } from "./prepare-request";

// @ts-expect-error - PreparedRequestFor requires an explicit endpoint type
type MissingPreparedRequestEndpoint = PreparedRequestFor;

test("includes only declared sections and keeps declared sections required", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/users/{id}", z.object({ id: z.string() })),
    request: {
      query: z.object({ include: z.string().optional() }),
      headers: z.object({ authorization: z.string() }),
    },
    response: { status: 204 },
  });

  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    params: { id: string };
    query: { include?: string | undefined };
    headers: { authorization: string };
  }>();
});

test("preparation accepts omitted input for a request without sections", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: { status: 204 },
  });

  prepareRequest(contract);
});

test("preparation uses structural assignability for Call Input", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: { query: z.object({ page: z.string() }) },
    response: { status: 204 },
  });

  const input = { query: { page: "1" }, body: undefined };
  prepareRequest(contract, input);
  prepareRequest(contract, {
    query: { page: "1" },
    // @ts-expect-error - inline call input uses native excess property checking
    body: undefined,
  });
});

test("exposes transformed prepared output when schema input accepts undefined", () => {
  const contract = endpoint({
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
  });

  type Prepared = PreparedRequestFor<typeof contract>;

  expectTypeOf<Prepared>().toEqualTypeOf<{
    method: "POST";
    resolvedPath: "/users";
    encodeAs: "json";
    body: { name: string } | null;
  }>();
});

test("uses request schema input for call input and output for prepared request", () => {
  const contract = endpoint({
    method: "GET",
    path: path(
      "/users/{id}",
      z.object({
        id: z.string().transform((value) => Number(value)),
      }),
    ),
    request: {
      query: z.object({
        page: z.string().transform((value) => Number(value)),
        includeDrafts: z.string().transform((value) => value === "true"),
      }),
      headers: z.object({
        authorization: z.string().default("Bearer token"),
        retryAfter: z.string().transform((value) => Number(value)),
      }),
    },
    response: { status: 204 },
  });

  type Prepared = PreparedRequestFor<typeof contract>;

  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    params: { id: string };
    query: {
      page: string;
      includeDrafts: string;
    };
    headers: {
      authorization?: string | undefined;
      retryAfter: string;
    };
  }>();

  expectTypeOf<Prepared>().toEqualTypeOf<{
    method: "GET";
    resolvedPath: `/users/${number}`;
    query: {
      page: number;
      includeDrafts: boolean;
    };
    headers: {
      authorization: string;
      retryAfter: number;
    };
  }>();
});

test("preserves rich call input types while preparing transport-compatible outputs", () => {
  const contract = endpoint({
    method: "GET",
    path: path(
      "/users/{id}",
      z.object({
        id: z.object({ value: z.number() }).transform(({ value }) => value),
      }),
    ),
    request: {
      query: z.object({
        since: z.date().transform((date) => date.toISOString()),
      }),
      headers: z.object({
        authorization: z.object({ token: z.string() }).transform(({ token }) => `Bearer ${token}`),
      }),
    },
    response: { status: 204 },
  });

  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    params: { id: { value: number } };
    query: { since: Date };
    headers: { authorization: { token: string } };
  }>();
  expectTypeOf<PreparedRequestFor<typeof contract>>().toEqualTypeOf<{
    method: "GET";
    resolvedPath: `/users/${number}`;
    query: { since: string };
    headers: { authorization: string };
  }>();
  expectTypeOf<PreparedRequestFor<typeof contract>>().toExtend<PreparedRequest>();
});

test("collapses to an empty object when the request declares no sections", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/health"),
    request: {},
    response: { status: 204 },
  });

  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{}>();
});

test("exposes an exact prepared shape for concrete endpoints", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/users/{id}", z.object({ id: z.string() })),
    request: {},
    response: { status: 200 },
  });

  type Prepared = PreparedRequestFor<typeof contract>;

  expectTypeOf<Prepared>().toEqualTypeOf<{
    method: "GET";
    resolvedPath: `/users/${string}`;
  }>();
});

test("shared prepared requests require encoding and body together", () => {
  const base = { method: "POST", resolvedPath: "/users" } as const;

  expectTypeOf(base).toExtend<PreparedRequest>();
  expectTypeOf({
    ...base,
    encodeAs: "json" as const,
    body: null,
  }).toExtend<PreparedRequest>();

  // @ts-expect-error - a declared encoding requires a body property
  const missingBody: PreparedRequest = {
    ...base,
    encodeAs: "json",
  };
  // @ts-expect-error - a body requires a declared encoding
  const missingEncoding: PreparedRequest = { ...base, body: "value" };
});

test("exact prepared requests fit the shared transport boundary", () => {
  const withoutBody = endpoint({
    method: "GET",
    path: path("/health"),
    request: {},
    response: { status: 204 },
  });
  const withBody = endpoint({
    method: "POST",
    path: path("/users"),
    request: {
      encodeAs: "json",
      body: z.undefined().transform(() => null),
    },
    response: { status: 204 },
  });

  expectTypeOf<PreparedRequestFor<typeof withoutBody>>().toExtend<PreparedRequest>();
  expectTypeOf<PreparedRequestFor<typeof withBody>>().toExtend<PreparedRequest>();
});

test("schema unions preserve call input and transformed prepared body types", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/values"),
    request: {
      encodeAs: "json",
      body: z.union([z.string(), z.number()]).transform((value) => ({ value })),
    },
    response: { status: 204 },
  });
  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    body: string | number;
  }>();
  expectTypeOf<PreparedRequestFor<typeof contract>>().toEqualTypeOf<{
    method: "POST";
    resolvedPath: "/values";
    encodeAs: "json";
    body: { value: string | number };
  }>();
});

test("preparation accepts generic schema values", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      body: z.string(),
    },
    response: { status: 204 },
  });
  function forward<T extends string>(body: T) {
    return prepareRequest(contract, { body });
  }
  forward("hello");
});

test("preserves encoding without inventing an omitted content type", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      body: z.number().transform(String),
    },
    response: { status: 204 },
  });
  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    body: number;
  }>();
  expectTypeOf<PreparedRequestFor<typeof contract>>().toEqualTypeOf<{
    method: "POST";
    resolvedPath: "/";
    encodeAs: "text";
    body: string;
  }>();
});
