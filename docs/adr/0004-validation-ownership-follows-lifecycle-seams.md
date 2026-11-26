# Validation ownership follows lifecycle seams

`http-connect` assigns validation responsibility to the lifecycle seam that has enough runtime information to make the decision:

- TypeScript validates Endpoint Contract authoring shape.
- Standard Schema validates Call Input and observed response data.
- The Fetch `Request` constructor enforces method/body compatibility when the fetcher is called.

Endpoint Contract authoring helpers should not reproduce the complete TypeScript contract with handwritten runtime checks. Runtime authoring checks are reserved for values that TypeScript cannot prove safe, such as a dynamically named Content-Type header, or for conditions whose failure would otherwise create unsafe or confusing execution behavior.

After a Standard Schema implementation reports successful validation, `http-connect` trusts its output value. It does not validate that value again against a handwritten copy of the schema's declared output constraint. A schema implementation that returns output inconsistent with its Standard Schema types does not satisfy the schema protocol and is unsupported.

At fetcher creation, TypeScript rejects Endpoint Contract types that permit a `GET` or `HEAD` body. If an untyped caller supplies that combination, constructing the request throws a `TypeError` before dispatch. Runtime response decoding and schema validation remain required because observed HTTP responses are external data.

Tests should follow the same ownership:

- Type tests cover Endpoint Contract authoring constraints.
- Runtime tests cover Standard Schema validation outcomes, widened values that require runtime protection, and Fetch compatibility during request construction.
- Runtime tests should not construct invalid contracts or dishonest schema outputs with `any` solely to require a second implementation of a TypeScript constraint.

Invalid Endpoint Contracts produced through `any`, type assertions, or otherwise bypassing the authoring interface are unsupported unless a specific runtime guard is documented. Standard Schema implementations that violate their declared input or output types are also unsupported.
