import path from "node:path";
import { afterAll, beforeAll, test, expect } from "vitest";
import { startLanguageServer } from "../authoring-test-utils";
const imports = `
import { path, endpoint, codecs, createTransport, type CallInput } from "./public";
import { prepareRequest } from "./transport/prepare-request";
import { z } from "zod";
const contract = endpoint({
  method: "POST", path: path("/users/:id", z.object({ id: z.string() })), request: {
    query: z.object({ search: z.string() }),
    headers: z.object({ authorization: z.string() }),
    encodeAs: "json", body: z.object({ name: z.string() }) },
  response: { status: 200 }
});
const transport = createTransport({ codecs, prefix: "https://example.com", fetch });
const fetcher = transport.createFetcher(contract);
`;
const requestFields = ["query", "headers", "body", "encodeAs"];
const responseFields = ["status", "headers", "body", "decodeAs"];
const sections = ["params", "query", "headers", "body"];
const cases: [string, string, string[]][] = [
  ["endpoint", "endpoint({ /**/ })", ["method", "path", "request", "response"]],
  [
    "endpoint request",
    'endpoint({ method: "GET", path: path("/"), request: { /**/ }, response: { status: 200 } })',
    requestFields,
  ],
  [
    "endpoint response",
    'endpoint({ method: "GET", path: path("/"), request: {}, response: { /**/ } })',
    responseFields,
  ],
  [
    "endpoint response array",
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [{ /**/ }] })',
    responseFields,
  ],
  [
    "later response array element",
    'endpoint({ method: "GET", path: path("/"), request: {}, response: [{ status: 200 }, { /**/ }] })',
    responseFields,
  ],
  ["prepareRequest input", "prepareRequest(contract, { /**/ })", sections],
  ["typed Call Input", "const input: CallInput<typeof contract> = { /**/ }", sections],
  ["fetcher input", "fetcher({ /**/ })", sections],
  ["transport config", "createTransport({ /**/ })", ["prefix", "fetch", "codecs"]],
  [
    "transport endpoint",
    "transport.createFetcher(endpoint({ /**/ }))",
    ["method", "path", "request", "response"],
  ],
];
for (const [section, field] of [
  ["params", "id"],
  ["query", "search"],
  ["headers", "authorization"],
  ["body", "name"],
]) {
  cases.push(
    [
      `prepareRequest nested ${section}`,
      `prepareRequest(contract, { ${section}: { /**/ } })`,
      [field],
    ],
    [`fetcher nested ${section}`, `fetcher({ ${section}: { /**/ } })`, [field]],
  );
}
let server: Awaited<ReturnType<typeof startLanguageServer>>;
beforeAll(async () => {
  server = await startLanguageServer();
});
afterAll(() => server?.close());

test.each(cases)(
  "%s suggests fields in an incomplete declaration",
  async (_name, expression, expected) => {
    const file = path.join(process.cwd(), "src", "__completion.ts");
    const source = imports + expression;
    const document = await server.open(file, source);
    try {
      expect(await document.completions(source.indexOf("/**/"))).toEqual(expected.toSorted());
    } finally {
      await document.close();
    }
  },
);
