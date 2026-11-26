import type { Codecs } from "../codec/codecs";
import type { ResponseShape } from "../contract/response";

function createCaseInsensitiveHeaders(headers: Headers): Record<string, string> {
  return new Proxy<Record<string, string>>({} as Record<string, string>, {
    get(_, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return headers.get(property) ?? undefined;
    },
    has(_, property) {
      return typeof property === "string" && headers.has(property);
    },
    ownKeys() {
      return [...headers.keys()];
    },
    getOwnPropertyDescriptor(_, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      const value = headers.get(property);
      if (value === null) {
        return undefined;
      }

      return {
        configurable: true,
        enumerable: true,
        value,
      };
    },
  });
}

export function discardResponseBody(response: Response) {
  if (response.body && !response.body.locked) {
    void response.body.cancel().catch(() => {});
  }
}

export async function validateResponse({
  shape,
  response,
  decoders,
}: {
  shape: ResponseShape;
  response: Response;
  decoders: NonNullable<Codecs["decoders"]>;
}) {
  if (shape.status !== response.status) return undefined;

  let validatedHeaders: unknown = undefined;

  if (shape.headers) {
    const headerResult = await shape.headers["~standard"].validate(
      createCaseInsensitiveHeaders(response.headers),
    );

    if (headerResult.issues) {
      return undefined;
    }

    validatedHeaders = headerResult.value;
  }

  let validatedBody: unknown = undefined;

  if (shape.body) {
    const decode = decoders[shape.decodeAs];
    if (!decode) return undefined;

    let decoded: unknown;
    let candidate: Response | undefined;
    try {
      candidate = response.clone();
      decoded = await decode(candidate);
    } catch {
      return undefined;
    } finally {
      if (candidate) discardResponseBody(candidate);
    }

    const bodyResult = await shape.body["~standard"].validate(decoded);

    if (bodyResult.issues) {
      return undefined;
    }

    validatedBody = bodyResult.value;
  }

  return {
    status: shape.status,
    ...(validatedHeaders !== undefined ? { headers: validatedHeaders } : {}),
    ...(validatedBody !== undefined ? { body: validatedBody } : {}),
  };
}
