import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export default {
  meta: { name: "playground" },
  rules: {
    "public-api-only": {
      meta: {
        type: "problem",
        messages: { privateImport: "Import the library through src/public.ts or http-connect." },
      },
      create(context) {
        function check(source) {
          const specifier =
            source?.type === "TemplateLiteral" && source.expressions.length === 0
              ? source.quasis[0].value.cooked
              : source?.value;
          if (typeof specifier !== "string") return;

          if (!specifier.startsWith("http-connect/")) {
            if (!specifier.startsWith(".") && !isAbsolute(specifier)) return;
            const [path] = specifier.split(/[?#]/);
            const target = resolve(dirname(context.filename), path);
            const local = relative(root, target).split(sep).join("/");
            if (!local.startsWith("src/") && !local.startsWith("dist/")) return;
            if (["src/public", "src/public.ts", "src/public.js", "dist/public.js"].includes(local))
              return;
          }

          context.report({ node: source, messageId: "privateImport" });
        }

        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          TSImportType: (node) => check(node.source ?? node.parameter?.literal),
          TSExternalModuleReference: (node) => check(node.expression),
          'CallExpression[callee.name="require"]': (node) => check(node.arguments[0]),
        };
      },
    },
  },
};
