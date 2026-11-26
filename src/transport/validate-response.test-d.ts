import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { path, endpoint } from "../public";
import type { RuntimeResult } from "./fetcher";

test("defined fields follow schema output and exact status", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/example"),
    request: {},
    response: [
      {
        status: 200,
        decodeAs: "json",
        body: z.object({ id: z.string() }),
        headers: z.object({ trace: z.string().optional() }),
      },
      {
        status: 201,
        decodeAs: "json",
        body: z.string().optional().default("fallback"),
      },
      {
        status: 202,
        decodeAs: "json",
        body: z.string().transform((value) => value || undefined),
      },
      { status: 204 },
      { status: 205, decodeAs: "json", body: z.undefined() },
      { status: 206, decodeAs: "json", body: z.never() },
      {
        status: 404,
        decodeAs: "json",
        body: z.string().nullable(),
      },
    ],
  });
  type Defined = RuntimeResult<typeof contract>;
  expectTypeOf<Extract<Defined, { status: 200 }>>().toEqualTypeOf<{
    status: 200;
    body: { id: string };
    headers: { trace?: string | undefined };
  }>();
  expectTypeOf<Extract<Defined, { status: 201 }>>().toEqualTypeOf<{
    status: 201;
    body: string;
  }>();
  expectTypeOf<Extract<Defined, { status: 202 }>>().toEqualTypeOf<{
    status: 202;
    body?: string | undefined;
  }>();
  expectTypeOf<Extract<Defined, { status: 204 }>>().toEqualTypeOf<{
    status: 204;
  }>();
  expectTypeOf<Extract<Defined, { status: 205 }>>().toEqualTypeOf<{
    status: 205;
    body?: undefined;
  }>();
  expectTypeOf<Extract<Defined, { status: 206 }>>().toEqualTypeOf<{
    status: 206;
    body: never;
  }>();
  expectTypeOf<Extract<Defined, { status: 404 }>["body"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Extract<RuntimeResult<typeof contract>, Error>>().toEqualTypeOf<never>();
});

test("same-status alternatives retain correlated headers and bodies", () => {
  const contract = endpoint({
    method: "GET",
    path: path("/"),
    request: {},
    response: [
      {
        status: 200,
        headers: z.object({ mode: z.literal("first") }),
        decodeAs: "json",
        body: z.object({ first: z.string() }),
      },
      {
        status: 200,
        headers: z.object({ mode: z.literal("second") }),
        decodeAs: "text",
        body: z.string(),
      },
    ],
  });
  expectTypeOf<RuntimeResult<typeof contract>>().toEqualTypeOf<
    | {
        status: 200;
        headers: { mode: "first" };
        body: { first: string };
      }
    | {
        status: 200;
        headers: { mode: "second" };
        body: string;
      }
  >();
});
