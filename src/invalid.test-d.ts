import { expectTypeOf, test } from "vitest";
import type { Invalid, IsUnion } from "./internal";

type EmptyError = Invalid<"Error: value must not be empty.">;
type PrefixError = Invalid<"Error: value must start with 'item:'.">;
type BothErrors = EmptyError & PrefixError;

// These small authoring fixtures use the production marker. Their successful
// additive constraints use unknown so primitive and nullish inputs survive.
type NonEmptyConstraint<Value> = [Value] extends [""]
  ? Invalid<"Error: value must not be empty.">
  : unknown;
type PrefixConstraint<Value extends string> = Value extends `item:${string}`
  ? unknown
  : Invalid<"Error: value must start with 'item:'.">;

declare function nonEmpty<const Value>(value: Value & NonEmptyConstraint<Value>): Value;

type Entry = { value: string; count: number; note?: string };
type EntryConstraint<Value extends Entry> = {
  value: NonEmptyConstraint<Value["value"]> & PrefixConstraint<Value["value"]>;
};
declare function entry<const Value extends Entry>(value: Value & EntryConstraint<Value>): Value;
declare function entries<const Values extends readonly Entry[]>(
  values: Values & { [Index in keyof Values]: EntryConstraint<Values[Index]> },
): Values;

declare function single<const Value>(
  value: Value & (true extends IsUnion<Value> ? Invalid<"Error: choose one value."> : Value),
): Value;

test("Invalid requires one symbol key with a readonly nested message map", () => {
  expectTypeOf<keyof EmptyError>().toExtend<symbol>();
  expectTypeOf<keyof EmptyError>().not.toBeNever();
  expectTypeOf<Extract<keyof EmptyError, string | number>>().toEqualTypeOf<never>();
  expectTypeOf<EmptyError[keyof EmptyError]>().toEqualTypeOf<{
    readonly "Error: value must not be empty.": never;
  }>();
  expectTypeOf<EmptyError>().toEqualTypeOf<{
    readonly [Key in keyof EmptyError]: EmptyError[Key];
  }>();

  // @ts-expect-error - an empty object cannot supply the required marker
  const missing: EmptyError = {};
  // @ts-expect-error - visible message properties cannot supply the private key
  const visible: EmptyError = { "Error: value must not be empty.": "" };
  void missing;
  void visible;
});

test("independent errors retain both messages instead of collapsing to never", () => {
  expectTypeOf<BothErrors>().not.toBeNever();
  expectTypeOf<keyof BothErrors>().toEqualTypeOf<keyof EmptyError>();
  expectTypeOf<keyof BothErrors[keyof BothErrors]>().toEqualTypeOf<
    "Error: value must not be empty." | "Error: value must start with 'item:'."
  >();
  expectTypeOf<BothErrors[keyof BothErrors]["Error: value must not be empty."]>().toBeNever();
  expectTypeOf<BothErrors[keyof BothErrors]["Error: value must start with 'item:'."]>().toBeNever();
  expectTypeOf<BothErrors>().toExtend<EmptyError>();
  expectTypeOf<BothErrors>().toExtend<PrefixError>();
  expectTypeOf<EmptyError>().not.toExtend<BothErrors>();
  expectTypeOf<PrefixError>().not.toExtend<BothErrors>();

  // @ts-expect-error - two errors still require the marker
  const missing: BothErrors = {};
  void missing;
});

test("repeated errors are idempotent and message unions require every message", () => {
  expectTypeOf<EmptyError & EmptyError>().toEqualTypeOf<EmptyError>();
  expectTypeOf<BothErrors & EmptyError>().toEqualTypeOf<BothErrors>();

  type MessageMap = Invalid<
    "Error: value must not be empty." | "Error: value must start with 'item:'."
  >;
  expectTypeOf<BothErrors>().toExtend<MessageMap>();
  expectTypeOf<MessageMap>().toExtend<BothErrors>();
  expectTypeOf<EmptyError>().not.toExtend<MessageMap>();
  expectTypeOf<keyof MessageMap[keyof MessageMap]>().toEqualTypeOf<
    keyof BothErrors[keyof BothErrors]
  >();
});

test("object intersections preserve valid properties and modifiers beside both errors", () => {
  type Neighbor = { readonly kind: "kept"; optional?: number; tuple: readonly [1, "two"] };
  type Invalid = Neighbor & BothErrors;
  expectTypeOf<Invalid>().not.toBeNever();
  expectTypeOf<Pick<Invalid, keyof Neighbor>>().toEqualTypeOf<Neighbor>();
  expectTypeOf<Extract<keyof Invalid, string>>().toEqualTypeOf<keyof Neighbor>();

  // @ts-expect-error - a structural error belongs on the containing object
  const missing: Invalid = { kind: "kept", tuple: [1, "two"] };
  const wrongField: Invalid = {
    // @ts-expect-error - ordinary field constraints still describe expected values
    kind: "changed",
    optional: 3,
    tuple: [1, "two"],
  };
  void missing;
  void wrongField;
});

test("markers compose with structural unions without erasing their correlations", () => {
  type Shape =
    | { readonly mode: "empty"; value?: undefined }
    | { readonly mode: "value"; value: string };
  type Invalid = Shape & BothErrors;
  expectTypeOf<Invalid>().not.toBeNever();
  expectTypeOf<Extract<Invalid, { mode: "value" }>["value"]>().toEqualTypeOf<string>();
  expectTypeOf<Extract<Invalid, { mode: "empty" }>["value"]>().toEqualTypeOf<undefined>();
  expectTypeOf<Extract<Invalid, { mode: "value" }>>().toExtend<BothErrors>();
  expectTypeOf<Extract<Invalid, { mode: "empty" }>>().toExtend<BothErrors>();

  // @ts-expect-error - an invalid combination of union fields belongs on the object
  const wrongCombination: Invalid = {
    mode: "empty",
    value: "unexpected",
  };
  void wrongCombination;
});

test("field constraints retain literal inference on valid neighboring fields", () => {
  const valid = entry({ value: "item:one", count: 1, note: "kept" });
  expectTypeOf(valid).toEqualTypeOf<{
    readonly value: "item:one";
    readonly count: 1;
    readonly note: "kept";
  }>();

  const invalid = entry({
    // @ts-expect-error - two independent field errors stay on this value
    value: "",
    count: 2,
    note: "still inferred",
  });
  expectTypeOf(invalid).toEqualTypeOf<{
    readonly value: "";
    readonly count: 2;
    readonly note: "still inferred";
  }>();

  entry({
    // @ts-expect-error - a single failing constraint has the same field location
    value: "other",
    count: 3,
  });
  // @ts-expect-error - native missing-property checks still apply at the object
  entry<{ value: "item:one"; count: number }>({ value: "item:one" });
});

test("later invalid array fields leave valid elements and tuple inference intact", () => {
  const result = entries([
    { value: "item:one", count: 1 },
    {
      // @ts-expect-error - a later element can carry both field errors
      value: "",
      count: 2,
      note: "kept",
    },
    { value: "item:three", count: 3 },
    {
      // @ts-expect-error - another bad element remains independently diagnosable
      value: "other",
      count: 4,
    },
  ]);
  expectTypeOf(result).toEqualTypeOf<
    readonly [
      { readonly value: "item:one"; readonly count: 1 },
      { readonly value: ""; readonly count: 2; readonly note: "kept" },
      { readonly value: "item:three"; readonly count: 3 },
      { readonly value: "other"; readonly count: 4 },
    ]
  >();
});

test("unknown success preserves primitive, nullish, tuple, and unknown inputs", () => {
  expectTypeOf<NonEmptyConstraint<null>>().toBeUnknown();
  expectTypeOf<NonEmptyConstraint<undefined>>().toBeUnknown();
  expectTypeOf<NonEmptyConstraint<unknown>>().toBeUnknown();
  expectTypeOf(nonEmpty("kept")).toEqualTypeOf<"kept">();
  expectTypeOf(nonEmpty(0)).toEqualTypeOf<0>();
  expectTypeOf(nonEmpty(false)).toEqualTypeOf<false>();
  expectTypeOf(nonEmpty(1n)).toEqualTypeOf<1n>();
  const token = Symbol("kept");
  expectTypeOf(nonEmpty(token)).toEqualTypeOf<typeof token>();
  expectTypeOf(nonEmpty(null)).toEqualTypeOf<null>();
  expectTypeOf(nonEmpty(undefined)).toEqualTypeOf<undefined>();
  const nullable = "" as "kept" | null | undefined;
  expectTypeOf(nonEmpty(nullable)).toEqualTypeOf<typeof nullable>();
  expectTypeOf(nonEmpty([1, "two"])).toEqualTypeOf<readonly [1, "two"]>();
  const unknownValue: unknown = "kept";
  expectTypeOf(nonEmpty(unknownValue)).toBeUnknown();

  // @ts-expect-error - the general-purpose fixture still rejects its failing value
  nonEmpty("");
});

test("primitive intersections retain independent messages; nullish failures remain impossible", () => {
  expectTypeOf<string & BothErrors>().not.toBeNever();
  expectTypeOf<number & BothErrors>().not.toBeNever();
  expectTypeOf<false & BothErrors>().not.toBeNever();
  expectTypeOf<bigint & BothErrors>().not.toBeNever();
  expectTypeOf<symbol & BothErrors>().not.toBeNever();
  expectTypeOf<(string & BothErrors)[keyof BothErrors]>().toExtend<BothErrors[keyof BothErrors]>();
  expectTypeOf<unknown & BothErrors>().toEqualTypeOf<BothErrors>();
  // Required object markers cannot inhabit nullish values, regardless of payload.
  expectTypeOf<null & BothErrors>().toBeNever();
  expectTypeOf<undefined & BothErrors>().toBeNever();
  expectTypeOf<never & BothErrors>().toBeNever();
});

test("union guards compose with independent Invalid markers", () => {
  type UnionError = true extends IsUnion<1 | 2> ? Invalid<"Error: choose one value."> : never;
  type Combined = UnionError & EmptyError;
  expectTypeOf<Combined>().not.toBeNever();
  expectTypeOf<keyof Combined[keyof Combined]>().toEqualTypeOf<
    "Error: choose one value." | "Error: value must not be empty."
  >();
});

test("union guards preserve useful inference and reject whole union variables", () => {
  const inferred = single({ value: "kept", alternatives: ["left", "right"] });
  expectTypeOf(inferred).toEqualTypeOf<{
    readonly value: "kept";
    readonly alternatives: readonly ["left", "right"];
  }>();
  expectTypeOf(single("one")).toEqualTypeOf<"one">();
  expectTypeOf(single(null)).toEqualTypeOf<null>();
  expectTypeOf(single(undefined)).toEqualTypeOf<undefined>();
  const union = "" as "left" | "right";
  // @ts-expect-error - separately declared unions are rejected at their use
  single(union);
  // @ts-expect-error - explicit generics cannot accept just one member of a union
  single<"left" | "right">("left");
});
