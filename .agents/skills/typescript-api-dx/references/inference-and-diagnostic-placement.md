# Inference and diagnostic placement

## Diagnose before adding machinery

Compare the failing call with an otherwise identical valid call. Inspect whether the invalid field causes a generic to use its broad constraint, whether that widening reaches unrelated fields, and which conditional types then evaluate against that broad type.

Use a minimal reproduction without application schemas first, then verify the proposed change in the real API. A simple generic signature may already produce good field diagnostics. Splitting request-like and response-like generics can stop cross-field widening, but does not by itself ensure an error on a nested field. Overloads can move a diagnostic to the call and add noise from unrelated overloads; inspect their actual output.

## Branch before dependent validation

Use native structural types to enforce missing properties and field combinations. A union such as `{ body?: never; encodeAs?: never } | { body: Schema; encodeAs: Encoding }` already explains missing paired properties. These are structural errors on the containing object under ADR 0010; custom pairing messages and invalid-result repair types are unnecessary.

Infer against a field view when inferring against the complete structural union would cause broad fallback. In the request helpers, the field view lists `body` and `encodeAs` as independently optional, and the union requires both or neither.

```ts
type Constraint<T extends Fields> = true extends IsUnion<T>
  ? Invalid<"Error: unions of Request Shapes are not supported.">
  : [T] extends [Shape] ? DependentConstraint<T> : Shape;
declare function define<const T extends Fields>(value: T & Constraint<T>): T;
```

Reject unsupported whole-shape unions first, even when a member is structurally invalid. Then branch on structural validity: the false branch supplies the native expectation, while the true branch checks path/params, encoding/schema, and other dependent rules. `{}` in the structural false branch would accept invalid inputs. The tuple wrapper preserves whole-union validation rather than checking each member in isolation.

Here `Shape` is a concrete type. The standalone `T` in the parameter captures the argument, and the fallback supplies the expected request structure. Regression tests cover both narrower unions and the broad `RequestShape` type. Invalid basic field values may still widen the invalid call's result, and nested invalid calls can produce native errors at both boundaries.

Use the reverse mapped `ExpectedObjectOrArray<T, Item>` below when native structural diagnostics are insufficient, such as field errors inside response arrays. Do not introduce it solely to replace an already useful native missing-property diagnostic.

## Let the helper own the mapping

When ordinary structural types do not suffice, use the inferred input and expected item shape as the helper's interface:

```ts
declare function define<const T>(value: ExpectedObjectOrArray<T, Item>): T;
```

The executable [reverse-mapped-check.ts](reverse-mapped-check.ts) example imports the production helper from `src/internal.ts`, so it checks the implementation used by the API rather than a separate prototype. Its structure is:

```ts
type ExpectedObjectOrArray<T, Item extends object> = T extends readonly unknown[]
  ? { [K in keyof T]: ExpectedObjectOrArray<T[K], Item> & Item }
  : ExpectedObject<T, Item>;

type ExpectedObject<T, Item extends object> = {
  [K in keyof T]: K extends keyof Item ? (T[K] extends Item[K] ? T[K] : Item[K]) : T[K];
} & Item;
```

Here `T` is unconstrained. TypeScript infers it through the homomorphic mapped type (`[K in keyof T]`), a technique called reverse mapped type inference. The mapping preserves keys and tuple positions without requiring a separate container generic in the function signature.

- For an object property, keep the inferred type when valid and otherwise supply the expected field type. With `Item = { format: "text" | "json" }`, an invalid `format` gets the allowed-value diagnostic instead of an opaque `never` error. Extra properties are preserved.
- For an array, map each position. The per-element `& Item` requires each element to satisfy the item shape, including rejecting ordinary nested arrays for object-shaped items.
- For a single object, intersect the complete `Item`. This enforces missing fields, rejects primitives, and preserves relationships between fields in structural unions. Restoring only missing keys with `Pick` is insufficient: it can accept a response with a decoder but no body because each property is independently optional across the union.

Do not reflexively write `T & ExpectedObjectOrArray<T, Item>` or constrain `T` to the accepted shape. Intersecting an invalid captured literal with its replacement can collapse it to `never`; constraining `T` can reintroduce broad-constraint fallback. Test the resulting diagnostics rather than assuming these changes are equivalent.

## Compose with direct inference and dependent constraints

Reverse mapping alone can infer only the first member of a valid union variable. Test a single union-valued object separately from an array containing that union. The endpoint signature supplies direct inference through `T & ResponseShapeConstraint<T>` for structurally valid shapes. Its response mapping uses `ExpectedObject` for invalid shapes:

```ts
type CheckedResponseItem<T> = T extends ResponseShape
  ? T & ResponseShapeConstraint<T>
  : ExpectedObject<T, ResponseShape>;
```

Both structural helpers leave exact keys, nonempty response tuples, decoder/schema compatibility, and header-schema requirements to the caller. Keep those constraints separate and test that they still fire beside an invalid decoder in another array element. Check both valid and invalid union members so distribution cannot silently discard a failing member.

The endpoint's conditional response constraint on its `Contract` generic also preserves response inference when the request is invalid. Retain independent inference on both sides and verify return types, not just call acceptance.

Keep the direct request inference anchors (`Shape & RequestShapeConstraint<Shape>` in `request()` and `Request & RequestShapeConstraint<Request>` in `endpoint()`). Conditional constraints alone do not provide equivalent inference. Removing the prior explicit shape intersections made the TypeScript 5.9.3 project typecheck exhaust the default Node heap during verification.

## Verify the demonstrated scope

The example was verified with TypeScript 5.9.3 in strict mode. It covers literal and extra-property inference, mutable and readonly tuples and arrays, empty arrays, field errors with valid neighbors, missing fields, primitives, nullish values, and ordinary nested arrays. The repository type tests additionally cover structural union relationships and composition with endpoint constraints.

- A generic parameter does not establish support for arbitrary item types. Test the structural shapes and union inputs relevant to the API.
- Preserve established mutability. A standalone const helper infers readonly inline tuples, while endpoint inline response tuples retain their existing mutable container type.
- For a separately declared variable, an error at its use may be appropriate; do not promise an error inside its original declaration.
- Invalid declarations may still cause downstream use errors. Distinguish those from misleading errors on valid sibling fields.

Read [testing-type-apis.md](testing-type-apis.md) before accepting a signature change. Check the example independently without changing the playground:

```sh
pnpm exec tsc --ignoreConfig --strict --noEmit --skipLibCheck .agents/skills/typescript-api-dx/references/reverse-mapped-check.ts
```

This example is a type-only consumer of the repository helper. Do not execute its declared function, and do not substitute this check for the real API's type tests.

`--ignoreConfig` is required when passing individual files to the installed TypeScript 7 compiler; omit it with older compilers that do not support the flag.
