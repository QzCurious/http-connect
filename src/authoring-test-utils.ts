import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createMessageConnection } from "vscode-jsonrpc/node";

const require = createRequire(import.meta.url);
export const compiler = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");

type Position = { line: number; character: number };

export async function startLanguageServer() {
  const rootUri = pathToFileURL(process.cwd()).href;
  const child = spawn(process.execPath, [compiler, "--lsp", "-stdio"]);
  const connection = createMessageConnection(child.stdout, child.stdin);
  connection.listen();
  try {
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri,
      capabilities: { textDocument: { diagnostic: {} } },
    });
    await connection.sendNotification("initialized", {});
  } catch (error) {
    connection.dispose();
    child.kill();
    throw error;
  }

  return {
    async open(file: string, source: string) {
      const uri = pathToFileURL(file).href;
      const textDocument = { uri };
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: "typescript", version: 1, text: source },
      });

      const lines = source.split("\n");
      const offset = ({ line, character }: Position) =>
        lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, character);

      return {
        async completions(index: number) {
          const preceding = source.slice(0, index).split("\n");
          const result = await connection.sendRequest<{
            items: { label: string }[];
          } | null>("textDocument/completion", {
            textDocument,
            position: { line: preceding.length - 1, character: preceding.at(-1)!.length },
          });
          // The server appends a question mark to optional property labels.
          return result?.items.map((item) => item.label.replace(/\?$/, "")).sort();
        },
        async diagnostics() {
          const report = await connection.sendRequest<{
            items: {
              range: { start: Position; end: Position };
              message: string;
              severity: number;
            }[];
          }>("textDocument/diagnostic", { textDocument });
          // Editor hints such as unused variables are outside the compiler error assertions.
          return report.items
            .filter((item) => item.severity === 1)
            .map(({ range, message }) => ({
              start: offset(range.start),
              text: source.slice(offset(range.start), offset(range.end)),
              message,
            }));
        },
        close: () => connection.sendNotification("textDocument/didClose", { textDocument }),
      };
    },
    close() {
      connection.dispose();
      child.kill();
    },
  };
}
