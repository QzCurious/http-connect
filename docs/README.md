# Maintainer Docs

These docs orient maintainers around the product model for `http-connect`. The package README teaches user-facing usage; the source tree and package exports carry the module-boundary story.

## Current Lifecycle

The application-facing lifecycle is:

1. Endpoint Contract: `endpoint({ request, response })` records the backend route shape.
2. Transport: `createTransport` binds a base URL and a fetch implementation.
3. Fetcher creation: `transport.createFetcher(endpoint)` binds a compatible Endpoint Contract to its Transport.
4. Fetcher Execution: Call Input fills the variable request parts and becomes a Prepared Request.
5. Runtime Result: the configured fetch function returns an observed HTTP response, which the transport module validates against the exact-status Response Shape.

Execution turns an internal Prepared Request into a Web Platform `Request` for the configured fetch function.

## Source And Interface Boundary

`src/public.ts` explicitly lists the names available from the package entry point, `http-connect`.

Implementation modules import directly from the files that define the symbols they use. See [ADR 0001](./adr/0001-source-tree-as-architecture-narrative.md).

Validation responsibility follows the lifecycle seams: TypeScript validates Endpoint Contract authoring, Standard Schema validates Call Input and observed response data, and the Fetch `Request` constructor enforces method/body compatibility at call time. Runtime authoring checks are limited to values TypeScript cannot prove safe or failures that would otherwise make execution unsafe or confusing. See [ADR 0004](./adr/0004-validation-ownership-follows-lifecycle-seams.md).

Each Defined Response narrows `status` to the literal HTTP status declared by its Response Shape. Shapes with different statuses can be narrowed by `status`; alternatives sharing a status retain their body and header unions.

Author declarations with `path()`, `request()`, `response()`, or `endpoint()`. Use `typeof` on a declaration to refer to its inferred type.

Keep standalone response collection exposure minimal in the current public interface. `endpoint(...)` is the supported authoring boundary for exact-status Response Shapes and enforces that at least one Response Shape is present; do not add separate public response collection type exports unless a concrete user-facing need appears.

## Durable Docs

- [Goals](./goals.md): product goal, target user, success criteria, and non-goals.
- [Deferred ideas](./deferred.md): deliberately out-of-scope ideas that should not shape the current interface.

## Future Docs Rule

Add docs for durable decisions, glossary changes, product goals, and explicitly deferred ideas. Do not recreate stage-by-stage architecture docs for behavior that is already visible in source files and tests.
