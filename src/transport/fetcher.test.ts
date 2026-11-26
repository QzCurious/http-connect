import { codecs } from "../codec/codecs";
import { CallInputValidationError } from "../public";
import { path } from "../contract/path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { endpoint } from "../contract/endpoint";
import { createFetcher, UnknownResponseError } from "./fetcher";

const baseUrl = "https://example.com";

describe("createFetcher", () => {
  it("executes an endpoint with no call input", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const fetcher = createFetcher(
      endpoint({
        method: "GET",
        path: path("/health"),
        request: {},
        response: { status: 204 },
      }),
      { baseUrl, codecs, fetch },
    );

    await expect(fetcher({ cache: "no-store" })).resolves.toEqual({
      status: 204,
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "GET", url: baseUrl + "/health", cache: "no-store" }),
    );
  });

  it("preserves fetch transport throwing behavior", async () => {
    const failure = new Error("network boom");
    const fetcher = createFetcher(
      endpoint({
        method: "GET",
        path: path("/users"),
        request: {},
        response: { status: 200 },
      }),
      {
        baseUrl,
        codecs,
        fetch: async () => {
          throw failure;
        },
      },
    );

    await expect(fetcher()).rejects.toBe(failure);
  });
});

it("throws a validation error for invalid schema input before dispatch", async () => {
  const fetch = vi.fn();
  const send = createFetcher(
    endpoint({
      method: "POST",
      path: path("/values"),
      request: {
        encodeAs: "json",
        body: z.number().positive(),
      },
      response: { status: 204 },
    }),
    { baseUrl, codecs, fetch },
  );
  await expect(send({ body: -1 })).rejects.toBeInstanceOf(CallInputValidationError);
  expect(fetch).not.toHaveBeenCalled();
});

it("passes the validated body and second-argument options to execution", async () => {
  const fetch = vi.fn(async (_request: Request) => Response.json({ saved: true }, { status: 201 }));
  const send = createFetcher(
    endpoint({
      method: "POST",
      path: path("/values"),
      request: { encodeAs: "text", body: z.string().trim() },
      response: { status: 201, decodeAs: "json", body: z.object({ saved: z.boolean() }) },
    }),
    { baseUrl, codecs, fetch },
  );

  await expect(send({ body: " hello " }, { cache: "reload" })).resolves.toEqual({
    status: 201,
    body: { saved: true },
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(Request));
  const [[request]] = fetch.mock.calls;
  expect(request).toMatchObject({ method: "POST", url: baseUrl + "/values", cache: "reload" });
  await expect(request.text()).resolves.toBe("hello");
});

it("throws UnknownResponseError when the exact status response body cannot parse", async () => {
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: {},
    response: {
      status: 200,
      decodeAs: "json",
      body: z.object({ id: z.string() }),
    },
  });

  const send = createFetcher(contract, {
    baseUrl,
    codecs,
    fetch: async () => new Response("not-json", { status: 200 }),
  });
  const result = send();

  await expect(result).rejects.toBeInstanceOf(UnknownResponseError);
  await expect(result).rejects.toMatchObject({ status: 200 });
});

it("does not try another response shape when status validation fails", async () => {
  const contract = endpoint({
    method: "GET",
    path: path("/users"),
    request: {},
    response: [
      {
        status: 200,
        decodeAs: "json",
        body: z.object({ exact: z.literal(true) }),
      },
      {
        status: 201,
        decodeAs: "json",
        body: z.object({ other: z.literal(true) }),
      },
    ],
  });

  const send = createFetcher(contract, {
    baseUrl,
    codecs,
    fetch: async () => new Response(JSON.stringify({ other: true }), { status: 200 }),
  });
  const result = send();

  await expect(result).rejects.toBeInstanceOf(UnknownResponseError);
  await expect(result).rejects.toMatchObject({ status: 200 });
});

it("tries all alternatives with the observed status and discards the original body after matching", async () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: [
      {
        status: 201,
        decodeAs: "json",
        body: z.any().transform(() => {
          throw new Error("wrong status");
        }),
      },
      {
        status: 200,
        decodeAs: "json",
        body: z.object({ type: z.literal("first") }),
      },
      {
        status: 200,
        decodeAs: "json",
        body: z.object({ type: z.literal("second"), value: z.number() }),
      },
    ],
  });
  const observed = Response.json({ type: "second", value: 42 });
  const fetch = vi
    .fn<() => Promise<Response>>()
    .mockResolvedValueOnce(observed)
    .mockResolvedValueOnce(Response.json({ type: "other" }));
  const send = createFetcher(contract, { baseUrl, codecs, fetch });
  await expect(send()).resolves.toEqual({
    status: 200,
    body: { type: "second", value: 42 },
  });
  expect(observed.bodyUsed).toBe(true);
  await expect(send()).rejects.toBeInstanceOf(UnknownResponseError);
});

it("can fall back to another decoder for the same status", async () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: [
      { status: 200, decodeAs: "json", body: z.object({ value: z.string() }) },
      { status: 200, decodeAs: "text", body: z.string() },
    ],
  });
  const send = createFetcher(contract, {
    baseUrl,
    codecs,
    fetch: async () => new Response("plain text"),
  });
  await expect(send()).resolves.toEqual({
    status: 200,
    body: "plain text",
  });
});

it.each([200, 418])("cancels an unread body when the observed status is %i", async (status) => {
  const cancel = vi.fn();
  const observed = new Response(new ReadableStream({ cancel }), { status });
  const send = createFetcher(
    endpoint({ method: "GET", path: path("/"), request: {}, response: { status: 200 } }),
    { baseUrl, codecs, fetch: async () => observed },
  );

  if (status === 200) await expect(send()).resolves.toEqual({ status });
  else {
    const result = send();
    await expect(result).rejects.toBeInstanceOf(UnknownResponseError);
    await expect(result).rejects.toMatchObject({ status });
  }
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("releases both branches when the first decoder returns without reading", async () => {
  const cancel = vi.fn();
  const observed = new Response(new ReadableStream({ cancel }));
  const send = createFetcher(
    endpoint({
      method: "GET",
      path: path("/"),
      request: {},
      response: [
        { status: 200, decodeAs: "text", body: z.string() },
        { status: 200, decodeAs: "json", body: z.number() },
      ],
    }),
    {
      baseUrl,
      codecs: { decoders: { ...codecs.decoders, text: () => "ok" } },
      fetch: async () => observed,
    },
  );

  await expect(send()).resolves.toEqual({ status: 200, body: "ok" });
  expect(cancel).toHaveBeenCalledTimes(1);
});
