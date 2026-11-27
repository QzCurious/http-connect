# Goals

## Problem

Backend API documentation is often incomplete, inconsistent, stale, or missing entirely.

Application engineers end up reverse-engineering Request Shapes and Response Shapes from markdown, Word docs, examples, or live traffic.
The resulting knowledge is usually scattered across wrapper functions, ad hoc comments, inferred TypeScript types, and runtime assumptions.

When the backend changes unexpectedly, the consuming application often discovers it late through crashes, invalid state, or silent data issues.

## Product Goal

`http-connect` should give TypeScript engineers a deterministic, executable way to record the last-known backend Endpoint Contract in code.

That contract should be:

- easy to read
- easy to update
- close to how backend routes and API docs are written
- directly usable from application code through configured Transports
- able to validate API drift at runtime
- able to support decentralized authoring without forcing endpoints through a central router or registry

## Product Shape

The product should stay legible by centering one explicit executable path:

- Endpoint Contract: one Request Shape plus exact-status Response Shapes
- Call Input: typed directly from that Endpoint Contract
- Transport Configuration: `createTransport` binds a URL prefix and a fetch implementation
- Fetcher Execution: `transport.createFetcher(endpoint)` binds a compatible Endpoint Contract to its Transport
- Runtime Result: structured validation outcome for observed HTTP responses

Preparation validates Call Input. Execution constructs a Web Platform `Request` from the Prepared Request.

The `http-connect` package entry point exposes Endpoint Contract authoring, HTTP Codecs, and the Fetch transport.

The fetch transport assumes fetch-compatible runtime primitives such as `fetch`, `Request`, `Response`, `Headers`, and `URL`.

Transports should preserve the underlying client's normal throwing behavior when no HTTP response exists.

Endpoint Contracts are authored as finished values with `endpoint({ request, response })`.

## Target User

A TypeScript engineer working in a fetch-compatible runtime who:

- consumes backend APIs that are unstable or poorly documented
- wants endpoint definitions to stay close to backend route and doc shapes
- wants typed request input and typed results
- wants runtime response validation
- wants drift to be explicit and analyzable
- does not want to rely primarily on generated SDKs

## Success Criteria

- Every API function can be traced back to an explicit HTTP contract.
- Method and path remain first-class and visible.
- Endpoint definitions are readable enough to use as living documentation.
- Endpoints can be authored and consumed independently without requiring one global router or registry object.
- The library can produce typed Call Input from an Endpoint Contract.
- The library can execute that Endpoint Contract through the Transport.
- Applications can supply a fetch function that receives the assembled request and returns a Web Platform `Response`.
- A matching Response Shape produces a Defined Response. When no shape matches, the fetcher throws an `UnknownResponseError` with the observed status.
- Default execution still feels fetch-like for transport failures.
- Unexpected status codes and schema mismatches are surfaced as drift.

## Non-Goals

- Backend routing or request handling.
- Requiring a single god object, central router tree, or mandatory global endpoint registry as the primary authoring model.
- Hiding HTTP semantics behind RPC-style abstractions.
- Making code generation the primary workflow.
- Assuming OpenAPI or Swagger is always available or authoritative.
- Treating transport-specific objects like `Request` as the primary contract representation.
- Treating fragment composition for Request Shapes, Response Shapes, or Endpoint Contracts as part of the current public surface.
- Treating custom request/response codec key extension as part of the current public surface.
- Treating bound stages, resolved input, middleware, or execution context as part of the current product center.
