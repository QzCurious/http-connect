import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Invalid, Prettify, ExpectedObjectSchema, StandardObjectSchema } from "../internal";

export type PathParamValue = Prettify<string | number>;

export type PathShape = {
  template: string;
  params: StandardObjectSchema | undefined;
};

export function path<const T extends string>(
  template: T &
    ExpectedPath<T> &
    ([PathParamNames<T>[number]] extends [never]
      ? unknown
      : Invalid<"Error: params is required when path contains placeholders.">),
): Readonly<{ template: T; params: undefined }>;
export function path<const T extends string, const S extends StandardObjectSchema>(
  template: T & ExpectedPath<T>,
  params: S & ExpectedPathParams<NoInfer<T>, S>,
): Readonly<{ template: T; params: S }>;
export function path(template: string, params?: StandardObjectSchema): PathShape {
  return { template, params };
}

/** Computes substitution for a path already validated during contract authoring. */
export type ResolvedPath<
  Path extends string,
  Params extends Record<string, PathParamValue>,
> = Path extends `${string}:${string}`
  ? ResolveColonPath<Path, Params>
  : ResolveBracePath<Path, Params>;

/**
 * Extracts path placeholder names as a tuple in source order.
 *
 * Repeated placeholder names are preserved. Index the tuple with `number` to
 * obtain a union of its parameter names.
 * Names follow `[A-Za-z_][A-Za-z0-9_]*`: colon placeholders stop at the first
 * other character; brace placeholders require an immediate closing brace.
 * Malformed placeholders and mixed styles produce `never`.
 *
 * @example
 * type ParamNames = PathParamNames<"/users/{userId}/posts/{postId}">;
 * // ["userId", "postId"]
 *
 * type ParamName = ParamNames[number];
 * // "userId" | "postId"
 */
export type PathParamNames<Path extends string> = Path extends unknown
  ? PathPlaceholderStyle<Path> extends "mixed"
    ? never
    : PathPlaceholderStyle<Path> extends "colon"
      ? ColonPathParamNameTuple<Path>
      : PathPlaceholderStyle<Path> extends "brace"
        ? BracePathParamNameTuple<Path>
        : []
  : never;

/** Whether a literal name matches `[A-Za-z_][A-Za-z0-9_]*` in full. */
export type IsValidPathParamName<Name extends string> = string extends Name
  ? false
  : Name extends `${infer First}${infer Rest}`
    ? ContainsOnlyCharacters<First, PathParamNameStart> extends true
      ? ContainsOnlyCharacters<Rest, PathParamNameCharacter>
      : false
    : false;

type ContainsOnlyCharacters<
  Value extends string,
  AllowedCharacter extends string,
> = Value extends ""
  ? true
  : Value extends `${infer Character}${infer Rest}`
    ? Character extends AllowedCharacter
      ? ContainsOnlyCharacters<Rest, AllowedCharacter>
      : false
    : false;

// Concrete literals produce required record keys; open patterns produce index
// signatures. Distribute over unions to validate every member.
export type ExpectedPath<Path extends string> = Path extends unknown
  ? {} extends Record<Path, never>
    ? Invalid<"Error: path must be a string literal.">
    : Path extends `//${string}`
      ? Invalid<'Error: path must not start with "//".'>
      : Path extends `/${string}`
        ? ExpectedPathWithValidPlaceholders<Path>
        : Invalid<"Error: path must start with '/'.">
  : never;

// Keep the diagnostic for each invalid union member during contract authoring.
type ExpectedPathWithValidPlaceholders<Path extends string> = Path extends unknown
  ? PathPlaceholderStyle<Path> extends "mixed"
    ? Invalid<'Error: path must not mix ":id" and "{id}" placeholder styles.'>
    : [PathParamNames<Path>] extends [never]
      ? Invalid<"Error: path contains an invalid placeholder.">
      : Path
  : never;

type ExpectedPathParams<
  Path extends string,
  Params extends StandardObjectSchema | undefined,
> = [PathParamNames<Path>[number]] extends [never]
  ? Params extends StandardObjectSchema
    ? Invalid<"Error: params may only be declared when path contains placeholders.">
    : undefined
  : Params extends StandardObjectSchema
    ? ExpectedPathParamsSchema<Path, Params>
    : Invalid<"Error: params is required when path contains placeholders.">;

type ExpectedPathParamsSchema<Path extends string, Schema extends StandardObjectSchema> =
  ExpectedObjectSchema<Schema, PathParamValue, unknown> extends Schema
    ? [MissingPathParamKeys<Path, Schema>] extends [never]
      ? [ExtraPathParamKeys<Path, Schema>] extends [never]
        ? StandardSchemaV1.InferOutput<Schema> extends Record<
            PathParamNames<Path>[number],
            PathParamValue
          >
          ? Schema
          : Invalid<"Error: params schema must output a required value for every path parameter.">
        : Invalid<`Error: params schema has keys that do not match declared path parameters: ${ExtraPathParamKeys<
            Path,
            Schema
          > &
            string}`>
      : Invalid<`Error: params schema is missing path parameters: ${MissingPathParamKeys<
          Path,
          Schema
        > &
          string}`>
    : ExpectedObjectSchema<Schema, PathParamValue, unknown>;

type MissingPathParamKeys<Path extends string, Schema extends StandardObjectSchema> = Exclude<
  PathParamNames<Path>[number],
  Extract<keyof StandardSchemaV1.InferOutput<Schema>, string>
>;

type ExtraPathParamKeys<Path extends string, Schema extends StandardObjectSchema> = Exclude<
  Extract<keyof StandardSchemaV1.InferOutput<Schema>, string>,
  PathParamNames<Path>[number]
>;

// Classify before parsing so recursive helpers only handle their own syntax.
// Unmatched braces count too: malformed paths cannot bypass this boundary.
type PathPlaceholderStyle<Path extends string> = Path extends `${string}:${string}`
  ? Path extends `${string}${"{" | "}"}${string}`
    ? "mixed"
    : "colon"
  : Path extends `${string}${"{" | "}"}${string}`
    ? "brace"
    : "plain";

type ColonPathParamNameTuple<Path extends string> = Path extends `${string}:${infer After}`
  ? ReadPathParamName<After> extends [infer Name extends string, infer Rest extends string]
    ? IsValidPathParamName<Name> extends true
      ? [Name, ...ColonPathParamNameTuple<Rest>]
      : never
    : never
  : [];

type BracePathParamNameTuple<Path extends string> =
  Path extends `${infer Prefix}{${infer Name}}${infer Rest}`
    ? Prefix extends `${string}${"{" | "}"}${string}`
      ? never
      : IsValidPathParamName<Name> extends true
        ? [Name, ...BracePathParamNameTuple<Rest>]
        : never
    : Path extends `${string}${"{" | "}"}${string}`
      ? never
      : [];

type ResolveColonPath<
  Path extends string,
  Params extends Record<string, PathParamValue>,
> = Path extends `${infer Prefix}:${infer After}`
  ? ReadPathParamName<After> extends [infer Name extends string, infer Rest extends string]
    ? `${Prefix}${Params[Name]}${ResolveColonPath<Rest, Params>}`
    : never
  : Path;

type ResolveBracePath<
  Path extends string,
  Params extends Record<string, PathParamValue>,
> = Path extends `${infer Prefix}{${infer Name}}${infer Rest}`
  ? `${Prefix}${Params[Name]}${ResolveBracePath<Rest, Params>}`
  : Path;

type ReadPathParamName<
  Value extends string,
  Name extends string = "",
> = Value extends `${infer Character}${infer Rest}`
  ? Character extends PathParamNameCharacter
    ? ReadPathParamName<Rest, `${Name}${Character}`>
    : [Name, Value]
  : [Name, Value];

type PathParamNameStart =
  | StringCharacters<"abcdefghijklmnopqrstuvwxyz">
  | StringCharacters<"ABCDEFGHIJKLMNOPQRSTUVWXYZ">
  | "_";

type PathParamNameCharacter = PathParamNameStart | StringCharacters<"0123456789">;

type StringCharacters<Value extends string> = Value extends `${infer Character}${infer Rest}`
  ? Character | StringCharacters<Rest>
  : never;
