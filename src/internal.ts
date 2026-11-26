import type { StandardSchemaV1, StandardTypedV1 } from "@standard-schema/spec";

/**
 * Makes types easier to read in editor hovers and error messages.
 *
 * @example <caption>Hovers show all fields together in one object.</caption>
 * type User = { id: string } & { name: string };
 * // Hover: { id: string } & { name: string }
 *
 * type ReadableUser = Prettify<User>;
 * // Hover: { id: string; name: string }
 *
 * @example <caption>Errors list allowed values without looking up the type.</caption>
 * type Method = "GET" | "POST";
 * const method: Method = "PUT";
 * // Error: Type '"PUT"' is not assignable to type 'Method'.
 *
 * type ReadableMethod = Prettify<"GET" | "POST">;
 * const readableMethod: ReadableMethod = "PUT";
 * // Error: Type '"PUT"' is not assignable to type '"GET" | "POST"'.
 */
export type Prettify<T, Result = { [K in keyof T]: T[K] } & {}> = [T] extends [object]
  ? Result
  : Result & ({} | null | undefined);

/** A declared field whose runtime value is omitted when it is undefined.
 * Declaration presence must be checked separately; never is a required value.
 */
export type DefinedField<Name extends PropertyKey, Value> = undefined extends Value
  ? { [Key in Name]?: Value }
  : { [Key in Name]: Value };

// Collect extra keys from every union member before building the constraint.
type ExtraPropertyKeys<Actual, AllowedKeys extends PropertyKey> = Actual extends unknown
  ? Exclude<keyof Actual, AllowedKeys>
  : never;

export type NoExtraPropertiesConstraint<Actual, AllowedKeys extends PropertyKey> = [
  ExtraPropertyKeys<Actual, AllowedKeys>,
] extends [never]
  ? {}
  : {
      [Key in ExtraPropertyKeys<Actual, AllowedKeys>]: Invalid<
        Key extends string | number
          ? `Error: unknown property: ${Key}`
          : "Error: unknown symbol property"
      >;
    };

/**
 * Infer one object or a flat collection without retaining invalid field values
 * in the expected type. The item intersection also preserves union relations
 * (for example, two fields that must be declared together).
 * Dependent constraints and exact-key checks belong to the caller.
 * Union inputs also need a direct inference source for validated shapes;
 * reverse mapping alone may infer only their first member.
 */
export type ExpectedObjectOrArray<T, Item extends object> = T extends readonly unknown[]
  ? { [K in keyof T]: ExpectedObjectOrArray<T[K], Item> & Item }
  : ExpectedObject<T, Item>;

export type ExpectedObject<T, Item extends object> = {
  [K in keyof T]: K extends keyof Item ? (T[K] extends Item[K] ? T[K] : Item[K]) : T[K];
} & Item;

/**
 * Detect whole-type unions, allowing unions within fields and tuple elements.
 * Check with `true extends IsUnion<T>`: overlapping members can yield boolean.
 * never stays never; any/unknown and normalized single types yield false.
 */
export type IsUnion<T, Whole = T> = T extends unknown
  ? [Whole] extends [T]
    ? false
    : true
  : never;

declare const invalid: unique symbol;

/**
 * A custom type-level error when native TypeScript errors do not explain the rule.
 * Supports intersecting independent failures; diagnostic formatting is compiler-controlled.
 *
 * @example
 * type NonEmpty<S extends string> = S extends ""
 *   ? Invalid<"Value must not be empty">
 *   : S;
 */
export interface Invalid<Message extends string> {
  readonly [invalid]: { readonly [Key in Message]: never };
}

export function formatValidationIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  return issues
    .map((issue) => {
      if (!issue.path || issue.path.length === 0) {
        return issue.message;
      }

      const path = issue.path
        .map((segment) =>
          typeof segment === "object" && segment !== null && "key" in segment
            ? String(segment.key)
            : String(segment),
        )
        .join(".");

      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export type StandardObjectSchema = StandardSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;

type ConstrainedObjectSchema<
  Schema extends StandardObjectSchema,
  OutputAllowedValue,
  InputAllowedValue,
> = StandardTypedV1<
  { [Key in keyof StandardSchemaV1.InferInput<Schema>]: InputAllowedValue },
  { [Key in keyof StandardSchemaV1.InferOutput<Schema>]: OutputAllowedValue }
>;

export type ExpectedObjectSchema<
  Schema extends StandardObjectSchema,
  OutputAllowedValue,
  InputAllowedValue,
> = [Schema] extends [ConstrainedObjectSchema<Schema, OutputAllowedValue, InputAllowedValue>]
  ? Schema
  : ConstrainedObjectSchema<Schema, OutputAllowedValue, InputAllowedValue>;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly (JsonValue | undefined)[]
  | { readonly [key: string]: JsonValue | undefined };

export function shallowMergeDefined<T extends object>(...layers: (T | undefined)[]): Partial<T> {
  const merged: Partial<T> = {};
  for (const layer of layers) {
    for (const key in layer) {
      if (!Object.hasOwn(layer, key)) continue;
      const value = layer[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}
