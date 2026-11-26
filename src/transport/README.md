# Fetch transport lifecycle

`createTransport({ baseUrl, fetch })` binds origin resolution and request execution. The optional `fetch` function receives a Web Platform `Request` and returns a `Promise<Response>`. It defaults to `globalThis.fetch`.

Endpoints with a query schema require `codecs.encoders.query` at binding. Fetcher options take precedence over transport config.

Body codecs are opt-in. At binding, each required encoder and decoder is resolved from the fetcher options first and then from the transport config. TypeScript checks that the combined registrations cover the endpoint.

1. At `transport.createFetcher(endpoint)`, TypeScript checks that every possible `GET` or `HEAD` endpoint is bodyless. A plain `EndpointContract` annotation loses the information needed for this check.
2. Calling the fetcher validates Call Input and resolves the path. Schema issues produce a `CallInputValidationError` before dispatch.
3. The transport constructs a `Request` from the internal Prepared Request and per-call Fetch options. A body on `GET` or `HEAD` causes the constructor to throw a `TypeError` before dispatch. The Endpoint Contract determines the method, headers, and body encoding.
4. The configured fetch function executes the request. Network failures propagate to the caller.
5. The transport validates the observed status, headers, and body against the declared Response Shapes. The first matching shape produces the Runtime Result. Exhausting the alternatives throws an `UnknownResponseError`.

See [ADR 0007](../../docs/adr/0007-request-content-type-and-encoding.md) for encoding and [ADR 0011](../../docs/adr/0011-fetch-is-the-transport-interface.md) for the execution interface.
