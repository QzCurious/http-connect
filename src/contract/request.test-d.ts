import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { URLSearchParamsObject } from "../public";
import { request, type RequestShape } from "./request";

test("structural checking still requires one complete request object", () => {
  // @ts-expect-error - path belongs to the endpoint
  request({ path: "/users" });
  // @ts-expect-error - method belongs to the endpoint
  request({ method: "GET" });
  // @ts-expect-error - request does not accept a collection
  request([{}]);
  // @ts-expect-error - request requires an object
  request("GET");
  // @ts-expect-error - request requires an object
  request(null);
  // @ts-expect-error - request requires an object
  request(undefined);
});

test("preserves exact valid request types", () => {
  const body = z.number().transform(String);
  const bodyless = request({});
  expectTypeOf(bodyless).toEqualTypeOf<{}>();
  const withBody = request({
    encodeAs: "text",
    body,
  });
  expectTypeOf(withBody).toEqualTypeOf<{
    readonly encodeAs: "text";
    readonly body: typeof body;
  }>();
});

test("rejects the broad RequestShape union while preserving valid field unions", () => {
  const shape = {} as RequestShape;
  // @ts-expect-error - the structural constraint must not hide a whole-shape union
  request(shape);

  const encoded = request({
    encodeAs: "json" as "json" | "text",
    body: z.string(),
  });
  expectTypeOf(encoded.encodeAs).toEqualTypeOf<"json" | "text">();
});

test("rejects extra top-level request keys", () => {
  request({
    // @ts-expect-error - unknown request shape key
    extra: true,
  });
});

test("allows content-type inside headers", () => {
  request({
    headers: z.object({ "content-type": z.string() }),
    encodeAs: "json",
    body: z.object({ name: z.string() }),
  });
});

test("allows transforming query schemas within supported value families", () => {
  const shape = request({
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
  });

  expectTypeOf<z.output<typeof shape.query>>().toEqualTypeOf<{
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
  const shape = request({
    query: z.object({ page: z.coerce.number() }),
    headers: z.object({ "x-retry-after": z.coerce.number() }),
  });

  expectTypeOf<z.input<typeof shape.query>>().toEqualTypeOf<{
    page: unknown;
  }>();
  expectTypeOf<z.input<typeof shape.headers>>().toEqualTypeOf<{
    "x-retry-after": unknown;
  }>();
});

test("rejects query schemas with unsupported output values", () => {
  request({
    // @ts-expect-error - query must output URLSearchParams-compatible values
    query: z.object({
      createdAt: z.date(),
    }),
  });

  request({
    // @ts-expect-error - query must output URLSearchParams-compatible values
    query: z.object({
      createdAt: z.string().transform((value) => new Date(value)),
    }),
  });
});

test("allows transforming request header schemas within primitive header values", () => {
  const shape = request({
    headers: z.object({
      authorization: z.string().default("Bearer token"),
      retryAfter: z.string().transform((value) => Number(value)),
    }),
  });

  expectTypeOf<z.output<typeof shape.headers>>().toEqualTypeOf<{
    authorization: string;
    retryAfter: number;
  }>();
});

test("rejects request header schemas with non-primitive untransformed values", () => {
  request({
    // @ts-expect-error - request headers must output string-encodable primitive values
    headers: z.object({
      meta: z.object({ token: z.string() }),
    }),
  });
});

test("rejects request header schemas with non-primitive output values", () => {
  request({
    // @ts-expect-error - request headers must output string-encodable primitive values
    headers: z.object({
      authorization: z.string().transform((value) => ({ value })),
    }),
  });
});

test("requires body and encodeAs together", () => {
  // @ts-expect-error - body requires encodeAs
  request({ body: z.object({}) });

  const encodingOnly = {
    encodeAs: "json",
  } as const;
  // @ts-expect-error - encodeAs requires body
  request(encodingOnly);
});

test("rejects optional body and encoding declarations that may be incomplete", () => {
  const bodyOnly = {} as {
    body?: z.ZodString;
  };
  // @ts-expect-error - an optional schema still needs an encoder
  request(bodyOnly);
  const encodingOnly = {} as {
    encodeAs?: "text";
  };
  // @ts-expect-error - an optional encoder still needs a body schema
  request(encodingOnly);
  const optionalPair = {} as {
    encodeAs?: "text";
    body?: z.ZodString;
  };
  // @ts-expect-error - two independently optional fields cannot guarantee a complete pair
  request(optionalPair);
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
  const shape = request({
    encodeAs: "json",
    body: z.object({ term: z.string() }),
  });

  expectTypeOf(shape).toExtend<RequestShape>();
});

test("rejects body outputs incompatible with the selected encoder", () => {
  request({
    encodeAs: "text",
    // @ts-expect-error - text requires a string output
    body: z.object({ message: z.string() }),
  });
});

test("rejects form-urlencoded outputs that include native representations", () => {
  request({
    encodeAs: "form-urlencoded",
    // @ts-expect-error - every output must be a structured form object
    body: z.union([
      z.instanceof(URLSearchParams),
      z.string(),
      z.custom<string[][]>(),
      z.custom<URLSearchParamsObject>(),
    ]),
  });
});

test("requires custom URL-encoded input to transform into a supported representation", () => {
  request({
    encodeAs: "form-urlencoded",
    body: z
      .custom<Iterable<readonly [string, string]>>()
      .transform((entries) => Object.fromEntries(entries)),
  });
});

test("allows object-shaped form-urlencoded request body output shapes", () => {
  request({
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
  });
});

test("allows request body transforms into the encoded runtime type", () => {
  request({
    encodeAs: "text",
    body: z.object({ message: z.string() }).transform(({ message }) => message),
  });
});

test("rejects path params in a request", () => {
  request({
    encodeAs: "text",
    body: z.string(),
    // @ts-expect-error - params belong to the path declaration
    params: z.object({ workspaceId: z.string().transform(Number) }),
  });
});
