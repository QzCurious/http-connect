---
status: accepted
---

# Fetch is the transport interface

Supersedes [ADR 0005](0005-public-transport-adapter-authoring-seam.md).

The public adapter interface modeled one capability, support for request bodies by HTTP method. It required adapter authors to keep a type parameter and a runtime declaration aligned. The use case that justified that machinery was a possible future client with different HTTP semantics.

`transport.createFetcher(endpoint)` binds an Endpoint Contract to Fetch. The fetcher validates Call Input and prepares the request. Transport execution encodes a Web Platform `Request`, resolves its URL, and dispatches it through the supplied fetch function. The fetcher validates the returned `Response` against its Endpoint Contract. Applications can supply native fetch, a wrapper, a mock, or a client that implements this request and response contract.

Prepared Requests and the execution lifecycle are internal. The package supports one set of per-call Fetch options and one method/body rule. Executing routes that require semantics outside Fetch is outside the supported transport interface. Endpoint Contracts can still describe those routes. [ADR 0002](0002-method-body-compatibility-belongs-to-transport.md)
