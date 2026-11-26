import { describe, expect, expectTypeOf, it } from "vitest";
import { toURLSearchParams, type URLSearchParamsObject } from "../public";

describe("toURLSearchParams", () => {
  it("preserves URLSearchParams identity", () => {
    const params = new URLSearchParams({ username: "foo" });

    expect(toURLSearchParams(params)).toBe(params);
  });

  it("converts URLSearchParams constructor-compatible values", () => {
    expect(toURLSearchParams("tag=a&tag=b").toString()).toBe("tag=a&tag=b");

    expect(
      toURLSearchParams([
        ["tag", "a"],
        ["tag", "b"],
      ]).toString(),
    ).toBe("tag=a&tag=b");
  });

  it("converts URLSearchParamsObject values to URLSearchParams", () => {
    const result = toURLSearchParams({
      q: "shoes",
      tags: ["red", "blue"],
      filter: { price: { gte: 50 }, brand: ["nike", "adidas"] },
      items: [
        { id: 1, qty: 2 },
        { id: 2, qty: 5 },
      ],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      empty: null,
      omitted: undefined,
      emptyArray: [],
      emptyObject: {},
    });

    expect([...result]).toEqual([
      ["q", "shoes"],
      ["tags", "red"],
      ["tags", "blue"],
      ["filter[price][gte]", "50"],
      ["filter[brand]", "nike"],
      ["filter[brand]", "adidas"],
      ["items[0][id]", "1"],
      ["items[0][qty]", "2"],
      ["items[1][id]", "2"],
      ["items[1][qty]", "5"],
      ["matrix[0][0]", "1"],
      ["matrix[0][1]", "2"],
      ["matrix[1][0]", "3"],
      ["matrix[1][1]", "4"],
      ["empty", ""],
    ]);
  });

  it("treats top-level bracket keys as opaque field names", () => {
    const result = toURLSearchParams({
      "tags[]": ["red", "blue"],
      "filter[brand]": ["nike", "adidas"],
    });

    expect([...result]).toEqual([
      ["tags[]", "red"],
      ["tags[]", "blue"],
      ["filter[brand]", "nike"],
      ["filter[brand]", "adidas"],
    ]);
  });

  it("types URLSearchParamsObject arrays", () => {
    expectTypeOf({
      tags: ["red", "blue"],
      items: [{ id: 1 }, { id: 2 }],
      matrix: [
        [1, 2],
        [3, 4],
      ],
    }).toMatchTypeOf<URLSearchParamsObject>();
  });
});
