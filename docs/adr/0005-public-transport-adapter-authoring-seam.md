---
status: superseded
---

# Public Transport Adapter authoring seam

Superseded by [ADR 0011](0011-fetch-is-the-transport-interface.md). The decision below records the former interface.

`http-connect` exposes the supported interface for authoring Transport Adapters. `adapter.ts` is type-only: concrete adapter factories directly return objects implementing `TransportAdapter`. Implementations delegate lifecycle work to the shared `createFetcher(...)` helper, which prepares Call Input, checks the capabilities declared by the adapter, executes a transport-neutral Prepared Request through the concrete HTTP client, and validates the normalized Web Platform `Response` as a Runtime Result.

First-party and third-party adapters implement the same `TransportAdapter` interface and use the same `createFetcher(...)` helper. Concrete subpaths expose configuration factories named `createTransport(...)`, while the shared transport module does not manufacture adapters. The interface currently models request-body method compatibility; additional capability dimensions should be added only when real adapters require them.
