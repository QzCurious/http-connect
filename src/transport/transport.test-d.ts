import { codecs } from "../codec/codecs";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { path, endpoint } from "../public";
import { createTransport } from "./transport";

const transport = createTransport({ codecs, baseUrl: "https://example.com", fetch });

test("types the fetch override against the assembled request", () => {
  createTransport({
    baseUrl: "https://example.com",
    fetch: async (request, init) => {
      expectTypeOf(init).toEqualTypeOf<RequestInit | undefined>();
      expectTypeOf(request).toEqualTypeOf<Request>();
      return new Response();
    },
  });
  createTransport({
    baseUrl: "https://example.com",
    // @ts-expect-error - fetch must return a promise.
    fetch: () => new Response(),
  });
});

test("requires only codecs the transport cannot guarantee", () => {
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: { encodeAs: "json", body: z.string() },
    response: [
      { status: 200, decodeAs: "text", body: z.string() },
      { status: 400, decodeAs: "json", body: z.string() },
    ],
  });
  const config = { baseUrl: "https://example.com", fetch };
  const transport = createTransport({
    ...config,
    codecs: {
      encoders: { json: codecs.encoders.json },
      decoders: { json: codecs.decoders.json },
    },
  });
  // @ts-expect-error - the text response needs a decoder
  transport.createFetcher(contract);
  transport.createFetcher(contract, {
    codecs: {
      // @ts-expect-error - json is available, text is missing
      decoders: { json: codecs.decoders.json },
    },
  });
  transport.createFetcher(contract, {
    fetch: async (request) => {
      expectTypeOf(request).toEqualTypeOf<Request>();
      return new Response();
    },
    codecs: { decoders: { text: (response) => response.text() } },
  });
  // @ts-expect-error - overriding fetch still requires the missing text decoder
  transport.createFetcher(contract, { fetch });
  const partial: import("../codec/codecs").Codecs = codecs;
  // @ts-expect-error - optional codec properties cannot establish availability
  createTransport({ ...config, codecs: partial }).createFetcher(contract);
  createTransport(config).createFetcher(contract, {
    // @ts-expect-error - response codecs cannot satisfy the json request
    codecs: { decoders: codecs.decoders },
  });
  createTransport(config).createFetcher(
    endpoint({ method: "GET", path: path("/"), request: {}, response: { status: 204 } }),
  );
});

test("a form-urlencoded body encoder cannot satisfy a query schema", () => {
  const transport = createTransport({
    baseUrl: "https://example.com",
    fetch,
    codecs: { encoders: { "form-urlencoded": codecs.encoders["form-urlencoded"] } },
  });
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: { query: z.object({ tag: z.string() }) },
    response: { status: 204 },
  });
  // @ts-expect-error - this endpoint requires codecs.encoders.query
  transport.createFetcher(contract);
});

test("requires decoders guaranteed by only one transport alternative", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: [
      { status: 200, decodeAs: "json", body: z.string() },
      { status: 404, decodeAs: "text", body: z.string() },
    ],
  });
  function bind(decoders: Pick<typeof codecs.decoders, "json"> | typeof codecs.decoders) {
    const transport = createTransport({
      baseUrl: "https://example.com",
      fetch,
      codecs: { decoders },
    });
    // @ts-expect-error - both alternatives provide json, only one provides text
    transport.createFetcher(contract);
    transport.createFetcher(contract, { codecs: { decoders: { text: codecs.decoders.text } } });
  }
});

test("limits fetcher overrides to the endpoint's codec keys", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/notes"),
    request: { query: z.object({ page: z.number() }) },
    response: [
      { status: 200, decodeAs: "json", body: z.array(z.string()) },
      { status: 404, decodeAs: "json", body: z.string() },
    ],
  });
  transport.createFetcher(contract, {
    codecs: {
      encoders: {
        query: codecs.encoders.query,
        // @ts-expect-error - the request has no text body
        text: codecs.encoders.text,
      },
      decoders: {
        json: (response) => response.json(),
        // @ts-expect-error - neither response declares a text body
        text: codecs.decoders.text,
      },
    },
  });
  createTransport({ baseUrl: "https://example.com" }).createFetcher(contract, {
    codecs: {
      encoders: { query: codecs.encoders.query },
      decoders: {
        json: codecs.decoders.json,
        // @ts-expect-error - missing defaults do not widen the allowed overrides
        text: codecs.decoders.text,
      },
    },
  });
});
