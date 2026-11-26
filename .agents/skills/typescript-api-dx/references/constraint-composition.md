# Constraint composition and messages

Use these distinctions when they clarify the API. Existing names may express the same roles differently.

| Role                   | Purpose                                      | Typical form                                                        |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Shape                  | Describe basic accepted structure            | `type Config = { ... }`                                             |
| Additive constraint    | Add a requirement to an inferred object      | `{}` on success; a diagnostic-bearing object on failure             |
| Validated shape        | Combine structure and dependent requirements | `T & SomeConstraint<T>`                                             |
| Replacement constraint | Compute an expected field type               | Original field type on success; expected type or message on failure |

`{}` is not an exact empty-object type. It is useful as a neutral intersection for the object authoring inputs above; `unknown` is the general neutral intersection type. Do not apply an object-only convention blindly to nullable or primitive inputs.

## Example: a dependent requirement

Here, `file` is allowed but becomes required when `mode` is `"file"`. This keeps the ordinary `mode` union diagnostic while adding a message for the relationship:

```ts
type Config = {
  mode: "memory" | "file";
  file?: string;
};

type FileConstraint<T extends Config> = T extends { mode: "file" }
  ? T extends { file: string }
    ? {}
    : { file: ["Error: file is required when mode is 'file'."] }
  : {};

type ValidConfig<T extends Config> = T & FileConstraint<T>;

declare function configure<const T extends Config>(value: T & FileConstraint<T>): T;

const memory = configure({ mode: "memory" });
const literalMode: "memory" = memory.mode;
configure({ mode: "file", file: "output.txt" });

configure({
  // @ts-expect-error - native union diagnostic belongs on this field
  mode: "network",
});

// @ts-expect-error - a missing field is reported at its containing object
configure({ mode: "file" });
```

This example concerns inline literal modes. A widened `Config` variable does not prove which mode is present. Decide whether the real API accepts such uncertainty, requires narrowing, or uses a discriminated union instead. Do not add a custom constraint when a discriminated union already provides adequate inference and diagnostics.

## Choose useful errors

- Prefer native errors for basic value mismatches: an allowed literal union is usually clearer than a custom message.
- For a replacement constraint, let the replacement supply the expected field type. An outer `T & ExpectedObjectOrArray<T, Item>` can reintroduce the invalid literal that `ExpectedObjectOrArray` replaced: `"xml" & ("text" | "json")` becomes `never`. Test `value: ExpectedObjectOrArray<T, Item>` with reverse mapped inference before adding an intersection with `T`. Additive dependent constraints have a different role and may still need intersections.
- Use a diagnostic tuple or descriptive property type for relationships the compiler cannot explain naturally. Its presence in an error is not a runtime value or runtime validation mechanism.
- Put a field-specific requirement on the field. A tuple intersected with the entire declaration often relocates the diagnostic to the entire declaration.
- Avoid reducing every invalid input to `never`: it can erase the explanation and cause unrelated properties to become impossible too.
- Match existing repository wording rather than introducing a competing error vocabulary.

## Preserve semantics while composing

A conditional `T extends U` distributes when `T` is a naked type parameter. `[T] extends [U]` checks the union as a whole. Choose deliberately: rejecting an entire union is different from checking each member. Do not change distribution solely because a single failing example looks better.

Check whether `Extract`, `Exclude`, or a `never` branch silently removes invalid union members. Decide explicitly how the API handles `undefined`, optional fields, widened values, and unknown collection length. Test the cases affected by the change rather than accumulating speculative restrictions.

Use `NoInfer` only where another argument should be authoritative for inference. It cannot preserve information already lost, and making a check non-inferential does not guarantee better diagnostics. Likewise, flattening a type for a readable hover is not proof that assignability or error placement is preserved.
