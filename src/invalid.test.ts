import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { compiler, startLanguageServer } from "./authoring-test-utils";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

// Exercise the production marker through a small generic authoring API, keeping
// its behavior separate from the Endpoint Contract helpers' inference rules.
const declarations = `
import type { Invalid } from "./internal";

type ResponseShape = {
  status: 200 | 201;
  label?: string;
  decodeAs?: "text" | "json";
  body?: string | { id: string };
  headers?: { "content-type": string };
};
type DecoderConstraint<T> = T extends { body: unknown }
  ? T extends { decodeAs: "text" | "json" } ? unknown
    : Invalid<"Error: body requires decodeAs.">
  : unknown;
type HeaderConstraint<T> = T extends { body: unknown }
  ? T extends { headers: { "content-type": string } } ? unknown
    : Invalid<"Error: body requires a Content-Type header.">
  : unknown;
type BodyConstraint<T> = T extends { decodeAs: "json"; body: string }
  ? { body: Invalid<"Error: json decoding requires an object body."> }
  : unknown;
type Constraint<T> = DecoderConstraint<T> & HeaderConstraint<T> & BodyConstraint<T>;

declare function response<const T extends ResponseShape>(value: T & Constraint<T>): T;
declare function endpoint<const T extends readonly ResponseShape[]>(value: {
  label: string;
  response: T & { [K in keyof T]: Constraint<T[K]> };
}): T;
`;

const root = process.cwd();
const file = path.join(root, "src", "__authoring_error.ts");
let source = "";
let server: Awaited<ReturnType<typeof startLanguageServer>>;
let document: Awaited<ReturnType<typeof server.open>> | undefined;

beforeAll(async () => {
  server = await startLanguageServer();
});
afterEach(async () => {
  await document?.close();
  document = undefined;
});
afterAll(() => server?.close());

async function fixture(text: string) {
  source = declarations + text;
  document = await server.open(file, source);
  return document;
}

function position(marker: string) {
  const token = `/*${marker}*/`;
  const start = source.indexOf(token);
  expect(start, `Missing fixture marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return start + token.length;
}

test("virtual fixtures use the repository compiler options", async () => {
  const document = await fixture(`
import { StandardSchemaV1 } from "@standard-schema/spec";
declare const schema: StandardSchemaV1;
`);
  const errors = await document.diagnostics();
  expect(errors).toHaveLength(1);
  expect(errors[0].text).toBe("StandardSchemaV1");
  expect(errors[0].message).toContain("verbatimModuleSyntax");
});

test("composed structural errors blame their container and explain independent requirements", async () => {
  const document = await fixture(`
response(/*both*/{
  status: 200,
  body: { id: "123" },
  label: "valid neighbor",
});
response(/*decoder*/{
  status: 200,
  body: { id: "123" },
  headers: { "content-type": "application/json" },
});
response(/*header*/{
  status: 200,
  body: { id: "123" },
  decodeAs: "json",
});
`);
  const errors = await document.diagnostics();
  // Exact locations/count also rule out misleading diagnostics on valid fields.
  expect(errors.map((error) => error.start)).toEqual(["both", "decoder", "header"].map(position));
  for (const error of errors) {
    expect(error.text).toMatch(/^\{[\s\S]*\}$/);
    expect(error.message).not.toContain("parameter of type 'never'");
  }
  // The compiler may report only one constituent of a composed intersection.
  expect(errors[0].message).toMatch(/Error: body requires (decodeAs\.|a Content-Type header\.)/);
  expect(errors[1].message).toContain("Error: body requires decodeAs.");
  expect(errors[2].message).toContain("Error: body requires a Content-Type header.");
});

test("dependent errors stay on their field in a single object and a later nested array element", async () => {
  const document = await fixture(`
response({
  status: 200,
  decodeAs: "json",
  /*single*/body: "plain text",
  headers: { "content-type": "application/json" },
  label: "valid neighbor",
});
endpoint({
  label: "valid outer field",
  response: [
    { status: 200, decodeAs: "text", body: "ok", headers: { "content-type": "text/plain" } },
    {
      status: 201,
      decodeAs: "json",
      /*nested*/body: "plain text",
      headers: { "content-type": "application/json" },
      label: "valid neighbor",
    },
  ],
});
`);
  const errors = await document.diagnostics();
  expect(errors.map((error) => error.start)).toEqual(["single", "nested"].map(position));
  for (const error of errors) {
    expect(error.text).toBe("body");
    expect(error.message).toContain("Error: json decoding requires an object body.");
    expect(error.message).not.toContain("not assignable to type 'never'");
  }
});

test("object and literal completions expose authoring fields without diagnostic marker fields", async () => {
  const document = await fixture(`
response({ /*empty*/ });
response({ status: 200, body: { id: "123" }, /*partial*/ });
endpoint({
  label: "example",
  response: [{ status: 200 }, { /*element*/ }],
});
response({ status: 200, decodeAs: "/*decoder*/" });
`);
  const fields = ["body", "decodeAs", "headers", "label", "status"];
  // Exact lists catch leaked symbol names, message keys, and tuple members.
  expect(await document.completions(position("empty"))).toEqual(fields);
  expect(await document.completions(position("partial"))).toEqual(["decodeAs", "headers", "label"]);
  expect(await document.completions(position("element"))).toEqual(fields);
  expect(await document.completions(position("decoder"))).toEqual(["json", "text"]);
});

test("declaration exports retain a nameable marker through explicit annotations", () => {
  const directory = mkdtempSync(path.join(root, ".authoring-emit-"));
  function emit(expression: string) {
    const text = `
import type { Invalid } from "../src/internal";
declare const error: Invalid<"Error: invalid declaration.">;
export type Failure = Invalid<"Error: invalid declaration.">;
export const direct = error;
${expression}
`;
    const fixture = path.join(directory, "fixture.ts");
    writeFileSync(fixture, text);
    const result = spawnSync(
      process.execPath,
      [
        compiler,
        "--ignoreConfig",
        "--declaration",
        "--emitDeclarationOnly",
        "--strict",
        "--target",
        "ESNext",
        "--module",
        "preserve",
        "--pretty",
        "false",
        "--outDir",
        directory,
        "--rootDir",
        root,
        fixture,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    return result;
  }

  try {
    const annotated = emit("export const copy: Failure = { ...error };");
    expect(annotated.stdout).toBe("");
    expect(annotated.status).toBe(0);
    const output = readFileSync(
      path.join(directory, path.basename(directory), "fixture.d.ts"),
      "utf8",
    );
    expect(output).toContain("export declare const copy: Failure;");
    expect(output).toContain('Invalid<"Error: invalid declaration.">');

    // Document the private-key boundary rather than promising arbitrary expanded
    // marker types can become inferred public declarations.
    const expanded = emit("export const copy = { ...error };");
    expect(expanded.stdout.trim().split(/\r?\n/)).toEqual([
      expect.stringContaining("error TS4023:"),
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
