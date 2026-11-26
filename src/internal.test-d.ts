import { expectTypeOf, test } from "vitest";
import type { DefinedField, ExpectedObjectOrArray, IsUnion, Prettify } from "./internal";

type Item = { format: "text" | "json"; label?: string };
declare function define<const T>(value: ExpectedObjectOrArray<T, Item>): T;

test("ExpectedObjectOrArray infers literals for objects and arrays", () => {
  const single = define({ format: "text", extra: 1 });
  expectTypeOf(single).toEqualTypeOf<{
    readonly format: "text";
    readonly extra: 1;
  }>();
  const alternatives = define([{ format: "text" }, { format: "json" }]);
  expectTypeOf(alternatives).toEqualTypeOf<
    readonly [{ readonly format: "text" }, { readonly format: "json" }]
  >();
  expectTypeOf(define([])).toEqualTypeOf<readonly []>();

  const readonlyTuple = [{ format: "text", label: "plain" }] as const;
  expectTypeOf(define(readonlyTuple)).toEqualTypeOf<typeof readonlyTuple>();
  const mutableTuple: [Item, Item] = [{ format: "text" }, { format: "json" }];
  expectTypeOf(define(mutableTuple)).toEqualTypeOf<typeof mutableTuple>();
  const mutableArray: Item[] = [{ format: "text" }];
  expectTypeOf(define(mutableArray)).toEqualTypeOf<typeof mutableArray>();
  const readonlyArray: readonly Item[] = mutableArray;
  expectTypeOf(define(readonlyArray)).toEqualTypeOf<typeof readonlyArray>();
});

test("ExpectedObjectOrArray reports invalid fields at their declarations", () => {
  define({
    // @ts-expect-error - expected format values belong on the field
    format: "xml",
    label: "plain",
  });
  define([
    { format: "text", label: "plain" },
    {
      // @ts-expect-error - the later element's field is the error location
      format: "xml",
      label: "other",
    },
    { format: "json" },
  ]);
  define({
    format: "text",
    // @ts-expect-error - optional fields retain their constraints
    label: 1,
  });
});

test("ExpectedObjectOrArray requires complete objects and rejects nonobjects and nested arrays", () => {
  // @ts-expect-error - format is required
  define({ label: "missing format" });
  define([
    { format: "json" },
    // @ts-expect-error - each item must have format
    {},
  ]);
  // @ts-expect-error - a primitive is not an item
  define(1);
  // @ts-expect-error - null is not an item
  define(null);
  // @ts-expect-error - undefined is not an item
  define(undefined);
  // @ts-expect-error - only flat arrays are supported
  define([[{ format: "text" }]]);
});

type PairedItem = { mode: "empty"; value?: undefined } | { mode: "value"; value: string };
declare function definePaired<const T>(value: ExpectedObjectOrArray<T, PairedItem>): T;

test("ExpectedObjectOrArray retains relationships between fields in a union", () => {
  const single = definePaired({ mode: "value", value: "present" });
  expectTypeOf(single).toEqualTypeOf<{
    readonly mode: "value";
    readonly value: "present";
  }>();
  definePaired({ mode: "empty" });
  // @ts-expect-error - the value branch requires value
  definePaired({ mode: "value" });
  // @ts-expect-error - the empty branch forbids a string value
  definePaired({ mode: "empty", value: "unexpected" });
  definePaired([
    { mode: "empty" },
    // @ts-expect-error - each element retains the union relationship
    { mode: "value" },
  ]);
});

test("IsUnion detects whole unions, including overlapping members", () => {
  expectTypeOf<IsUnion<"left" | "right">>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<string | number>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<boolean>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<"one" | null | undefined>>().toEqualTypeOf<true>();
  type Overlapping = IsUnion<{ value: 1 } | { value: 1; extra: 2 }>;
  expectTypeOf<Overlapping>().toEqualTypeOf<boolean>();
  expectTypeOf<true extends Overlapping ? true : false>().toEqualTypeOf<true>();
});

test("IsUnion allows nested unions and handles single and special types", () => {
  type Shape = { readonly method: "GET" | "POST"; body?: string };
  type Tuple = readonly ["left" | "right", { readonly id: 1 }];
  expectTypeOf<IsUnion<Shape>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<Tuple>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<readonly (1 | 2)[]>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<{ left: 1 } & { right: 2 }>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<true>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<null>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<undefined>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<never>>().toBeNever();
  expectTypeOf<IsUnion<unknown>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<any>>().toEqualTypeOf<false>();
});

test("IsUnion follows TypeScript's union normalization", () => {
  expectTypeOf<IsUnion<"one" | never>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<"one" | "one">>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<string | "one">>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<number | 1>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<unknown | 1>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<any | 1>>().toEqualTypeOf<false>();
});

test("prettify preserves primitive unions including null and undefined", () => {
  expectTypeOf<Prettify<string | number | boolean | null | undefined>>().toEqualTypeOf<
    string | number | boolean | null | undefined
  >();
  expectTypeOf<Prettify<never>>().toEqualTypeOf<never>();
});

test("prettify flattens object intersections while preserving property modifiers", () => {
  expectTypeOf<Prettify<{ readonly id: string } & { label?: string }>>().toEqualTypeOf<{
    readonly id: string;
    label?: string;
  }>();
});

test("defined fields preserve required values, including never and null", () => {
  expectTypeOf<DefinedField<"value", string>>().toEqualTypeOf<{
    value: string;
  }>();
  expectTypeOf<DefinedField<"value", never>>().toEqualTypeOf<{
    value: never;
  }>();
  expectTypeOf<DefinedField<"value", string | null>>().toEqualTypeOf<{
    value: string | null;
  }>();
});

test("defined fields allow omission only when output can be undefined", () => {
  expectTypeOf<DefinedField<"value", undefined>>().toEqualTypeOf<{
    value?: undefined;
  }>();
  expectTypeOf<DefinedField<"value", string | undefined>>().toEqualTypeOf<{
    value?: string | undefined;
  }>();
  expectTypeOf<DefinedField<"value", unknown>>().toEqualTypeOf<{
    value?: unknown;
  }>();
});

test("ExpectedObjectOrArray retains required fields in mixed object-or-array unions", () => {
  type Mixed = { label: "plain" } | readonly [{ format: "text" }];
  // @ts-expect-error - the object branch still requires format
  const missing: ExpectedObjectOrArray<Mixed, Item> = { label: "plain" };
  void missing;

  type PairedMixed = { mode: "value" } | readonly [{ mode: "empty" }];
  // @ts-expect-error - the object branch still requires its paired value
  const unpaired: ExpectedObjectOrArray<PairedMixed, PairedItem> = { mode: "value" };
  void unpaired;

  const valid: ExpectedObjectOrArray<Item | readonly Item[], Item> = { format: "text" };
  const validArray: ExpectedObjectOrArray<Item | readonly Item[], Item> = [{ format: "json" }];
  void valid;
  void validArray;
});
