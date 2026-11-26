import { z } from "zod";
import {
  path,
  request,
  response,
  UnknownResponseError,
  resolvePath,
  type PathInput,
  type RequestInput,
} from "../src/public";

const origin = "https://api.example.com";

// One route accepts two representations. The caller chooses the shape
// explicitly because both schemas accept a title string as input.
const notesPath = path(
  "/workspaces/:workspaceId/notes",
  z.object({ workspaceId: z.string().min(1) }),
);
const jsonRequest = request({
  encodeAs: "json",
  body: z
    .string()
    .trim()
    .min(1)
    .transform((title) => ({ title })),
});
const textRequest = request({ encodeAs: "text", body: z.string().trim().min(1) });
const created = response({
  status: 201,
  decodeAs: "json",
  body: z.object({ id: z.string(), title: z.string() }),
});
const rejected = response({
  status: 422,
  decodeAs: "json",
  body: z.object({ message: z.string() }),
});

type CallInput = PathInput<typeof notesPath> &
  (
    | ({ encodeAs: typeof jsonRequest.encodeAs } & RequestInput<typeof jsonRequest>)
    | ({ encodeAs: typeof textRequest.encodeAs } & RequestInput<typeof textRequest>)
  );
type Result = Awaited<ReturnType<typeof createNote>>;

async function createNote(input: CallInput, signal?: AbortSignal) {
  const shape = input.encodeAs === "json" ? jsonRequest : textRequest;
  const resolvedPath = await resolvePath(notesPath, input.params);
  const body =
    shape.encodeAs === "json"
      ? JSON.stringify(await shape.body.parseAsync(input.body))
      : await shape.body.parseAsync(input.body);
  const observed = await fetch(new URL(resolvedPath, origin), {
    method: "POST",
    headers: { "content-type": shape.encodeAs === "json" ? "application/json" : "text/plain" },
    body,
    signal,
  });
  if (observed.status !== created.status && observed.status !== rejected.status) {
    void observed.body?.cancel().catch(() => {});
    throw new UnknownResponseError(observed.status);
  }

  let json: unknown;
  try {
    json = await observed.json();
  } catch {
    signal?.throwIfAborted();
    throw new UnknownResponseError(observed.status);
  }
  if (observed.status === created.status) {
    const body = await created.body.safeParseAsync(json);
    if (body.success) return { status: created.status, body: body.data } as const;
  } else {
    const body = await rejected.body.safeParseAsync(json);
    if (body.success) return { status: rejected.status, body: body.data } as const;
  }
  throw new UnknownResponseError(observed.status);
}

await createNote({ encodeAs: "json", params: { workspaceId: "acme" }, body: " First note " });
await createNote({ encodeAs: "text", params: { workspaceId: "acme" }, body: " First note " });
