import { z } from "zod";
import { codecs, createTransport, endpoint, path, type CallInput } from "../src/public";

// Setup transport.
const origin = "https://api.example.com";
const transport = createTransport({
  codecs,
  baseUrl: origin,
});

// Define endpoint contract
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

// Create typed fetcher
const listNotes = transport.createFetcher(listNotesContract);

type ListNotesInput = Parameters<typeof listNotes>;
type ListNotesResult = Awaited<ReturnType<typeof listNotes>>;

// GET /workspaces/acme/notes?page=1 HTTP/1.1
// Host: api.example.com
// Accept-Language: en
await listNotes({
  params: { workspaceId: "acme" },
  query: { page: 1 },
  headers: { "accept-language": "en" },
});

// GET /workspaces/acme/notes?page=2&tag=work&tag=urgent HTTP/1.1
// Host: api.example.com
// Accept-Language: zh-TW
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

// POST /workspaces/acme/notes HTTP/1.1
// Host: api.example.com
// Content-Type: application/json
//
// {"title":"First note"}
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

// * The runtime generates the multipart boundary. This example uses "example-boundary".
// 
// POST /workspaces/acme/notes/note-42/images HTTP/1.1
// Host: api.example.com
// Content-Type: multipart/form-data; boundary=example-boundary
//
// --example-boundary
// Content-Disposition: form-data; name="image"; filename="whiteboard.png"
// Content-Type: image/png
//
// mock image bytes
// --example-boundary
// Content-Disposition: form-data; name="alt"
//
// Whiteboard sketch of the sign-in flow
// --example-boundary--
await attachNoteImage({
  params: { workspaceId: "acme", noteId: "note-42" },
  body: { image: imageFile, alt: "Whiteboard sketch of the sign-in flow" },
});
