# Verify the authoring experience

Test four distinct properties. None substitutes for the others:

| Property    | Evidence                                                                         |
| ----------- | -------------------------------------------------------------------------------- |
| Acceptance  | Supported valid declarations compile.                                            |
| Rejection   | Invalid declarations are rejected, including dependent constraints.              |
| Inference   | Useful literal, tuple, readonly, union, and schema types are preserved.          |
| Diagnostics | The error points to the intended field or structure and explains its constraint. |

Use the repository's existing type-test framework. Prefer exact type assertions where exactness is the requirement: assigning a readonly result to a readonly target does not prove that the result retained readonlyness, and assignability alone may miss widening or `any`.

## Regression cases

For a change to object-or-array authoring, cover the supported forms affected by the change: one object, multiple inline array elements, a later invalid element beside valid ones, more than one invalid element, and readonly tuples or widened arrays if accepted. Check existing behavior for empty arrays, unions, and extra properties when the changed constraint handles them.

For a reverse mapped helper, test the intended function-author signature itself (`define<const T>(value: ExpectedObjectOrArray<T, Item>): T`), without an auxiliary container generic or caller-owned mapping. Assert exact return types, not just that the helper rejects a bad field. Test missing required fields, primitive and nullish inputs, and nested arrays so simplifying the inference does not silently widen the accepted structures. Treat optional fields and union correlations as separate cases before claiming support for them.

Keep unrelated fields valid. Assert their inferred types when the original failure widened them. For schema-carrying APIs, check schema input/output types and resulting caller-facing types, not only the presence of the schema property.

Use separate cases for basic field mismatches and dependent constraint failures. A pleasant error for an unknown decoder does not prove that a known decoder with an incompatible body schema is still rejected.

## Check the diagnostic itself

Put the invalid field on its own line, with `@ts-expect-error` immediately above it. Do not suppress the entire call or put the entire object on one line when testing field placement. Leave valid neighbors unsuppressed.

This verifies that an error occurs on the next line, not its exact diagnostic code, message, span, or number. Inspect an unsuppressed version in a temporary file or compiler API harness to establish that the observed error is the intended one. In particular, `Type ... is not assignable to never` may satisfy the directive while losing the useful explanation.

Do not snapshot full compiler messages by default; wording and rendered type expansions are unstable. If precise spans or codes are essential, use a focused compiler API assertion with the installed compiler, and keep the fixture small.

The [reverse-mapped-check.ts](reverse-mapped-check.ts) example imports the production helper. Compile it with its directives to check accepted cases, exact inference assertions, and error lines. Then compile a temporary copy with the directives removed, keeping its helper import resolvable. Expect three field diagnostics describing the allowed formats and seven structural diagnostics for missing fields, primitives, nullish values, and a nested array. Valid neighboring fields and elements should have no diagnostics.

Do not execute its declared function at runtime. The example establishes its demonstrated scope; the repository type tests verify union relationships, direct union inference, and the real API's dependent constraints.

## Run checks without disturbing experiments

Run targeted type checks first, then the relevant repository checks. Determine whether the test runner actually includes type tests; a passing runtime suite alone is insufficient.

If the user's playground intentionally contains errors, preserve it. Isolate the reproduction or use a temporary compiler configuration when practical. State which checks passed and which remain blocked by those errors. Never mask unrelated failures or weaken assertions to obtain a green result.

For compiler upgrades, re-run diagnostic-location tests as well as ordinary acceptance and inference tests. Record the compiler version used when documenting a non-obvious inference technique.
