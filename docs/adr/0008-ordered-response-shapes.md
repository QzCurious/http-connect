---
status: accepted
implementation: complete
---

# Ordered Response Shapes

An Endpoint Contract declares one Response Shape or a nonempty array of alternatives. Each shape owns an exact numeric HTTP status, and multiple alternatives may share a status. Declarations retain their authored runtime representation.

Validation tries shapes with the observed status in declaration order and returns the first that validates. Each body decoder receives a fresh clone so later alternatives can read the same body. The transport cancels discarded body streams. Decoder failures and reported schema mismatches try the next matching shape. Exhausting alternatives or observing an undeclared status throws an `UnknownResponseError` with the observed status. Schema exceptions throw.

Defined Response types distribute over the alternatives, preserving correlated status, header, and body outputs. [ADR 0006](0006-response-shapes-own-status-identity.md) defines status identity, and [ADR 0004](0004-validation-ownership-follows-lifecycle-seams.md) defines schema trust.

TypeScript rejects empty response tuples. Widened arrays whose length is unknown to TypeScript are accepted without a runtime length check.
