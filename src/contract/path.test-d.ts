import { z } from "zod";
import { path, resolvePath, type PathInput } from "../public";
import type { Invalid } from "../internal";
import { expectTypeOf, test } from "vitest";
import type { ExpectedPath, IsValidPathParamName, PathParamNames, ResolvedPath } from "./path";

test("validates complete path parameter names independently of parsing", () => {
  expectTypeOf<IsValidPathParamName<"id">>().toEqualTypeOf<true>();
  expectTypeOf<IsValidPathParamName<"_">>().toEqualTypeOf<true>();
  expectTypeOf<IsValidPathParamName<"_A1_z9">>().toEqualTypeOf<true>();
  expectTypeOf<IsValidPathParamName<"Zebra0">>().toEqualTypeOf<true>();

  expectTypeOf<IsValidPathParamName<"">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"123">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"1bad">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"bad-name">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"id.json">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"café">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<"id\n">>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<string>>().toEqualTypeOf<false>();
  expectTypeOf<IsValidPathParamName<`id${string}`>>().toEqualTypeOf<false>();
});

test("type parsers match the runtime identifier grammar", () => {
  expectTypeOf<PathParamNames<"/files/:fileName.:extension">>().toEqualTypeOf<
    ["fileName", "extension"]
  >();
  expectTypeOf<
    ResolvedPath<"/files/:fileName.:extension", { fileName: "report"; extension: "json" }>
  >().toEqualTypeOf<"/files/report.json">();

  expectTypeOf<PathParamNames<"/files/{fileName}.{extension}">>().toEqualTypeOf<
    ["fileName", "extension"]
  >();
  expectTypeOf<
    ResolvedPath<"/files/{fileName}.{extension}", { fileName: "report"; extension: "json" }>
  >().toEqualTypeOf<"/files/report.json">();

  expectTypeOf<PathParamNames<"/:id-:id/:_A1">>().toEqualTypeOf<["id", "id", "_A1"]>();
  expectTypeOf<
    ResolvedPath<"/:id-:id/:_A1", { id: 42; _A1: "code" }>
  >().toEqualTypeOf<"/42-42/code">();

  expectTypeOf<PathParamNames<"/{_A1}/{id}{postId}">>().toEqualTypeOf<["_A1", "id", "postId"]>();
  expectTypeOf<
    ResolvedPath<"/{_A1}/{id}{postId}", { _A1: "code"; id: 42; postId: 99 }>
  >().toEqualTypeOf<"/code/4299">();

  expectTypeOf<PathParamNames<"/:café">>().toEqualTypeOf<["caf"]>();
  expectTypeOf<ResolvedPath<"/:café", { caf: "coffee" }>>().toEqualTypeOf<"/coffeeé">();
});

test("rejects invalid placeholder syntax", () => {
  type Malformed =
    | "/users/:123"
    | "/users/:1bad"
    | "/users/:"
    | "/users/::id"
    | "/users/{1bad}"
    | "/users/{bad-name}"
    | "/users/{café}"
    | "/users/{id\n}"
    | "/users/{}"
    | "/users/{id"
    | "/users/id}"
    | "/users/{id}}"
    | "/users/{id}/{"
    | "/users/{{id}}"
    | "/users/{bad{postId}}"
    | "/users/{:id}"
    | "/users/:{id}";
  type Accepted = {
    [Path in Malformed]: ExpectedPath<Path> extends Path ? Path : never;
  }[Malformed];

  expectTypeOf<Accepted>().toEqualTypeOf<never>();
  expectTypeOf<PathParamNames<Malformed>>().toEqualTypeOf<never>();
});

test("extracts params from repeated placeholders, plain paths, and path unions", () => {
  expectTypeOf<PathParamNames<"/users/{id}/{id}/posts/{postId}">>().toEqualTypeOf<
    ["id", "id", "postId"]
  >();
  expectTypeOf<PathParamNames<"/health">>().toEqualTypeOf<[]>();
  expectTypeOf<PathParamNames<"/users/:id" | "/posts/{postId}" | "/health">>().toEqualTypeOf<
    ["id"] | ["postId"] | []
  >();
});

test("rejects mixed placeholder styles", () => {
  type Mixed = "/users/:id/{postId}" | "/users/{id}/:postId" | "/users/:id/{" | "/users/}/:id";

  expectTypeOf<PathParamNames<Mixed>>().toEqualTypeOf<never>();
  expectTypeOf<ExpectedPath<Mixed>>().toEqualTypeOf<
    Invalid<'Error: path must not mix ":id" and "{id}" placeholder styles.'>
  >();
});

test("preserves plain paths at type level", () => {
  expectTypeOf<ResolvedPath<"/users", {}>>().toEqualTypeOf<"/users">();
  expectTypeOf<ResolvedPath<string, {}>>().toEqualTypeOf<string>();
});

test("infers path inputs for resolution", () => {
  const notesPath = path(
    "/workspaces/:workspaceId/notes",
    z.object({ workspaceId: z.string().transform(Number) }),
  );
  expectTypeOf<PathInput<typeof notesPath>>().toEqualTypeOf<{ params: { workspaceId: string } }>();
  expectTypeOf(resolvePath<typeof notesPath>)
    .parameter(1)
    .toEqualTypeOf<{ workspaceId: string }>();
  const health = path("/health");
  expectTypeOf(resolvePath<typeof health>).parameters.toEqualTypeOf<[path: typeof health]>();
  expectTypeOf<PathInput<typeof health>>().toEqualTypeOf<{}>();
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
  path(template);
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
});

test("params schema keys follow the runtime placeholder grammar", () => {
  path("/files/:fileName.:extension", z.object({ fileName: z.string(), extension: z.string() }));

  path("/files/prefix-:_A1.json", z.object({ _A1: z.string() }));

  path(
    "/files/:fileName.:extension",
    // @ts-expect-error - punctuation terminates colon placeholder names
    z.object({ "fileName.:extension": z.string() }),
  );
});

test("rejects invalid names and malformed placeholders during authoring", () => {
  // @ts-expect-error - placeholder names must be identifiers
  path("/files/{bad-name}");

  // @ts-expect-error - colon names cannot start with a digit
  path("/users/:123");

  // @ts-expect-error - nested braces are invalid
  path("/users/{{id}}");
});

test("params schemas must output a value for every placeholder", () => {
  path(
    "/users/{id}",
    // @ts-expect-error - an optional output cannot guarantee a path parameter
    z.object({ id: z.string().optional() }),
  );

  const shape = path("/users/{id}", z.object({ id: z.string().default("guest") }));

  expectTypeOf<z.input<typeof shape.params>>().toEqualTypeOf<{ id?: string }>();
  expectTypeOf<z.output<typeof shape.params>>().toEqualTypeOf<{ id: string }>();
});

test("rejects params when path has no placeholders", () => {
  path(
    "/users",
    // @ts-expect-error - params is not allowed without placeholders
    z.object({ id: z.string() }),
  );
});

test("rejects extra params keys", () => {
  path(
    "/users/{id}",
    // @ts-expect-error - extra is not present in path
    z.object({ id: z.string(), extra: z.string() }),
  );
});

test("rejects missing params keys", () => {
  path(
    "/users/{id}/posts/{postId}",
    // @ts-expect-error - postId is missing
    z.object({ id: z.string() }),
  );
});

test("rejects params schemas with unsupported output values", () => {
  path(
    "/users/{id}",
    // @ts-expect-error - params must output string or number values
    z.object({ id: z.boolean() }),
  );

  path(
    "/users/{id}",
    // @ts-expect-error - params must output string or number values
    z.object({ id: z.string().transform((value) => ({ value })) }),
  );
});

test("accepts unknown path parameter inputs with supported outputs", () => {
  const shape = path("/users/{id}", z.object({ id: z.coerce.number() }));
  expectTypeOf<z.input<typeof shape.params>>().toEqualTypeOf<{ id: unknown }>();
  expectTypeOf<z.output<typeof shape.params>>().toEqualTypeOf<{ id: number }>();
});
