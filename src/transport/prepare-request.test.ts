import { CallInputValidationError } from "../public";
import { path } from "../contract/path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { endpoint } from "../contract/endpoint";
import { prepareRequest } from "./prepare-request";

describe("prepareRequest", () => {
  it.each(["params", "query", "headers", "body"] as const)(
    "exposes the original validation issues for %s",
    async (section) => {
      const schema = z.object({ id: z.string().min(1) });
      const contract = endpoint({
        method: "POST",
        path: path("/users/{id}", schema),
        request: { query: schema, headers: schema, encodeAs: "json", body: schema },
        response: { status: 200 },
      });
      const valid = { id: "1" };
      const invalid = { id: "" };
      const input = {
        params: valid,
        query: valid,
        headers: valid,
        body: valid,
        [section]: invalid,
      };
      const result = prepareRequest(contract, input);

      await expect(result).rejects.toBeInstanceOf(CallInputValidationError);
      await expect(result).rejects.toMatchObject({
        section,
        issues: [{ path: ["id"], message: expect.any(String) }],
      });
    },
  );

  it.each(["/files/:fileName.:extension", "/files/{fileName}.{extension}"] as const)(
    "resolves and percent-encodes embedded placeholders in %s",
    async (template) => {
      const contract = endpoint({
        method: "GET",
        path: path(template, z.object({ fileName: z.string(), extension: z.string() })),
        request: {},
        response: { status: 200 },
      });

      await expect(
        prepareRequest(contract, {
          params: { fileName: "reports/annual report", extension: "json" },
        }),
      ).resolves.toEqual({
        method: "GET",
        resolvedPath: "/files/reports%2Fannual%20report.json",
      });
    },
  );

  it.each([
    ["/:id-:id/:_A1", "/42-42/code"],
    ["/{_A1}/{id}{_A1}", "/code/42code"],
  ] as const)("resolves repeated placeholders in %s", async (template, resolvedPath) => {
    const contract = endpoint({
      method: "GET",
      path: path(template, z.object({ id: z.number(), _A1: z.string() })),
      request: {},
      response: { status: 200 },
    });

    await expect(
      prepareRequest(contract, { params: { id: 42, _A1: "code" } }),
    ).resolves.toMatchObject({ resolvedPath });
  });

  it("preserves non-identifier suffixes after colon placeholders", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/:café", z.object({ caf: z.string() })),
      request: {},
      response: { status: 200 },
    });

    await expect(prepareRequest(contract, { params: { caf: "coffee" } })).resolves.toMatchObject({
      resolvedPath: "/coffeeé",
    });
  });

  it("resolves params and carries validated request sections", async () => {
    const contract = endpoint({
      method: "POST",
      path: path("/users/{id}", z.object({ id: z.string() })),
      request: {
        query: z.object({ page: z.number().optional() }),
        headers: z.object({ authorization: z.string() }),
        encodeAs: "json",
        body: z.object({ name: z.string() }),
      },
      response: { status: 201 },
    });

    const prepared = await prepareRequest(contract, {
      params: { id: "42" },
      query: { page: 3 },
      headers: { authorization: "Bearer token" },
      body: { name: "Ada" },
    });

    expect(prepared).toEqual({
      method: "POST",
      resolvedPath: "/users/42",
      query: { page: 3 },
      headers: { authorization: "Bearer token" },
      encodeAs: "json",
      body: { name: "Ada" },
    });
  });

  it("transforms rich call input into transport-compatible prepared sections", async () => {
    const contract = endpoint({
      method: "GET",
      path: path(
        "/users/{id}",
        z.object({
          id: z.object({ value: z.number() }).transform(({ value }) => value),
        }),
      ),
      request: {
        query: z.object({
          page: z.string().transform((value) => Number(value)),
          includeDrafts: z.string().transform((value) => value === "true"),
          since: z.date().transform((date) => date.toISOString()),
        }),
        headers: z.object({
          authorization: z
            .object({ token: z.string() })
            .transform(({ token }) => `Bearer ${token}`),
        }),
      },
      response: { status: 200 },
    });

    const prepared = await prepareRequest(contract, {
      params: { id: { value: 42 } },
      query: {
        page: "3",
        includeDrafts: "true",
        since: new Date("2026-11-12T00:00:00.000Z"),
      },
      headers: { authorization: { token: "token" } },
    });

    expect(prepared).toEqual({
      method: "GET",
      resolvedPath: "/users/42",
      query: {
        page: 3,
        includeDrafts: true,
        since: "2026-11-12T00:00:00.000Z",
      },
      headers: { authorization: "Bearer token" },
    });
  });

  it.each([
    {
      name: "query with optional fields",
      contract: endpoint({
        method: "GET",
        path: path("/users"),
        request: {
          query: z.object({ include: z.string().optional() }),
        },
        response: { status: 200 },
      }),
      section: "query",
    },
    {
      name: "body with only optional fields",
      contract: endpoint({
        method: "POST",
        path: path("/users"),
        request: {
          encodeAs: "json",
          body: z.object({ name: z.string().optional() }),
        },
        response: { status: 200 },
      }),
      section: "body",
    },
  ])("lets the declared $name schema reject an omitted section", async (scenario) => {
    await expect(prepareRequest(scenario.contract)).rejects.toMatchObject({
      section: scenario.section,
    });
  });

  it("lets a declared schema synthesize a default for an omitted section", async () => {
    const contract = endpoint({
      method: "POST",
      path: path("/users"),
      request: {
        encodeAs: "json",
        body: z.object({ name: z.string() }).default({ name: "Ada" }),
      },
      response: { status: 201 },
    });

    const prepared = await prepareRequest(contract);

    expect(prepared).toEqual({
      method: "POST",
      resolvedPath: "/users",
      encodeAs: "json",
      body: { name: "Ada" },
    });
  });

  it("preserves synthesized defaults for explicitly undefined body sections", async () => {
    const contract = endpoint({
      method: "POST",
      path: path("/users"),
      request: {
        encodeAs: "json",
        body: z.object({ name: z.string() }).default({ name: "Ada" }),
      },
      response: { status: 201 },
    });

    const prepared = await prepareRequest(contract, { body: undefined });

    expect(prepared).toEqual({
      method: "POST",
      resolvedPath: "/users",
      encodeAs: "json",
      body: { name: "Ada" },
    });
  });

  it("ignores undeclared sections in a Call Input variable", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: {},
      response: { status: 200 },
    });

    const input = { headers: { authorization: "x" } };
    await expect(prepareRequest(contract, input)).resolves.toEqual({
      method: "GET",
      resolvedPath: "/users",
    });
  });

  it("lets a required section schema reject undefined", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users/{id}", z.object({ id: z.string() })),
      request: {},
      response: { status: 200 },
    });

    await expect(prepareRequest(contract)).rejects.toMatchObject({ section: "params" });
  });

  it("transforms explicitly undefined body input to a supported encoded output", async () => {
    const contract = endpoint({
      method: "POST",
      path: path("/users"),
      request: {
        encodeAs: "json",
        body: z
          .object({ name: z.string() })
          .optional()
          .transform((value) => value ?? null),
      },
      response: { status: 201 },
    });

    const prepared = await prepareRequest(contract, { body: undefined });

    expect(prepared).toEqual({
      method: "POST",
      resolvedPath: "/users",
      encodeAs: "json",
      body: null,
    });
  });

  it("allows validated query values in the URLSearchParamsObject family", async () => {
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: {
        query: {
          "~standard": {
            validate: async () => ({
              value: {
                tags: ["red", "blue"],
                filter: { price: { gte: 50 } },
                items: [{ id: 1 }, { id: 2 }],
                empty: null,
              },
            }),
          },
        } as any,
      },
      response: { status: 200 },
    });

    await expect(
      prepareRequest(contract, { query: { tags: ["red"] } as any }),
    ).resolves.toMatchObject({
      query: {
        tags: ["red", "blue"],
        filter: { price: { gte: 50 } },
        items: [{ id: 1 }, { id: 2 }],
        empty: null,
      },
    });
  });
});

it.each(["hello", 42])(
  "validates a schema union without changing request facts: %s",
  async (value) => {
    const contract = endpoint({
      method: "POST",
      path: path("/values"),
      request: {
        encodeAs: "json",
        body: z.union([z.string(), z.number()]).transform((value) => ({ value })),
      },
      response: { status: 204 },
    });
    await expect(prepareRequest(contract, { body: value })).resolves.toEqual({
      method: "POST",
      resolvedPath: "/values",
      encodeAs: "json",
      body: { value },
    });
  },
);

it("propagates schema exceptions", async () => {
  const failure = new Error("broken transform");
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.string().transform(() => {
        throw failure;
      }),
    },
    response: { status: 204 },
  });
  await expect(prepareRequest(contract, { body: "hello" })).rejects.toBe(failure);
});

it("validates a body without an explicit content type and leaves it unencoded", async () => {
  const contract = endpoint({
    method: "POST",
    path: path("/"),
    request: {
      encodeAs: "json",
      body: z.string().transform((title) => ({ title })),
    },
    response: { status: 204 },
  });
  const prepared = await prepareRequest(contract, { body: "Hello" });
  expect(prepared).toEqual({
    method: "POST",
    resolvedPath: "/",
    encodeAs: "json",
    body: { title: "Hello" },
  });
  expect(prepared).not.toHaveProperty("contentType");
});
