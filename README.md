Fetch HTTP APIs in a type-safe way. Define API endpoint **contract**s with standard schema compatible library, you get typed **fetcher**s that validate response for you.

# Quick start

Install the library and Zod for this example.

```sh
npm install @qzcurious/http-connect zod
```

```ts
import { z } from "zod";
import { codecs, createTransport, endpoint, path, type CallInput } from "../src/public";

// Setup transport.
const origin = "https://api.example.com";
const transport = createTransport({
  codecs,
  baseUrl: origin,
  fetch,
});

// Define endpoint contract
const contract = endpoint({
  method: "GET",
  path: path("/workspaces/:workspaceId/notes", z.object({ workspaceId: z.string().min(1) })),
  request: {
    query: z.object({ page: z.number().int().positive(), tag: z.array(z.string()).optional() }),
    headers: z.object({ "accept-language": z.string() }),
  },
  response: [
    {
      status: 200,
      decodeAs: "json",
      body: z.array(z.object({ id: z.string(), title: z.string() })),
    },
    {
      status: 404,
      decodeAs: "json",
      body: z.object({ code: z.literal("workspace_not_found"), message: z.string() }),
    },
  ],
});

// Create typed fetcher
const fetcher = transport.createFetcher(contract);

await fetcher({
  params: { workspaceId: "acme" },
  query: { page: 1 },
  headers: { "accept-language": "en" },
});
```

Input of the fetcher is typed

```ts
type FetcherInput = Parameters<typeof fetcher>;
type FetcherInput = [
  input: {
    params: {
      workspaceId: string;
    };
    query: {
      page: number;
      tag?: string[] | undefined;
    };
    headers: {
      "accept-language": string;
    };
  },
  options?: Omit<RequestInit, "method" | "headers" | "body" | "duplex"> | undefined,
];
```

Output of the fetcher is typed

```ts
type FetcherResult = ReturnType<typeof fetcher>;
type FetcherResult = Promise<
  | {
      status: 200;
      body: {
        id: string;
        title: string;
      }[];
    }
  | {
      status: 404;
      body: {
        code: "workspace_not_found";
        message: string;
      };
    }
>;
```

# Usage

## Configure the transport

Set `baseUrl` to an absolute API URL without a query string or fragment. The transport removes trailing slashes from the base URL and appends the endpoint path. With `baseUrl: "https://api.example.com/v1/"`, the quick start request goes to `https://api.example.com/v1/workspaces/acme/notes?page=1`. If the endpoint path also starts with `/v1`, the resulting path starts with `/v1/v1/`.

`createTransport` uses `globalThis.fetch` by default. Supply a `fetch` function to customize dispatch. It receives the assembled Web Platform `Request` and returns a promise for a `Response`.

```ts
function authenticatedTransport(baseUrl: string, token: string) {
  return createTransport({
    baseUrl,
    codecs,
    fetch(request) {
      request.headers.set("Authorization", `Bearer ${token}`);
      return fetch(request);
    },
  });
}
```

Use `transport.createFetcher(contract, { fetch: customFetch })` to override the transport’s fetch implementation for one fetcher. Both direct calls and `fetcher.execute()` use that implementation.

Passing `codecs` opts into the built-in query and body encoders and response decoders. To register only what a contract uses, configure codecs on the transport or in the second argument to `createFetcher`. Fetcher-level codecs override the corresponding transport entries. For example, the list endpoint needs a query encoder and a JSON decoder.

```ts
const api = createTransport({ baseUrl: "https://api.example.com", fetch });
const fetchNotes = api.createFetcher(listNotesContract, {
  codecs: {
    encoders: { query: codecs.encoders.query },
    decoders: { json: codecs.decoders.json },
  },
});
```

## Define the contract

```ts
const contract = endpoint({
  method: "POST",
  path: path("/workspaces/:workspaceId/notes", z.object({ workspaceId: z.string().min(1) })),
  request: {
    encodeAs: "json",
    body: z.object({ title: z.string().trim().min(1) }),
  },
  response: [
    { status: 201, decodeAs: "json", body: z.object({ id: z.string(), title: z.string() }) },
    { status: 404, decodeAs: "json", body: z.object({ message: z.string() }) },
  ],
});
```

A single response can be written inline as `response: { status: 204 }`. If several shapes share a status, the fetcher returns the first one that validates.

### Encode the request body

The same object can be sent as JSON, URL-encoded fields, or multipart form data. Declare `encodeAs` alongside `body` to select the format the endpoint expects. The encoder receives the schema’s validated output.

```ts
type EncodeAs = "json" | "text" | "form-data" | "form-urlencoded" | "binary" | "stream";
```

| `encodeAs`          | Expected `body` schema output                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `"json"`            | A string, number, boolean, null, or a nested array or object of these values. Object fields and array elements may also be `undefined`. |
| `"text"`            | `string`                                                                                                                                |
| `"form-data"`       | `FormDataObject` (a field object supporting nested objects, arrays, and `Blob` values)                                                  |
| `"form-urlencoded"` | `URLSearchParamsObject` (a field object supporting nested objects and arrays with string, number, boolean, null, or undefined values)   |
| `"binary"`          | `Blob \| ArrayBuffer \| Uint8Array`                                                                                                     |
| `"stream"`          | `ReadableStream<Uint8Array>`                                                                                                            |

### Decode the response body

The same response bytes can be read as text, parsed as JSON, or returned as binary data. Declare `decodeAs` alongside `body` to select how the fetcher reads the response. The `body` schema validates the decoded value and supplies the type of `result.body`.

```ts
type DecodeAs = "json" | "text" | "blob" | "arrayBuffer" | "bytes" | "formData";
```

| `decodeAs`      | Value passed to the `body` schema |
| --------------- | --------------------------------- |
| `"json"`        | `unknown` (parsed JSON)           |
| `"text"`        | `string`                          |
| `"blob"`        | `Blob`                            |
| `"arrayBuffer"` | `ArrayBuffer`                     |
| `"bytes"`       | `Uint8Array`                      |
| `"formData"`    | `FormData`                        |

## Derive the fetcher

```ts
const fetcher = transport.createFetcher(contract);

const result = await fetcher({
  params: { workspaceId: "acme" },
  body: { title: " First note " },
});

if (result.status === 201) {
  console.log(result.body.id);
} else {
  console.log(result.body.message); // 404
}
```

Pass fetch options with `fetcher(input, { signal })`. For an endpoint without input fields, use `fetcher()` or `fetcher({ signal })`.


## Handle failures

> http-connect only tend to add validation and typing to fetch. It don't handle any error that produced by fetch.

There are two types of error http-connect might throws, `CallInputValidationError` and `UnknownResponseError`. Both might be thrown by fetcher.

| Outcome                                                                              | What the caller receives                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A call input schema reports validation issues                                        | `CallInputValidationError` with the failing `section` and its `issues`. The request has not been sent.                   |
| The status is undeclared, or none of its shapes can decode and validate the response | `UnknownResponseError` with the observed `status`. For example, a 200 with malformed JSON fails the list contract above. |
| Fetch rejects, for example because of a network failure or cancellation              | The original rejection from the fetch implementation.                                                                    |

## Use it with TanStack Query

```ts
const prepared = await fetcher.prepare(input);
const result = await queryClient.fetchQuery({
  queryKey: [prepared],
  queryFn: ({ signal }) => fetcher.execute(prepared, { signal }),
});
```

> Use this key pattern for plain-data requests. Use JSON-safe field values, including finite numbers and arrays without undefined elements. Files, binary bodies, and streams are outside its scope. Prepared headers appear in the key. For authenticated requests, supply credentials through the configured fetch function and include a stable account scope in the key when results depend on the account.

# Advenced usage

To take full control of the flow. You can use lower level apis. See [Endpoint with manual fetch](./playground/endpoint-with-manual-fetch.ts), [Standalone shapes](./playground/standalone-shapes.ts), [Multiple request shapes](./playground/multiple-request-shapes.ts).

# TODO

- More hand written docs
- I haven't yet figure out usecase for `encodedAs: "stream"`. Consider it's an unstable feature (AI slop).
- Maybe middleware
- Built-in adapter for ky, axios, etc.
