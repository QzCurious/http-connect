import { path } from "./path";
import { describe, expect, it } from "vitest";
import { endpoint } from "./endpoint";

describe("endpoint authoring", () => {
  it("preserves single request and response declarations", () => {
    const authoredRequest = {};
    const authoredResponse = { status: 201 } as const;
    const init = {
      method: "POST",
      path: path("/users"),
      request: authoredRequest,
      response: authoredResponse,
    } as const;
    const contract = endpoint(init);
    expect(contract).toBe(init);
    expect(contract.request).toBe(authoredRequest);
    expect(contract.response).toBe(authoredResponse);
  });

  it("preserves a single request and an array of response alternatives", () => {
    const authoredRequest = {};
    const responses = [{ status: 200 } as const, { status: 404 } as const];
    const contract = endpoint({
      method: "GET",
      path: path("/users"),
      request: authoredRequest,
      response: responses,
    });
    expect(contract.request).toBe(authoredRequest);
    expect(contract.response).toBe(responses);
  });
});
