import { toURLSearchParams } from "../codec/search-params";
import { codecs } from "../codec/codecs";
import { path } from "../contract/path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { endpoint, type EndpointContract } from "../contract/endpoint";
import { createTransport } from "./transport";

describe("fetch transport", () => {
  it("uses baseUrl and serializes contract query into the URL", async () => {
    const fetchMock = vi.fn(async (transportRequest: Request) => {
      expect(transportRequest.url).toBe(
        "https://api.example.com/v1/users/a%2Fb?page=2&tags=red&tags=blue&filter%5Bprice%5D%5Bgte%5D=50&items%5B0%5D%5Bid%5D=1&empty=",
      );

      return new Response(null, { status: 204 });
    });
    const transport = createTransport({
      codecs,
      baseUrl: "https://api.example.com/v1/",
      fetch: fetchMock,
    });
    const fetcher = transport.createFetcher(
      endpoint({
        method: "GET",
        path: path("/users/{id}", z.object({ id: z.string() })),
        request: {
          query: z.object({
            page: z.number(),
            tags: z.array(z.string()),
            filter: z.object({ price: z.object({ gte: z.number() }) }),
            items: z.array(z.object({ id: z.number() })),
            empty: z.null(),
          }),
        },
        response: { status: 204 },
      }),
    );

    await fetcher({
      params: { id: "a/b" },
      query: {
        page: 2,
        tags: ["red", "blue"],
        filter: { price: { gte: 50 } },
        items: [{ id: 1 }],
        empty: null,
      },
    });
  });

  it.each([
    ["https://dev.to/api", "/articles", "/api/articles"],
    ["https://dev.to/api/", "/articles", "/api/articles"],
    ["https://dev.to", "/articles", "/articles"],
    ["https://dev.to/api", "/", "/api/"],
    ["https://dev.to/api///", "/articles//latest/", "/api/articles//latest/"],
  ] as const)("joins %s and %s as %s", async (baseUrl, template, pathname) => {
    const fetch = vi.fn(async (_request: Request) => new Response(null, { status: 204 }));
    const transport = createTransport({ baseUrl, fetch });
    const fetcher = transport.createFetcher(
      endpoint({ method: "GET", path: path(template), request: {}, response: { status: 204 } }),
    );

    await fetcher();

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://dev.to" + pathname }),
    );
  });

  it("executes the full defined response path", async () => {
    const fetchMock = vi.fn(async (transportRequest: Request) => {
      expect(transportRequest.url).toBe("https://api.example.com/users/123?page=2");
      expect(transportRequest.method).toBe("POST");
      expect(transportRequest.headers.get("authorization")).toBe("Bearer token");
      expect(transportRequest.headers.get("content-type")).toBe("application/json");
      expect(await transportRequest.json()).toEqual({ name: "Ada" });

      return new Response(JSON.stringify({ id: "123", name: "Ada" }), {
        status: 201,
        headers: {
          "content-type": "text/plain",
          "x-request-id": "req-1",
        },
      });
    });
    const transport = createTransport({
      codecs,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as typeof fetch,
    });
    const fetcher = transport.createFetcher(
      endpoint({
        method: "POST",
        path: path("/users/{id}", z.object({ id: z.string() })),
        request: {
          query: z.object({ page: z.number() }),
          headers: z.object({ authorization: z.string() }),
          encodeAs: "json",
          body: z.object({ name: z.string() }),
        },
        response: [
          {
            status: 201,
            headers: z.object({ "X-Request-Id": z.string() }),
            decodeAs: "json",
            body: z.object({ id: z.string(), name: z.string() }),
          },
          {
            status: 409,
            decodeAs: "json",
            body: z.object({ error: z.string() }),
          },
        ],
      }),
    );

    const result = await fetcher({
      params: { id: "123" },
      query: { page: 2 },
      headers: { authorization: "Bearer token" },
      body: { name: "Ada" },
    });

    expect(result).toEqual({
      status: 201,
      headers: { "X-Request-Id": "req-1" },
      body: { id: "123", name: "Ada" },
    });
  });
});

it("executes one request with response alternatives and transport options", async () => {
  const fetchMock = vi.fn(async (sent: Request) => {
    expect(sent.method).toBe("PUT");
    expect(sent.url).toBe("https://api.example.com/text");
    expect(sent.headers.get("content-type")).toBe("text/plain");
    expect(sent.cache).toBe("no-store");
    expect(await sent.text()).toBe("hello");
    return Response.json({ type: "text", length: 5 });
  });
  const transport = createTransport({
    codecs,
    baseUrl: "https://api.example.com",
    fetch: fetchMock as typeof fetch,
  });
  const send = transport.createFetcher(
    endpoint({
      method: "PUT",
      path: path("/text"),
      request: {
        encodeAs: "text",
        headers: z.object({ "Content-Type": z.literal("text/plain").default("text/plain") }),
        body: z.string(),
      },
      response: [
        {
          status: 200,
          decodeAs: "json",
          body: z.object({ type: z.literal("number"), value: z.number() }),
        },
        {
          status: 200,
          decodeAs: "json",
          body: z.object({ type: z.literal("text"), length: z.number() }),
        },
      ],
    }),
  );
  await expect(send({ headers: {}, body: "hello" }, { cache: "no-store" })).resolves.toEqual({
    status: 200,
    body: { type: "text", length: 5 },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["GET", "HEAD"] as const)(
  "rejects a %s call with a body before dispatch",
  async (method: EndpointContract["method"]) => {
    const shapes = endpoint({
      method,
      path: path("/"),
      request: {
        encodeAs: "json",
        body: z.string(),
      },
      response: { status: 200 },
    });
    const fetchMock = vi.fn<typeof fetch>();
    const transport = createTransport({
      codecs,
      baseUrl: "https://api.example.com",
      fetch: fetchMock,
    });
    // @ts-expect-error - exercise native Request behavior for an untyped caller.
    const send = transport.createFetcher(shapes);
    await expect(send({ body: "hello" })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("binds codecs per key and isolates overrides between fetchers", async () => {
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "text",
      body: z.string().trim(),
    },
    response: { status: 200, decodeAs: "text", body: z.string() },
  });
  const transport = createTransport({
    baseUrl: "https://example.com",
    fetch: async (request) => new Response(await request.text()),
    codecs: {
      encoders: { text: async (value) => value.toUpperCase() },
    },
  });
  const customized = transport.createFetcher(contract, {
    codecs: {
      encoders: { text: (value) => value.toLowerCase() },
      decoders: { text: async (r) => "(" + (await r.text()) + ")" },
    },
  });
  const inherited = transport.createFetcher(contract, {
    codecs: { decoders: { text: codecs.decoders.text } },
  });
  await expect(customized({ body: " Ab " })).resolves.toEqual({ status: 200, body: "(ab)" });
  await expect(inherited({ body: " Ab " })).resolves.toEqual({ status: 200, body: "AB" });
});

it("encodes the validated query with the fetcher override", async () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {
      query: z.object({ tag: z.string().trim() }),
    },
    response: { status: 204 },
  });
  const config = {
    baseUrl: "https://example.com",
    fetch: vi.fn(async (_request: Request) => new Response(null, { status: 204 })),
  };
  const transport = createTransport({
    ...config,
    codecs: { encoders: { "form-urlencoded": codecs.encoders["form-urlencoded"] } },
  });
  const encodeQuery = vi.fn(toURLSearchParams);
  const send = transport.createFetcher(contract, { codecs: { encoders: { query: encodeQuery } } });
  await send({ query: { tag: " a " } });
  expect(encodeQuery).toHaveBeenCalledWith({ tag: "a" });
  expect(config.fetch.mock.calls[0]![0].url).toBe("https://example.com/?tag=a");

  const shared = createTransport({ ...config, codecs: { encoders: { query: encodeQuery } } });
  await shared.createFetcher(contract, {
    codecs: { encoders: { query: (query) => new URLSearchParams({ label: String(query.tag) }) } },
  })({ query: { tag: " b " } });
  expect(config.fetch.mock.calls[1]![0].url).toBe("https://example.com/?label=b");
  expect(encodeQuery).toHaveBeenCalledTimes(1);
});

it("resolves registered codecs at binding and inherits an explicitly undefined override", async () => {
  const defaults = {
    text: async () => "inherited",
  };
  const transport = createTransport({
    baseUrl: "https://example.com",
    fetch: async () => new Response(),
    codecs: { decoders: defaults },
  });
  const send = transport.createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: {},
      response: { status: 200, decodeAs: "text", body: z.string() },
    }),
    { codecs: { decoders: { text: undefined } } },
  );
  defaults.text = async () => "changed";
  await expect(send()).resolves.toEqual({ status: 200, body: "inherited" });
});
