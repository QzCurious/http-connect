// Authoring example using the repo's helper; checked with TypeScript 5.9.3.
// Scope: one fixed object shape or a flat array of that shape, with extra keys.
// Type-check only: define() is intentionally declared without a runtime body.
import type { ExpectedObjectOrArray } from "../../../../src/internal";

type Item = { format: "text" | "json" };

declare function define<const T>(value: ExpectedObjectOrArray<T, Item>): T;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const single = define({ format: "text", name: "first" });
type SinglePreserved = Assert<
  Equal<typeof single, { readonly format: "text"; readonly name: "first" }>
>;

const alternatives = define([{ format: "text", name: "first" }, { format: "json" }]);
type AlternativesPreserved = Assert<
  Equal<
    typeof alternatives,
    readonly [{ readonly format: "text"; readonly name: "first" }, { readonly format: "json" }]
  >
>;

const readonlyInput = [{ format: "json" }, { format: "text" }] as const;
const readonlyResult = define(readonlyInput);
type ReadonlyPreserved = Assert<Equal<typeof readonlyResult, typeof readonlyInput>>;

const mutableTuple: [Item, Item] = [{ format: "text" }, { format: "json" }];
const mutableTupleResult = define(mutableTuple);
type MutableTuplePreserved = Assert<Equal<typeof mutableTupleResult, [Item, Item]>>;

const widenedInput: Item[] = [{ format: "json" }];
const widenedResult = define(widenedInput);
type WidenedPreserved = Assert<Equal<typeof widenedResult, Item[]>>;

const readonlyArray: readonly Item[] = [{ format: "text" }];
const readonlyArrayResult = define(readonlyArray);
type ReadonlyArrayPreserved = Assert<Equal<typeof readonlyArrayResult, readonly Item[]>>;

// Empty arrays are allowed by ExpectedObjectOrArray; nonempty is a separate rule.
const empty = define([]);
type EmptyPreserved = Assert<Equal<typeof empty, readonly []>>;

define({
  // @ts-expect-error - diagnostic must identify this field's allowed formats
  format: "xml",
});

define([
  { format: "text", name: "first" },
  {
    // @ts-expect-error - diagnostic belongs on this field, not its element
    format: "xml",
  },
  { format: "json", name: "third" },
  {
    // @ts-expect-error - another invalid field gets its own diagnostic
    format: "csv",
  },
]);

// @ts-expect-error - missing format belongs on the containing object
define({ name: "missing" });

define([
  { format: "text" },
  // @ts-expect-error - missing format belongs on this element
  {},
]);

// @ts-expect-error - a primitive is not an Item
define(4);

define([
  { format: "text" },
  // @ts-expect-error - a primitive element is not an Item
  4,
]);

// @ts-expect-error - null is not an Item
define(null);

// @ts-expect-error - undefined is not an Item
define(undefined);

define([
  // @ts-expect-error - an ordinary nested array is not an Item
  [{ format: "text" }],
]);
