# @phrony/sdk

TypeScript client for the **Phrony public API**. It wraps `fetch`, sends **`X-API-Key`** on every request, and provides typed responses for **agents** (start runs, list sessions), **runs** (status, conversation, follow-up messages, SSE stream), and the **file library** (presign, upload, finalize).

**Auth models:** this package is built for **workspace API keys** (`phk_…`) against **`/v1/...`**. **Workspace access tokens** (`pwt_…`) authenticate **`Authorization: Bearer`** on **internal** gateway routes (different URLs and scope model). Use the **[Phrony CLI](https://www.npmjs.com/package/@phrony/cli)** and dashboard **access tokens** for CI on internal APIs; do not substitute an API key where a Bearer access token is required.

**Requirements:** Node **18+** (or any runtime with `fetch`).

## Install

```bash
pnpm add @phrony/sdk
```

## Create a client

Set `apiKey` to a Phrony API key (`phk_...`). It must be scoped to the same agent and trigger as the routes you call.

- **`baseUrl`** (optional) defaults to `https://api.phrony.com`. Your team’s host may differ; use the base URL from the agent’s **Access** tab in the Phrony dashboard.
- **`fetch`** (optional) defaults to `globalThis.fetch`. On older Node or custom stacks, pass an implementation (for example from `undici`).

```ts
import { Phrony } from "@phrony/sdk";

const phrony = new Phrony({
  apiKey: process.env.PHRONY_API_KEY!,
  // baseUrl: "https://api.phrony.com", // default
});
```

## Start a run and poll until done

`startRun` calls `POST /v1/agents/{agentId}/runs`. The body’s `input` must match your deployed agent’s input contract; omit it or use `{}` when the agent does not need static input.

`getRun` calls `GET /v1/runs/{runId}`. Keep polling (or use the [SSE stream](#subscribe-to-the-run-stream-sse) below) until `status` is in a state you consider finished. Exact status strings depend on your workspace; see the Phrony **Runs** API reference.

```ts
import { Phrony } from "@phrony/sdk";

const phrony = new Phrony({ apiKey: "phk_…" });
const agentId = "00000000-0000-0000-0000-000000000000";

const { runId } = await phrony.startRun(agentId, {
  input: { question: "Summarize the attached policy." },
});

const interval = 1_000;
let run = await phrony.getRun(runId);
while (shouldKeepPolling(run.status)) {
  await new Promise((r) => setTimeout(r, interval));
  run = await phrony.getRun(runId);
}
console.log(run.output);

function shouldKeepPolling(status: string) {
  // Example only — align with your agent’s real lifecycle.
  return status === "Running" || status.startsWith("Waiting");
}
```

## List sessions

`listSessions` calls `GET /v1/agents/{agentId}/sessions` with optional `skip`, `take`, and `versionId`.

```ts
const page = await phrony.listSessions(agentId, { skip: 0, take: 20 });
console.log(page.items, page.total);
```

## Read the conversation

`getConversation` calls `GET /v1/runs/{runId}/conversation`. Use `stepContent: "slim"` to strip redundant keys from object step **`content`** values (per the API: `session_id`, `run_id`, `tenant_id`, `agent_id`, `event_id` where applicable).

The response is typed as **`ConversationResponse`**:

- **`session`** — `ConversationSession` (id, status, `input`, **`startContext`** with frozen version limits and `userInput`, tokens, and timing fields).
- **`runs`** — `ConversationRunSummary[]` (every run in the session, including sub-runs, with `input`, `output`, and trigger metadata).
- **`items`** — `ConversationTimelineItem[]` (merged session timeline: `ordinal` for global sort, `sequence` per run, `type` for the step, and **`content`** whose shape depends on the step).

Narrow `items[].content` with **`type`** and the optional content aliases (`ToolCallStepContent`, `ReasoningStepContent`, `RunCompletedItemContent`, `SessionCompletedItemContent`, and so on). Agent-specific payloads under `session.input` or `userInput` stay **`JsonValue`**.

```ts
import {
  type ConversationResponse,
  type ConversationTimelineItem,
  Phrony,
} from "@phrony/sdk";

const phrony = new Phrony({ apiKey: "phk_…" });
const convo: ConversationResponse = await phrony.getConversation(runId, {
  stepContent: "slim",
});

const toolCalls: ConversationTimelineItem[] = convo.items.filter(
  (i) => i.type === "ToolCall",
);
```

## Send a follow-up (messages or HITL)

`sendRunMessage` calls `POST /v1/runs/{runId}/messages` (or `…/input` with `{ path: "input" }`). The JSON must include `runId` (the client sets it for you) plus either `userTaskId` for human-in-the-loop, or `text` / `message`, and/or `files`, as required for your run’s pause. See the Phrony **Runs** API for the full field list.

```ts
await phrony.sendRunMessage(
  runId,
  { text: "Use the 2024 figures only." },
);
```

For a user task (approval, option pick, and so on), add fields like `userTaskId`, `approved`, or `selectedOptionId` in the same object.

## Subscribe to the run stream (SSE)

`streamRunEvents` calls `GET /v1/runs/{runId}/stream` and parses **Server-Sent Events** so each `data` line becomes one JSON object (`StreamEvent` with `ts`, `kind`, `subject`, `data`). Use this from a **server** or from Node; browser `EventSource` cannot set `X-API-Key`.

```ts
import type { Phrony } from "@phrony/sdk";

async function followStream(phrony: Phrony, runId: string) {
  for await (const ev of phrony.streamRunEvents(runId)) {
    console.log(ev.kind, ev.subject, ev.data);
  }
}
```

To parse a `Response` body yourself (for example a custom `fetch` pipeline), use the exported `parseSSEStream(res.body)`.

## File uploads (file library)

The API key must have **Allow file uploads** enabled. The flow is: **presign** → `PUT` bytes to `uploadUrl` with **every** header from `requiredHeaders` → **finalize** → pass a [file reference](https://docs.phrony.com) in `input` or in `files` on a run message.

`uploadWorkspaceFile` runs presign, upload, and finalize in one call and returns `leafName` (the last segment of `objectKey`) for use in a `phronyFile` reference.

```ts
import { fileRefFromObjectKey, Phrony } from "@phrony/sdk";
import { readFile } from "node:fs/promises";

const phrony = new Phrony({ apiKey: "phk_…" });
const buf = await readFile("document.pdf");
const { leafName, finalize } = await phrony.uploadWorkspaceFile({
  filename: "document.pdf",
  mediaType: "application/pdf",
  data: buf,
});

// Match your agent’s input field name, e.g. "document"
await phrony.startRun(agentId, {
  input: {
    document: fileRefFromObjectKey(finalize.objectKey, "application/pdf"),
  },
});
```

`fileRefFromObjectKey` builds `{ phronyFile: true, filename, mediaType }` using the **leaf** file name, as required for run `input`. For message attachments, use the `files[]` shape with `phronyFile: true` and `objectKey` (see the Runs API).

## Errors

Non-success HTTP status codes throw `PhronyAPIError` with `status`, `path`, and the response `body` as text (often JSON from the server).

```ts
import { Phrony, PhronyAPIError } from "@phrony/sdk";

try {
  await phrony.getRun("…");
} catch (e) {
  if (e instanceof PhronyAPIError) {
    console.error(e.status, e.path, e.message, e.body);
  }
  throw e;
}
```

## API map

| Client method | HTTP |
| --- | --- |
| `startRun` | `POST /v1/agents/{agentId}/runs` |
| `listSessions` | `GET /v1/agents/{agentId}/sessions` |
| `getRun` | `GET /v1/runs/{runId}` |
| `getConversation` | `GET /v1/runs/{runId}/conversation` |
| `sendRunMessage` | `POST /v1/runs/{runId}/messages` or `…/input` |
| `streamRunEvents` | `GET /v1/runs/{runId}/stream` (SSE) |
| `presignFile` / `finalizeFile` | `POST /v1/file-library/presign` / `…/finalize` |
| `uploadWorkspaceFile` | presign + `PUT` + finalize |

## Documentation

For request and response field details, authentication scoping, and product behavior, use the [Phrony API documentation](https://docs.phrony.com) (Agents, Runs, File library, Authentication).
