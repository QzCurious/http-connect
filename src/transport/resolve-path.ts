import { CallInputValidationError } from "./call-input";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { PathShape } from "../contract/path";
import type { StandardObjectSchema } from "../internal";

type ParamsArgument<Params> = StandardObjectSchema extends Params
  ? [params?: unknown]
  : Params extends StandardObjectSchema
    ? [params: StandardSchemaV1.InferInput<Params>]
    : [];

export function resolvePath<Path extends PathShape>(
  path: Path,
  ...args: ParamsArgument<NoInfer<Path["params"]>>
): Promise<string>;
export async function resolvePath(path: PathShape, params?: unknown): Promise<string> {
  if (!path.params) return path.template;

  const result = await path.params["~standard"].validate(params);
  if (result.issues) {
    throw new CallInputValidationError("params", result.issues);
  }

  return path.template.replace(
    /:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}/gu,
    (_, colon: string | undefined, brace: string) =>
      encodeURIComponent(String(result.value[colon ?? brace])),
  );
}
