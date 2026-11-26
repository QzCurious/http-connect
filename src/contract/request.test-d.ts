import { path } from "./path";
import type { Invalid } from "../internal";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { URLSearchParamsObject } from "../public";
import type { ExpectedPath } from "./path";
import type { RequestShape } from "./request";
import type { CallInput } from "../transport/call-input";
import { endpoint } from "./endpoint";

test("structural checking still requires one complete request object", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    // @ts-expect-error - path belongs to the endpoint
    request: { path: "/users" },
    response: { status: 204 },
  });
  endpoint({
    method: "POST",
    path: path("/"),
    // @ts-expect-error - method belongs to the endpoint
    request: { method: "GET" },
    response: { status: 204 },
  });
  // @ts-expect-error - request does not accept a collection
  endpoint({ method: "POST", path: path("/"), request: [{}], response: { status: 204 } });
  // @ts-expect-error - request requires an object
  endpoint({ method: "POST", path: path("/"), request: "GET", response: { status: 204 } });
  // @ts-expect-error - request requires an object
  endpoint({ method: "POST", path: path("/"), request: null, response: { status: 204 } });
  // @ts-expect-error - request requires an object
  endpoint({ method: "POST", path: path("/"), request: undefined, response: { status: 204 } });
});

test("body declaration errors preserve neighboring schema types", () => {
  const params = z.object({ id: z.string().transform(Number) });
  const shape = endpoint({
    method: "POST",
    path: path("/users/{id}", params),
    // @ts-expect-error - the request object is missing encodeAs
    request: {
      body: z.undefined(),
    },
    response: { status: 204 },
  }).path;

  expectTypeOf(shape.params).toEqualTypeOf<typeof params>();
  expectTypeOf<z.input<typeof shape.params>>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<z.output<typeof shape.params>>().toEqualTypeOf<{ id: number }>();

  const encodingOnly = endpoint({
    method: "POST",
    path: path("/users/{id}", params),
    // @ts-expect-error - the request object is missing body
    request: {
      encodeAs: "json",
    },
    response: { status: 204 },
  }).path;
  expectTypeOf(encodingOnly.params).toEqualTypeOf<typeof params>();
});

test("preserves exact valid request types and their resulting Call Input", () => {
  const params = z.object({ id: z.string().transform(Number) });
  const body = z.number().transform(String);
  const bodyless = endpoint({
    method: "POST",
    path: path("/users/{id}", params),
    request: {},
    response: { status: 204 },
  }).request;
  expectTypeOf(bodyless).toEqualTypeOf<{}>();
  const withBody = endpoint({
    method: "POST",
    path: path("/users/{id}", params),
    request: {
      encodeAs: "text",
      body,
    },
    response: { status: 204 },
  }).request;
  expectTypeOf(withBody).toEqualTypeOf<{
    readonly encodeAs: "text";
    readonly body: typeof body;
  }>();
  const contract = endpoint({
    method: "POST",
    path: path("/users/{id}", params),
    request: withBody,
    response: { status: 204 },
  });
  expectTypeOf<CallInput<typeof contract>>().toEqualTypeOf<{
    params: { id: string };
    body: number;
  }>();
});

test("rejects the broad RequestShape union while preserving valid field unions", () => {
  const shape = {} as RequestShape;
  // @ts-expect-error - the structural constraint must not hide a whole-shape union
  endpoint({ method: "POST", path: path("/"), request: shape, response: { status: 204 } });

  const encoded = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json" as "json" | "text",
      body: z.string(),
    },
    response: { status: 204 },
  }).request;
  expectTypeOf(encoded.encodeAs).toEqualTypeOf<"json" | "text">();
});

test("requires literal paths", () => {
  expectTypeOf<ExpectedPath<string>>().toEqualTypeOf<
    Invalid<"Error: path must be a string literal.">
  >();
  expectTypeOf<ExpectedPath<`/${string}`>>().toEqualTypeOf<
    Invalid<"Error: path must be a string literal.">
  >();
  expectTypeOf<ExpectedPath<`/users/${string}`>>().toEqualTypeOf<
    Invalid<"Error: path must be a string literal.">
  >();
  expectTypeOf<ExpectedPath<`/users/${number}/posts`>>().toEqualTypeOf<
    Invalid<"Error: path must be a string literal.">
  >();
  expectTypeOf<ExpectedPath<`/users/${bigint}/posts`>>().toEqualTypeOf<
    Invalid<"Error: path must be a string literal.">
  >();

  const template: `/${string}` = "/users";
  // @ts-expect-error - authored paths must be literals
  endpoint({ method: "GET", path: path(template), request: {}, response: { status: 204 } });
});

test("requires path to be slash-prefixed and non-protocol-relative", () => {
  expectTypeOf<ExpectedPath<"/users/123">>().toEqualTypeOf<"/users/123">();
  expectTypeOf<ExpectedPath<`/users/${1 | 2}`>>().toEqualTypeOf<"/users/1" | "/users/2">();
  expectTypeOf<ExpectedPath<"//users">>().toEqualTypeOf<
    Invalid<'Error: path must not start with "//".'>
  >();
  expectTypeOf<ExpectedPath<"users">>().toEqualTypeOf<
    Invalid<"Error: path must start with '/'.">
  >();
  expectTypeOf<ExpectedPath<"/users/:id/posts/{postId}">>().toEqualTypeOf<
    Invalid<'Error: path must not mix ":id" and "{id}" placeholder styles.'>
  >();

  // @ts-expect-error - method is required
  endpoint({ path: path("/users"), request: {}, response: { status: 204 } });
});

test("requires params when path contains placeholders", () => {
  // @ts-expect-error - params is required for placeholder paths
  endpoint({ method: "GET", path: path("/users/{id}"), request: {}, response: { status: 204 } });
});

test("params schema keys follow the runtime placeholder grammar", () => {
  endpoint({
    method: "GET",
    path: path(
      "/files/:fileName.:extension",
      z.object({ fileName: z.string(), extension: z.string() }),
    ),
    request: {},
    response: { status: 204 },
  });

  endpoint({
    method: "GET",
    path: path("/files/prefix-:_A1.json", z.object({ _A1: z.string() })),
    request: {},
    response: { status: 204 },
  });

  endpoint({
    method: "GET",
    path: path(
      "/files/:fileName.:extension",
      // @ts-expect-error - punctuation terminates colon placeholder names
      z.object({ "fileName.:extension": z.string() }),
    ),
    request: {},
    response: { status: 204 },
  });
});

test("rejects invalid names and malformed placeholders during authoring", () => {
  endpoint({
    method: "GET",
    // @ts-expect-error - placeholder names must be identifiers
    path: path("/files/{bad-name}"),
    request: {},
    response: { status: 204 },
  });

  endpoint({
    method: "GET",
    // @ts-expect-error - colon names cannot start with a digit
    path: path("/users/:123"),
    request: {},
    response: { status: 204 },
  });

  endpoint({
    method: "GET",
    // @ts-expect-error - nested braces are invalid
    path: path("/users/{{id}}"),
    request: {},
    response: { status: 204 },
  });
});

test("params schemas must output a value for every placeholder", () => {
  endpoint({
    method: "GET",
    path: path(
      "/users/{id}",
      // @ts-expect-error - an optional output cannot guarantee a path parameter
      z.object({ id: z.string().optional() }),
    ),
    request: {},
    response: { status: 204 },
  });

  const shape = endpoint({
    method: "GET",
    path: path("/users/{id}", z.object({ id: z.string().default("guest") })),
    request: {},
    response: { status: 204 },
  });

  expectTypeOf<z.input<typeof shape.path.params>>().toEqualTypeOf<{ id?: string }>();
  expectTypeOf<z.output<typeof shape.path.params>>().toEqualTypeOf<{ id: string }>();
});

test("rejects params when path has no placeholders", () => {
  endpoint({
    method: "GET",
    path: path(
      "/users",
      // @ts-expect-error - params is not allowed without placeholders
      z.object({ id: z.string() }),
    ),
    request: {},
    response: { status: 204 },
  });
});

test("rejects extra params keys", () => {
  endpoint({
    method: "GET",
    path: path(
      "/users/{id}",
      // @ts-expect-error - extra is not present in path
      z.object({ id: z.string(), extra: z.string() }),
    ),
    request: {},
    response: { status: 204 },
  });
});

test("rejects extra top-level request keys", () => {
  endpoint({
    method: "GET",
    path: path("/users"),
    request: {
      // @ts-expect-error - unknown request shape key
      extra: true,
    },
    response: { status: 204 },
  });
});

test("rejects missing params keys", () => {
  endpoint({
    method: "GET",
    path: path(
      "/users/{id}/posts/{postId}",
      // @ts-expect-error - postId is missing
      z.object({ id: z.string() }),
    ),
    request: {},
    response: { status: 204 },
  });
});

test("allows content-type inside headers", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      headers: z.object({ "content-type": z.string() }),
      encodeAs: "json",
      body: z.object({ name: z.string() }),
    },
    response: { status: 204 },
  });
});

test("allows transforming params and query schemas within supported value families", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/users/{id}", z.object({ id: z.string().transform((value) => Number(value)) })),
    request: {
      query: z.object({
        page: z.string().transform((value) => Number(value)),
        includeDrafts: z.string().transform((value) => value === "true"),
        tags: z.array(z.string()),
        filter: z.object({
          price: z.object({ gte: z.number() }),
          brand: z.array(z.string()),
        }),
        items: z.array(z.object({ id: z.number(), qty: z.number() })),
        empty: z.null(),
      }),
    },
    response: { status: 204 },
  });

  expectTypeOf<z.output<typeof shape.path.params>>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<z.output<typeof shape.request.query>>().toEqualTypeOf<{
    page: number;
    includeDrafts: boolean;
    tags: string[];
    filter: {
      price: { gte: number };
      brand: string[];
    };
    items: { id: number; qty: number }[];
    empty: null;
  }>();
});

test("allows unknown request input values when outputs are supported", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/users/{id}", z.object({ id: z.coerce.number() })),
    request: {
      query: z.object({ page: z.coerce.number() }),
      headers: z.object({ "x-retry-after": z.coerce.number() }),
    },
    response: { status: 204 },
  });

  expectTypeOf<z.input<typeof shape.path.params>>().toEqualTypeOf<{ id: unknown }>();
  expectTypeOf<z.input<typeof shape.request.query>>().toEqualTypeOf<{
    page: unknown;
  }>();
  expectTypeOf<z.input<typeof shape.request.headers>>().toEqualTypeOf<{
    "x-retry-after": unknown;
  }>();
});

test("rejects params schemas with unsupported output values", () => {
  endpoint({
    method: "POST",
    path: path(
      "/users/{id}",
      // @ts-expect-error - params must output string or number values
      z.object({ id: z.boolean() }),
    ),
    request: {},
    response: { status: 204 },
  });

  endpoint({
    method: "POST",
    path: path(
      "/users/{id}",
      // @ts-expect-error - params must output string or number values
      z.object({ id: z.string().transform((value) => ({ value })) }),
    ),
    request: {},
    response: { status: 204 },
  });
});

test("rejects query schemas with unsupported output values", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - query must output URLSearchParams-compatible values
      query: z.object({
        createdAt: z.date(),
      }),
    },
    response: { status: 204 },
  });

  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - query must output URLSearchParams-compatible values
      query: z.object({
        createdAt: z.string().transform((value) => new Date(value)),
      }),
    },
    response: { status: 204 },
  });
});

test("allows transforming request header schemas within primitive header values", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      headers: z.object({
        authorization: z.string().default("Bearer token"),
        retryAfter: z.string().transform((value) => Number(value)),
      }),
    },
    response: { status: 204 },
  }).request;

  expectTypeOf<z.output<typeof shape.headers>>().toEqualTypeOf<{
    authorization: string;
    retryAfter: number;
  }>();
});

test("rejects request header schemas with non-primitive untransformed values", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - request headers must output string-encodable primitive values
      headers: z.object({
        meta: z.object({ token: z.string() }),
      }),
    },
    response: { status: 204 },
  });
});

test("rejects request header schemas with non-primitive output values", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      // @ts-expect-error - request headers must output string-encodable primitive values
      headers: z.object({
        authorization: z.string().transform((value) => ({ value })),
      }),
    },
    response: { status: 204 },
  });
});

test("requires body and encodeAs together", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    // @ts-expect-error - body requires encodeAs
    request: { body: z.object({}) },
    response: { status: 204 },
  });

  const encodingOnly = {
    encodeAs: "json",
  } as const;
  // @ts-expect-error - encodeAs requires body
  endpoint({ method: "POST", path: path("/"), request: encodingOnly, response: { status: 204 } });
});

test("rejects optional body and encoding declarations that may be incomplete", () => {
  const bodyOnly = {} as {
    body?: z.ZodString;
  };
  // @ts-expect-error - an optional schema still needs an encoder
  endpoint({ method: "POST", path: path("/"), request: bodyOnly, response: { status: 204 } });
  const encodingOnly = {} as {
    encodeAs?: "text";
  };
  // @ts-expect-error - an optional encoder still needs a body schema
  endpoint({ method: "POST", path: path("/"), request: encodingOnly, response: { status: 204 } });
  const optionalPair = {} as {
    encodeAs?: "text";
    body?: z.ZodString;
  };
  // @ts-expect-error - two independently optional fields cannot guarantee a complete pair
  endpoint({ method: "POST", path: path("/"), request: optionalPair, response: { status: 204 } });
});

test("RequestShape satisfies authoring requires body and encodeAs together", () => {
  const withoutBody = {} satisfies RequestShape;

  const withBody = {
    encodeAs: "json",
    body: z.object({ name: z.string() }),
  } satisfies RequestShape;

  const bodyOnly = {
    body: z.object({ name: z.string() }),
  };
  // @ts-expect-error - RequestShape requires encodeAs with body
  bodyOnly satisfies RequestShape;

  const encodeOnly = {
    encodeAs: "json",
  };
  // @ts-expect-error - RequestShape requires body with encodeAs
  encodeOnly satisfies RequestShape;

  expectTypeOf(withoutBody).toEqualTypeOf<{}>();
  expectTypeOf(withBody.encodeAs).toEqualTypeOf<"json">();
});

test("allows canonical method-agnostic request payloads", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.object({ term: z.string() }),
    },
    response: { status: 204 },
  }).request;

  expectTypeOf(shape).toMatchTypeOf<RequestShape>();
});

test("rejects body outputs incompatible with the selected encoder", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      // @ts-expect-error - text requires a string output
      body: z.object({ message: z.string() }),
    },
    response: { status: 204 },
  });
});

test("allows form-urlencoded request body output shapes", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-urlencoded",
      body: z.union([
        z.instanceof(URLSearchParams),
        z.string(),
        z.custom<string[][]>(),
        z.custom<URLSearchParamsObject>(),
      ]),
    },
    response: { status: 204 },
  }).request;
});

test("requires custom URL-encoded input to transform into a supported representation", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-urlencoded",
      body: z
        .custom<Iterable<readonly [string, string]>>()
        .transform(
          (entries) => new URLSearchParams(Array.from(entries, ([key, value]) => [key, value])),
        ),
    },
    response: { status: 204 },
  });
});

test("allows object-shaped form-urlencoded request body output shapes", () => {
  const shape = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "form-urlencoded",
      body: z.object({
        username: z.string(),
        remember: z.boolean(),
        empty: z.null(),
        tags: z.array(z.string()),
        filter: z.object({
          price: z.object({ gte: z.number() }),
          brand: z.array(z.string()),
        }),
        items: z.array(z.object({ id: z.number(), qty: z.number() })),
        omitted: z.undefined().optional(),
      }),
    },
    response: { status: 204 },
  }).request;
});

test("allows request body transforms into the encoded runtime type", () => {
  endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      body: z.object({ message: z.string() }).transform(({ message }) => message),
    },
    response: { status: 204 },
  });
});
