import { z } from "zod";
import { codecs, createTransport, endpoint, path, type CallInput } from "../src/public";

const origin = "https://api.example.com";
const transport = createTransport({
  codecs,
  baseUrl: origin,
  fetch,
});

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

const listNotes = transport.createFetcher(listNotesContract);

type ListNotesInput = CallInput<typeof listNotesContract>;
type ListNotesResult = Awaited<ReturnType<typeof listNotes>>;

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

const createNote = transport.createFetcher(createNoteContract);

type CreateNoteInput = CallInput<typeof createNoteContract>;
type CreateNoteResult = Awaited<ReturnType<typeof createNote>>;

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

const attachNoteImage = transport.createFetcher(attachNoteImageContract);

type AttachNoteImageInput = CallInput<typeof attachNoteImageContract>;
type AttachNoteImageResult = Awaited<ReturnType<typeof attachNoteImage>>;

const imageFile = new File(["mock image bytes"], "whiteboard.png", { type: "image/png" });

await attachNoteImage({
  params: { workspaceId: "acme", noteId: "note-42" },
  body: { image: imageFile, alt: "Whiteboard sketch of the sign-in flow" },
});
