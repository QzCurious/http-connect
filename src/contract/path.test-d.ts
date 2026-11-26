import { z } from "zod";
import { path, request, resolvePath, type PathInput, type RequestInput } from "../public";
import type { Invalid } from "../internal";
import { expectTypeOf, test } from "vitest";
import type { ExpectedPath, IsValidPathParamName, PathParamNames, ResolvedPath } from "./path";

test("extracts params from colon and brace syntax", () => {
  expectTypeOf<PathParamNames<"/users/:id">>().toEqualTypeOf<["id"]>();
  expectTypeOf<PathParamNames<"/users/{id}/posts/{postId}">>().toEqualTypeOf<["id", "postId"]>();
});

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

test("resolves colon paths at type level", () => {
  expectTypeOf<
    ResolvedPath<"/users/:id/posts/:postId", { id: "42"; postId: 99 }>
  >().toEqualTypeOf<"/users/42/posts/99">();
});

test("resolves brace paths at type level", () => {
  expectTypeOf<
    ResolvedPath<"/users/{id}/posts/{postId}", { id: "42"; postId: 99 }>
  >().toEqualTypeOf<"/users/42/posts/99">();
});

test("preserves plain paths at type level", () => {
  expectTypeOf<ResolvedPath<"/users", {}>>().toEqualTypeOf<"/users">();
  expectTypeOf<ResolvedPath<string, {}>>().toEqualTypeOf<string>();
});

test("composes path and request inputs from the schema input types", () => {
  const notesPath = path(
    "/workspaces/:workspaceId/notes",
    z.object({
      workspaceId: z.string().transform(Number),
    }),
  );
  const note = request({ encodeAs: "text", body: z.number().transform(String) });

  expectTypeOf<PathInput<typeof notesPath> & RequestInput<typeof note>>().toMatchTypeOf<{
    params: { workspaceId: string };
    body: number;
  }>();
  expectTypeOf(resolvePath<typeof notesPath>)
    .parameter(1)
    .toEqualTypeOf<{ workspaceId: string }>();
  const health = path("/health");
  expectTypeOf(resolvePath<typeof health>).parameters.toEqualTypeOf<[path: typeof health]>();
  expectTypeOf<PathInput<typeof health>>().toEqualTypeOf<{}>();

  request({
    encodeAs: "text",
    body: z.string(),
    // @ts-expect-error - params belong to the path declaration
    params: notesPath.params,
  });
});
