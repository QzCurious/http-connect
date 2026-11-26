# http-connect

English · [繁體中文](./README.zh-TW.md)

`http-connect` lets a TypeScript application record what it expects from a backend route and use that contract to call the API. Each endpoint describes one request and the responses you have observed. Callers get typed input and results. If the backend returns an unfamiliar status or changes the shape of its data, the fetcher reports the mismatch at runtime.

## Quick start

Install the library and Zod for this example.

```sh
npm install @qzcurious/http-connect zod
```

Read a todo from JSONPlaceholder using Zod and a runtime with Fetch support.

```ts
import { codecs, createTransport, endpoint, path } from "@qzcurious/http-connect";
import { z } from "zod";

const api = createTransport({ baseUrl: "https://jsonplaceholder.typicode.com", codecs });
const todo = endpoint({
  method: "GET",
  path: path("/todos/:id", z.object({ id: z.string() })),
  request: {},
  response: {
    status: 200,
    decodeAs: "json",
    body: z.object({ title: z.string(), completed: z.boolean() }),
  },
});

const getTodo = api.createFetcher(todo);
const { body } = await getTodo({ params: { id: "1" } });
console.log(body.title);
```

This calls `GET /todos/1` and prints its title after validating the JSON response. To use your own API, change the base URL, path, and response schema.

## Add query parameters, headers, and a 404 response

Suppose `GET /workspaces/:workspaceId/notes` returns a JSON list of notes, or a JSON error when the workspace is missing. The following example uses Zod for validation and a fetch-compatible runtime. Replace the example origin with your API’s origin.

```ts
import { codecs, createTransport, endpoint, path, type CallInput } from "@qzcurious/http-connect";
import { z } from "zod";

const transport = createTransport({
  baseUrl: "https://api.example.com",
  codecs,
});

const workspaceNotes = path(
  "/workspaces/:workspaceId/notes",
  z.object({ workspaceId: z.string().min(1) }),
);

const listNotesContract = endpoint({
  method: "GET",
  path: workspaceNotes,
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

const listNotes = transport.createFetcher(listNotesContract);
type ListNotesInput = CallInput<typeof listNotesContract>;

const input: ListNotesInput = {
  params: { workspaceId: "acme" },
  query: { page: 1 },
  headers: { "accept-language": "en" },
};

const result = await listNotes(input);
if (result.status === 200) {
  console.log(result.body.map((note) => note.title));
} else {
  console.log(result.body.message); // Validated 404 response
}
```

This sends `GET /workspaces/acme/notes?page=1` with the header `accept-language: en`. Checking `result.status` narrows the body type to the schema for that status. You can define endpoints beside the features that use them and bind each to the same transport.

## Send a request body

To create a note on the same route, declare a POST endpoint. Pair the body schema with `encodeAs` to choose how the transport serializes the validated value.

```ts
const createNoteContract = endpoint({
  method: "POST",
  path: workspaceNotes,
  request: {
    encodeAs: "json",
    body: z.string().trim().min(1).transform((title) => ({ title })),
  },
  response: { status: 204 },
});

const createNote = transport.createFetcher(createNoteContract);
await createNote({ params: { workspaceId: "acme" }, body: " First note " });
```

The caller supplies a string. The schema trims it and produces an object, so the JSON encoder sends `{"title":"First note"}`. Declaring `{ status: 204 }` is enough for a response with no body to decode.

Other request encodings include `text`, `form-urlencoded`, `form-data`, `binary`, and `stream`. For a file upload, use `encodeAs: "form-data"` and a schema such as `z.object({ image: z.file(), alt: z.string() })`. Pass a `File` and its description in `body`. Leave `Content-Type` unset so Fetch can generate the multipart boundary. The playground includes the complete upload contract and call. [Endpoint with transport](./playground/endpoint-with-transport.ts)

## Shape the call

- **Path parameters.** Use `path("/health")` for a static route. For a parameterized route, pass a schema whose output keys match the placeholders. Both `:id` and `{id}` are supported. Use one style per path. The fetcher validates and encodes each parameter as a path segment.
- **Input and options.** Supply each declared section (`params`, `query`, `headers`, or `body`) in the input object. Individual fields can be optional, like `tag` above. To cancel a call, pass an abort signal in the second argument, as in `listNotes(input, { signal })`. For an endpoint with no input sections, call its fetcher with no arguments or pass `{ signal }` as the first argument.
- **Response alternatives.** Use one response object or an array of alternatives. For multiple shapes with the same status, the fetcher tries them in declaration order and returns the first that validates. Use `Awaited<ReturnType<typeof listNotes>>` when you need to name the inferred result type.

## Handle failures

A declared HTTP error such as the 404 above is a normal result when its schema matches. Use the error classes exported by `@qzcurious/http-connect` to distinguish invalid input from an unexpected response.

| Outcome | What the caller receives |
| --- | --- |
| A call input schema reports validation issues | `CallInputValidationError` with the failing `section` and its `issues`. The request has not been sent. |
| The status is undeclared, or none of its shapes can decode and validate the response | `UnknownResponseError` with the observed `status`. For example, a 200 with malformed JSON fails the list contract above. |
| Fetch rejects, for example because of a network failure or cancellation | The original rejection from the fetch implementation. |

## Configure the transport

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

Passing `codecs` opts into the built-in query and body encoders and response decoders. To register only what a contract uses, configure codecs on the transport or in the second argument to `createFetcher`. Fetcher-level codecs override the corresponding transport entries. For example, the list endpoint needs a query encoder and a JSON decoder.

```ts
const api = createTransport({ baseUrl: "https://api.example.com" });
const fetchNotes = api.createFetcher(listNotesContract, {
  codecs: {
    encoders: { query: codecs.encoders.query },
    decoders: { json: codecs.decoders.json },
  },
});
```

## More examples

- Follow the main workflow from listing notes to creating a note and attaching an image. [Endpoint with transport](./playground/endpoint-with-transport.ts)
- Use an endpoint contract with your own fetch logic. [Endpoint with manual fetch](./playground/endpoint-with-manual-fetch.ts)
- Define request and response shapes independently. [Standalone shapes](./playground/standalone-shapes.ts)
- Choose between JSON and text when a route accepts both. [Multiple request shapes](./playground/multiple-request-shapes.ts)

For the project’s scope and design rationale, see the [product goals](./docs/goals.md) and [maintainer documentation](./docs/README.md).
