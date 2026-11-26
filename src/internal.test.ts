import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("prettify expands unions in compiler diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "http-connect-prettify-"));
  const file = join(directory, "fixture.ts");
  const endpoint = fileURLToPath(new URL("./contract/endpoint", import.meta.url));
  const response = fileURLToPath(new URL("./contract/response", import.meta.url));

  try {
    writeFileSync(
      file,
      `import type { HttpMethod } from ${JSON.stringify(endpoint)};
import type { ResponseDecoderKey } from ${JSON.stringify(response)};
const invalidMethod: HttpMethod = "INVALID";
const invalidDecoder: ResponseDecoderKey = "INVALID";
`,
    );
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "--noEmit",
        "--pretty",
        "false",
        "--noErrorTruncation",
        "--strict",
        "--skipLibCheck",
        "--target",
        "ESNext",
        "--module",
        "preserve",
        file,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");

    const diagnostics = result.stdout.trim().split(/\r?\n/);
    expect(diagnostics).toHaveLength(2);
    for (const [index, values] of [
      ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
      ["json", "text", "blob", "arrayBuffer", "bytes", "formData"],
    ].entries()) {
      const expectedType = diagnostics[index].match(/not assignable to type '([^']+)'/);
      expect(expectedType).not.toBeNull();
      expect(expectedType![1].split(" | ").sort()).toEqual(
        values.map((value) => JSON.stringify(value)).sort(),
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
