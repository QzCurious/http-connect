import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startLanguageServer } from "../authoring-test-utils";

let server: Awaited<ReturnType<typeof startLanguageServer>>;
beforeAll(async () => {
  server = await startLanguageServer();
});
afterAll(() => server?.close());

const endpointWithRequest = (fields: string, template = "/") =>
  `endpoint({ method: "POST", path: ${template === "/" ? 'path("/")' : 'path("/users/{id}", z.object({ id: z.string() }))'}, request: { ${fields} }, response: [{ status: 200 }, { status: 404 }] })`;

const cases = [
  [
    endpointWithRequest(
      'encodeAs: "form-urlencoded", body: z.union([z.instanceof(URLSearchParams), z.string(), z.array(z.tuple([z.string(), z.string()])), z.object({ tag: z.string() })])',
    ),
    "body",
    "Type 'string' is not assignable to type 'URLSearchParamsObject'",
  ],
  [
    endpointWithRequest('encodeAs: "form-data", body: z.instanceof(FormData)'),
    "body",
    "Type 'FormData' is not assignable to type 'FormDataObject'",
  ],
  [
    endpointWithRequest('encodeAs: "binary", body: z.string()'),
    "body",
    "Type 'string' is not assignable to type 'ArrayBuffer | Blob | Uint8Array",
  ],
  [
    endpointWithRequest('encodeAs: "stream", body: z.string()'),
    "body",
    "Type 'string' is not assignable to type 'ReadableStream<Uint8Array",
  ],
  [
    'request({ encodeAs: "text", body: z.number() })',
    "body",
    "Type 'number' is not assignable to type 'string'",
  ],
  [
    'response({ status: 201, decodeAs: "text", body: z.number() })',
    "body",
    "response body schema input is incompatible",
  ],
  [
    endpointWithRequest('encodeAs: "json", body: z.undefined()', "/users/{id}"),
    "body",
    "Type 'undefined' is not assignable to type 'JsonValue'",
  ],
  [
    'endpoint({ method: "GET", path: path("/:id/{other}"), request: {}, response: { status: 204 } })',
    '"/:id/{other}"',
    "path must not mix",
  ],
  [
    'endpoint({ method: "GET", path: path("/:id", z.object({ other: z.string() })), request: { }, response: { status: 204 } })',
    "z.object({ other: z.string() })",
    "params schema is missing path parameters",
  ],
  [
    endpointWithRequest(
      'encodeAs: "form-data", body: z.object({ name: z.string() }), headers: z.object({ "Content-Type": z.string() })',
    ),
    "headers",
    "form-data generates its own Content-Type",
  ],
  [
    endpointWithRequest('encodeAs: "text", body: z.number()'),
    "body",
    "Type 'number' is not assignable to type 'string'",
  ],
  [
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [{ status: 200 }, { status: 201, decodeAs: "text", body: z.number() }] })',
    "body",
    "response body schema input is incompatible",
  ],
  [
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [] })',
    "response",
    "endpoint response must contain at least one response",
  ],
  [
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [] as const })',
    "response",
    "endpoint response must contain at least one response",
  ],
  [
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [] as readonly [] | readonly [{ status: 200 }] })',
    "response",
    "endpoint response must contain at least one response",
  ],
  [
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [] as readonly [] | readonly [{ status: 600 }] })',
    "response",
    "endpoint response must contain at least one response",
  ],
  [endpointWithRequest("headers: z.object({}), extra: true"), "extra", "unknown property: extra"],
  [endpointWithRequest("headers: z.object({}), 0: true"), "0", "unknown property: 0"],
  [
    endpointWithRequest("headers: z.object({}), [extraKey]: true"),
    "[extraKey]",
    "unknown symbol property",
  ],
  [
    'transport.createFetcher(endpoint({ method: "GET", path: path("/"), request: { encodeAs: "text", body: z.string() }, response: { status: 200 } }))',
    'endpoint({ method: "GET", path: path("/"), request: { encodeAs: "text", body: z.string() }, response: { status: 200 } })',
    "Fetch cannot send GET or HEAD requests with a body",
  ],
] as const;

test.each(cases)("diagnostics explain %s", async (expression, field, message) => {
  const document = await server.open(
    path.join(process.cwd(), "src", "__invalid_diagnostics.ts"),
    `
import { path, endpoint, request, response, codecs, createTransport } from "./public";
import { z } from "zod";
const transport = createTransport({ codecs, prefix: "https://example.com", fetch });
const extraKey = Symbol();
${expression};
`,
  );
  try {
    const errors = await document.diagnostics();
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toBe(field);
    expect(errors[0].message).toContain(message);
  } finally {
    await document.close();
  }
});

test.each([
  'endpoint({ method: "GET", path: path("/"), request: {}, response: { status: 200, decodeAs: "xml", body: z.string() } })',
  'endpoint({ method: "GET", path: path("/"), request: {}, response: [{ status: 204 }, { status: 200, decodeAs: "xml", body: z.string() }] })',
])("ordinary field errors retain native expected types in %s", async (expression) => {
  const document = await server.open(
    path.join(process.cwd(), "src", "__native_diagnostics.ts"),
    `import { path, endpoint } from "./public";
import { z } from "zod";
${expression};`,
  );
  try {
    const errors = await document.diagnostics();
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toBe("decodeAs");
    expect(errors[0].message).toContain('"text"');
    expect(errors[0].message).not.toContain("Invalid<");
  } finally {
    await document.close();
  }
});

const invalidRequestFields = [
  ['encodeAs: "jsonx"', "encodeAs", '"json"'],
  ['encodeAs: "jsonx", body: z.string()', "encodeAs", '"json"'],
] as const;

test.each(invalidRequestFields)(
  "native request diagnostics stay on the invalid field in %s",
  async (fields, field, expected) => {
    const document = await server.open(
      path.join(process.cwd(), "src", "__native_request_diagnostics.ts"),
      `import { path, endpoint } from "./public";
import { z } from "zod";
${endpointWithRequest(fields, "/users/{id}")};`,
    );
    try {
      const errors = await document.diagnostics();
      expect(errors).toHaveLength(1);
      expect(errors[0].text).toBe(field);
      expect(errors[0].message).toContain(expected);
      expect(errors[0].message).not.toContain("Invalid<");
    } finally {
      await document.close();
    }
  },
);

const incompleteRequests = [
  ["body: z.undefined()", "encodeAs"],
  ['encodeAs: "json"', "body"],
] as const;

test.each(incompleteRequests)(
  "native request pairing diagnostics explain %s",
  async (fields, missing) => {
    const document = await server.open(
      path.join(process.cwd(), "src", "__request_pair_diagnostics.ts"),
      `import { path, endpoint } from "./public";
import { z } from "zod";
${endpointWithRequest(fields, "/users/{id}")};`,
    );
    try {
      const errors = await document.diagnostics();
      expect(errors).toHaveLength(1);
      expect(errors[0].text).toBe("request");
      expect(errors[0].message).toContain(`Property '${missing}' is missing`);
      expect(errors[0].message).not.toContain("Invalid<");
    } finally {
      await document.close();
    }
  },
);

test.each([true, false])(
  "whole-request unions are rejected first (encoded shape has body: %s)",
  async (body) => {
    const document = await server.open(
      path.join(process.cwd(), "src", "__request_union_diagnostics.ts"),
      `import { path, endpoint } from "./public";
import { z } from "zod";
const bodyless = { headers: z.object({}) } as const;
const encoded = { ...bodyless, encodeAs: "text", ${body ? "body: z.string()" : ""} } as const;
const shape = {} as typeof bodyless | typeof encoded;
endpoint({ method: "GET", path: path("/users"), request: shape, response: { status: 204 } });`,
    );
    try {
      const errors = await document.diagnostics();
      expect(errors).toHaveLength(1);
      expect(errors[0].text).toBe("request");
      expect(errors[0].message).toContain("unions of Request Shapes are not supported");
    } finally {
      await document.close();
    }
  },
);

test("structural request errors are reported before dependent constraints", async () => {
  const document = await server.open(
    path.join(process.cwd(), "src", "__independent_request_diagnostics.ts"),
    `import { path, endpoint } from "./public";
${endpointWithRequest('encodeAs: "jsonx", extra: true')};`,
  );
  try {
    const errors = await document.diagnostics();
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toBe("encodeAs");
    expect(errors[0].message).toContain('"json"');
    expect(errors[0].message).not.toContain("Invalid<");
  } finally {
    await document.close();
  }
});
