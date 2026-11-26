import { describe, expect, expectTypeOf, it } from "vitest";
import { toFormData, type FormDataObject } from "../public";

describe("toFormData", () => {
  it("preserves FormData identity", () => {
    const formData = new FormData();

    expect(toFormData(formData)).toBe(formData);
  });

  it("converts FormDataObject values to FormData", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const result = toFormData({
      file: blob,
      name: "test",
      tags: ["red", "blue"],
      profile: { active: true, score: null },
      files: [{ file: blob }],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      omitted: undefined,
      emptyArray: [],
      emptyObject: {},
    });

    expect(result.get("file")).toBeInstanceOf(Blob);
    expect(result.get("name")).toBe("test");
    expect(result.getAll("tags")).toEqual(["red", "blue"]);
    expect(result.get("profile[active]")).toBe("true");
    expect(result.get("profile[score]")).toBe("");
    expect(result.get("files[0][file]")).toBeInstanceOf(Blob);
    expect(result.getAll("matrix[0][0]")).toEqual(["1"]);
    expect(result.getAll("matrix[1][1]")).toEqual(["4"]);
    expect(result.has("omitted")).toBe(false);
    expect(result.has("emptyArray")).toBe(false);
    expect(result.has("emptyObject")).toBe(false);
  });

  it("types FormDataObject arrays", () => {
    expectTypeOf({
      files: [{ file: new Blob(["a"]) }],
      flags: [true, null, undefined],
    }).toMatchTypeOf<FormDataObject>();
  });
});
