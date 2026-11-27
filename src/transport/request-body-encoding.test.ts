import { QueryClient } from "@tanstack/query-core";
import { codecs } from "../codec/codecs";
import { describe, expect, expectTypeOf, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { path, endpoint } from "../public";
import { createTransport } from "./transport";

const facts = { method: "POST", path: path("/") } as const;
function setup() {
  const sent: Request[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    sent.push(input as Request);
    return new Response(null, { status: 204 });
  });
  return {
    sent,
    fetchMock,
    transport: createTransport({
      codecs,
      prefix: "https://example.com",
      fetch: fetchMock,
    }),
  };
}

describe("contract request encodings", () => {
  it.each([
    {
      name: "JSON object",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "json",
          body: z.object({ title: z.string() }),
        },
        response: { status: 204 },
      }),
      input: { body: { title: "Hello" } },
      text: '{"title":"Hello"}',
      type: "application/json",
    },
    {
      name: "JSON string",
      contract: endpoint({
        ...facts,
        request: { encodeAs: "json", body: z.string() },
        response: { status: 204 },
      }),
      input: { body: "Hello" },
      text: '"Hello"',
      type: "application/json",
    },
    {
      name: "text",
      contract: endpoint({
        ...facts,
        request: { encodeAs: "text", body: z.string() },
        response: { status: 204 },
      }),
      input: { body: "Hello" },
      text: "Hello",
      type: "text/plain;charset=UTF-8",
    },
    {
      name: "URL-encoded object",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "form-urlencoded",
          body: z.object({ tags: z.array(z.string()) }),
        },
        response: { status: 204 },
      }),
      input: { body: { tags: ["a", "b"] } },
      text: "tags=a&tags=b",
      type: "application/x-www-form-urlencoded;charset=UTF-8",
    },
    {
      name: "URLSearchParams",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "form-urlencoded",
          body: z.instanceof(URLSearchParams).transform((params) => ({ a: params.getAll("a") })),
        },
        response: { status: 204 },
      }),
      input: { body: new URLSearchParams("a=1&a=2") },
      text: "a=1&a=2",
      type: "application/x-www-form-urlencoded;charset=UTF-8",
    },
    {
      name: "Blob",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "binary",
          body: z.instanceof(Blob),
        },
        response: { status: 204 },
      }),
      input: { body: new Blob(["blob"], { type: "image/png" }) },
      text: "blob",
      type: "image/png",
    },
    {
      name: "byte view",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "binary",
          body: z.instanceof(Uint8Array),
        },
        response: { status: 204 },
      }),
      input: { body: new Uint8Array([0, 65, 66, 0]).subarray(1, 3) },
      text: "AB",
      type: null,
    },
    {
      name: "ArrayBuffer",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "binary",
          body: z.instanceof(ArrayBuffer),
        },
        response: { status: 204 },
      }),
      input: { body: new Uint8Array([67]).buffer },
      text: "C",
      type: null,
    },
  ])(
    "sends $name with its normal Content-Type when omitted",
    async ({ contract, input, text, type }) => {
      const { transport, sent } = setup();
      const send = transport.createFetcher(contract);
      await send(input);
      expect(await sent[0]!.text()).toBe(text);
      expect(sent[0]!.headers.get("content-type")).toBe(type);
    },
  );

  it.each(["Application/Vnd.example+json; charset=utf-8", "text/plain"])(
    "preserves %s independently of JSON encoding",
    async (contentType) => {
      const { transport, sent } = setup();
      const send = transport.createFetcher(
        endpoint({
          ...facts,
          request: {
            encodeAs: "json",
            headers: z.object({ "Content-Type": z.string() }),
            body: z.object({ title: z.string() }),
          },
          response: { status: 204 },
        }),
      );
      await send({ headers: { "Content-Type": contentType }, body: { title: "Hello" } });
      expect(sent[0]!.headers.get("content-type")).toBe(contentType);
      expect(await sent[0]!.text()).toBe('{"title":"Hello"}');
    },
  );

  it.each([
    {
      encodeAs: "text",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "text",
          headers: z.object({
            "Content-Type": z
              .literal("multipart/form-data; boundary=example")
              .default("multipart/form-data; boundary=example"),
          }),
          body: z.string(),
        },
        response: { status: 204 },
      }),
    },
    {
      encodeAs: "binary",
      contract: endpoint({
        ...facts,
        request: {
          encodeAs: "binary",
          headers: z.object({
            "Content-Type": z
              .literal("multipart/form-data; boundary=example")
              .default("multipart/form-data; boundary=example"),
          }),
          body: z.string().transform((value) => new TextEncoder().encode(value)),
        },
        response: { status: 204 },
      }),
    },
  ])("sends pre-encoded multipart $encodeAs with its explicit framing", async ({ contract }) => {
    const { transport, sent } = setup();
    const encoded =
      '--example\r\nContent-Disposition: form-data; name="title"\r\n\r\nHello\r\n--example--\r\n';
    const send = transport.createFetcher(contract);
    await send({ headers: {}, body: encoded });
    expect(sent[0]!.headers.get("content-type")).toBe("multipart/form-data; boundary=example");
    expect((await sent[0]!.formData()).get("title")).toBe("Hello");
  });

  it("overrides native Blob Content-Type without changing bytes", async () => {
    const { transport, sent } = setup();
    const send = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "binary",
          headers: z.object({ "Content-Type": z.literal("image/png").default("image/png") }),
          body: z.instanceof(Blob),
        },
        response: { status: 204 },
      }),
    );
    await send({ headers: {}, body: new Blob(["bytes"], { type: "text/plain" }) });
    expect(sent[0]!.headers.get("content-type")).toBe("image/png");
    expect(await sent[0]!.text()).toBe("bytes");
  });

  it("generates multipart boundaries matching object and native FormData fields", async () => {
    const { transport, sent } = setup();
    const send = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "form-data",
          body: z.union([
            z.object({ title: z.string(), image: z.instanceof(Blob) }),
            z.instanceof(FormData).transform((form) => Object.fromEntries(form)),
          ]),
        },
        response: { status: 204 },
      }),
    );
    const body = {
      title: "Hello",
      image: new Blob(["image"], { type: "image/png" }),
    };
    const form = new FormData();
    form.set("title", body.title);
    form.set("image", body.image);
    await send({ body });
    await send({ body: form });
    for (const sentRequest of sent) {
      expect(sentRequest.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
      const fields = await sentRequest.formData();
      expect(fields.get("title")).toBe("Hello");
      expect(await (fields.get("image") as Blob).text()).toBe("image");
    }
  });

  it("awaits schema transforms for custom formats and throws before dispatch on failure", async () => {
    const { transport, sent } = setup();
    const failure = new Error("encoding failed");
    const send = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "text",
          headers: z.object({
            "Content-Type": z.literal("application/xml").default("application/xml"),
          }),
          body: z.object({ title: z.string() }).transform(async ({ title }) => {
            return `<title>${title}</title>`;
          }),
        },
        response: { status: 204 },
      }),
    );
    await send({ headers: {}, body: { title: "Hello" } });
    expect(sent[0]!.headers.get("content-type")).toBe("application/xml");
    expect(await sent[0]!.text()).toBe("<title>Hello</title>");
    const fail = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "text",
          body: z.string().transform(() => {
            throw failure;
          }),
        },
        response: { status: 204 },
      }),
    );
    await expect(fail({ body: "fail" })).rejects.toBe(failure);
    expect(sent).toHaveLength(1);
  });

  it("streams validated schema output using half duplex with no implicit Content-Type", async () => {
    const { transport, sent } = setup();
    const send = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "stream",
          body: z.string().transform(
            (value) =>
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(value));
                  controller.close();
                },
              }),
          ),
        },
        response: { status: 204 },
      }),
    );
    await send({ body: "streamed" });
    expect(sent[0]!.headers.get("content-type")).toBeNull();
    expect((sent[0] as Request & { duplex: string }).duplex).toBe("half");
    expect(await sent[0]!.text()).toBe("streamed");
  });

  it("rejects a locked stream before dispatch", async () => {
    const { transport, fetchMock } = setup();
    const send = transport.createFetcher(
      endpoint({
        ...facts,
        request: {
          encodeAs: "stream",
          body: z.custom<ReadableStream<Uint8Array>>(),
        },
        response: { status: 204 },
      }),
    );
    const body = new ReadableStream<Uint8Array>();
    const reader = body.getReader();
    try {
      await expect(send({ body })).rejects.toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      reader.releaseLock();
    }
  });

  it.each(["json", "form-data"] as const)(
    "omits undefined dynamic headers for %s",
    async (encodeAs) => {
      const { transport, sent } = setup();
      const send = transport.createFetcher(
        endpoint({
          ...facts,
          request: {
            encodeAs,
            headers: z.record(z.string(), z.string().optional()),
            body: z.object({ title: z.string() }),
          },
          response: { status: 204 },
        }),
      );
      await send({ headers: { "cOnTeNt-TyPe": undefined }, body: { title: "Hello" } });
      expect(sent[0]!.headers.get("content-type")).toMatch(
        encodeAs === "json" ? /^application\/json$/ : /^multipart\/form-data; boundary=/,
      );
    },
  );

  it.each(["cOnTeNt-TyPe"])(
    "warns about dynamically named %s and sends a parseable multipart request",
    async (name) => {
      const { transport, sent } = setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      onTestFinished(() => {
        warn.mockRestore();
      });
      const send = transport.createFetcher(
        endpoint({
          ...facts,
          request: {
            encodeAs: "form-data",
            headers: z.record(z.string(), z.string()),
            body: z.object({ title: z.string() }),
          },
          response: { status: 204 },
        }),
      );
      await send({
        headers: { [name]: "multipart/form-data; boundary=wrong", "X-Trace": "abc" },
        body: { title: "Hello" },
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Ignoring supplied Content-Type"));
      const request = sent[0]!;
      expect(request.headers.get("x-trace")).toBe("abc");
      expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
      expect((await request.formData()).get("title")).toBe("Hello");
    },
  );
});

it.each(["form-data", "form-urlencoded"] as const)(
  "uses a prepared %s as the TanStack key and replays its fields without preparing again",
  async (encoding) => {
    const { transport, sent } = setup();
    const transform = vi.fn((input: string) => ({ tag: input.trim().split(",") }));
    const body = z.string().transform(transform);
    const route = { ...facts, response: { status: 204 } } as const;
    const encoders = {
      "form-data": vi.fn(codecs.encoders["form-data"]),
      "form-urlencoded": vi.fn(codecs.encoders["form-urlencoded"]),
    };
    const search = transport.createFetcher(
      encoding === "form-data"
        ? endpoint({ ...route, request: { encodeAs: "form-data", body } })
        : endpoint({ ...route, request: { encodeAs: "form-urlencoded", body } }),
      { codecs: { encoders } },
    );
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const lookup = async (input: string) => {
      const prepared = await search.prepare({ body: input });
      expectTypeOf(prepared.body).toEqualTypeOf<{ tag: string[] }>();
      expect(prepared.body).toEqual({ tag: input.trim().split(",") });
      return client.fetchQuery({
        queryKey: ["search", prepared],
        queryFn: ({ signal }) => search.execute(prepared, { signal }),
      });
    };

    await lookup(" a,b ");
    await lookup("a,b");
    await lookup("b,a");
    expect(transform).toHaveBeenCalledTimes(3);
    expect(encoders[encoding].mock.calls).toEqual([[{ tag: ["a", "b"] }], [{ tag: ["b", "a"] }]]);
    expect(sent).toHaveLength(2);
    expect((await sent[0]!.formData()).getAll("tag")).toEqual(["a", "b"]);
    expect((await sent[1]!.formData()).getAll("tag")).toEqual(["b", "a"]);
    client.clear();
  },
);
