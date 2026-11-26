import { codecs } from "../codec/codecs";
import { path } from "../contract/path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { endpoint } from "../contract/endpoint";
import { validateResponse } from "./validate-response";

describe("validateResponse", () => {
  it("omits undefined schema output while retaining defined falsy values", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/example"),
      request: {},
      response: {
        status: 200,
        decodeAs: "json",
        body: z.string().transform((value) => (value === "omit" ? undefined : value)),
      },
    });
    expect(
      await validateResponse({
        shape: contract.response,
        response: new Response(JSON.stringify("omit")),
        decoders: codecs.decoders,
      }),
    ).toEqual({
      status: 200,
    });
    expect(
      await validateResponse({
        shape: contract.response,
        response: new Response(JSON.stringify("")),
        decoders: codecs.decoders,
      }),
    ).toEqual({
      status: 200,
      body: "",
    });
  });

  it("treats declared non-2xx responses as defined responses", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users/{id}", z.object({ id: z.string() })),
      request: {},
      response: {
        status: 404,
        decodeAs: "json",
        body: z.object({ error: z.string() }),
      },
    });

    const result = await validateResponse({
      shape: contract.response,
      response: new Response(JSON.stringify({ error: "missing" }), { status: 404 }),
      decoders: codecs.decoders,
    });

    expect(result).toEqual({ status: 404, body: { error: "missing" } });
  });

  it("normalizes repeated non-cookie response headers before validation", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: {},
      response: {
        status: 200,
        headers: z.object({ accept: z.string() }),
      },
    });

    const headers = new Headers();
    headers.append("accept", "application/json");
    headers.append("accept", "text/plain");

    const result = await validateResponse({
      shape: contract.response,
      response: new Response(null, { status: 200, headers }),
      decoders: codecs.decoders,
    });

    expect(result?.headers).toEqual({
      accept: "application/json, text/plain",
    });
  });

  it("matches response header schema keys case-insensitively", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: {},
      response: {
        status: 200,
        headers: z.object({ "X-Trace-Id": z.string() }),
      },
    });

    const headers = new Headers();
    headers.set("x-trace-id", "trace-123");

    const result = await validateResponse({
      shape: contract.response,
      response: new Response(null, { status: 200, headers }),
      decoders: codecs.decoders,
    });

    expect(result?.headers).toEqual({
      "X-Trace-Id": "trace-123",
    });
  });
});
