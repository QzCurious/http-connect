import { z } from "zod";
import {
  codecs,
  endpoint,
  path,
  prepareRequest,
  toFormData,
  toURLSearchParams,
  UnknownResponseError,
  validateResponse,
  type CallInput,
  type RuntimeResult,
} from "../src/public";

const origin = "https://api.example.com";

const listNotesContract = endpoint({
  method: "GET",
  path: path("/workspaces/:workspaceId/notes", z.object({ workspaceId: z.string().min(1) })),
  request: {
    query: z.object({ page: z.number().int().positive(), tag: z.array(z.string()).optional() }),
    headers: z.object({ "accept-language": z.string() }),
  },
  response: [
    {
      status: 200,
      decodeAs: "json",
      body: z.array(z.object({ id: z.string(), title: z.string() })),
    },
    {
      status: 404,
      decodeAs: "json",
      body: z.object({ code: z.literal("workspace_not_found"), message: z.string() }),
    },
  ],
});

type ListNotesInput = CallInput<typeof listNotesContract>;
type ListNotesResult = RuntimeResult<typeof listNotesContract>;

async function listNotes(input: ListNotesInput, signal?: AbortSignal): Promise<ListNotesResult> {
  const prepared = await prepareRequest(listNotesContract, input);
  const url = new URL(prepared.resolvedPath, origin);
  url.search = toURLSearchParams(prepared.query).toString();
  const observed = await fetch(url, {
    method: prepared.method,
    headers: prepared.headers,
    signal,
  });
  for (const shape of listNotesContract.response) {
    const result = await validateResponse({ shape, response: observed, decoders: codecs.decoders });
    if (result !== undefined) return result as ListNotesResult;
  }
  throw new UnknownResponseError(observed.status);
}

await listNotes({
  params: { workspaceId: "acme" },
  query: { page: 1 },
  headers: { "accept-language": "en" },
});

await listNotes({
  params: { workspaceId: "acme" },
  query: { page: 2, tag: ["work", "urgent"] },
  headers: { "accept-language": "zh-TW" },
});

// =============================

const createNoteContract = endpoint({
  method: "POST",
  path: path("/workspaces/:workspaceId/notes", z.object({ workspaceId: z.string().min(1) })),
  request: {
    encodeAs: "json",
    body: z
      .string()
      .trim()
      .min(1)
      .transform((title) => ({ title })),
  },
  response: { status: 204 },
});

type CreateNoteInput = CallInput<typeof createNoteContract>;
type CreateNoteResult = RuntimeResult<typeof createNoteContract>;

async function createNote(input: CreateNoteInput, signal?: AbortSignal) {
  const prepared = await prepareRequest(createNoteContract, input);
  const observed = await fetch(new URL(prepared.resolvedPath, origin), {
    method: prepared.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prepared.body),
    signal,
  });
  const result = await validateResponse({
    shape: createNoteContract.response,
    response: observed,
    decoders: codecs.decoders,
  });
  if (result === undefined) throw new UnknownResponseError(observed.status);
  return result as CreateNoteResult;
}

await createNote({ params: { workspaceId: "acme" }, body: " First note " });

// =============================

const attachNoteImageContract = endpoint({
  method: "POST",
  path: path(
    "/workspaces/:workspaceId/notes/:noteId/images",
    z.object({ workspaceId: z.string().min(1), noteId: z.string().min(1) }),
  ),
  request: {
    encodeAs: "form-data",
    body: z.object({ image: z.file(), alt: z.string() }),
  },
  response: {
    status: 201,
    decodeAs: "json",
    body: z.object({ id: z.string(), url: z.string() }),
  },
});

type AttachNoteImageInput = CallInput<typeof attachNoteImageContract>;
type AttachNoteImageResult = RuntimeResult<typeof attachNoteImageContract>;

async function attachNoteImage(
  input: AttachNoteImageInput,
  signal?: AbortSignal,
): Promise<AttachNoteImageResult> {
  const prepared = await prepareRequest(attachNoteImageContract, input);
  const observed = await fetch(new URL(prepared.resolvedPath, origin), {
    method: prepared.method,
    body: toFormData(prepared.body),
    signal,
  });
  const shape = attachNoteImageContract.response;
  const result = await validateResponse({ shape, response: observed, decoders: codecs.decoders });
  if (result === undefined) throw new UnknownResponseError(observed.status);
  return result as AttachNoteImageResult;
}

const imageFile = new File(["mock image bytes"], "whiteboard.png", { type: "image/png" });

await attachNoteImage({
  params: { workspaceId: "acme", noteId: "note-42" },
  body: { image: imageFile, alt: "Whiteboard sketch of the sign-in flow" },
});
