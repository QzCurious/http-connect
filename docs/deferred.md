# Deferred Ideas

These ideas are outside the current `http-connect` surface. They should not shape the package interface or active docs unless they are deliberately pulled back into scope.

## Authoring Composition

Future authoring helpers may reduce repetition, but they should compile into the same explicit Endpoint Contract before execution.

- Request fragments for repeated `params`, `query`, `headers`, `encodeAs`, or `body` declarations.
- Response fragments for shared headers, decoders, body schemas, or common Response Shapes.
- Endpoint bundles for repeated endpoint families or shared response sets.

Composition should remain an authoring convenience. It should not create hidden runtime behavior, hidden inheritance chains, or ambiguous ownership of HTTP semantics.

## Bound Stages

Bound stages could supply deterministic defaults if callers need derived request values before execution.

- Shared defaults for `params`, `query`, `headers`, or `body`.
- Typed context used while producing request values.
- Middleware-like request lifecycle behavior around execution.
- Higher-level transport configuration beyond the configured fetch function and base URL.

If introduced, these concerns should remain outside the Endpoint Contract.

## Resolved Input

A separate resolved-input stage could be useful if direct `Call Input -> Prepared Request` conversion stops being clear enough, especially if bound stages are introduced.

It should stay schema-shaped and transport-neutral, and raw context should not survive into the Prepared Request.

## Contract Vocabulary

Potential contract extensions include:

- a typed cookie section
- explicit omission of an entire declared Call Input section
- dedicated response media-type metadata, alongside correlated headers and bodies
- `TRACE` in the HTTP method vocabulary

Status classes and default response declarations would require revisiting the exact-status drift model in [ADR 0006](adr/0006-response-shapes-own-status-identity.md).

## Transport Extensions

Future extensions to the Fetch transport may include:

- a `createSafeFetcher(...)` companion that returns transport failures instead of throwing them
- response codec key extensions beyond the fixed built-in `decodeAs` keys

Future extensions should preserve Fetch request and response semantics. [ADR 0011](adr/0011-fetch-is-the-transport-interface.md)
