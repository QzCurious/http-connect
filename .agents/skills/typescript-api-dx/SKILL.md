---
name: typescript-api-dx
description: Design and review public TypeScript authoring APIs for precise inference, composable constraints, and actionable compiler diagnostics. Use when changing generic signatures or constraint types, fixing inference regressions, improving error placement in nested objects or arrays, or adding type-level validation messages. Ordinary TypeScript implementation without these concerns does not require this skill.
---

# TypeScript API DX

Treat inferred types and compiler diagnostics as part of the public API. Preserve useful information for valid inputs; explain invalid inputs at the smallest relevant location.

## Establish the authoring contract

Read the applicable repository instructions and ADRs, the public signature, its callers, and its type tests. Establish the supported input forms and the types callers should receive. Use the installed TypeScript version and the repository's compiler options; diagnostic behavior can change between compiler versions.

For a diagnostic bug, first reproduce it with one intentional mistake. Identify the expected error location and any misleading errors on valid neighbors. Distinguish inline declarations from separately declared variables, where TypeScript may report at the variable's use.

## Choose the smallest effective design

- Start with ordinary structural types and native diagnostics. Add generic machinery only for a demonstrated inference or validation need.
- Consider the function author's experience too. Prefer a helper that owns its object-or-array mapping, such as `ExpectedObjectOrArray<T, Item>`, over requiring each signature to introduce an extra inference generic or repeat the mapping. Verify reverse mapped inference with the actual constraints, especially valid union inputs.
- Preserve the caller's useful literal, tuple, readonly, union, and schema information. A valid call compiling is insufficient if its return type has widened.
- Separate basic structure from dependent constraints. Follow local naming conventions; do not rename helpers merely to match a pattern in this skill.
- Report invalid field values on those fields, including inside array elements. Report structural failures at their smallest relevant container.
- Keep independent parts of a declaration independently inferable when failure on one side otherwise widens the other.
- Do not improve error placement by accepting invalid declarations, dropping relational checks, or requiring callers to add assertions or extra helpers to previously supported inline forms.

Read supporting guidance as needed:

- [Constraint composition](references/constraint-composition.md): `*Constraint` and `Valid*` roles, custom messages, and conditional-type pitfalls.
- [Inference and diagnostic placement](references/inference-and-diagnostic-placement.md): diagnosing widening, the reverse mapped helper for object-or-array inputs, and composing it with direct inference and dependent constraints.
- [Testing type APIs](references/testing-type-apis.md): acceptance, rejection, inference, and diagnostic-location checks.

The techniques are options, not a required architecture. Compiler-dependent behavior must be demonstrated in the target API, not assumed from a simplified example.

## Verify and report

Add focused regression coverage for the demonstrated problem and affected supported forms. Inspect an unsuppressed diagnostic at least once; an `@ts-expect-error` directive alone does not establish that the error says the right thing. Run the repository's relevant type checks and required tests.

Keep authoring-time validation distinct from runtime validation. Type-level helpers do not validate external data; follow the repository's existing ownership boundaries instead of adding runtime copies of its TypeScript rules.

Report what improved, what valid inference was preserved, and any remaining diagnostic limitations. If unrelated intentional errors block a full check, distinguish isolated verification from a clean repository-wide pass; do not silently edit the user's experiments to claim success.
