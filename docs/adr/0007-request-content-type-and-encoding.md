---
status: accepted
implementation: complete
---

# Explicit request encoding and independent Content-Type

## Decision

A Request Shape with a body schema requires `encodeAs`. A bodyless shape cannot declare `encodeAs`. Content-Type is an ordinary declared request header, supplied through the header schema independently of encoding. Changing it never chooses or changes an encoder.

Call Input uses schema input. Standard Schema validation and transformation produce schema output, which the selected Request Encoder consumes. TypeScript checks every possible schema output against the selected representation when authoring an Endpoint Contract with `endpoint()`. Successful schema output remains trusted at runtime, as required by ADR 0004.

| `encodeAs`        | Accepted schema output                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `json`            | JSON primitives, recursive arrays and objects, including optional object properties and nested undefined handled by JSON serialization |
| `text`            | `string`                                                                                                                               |
| `form-data`       | `FormData` or the project's Form Data Object                                                                                           |
| `form-urlencoded` | `URLSearchParams`, supported native constructor inputs, or the project's URL Search Params Object                                      |
| `binary`          | `Blob`, `ArrayBuffer`, or `Uint8Array`                                                                                                 |
| `stream`          | `ReadableStream<Uint8Array>`, subject to native runtime support                                                                        |

Uncertain outputs such as `any` or `unknown`, including nested uncertain values, and unsupported union members are rejected. Top-level undefined is unsupported. A schema may accept arbitrary input if it transforms it into a supported output; asynchronous transformations are supported. For example, custom XML serialization belongs in a schema transformation producing text, paired with `encodeAs: "text"` and a header schema producing `Content-Type: application/xml`.

An Endpoint Contract settles request encoding before Transport Configuration exists. Fetcher creation binds that finished contract to a configured Transport.

## Content-Type and Fetch defaults

An explicit Content-Type header is emitted as declared and overrides native body defaults. Authors own whether the bytes match that media type. Omission uses encoding/client defaults: Fetch sets `application/json` for JSON; native Request sets `text/plain;charset=UTF-8` for text, `application/x-www-form-urlencoded;charset=UTF-8` for URLSearchParams, and a Blob's nonempty type for a Blob. ArrayBuffer, Uint8Array, and streams add no default type.

For `encodeAs: "form-data"`, an explicit content type is forbidden statically. Fetch generates the multipart body and matching boundary/header. Pre-encoded multipart text or bytes may instead use `text` or `binary` with an explicit matching type and boundary, owned by the author. For `form-data` only, request header schemas cannot declare Content-Type case-insensitively, and the transport warns and ignores any defined conflict from a dynamically named header before dispatch.

The Fetch transport supplies `duplex: "half"` for streams. Native Request construction enforces runtime stream support and rejects locked or disturbed streams before dispatch. Binary byte views copy only the selected view's bytes.

## Clean break

The dedicated `contentType` field and `RequestContentType` type are removed. Header schemas own explicit media types, including fixed defaults and per-call values. Prepared Requests carry these values only in `headers`. JSON defaults apply only when that header is absent; undefined header values are omitted. No compatibility alias is retained.
