---
status: accepted
---

# Authoring diagnostics identify the invalid field

## Context

TypeScript accepting valid declarations and rejecting invalid ones is only part of the authoring experience. The location and content of a diagnostic determine how easily an author can understand and correct a mistake.

Generic inference and validation types can cause a local mistake to produce an error on a containing object or array, or unrelated errors elsewhere in the declaration. These diagnostics obscure the actual problem.

## Decision

For inline declarations, errors caused by an invalid field value should be reported on that field, including when its containing object is an element of an array. This applies across public authoring APIs, including Request Shapes and Response Shapes.

Diagnostics should describe the violated constraint or expected values. A local mistake should not produce misleading errors on otherwise valid parts of the declaration.

Errors concerning a whole structure should be reported at the smallest relevant containing structure. Examples include an empty collection, a missing required property, or an invalid combination of fields.

This is a public API design criterion. Type signatures should be evaluated for diagnostic quality as well as acceptance, rejection, and inference. It complements the validation responsibilities in [ADR 0004](0004-validation-ownership-follows-lifecycle-seams.md).

The field-location expectation applies to inline declarations. For values passed through separately declared variables, TypeScript may report an error at the variable's use rather than at the original field declaration.

## Verification

Type tests should cover diagnostic placement for single objects and array elements, alongside inference and validation behavior.

For representative field errors, place `@ts-expect-error` immediately above the invalid field on its own line. Verify that valid neighboring fields and array elements do not produce additional errors.

Exact compiler wording is not part of the contract. Diagnostics should still communicate the relevant constraint rather than an opaque type failure.

## Consequences

Supporting useful diagnostics may require more elaborate internal types. That complexity is justified when it improves the public authoring experience without weakening validation or losing useful inference. No particular inference technique is required by this decision.

TypeScript upgrades may change diagnostic placement, so representative diagnostic tests must be checked during upgrades.
