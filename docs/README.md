# Maintainer Docs

These docs orient maintainers around the product model for `http-connect`. The package README teaches user-facing usage.

## Current Lifecycle

The application-facing lifecycle is:

1. Endpoint Contract: `endpoint({ request, response })` records the backend route shape.
2. Transport: `createTransport` binds a base URL and a fetch implementation.
3. Fetcher creation: `transport.createFetcher(endpoint)` binds a compatible Endpoint Contract to its Transport.
4. Fetcher Execution: Call Input fills the variable request parts and becomes a Prepared Request.
5. Runtime Result: the configured fetch function returns an observed HTTP response, which the transport module validates against the exact-status Response Shape.

Every fetcher exposes `prepare`. Call it with the declared input sections, or with zero arguments when the endpoint has none. It can execute the resulting Prepared Request with `execute(prepared, options?)`. Calling the fetcher directly combines both steps.

## Source And Interface Boundary

`src/public.ts` explicitly lists the names available from the package entry point, `http-connect`.

Each Defined Response narrows `status` to the literal HTTP status declared by its Response Shape. Shapes with different statuses can be narrowed by `status`; alternatives sharing a status retain their body and header unions.

Author declarations with `path()`, `request()`, `response()`, or `endpoint()`. Use `typeof` on a declaration to refer to its inferred type.

Keep standalone response collection exposure minimal in the current public interface. `endpoint(...)` is the supported authoring boundary for exact-status Response Shapes and enforces that at least one Response Shape is present; do not add separate public response collection type exports unless a concrete user-facing need appears.

## Future Docs Rule

Add docs for durable decisions, glossary changes, product goals, and explicitly deferred ideas. Do not recreate stage-by-stage architecture docs for behavior that is already visible in source files and tests.
