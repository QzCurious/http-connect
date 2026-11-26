# Transport configuration owns runtime defaults

Transport Configuration belongs to the Transport. A configured transport creates fetchers for compatible Endpoint Contracts and applies execution policy when crossing the Transport Boundary. Transport Config supplies `baseUrl` and the concrete `fetch` implementation.

Endpoint Contracts select request encoding through `encodeAs` and may declare Content-Type through the request header schema. When content type is omitted, the encoding and native client supply normal defaults. For multipart FormData, the transport owns the matching body boundary and Content-Type header. [ADR 0007](0007-request-content-type-and-encoding.md) defines request representations and header ownership.

Call Input supplies only the path parameters and variable sections declared by the Endpoint Contract. Per-execution transport options control execution policies without overriding contract-owned method, headers, body, or encoding.
