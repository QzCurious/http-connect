# http-connect

[English](./README.md) · 繁體中文

使用 `http-connect`，你可以在 TypeScript 應用程式裡，把後端路由接受的請求和你實際觀察到的回應寫成端點契約，再依照契約呼叫 API。TypeScript 會從契約推導呼叫時的輸入與回傳型別。如果後端傳回未宣告的狀態碼，或回應資料的結構有變，產生的請求函式（fetcher）會在執行時回報不符之處。

## 快速開始

安裝 `http-connect` 和範例使用的驗證套件 Zod。

```sh
npm install @qzcurious/http-connect zod
```

在支援 Fetch 的執行環境中，從 JSONPlaceholder 讀取一筆待辦事項，並用 Zod 驗證回應。

```ts
import { codecs, createTransport, endpoint, path } from "@qzcurious/http-connect";
import { z } from "zod";

const api = createTransport({ baseUrl: "https://jsonplaceholder.typicode.com", codecs });
const todo = endpoint({
  method: "GET",
  path: path("/todos/:id", z.object({ id: z.string() })),
  request: {},
  response: {
    status: 200,
    decodeAs: "json",
    body: z.object({ title: z.string(), completed: z.boolean() }),
  },
});

const getTodo = api.createFetcher(todo);
const { body } = await getTodo({ params: { id: "1" } });
console.log(body.title);
```

這段程式會呼叫 `GET /todos/1`，驗證 JSON 回應後印出待辦事項的標題。要改用自己的 API，請調整基底網址、路徑和回應的驗證規則（schema）。

## 加入查詢參數、請求標頭與 404 回應

假設 `GET /workspaces/:workspaceId/notes` 會以 JSON 傳回筆記清單，找不到工作區時則傳回 JSON 格式的錯誤訊息。以下範例同樣使用 Zod 和支援 Fetch 的執行環境。請將 `https://api.example.com` 換成你的 API 網址。

```ts
import { codecs, createTransport, endpoint, path, type CallInput } from "@qzcurious/http-connect";
import { z } from "zod";

const transport = createTransport({
  baseUrl: "https://api.example.com",
  codecs,
});

const workspaceNotes = path(
  "/workspaces/:workspaceId/notes",
  z.object({ workspaceId: z.string().min(1) }),
);

const listNotesContract = endpoint({
  method: "GET",
  path: workspaceNotes,
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

const input: ListNotesInput = {
  params: { workspaceId: "acme" },
  query: { page: 1 },
  headers: { "accept-language": "en" },
};

const result = await listNotes(input);
if (result.status === 200) {
  console.log(result.body.map((note) => note.title));
} else {
  console.log(result.body.message); // 已通過驗證的 404 回應
}
```

這個呼叫會送出 `GET /workspaces/acme/notes?page=1`，並帶上 `accept-language: en` 標頭。檢查 `result.status` 後，TypeScript 會將 `result.body` 的型別縮小為該狀態碼對應的資料型別。你可以在各功能的程式碼旁定義所需的端點，再用同一個 transport 為各端點建立請求函式。

## 傳送請求本文

要在同一路徑新增筆記，可以宣告一個 POST 端點。使用 `body` 的 schema 驗證輸入，再用 `encodeAs` 指定 transport 如何將驗證後的值編碼。

```ts
const createNoteContract = endpoint({
  method: "POST",
  path: workspaceNotes,
  request: {
    encodeAs: "json",
    body: z.string().trim().min(1).transform((title) => ({ title })),
  },
  response: { status: 204 },
});

const createNote = transport.createFetcher(createNoteContract);
await createNote({ params: { workspaceId: "acme" }, body: " First note " });
```

呼叫端傳入字串後，schema 會去除頭尾空白，再將標題轉成物件，因此 JSON 編碼器實際送出的內容是 `{"title":"First note"}`。如果回應沒有本文需要解碼，只要宣告 `{ status: 204 }` 即可。

請求本文也支援 `text`、`form-urlencoded`、`form-data`、`binary` 和 `stream`。上傳檔案時，可以搭配 `encodeAs: "form-data"` 和 `z.object({ image: z.file(), alt: z.string() })`，並在 `body` 傳入 `File` 物件及其文字說明。請讓 Fetch 自動設定 `Content-Type`，以便產生分隔 multipart 各部分所需的 boundary。完整的上傳契約與呼叫方式請見[檔案上傳範例](./playground/endpoint-with-transport.ts)。

## 設定端點與呼叫方式

- **路徑參數**：固定路徑可直接寫成 `path("/health")`。路徑含有參數時，請傳入 schema，並讓輸出物件的鍵名與路徑中的參數名稱一致。支援 `:id` 和 `{id}` 兩種寫法，每條路徑擇一使用。請求函式會逐一驗證參數，並將每個值編碼成單一路徑區段。
- **輸入與選項**：在輸入物件中提供契約宣告的各個部分（`params`、`query`、`headers` 或 `body`）。其中的個別欄位可以是選填，例如前例的 `tag`。若要取消呼叫，可在第二個引數傳入中止訊號，例如 `listNotes(input, { signal })`。如果端點沒有宣告任何輸入，可以直接呼叫請求函式，也可以將 `{ signal }` 當作第一個引數傳入。
- **多種回應格式**：可以用一個物件宣告單一回應格式，也可以用陣列列出多種格式。如果同一狀態碼對應多種資料結構，請求函式會依宣告順序嘗試，並傳回第一個通過驗證的結果。需要為推導出的結果型別命名時，可使用 `Awaited<ReturnType<typeof listNotes>>`。

## 處理錯誤

像前例的 404，只要狀態碼已在契約中宣告，且回應通過驗證，請求函式就會正常傳回結果。你可以使用 `@qzcurious/http-connect` 匯出的錯誤類別，分辨是呼叫時的輸入有誤，還是後端回應不符合契約。

| 情況 | 呼叫端收到的結果 |
| --- | --- |
| 輸入未通過 schema 驗證 | 拋出 `CallInputValidationError`。`section` 指出哪個部分驗證失敗，`issues` 列出詳細原因。此時請求尚未送出。 |
| 狀態碼未宣告，或該狀態碼的所有格式都無法成功解碼並驗證回應 | 拋出 `UnknownResponseError`，其中的 `status` 是實際收到的狀態碼。例如，前例的清單端點即使傳回 200，只要 JSON 語法有誤，仍會觸發這個錯誤。 |
| Fetch 因網路錯誤或呼叫遭取消等原因而失敗 | 呼叫端會收到底層 Fetch 實作原本的拒絕原因。 |

## 設定 transport

`createTransport` 預設使用 `globalThis.fetch`。你也可以傳入自訂的 `fetch` 函式，調整請求的傳送方式。這個函式會收到已組裝好的 Web 平台 `Request` 物件，並傳回 `Promise<Response>`。

```ts
function authenticatedTransport(baseUrl: string, token: string) {
  return createTransport({
    baseUrl,
    codecs,
    fetch(request) {
      request.headers.set("Authorization", `Bearer ${token}`);
      return fetch(request);
    },
  });
}
```

傳入 `codecs` 即可使用內建的查詢參數編碼器、請求本文編碼器與回應解碼器。如果只想註冊契約用得到的項目，可以在 transport 上設定，也可以透過 `createFetcher` 的第二個引數設定。請求函式上的設定會覆寫 transport 上的對應項目。例如，前面的筆記清單端點只需要查詢參數編碼器和 JSON 解碼器。

```ts
const api = createTransport({ baseUrl: "https://api.example.com" });
const fetchNotes = api.createFetcher(listNotesContract, {
  codecs: {
    encoders: { query: codecs.encoders.query },
    decoders: { json: codecs.decoders.json },
  },
});
```

## 更多範例

- [使用 transport 呼叫端點](./playground/endpoint-with-transport.ts) 示範如何列出筆記、新增筆記並附上圖片。
- [自行使用 Fetch 傳送請求](./playground/endpoint-with-manual-fetch.ts) 示範如何將端點契約搭配自訂的請求邏輯。
- [獨立定義資料結構](./playground/standalone-shapes.ts) 示範如何分別定義請求與回應的格式。
- [宣告多種請求格式](./playground/multiple-request-shapes.ts) 示範如何在同一路由支援 JSON 和純文字時選擇要傳送的格式。

關於專案範圍與設計考量，請參閱[產品目標](./docs/goals.md)與[維護者文件](./docs/README.md)。
