import { PhronyAPIError } from "./errors.js";
import type { JsonObject } from "./types.js";
import { parseSSEStream, type StreamEvent } from "./sse.js";
import type {
  AcceptMessageResponse,
  ConversationQuery,
  ConversationResponse,
  FinalizeRequest,
  FinalizeResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  PresignRequest,
  PresignResponse,
  RunStatus,
  SendRunMessageBody,
  StartRunResponse,
} from "./types.js";

const DEFAULT_BASE = "https://api.phrony.com";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface PhronyClientOptions {
  /**
   * Workspace API key (`phk_…`) for the public **`/v1`** API. Sent as **`X-API-Key`**.
   * For **internal** tenant APIs (Bearer, `pwt_…` access tokens), use the Phrony CLI or call those routes with `fetch` yourself; this SDK does not map internal paths.
   */
  apiKey: string;
  /**
   * API base URL without a trailing slash (e.g. `https://api.phrony.com`).
   * @default "https://api.phrony.com"
   */
  baseUrl?: string;
  /**
   * Underlying `fetch` (e.g. pass `node:fetch` or a custom implementation).
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;
}

export type RunMessagePath = "messages" | "input";

export class Phrony {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PhronyClientOptions) {
    if (!options.apiKey) {
      throw new TypeError("Phrony: apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE);
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async requestJson<T>(
    method: string,
    path: string,
    init?: { body?: unknown; expectJson?: boolean },
  ): Promise<T> {
    const { body, expectJson = true } = init ?? {};
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
    };
    let reqBody: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      reqBody = JSON.stringify(body);
    }
    const res = await this.fetchImpl(url, { method, headers, body: reqBody });
    const text = await res.text();
    if (!res.ok) {
      throw new PhronyAPIError(
        res.status,
        `Phrony API ${res.status} ${res.statusText}: ${method} ${path}`,
        path,
        text,
      );
    }
    if (!expectJson || !text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  // --- Agents ---

  /**
   * Start a new run: `POST /v1/agents/{agentId}/runs`
   * Success: **202 Accepted** with a JSON body.
   */
  startRun(
    agentId: string,
    options?: { input?: JsonObject },
  ): Promise<StartRunResponse> {
    return this.requestJson<StartRunResponse>("POST", `/v1/agents/${agentId}/runs`, {
      body: { input: options?.input ?? {} },
    });
  }

  /**
   * List sessions: `GET /v1/agents/{agentId}/sessions`
   */
  listSessions(
    agentId: string,
    query?: ListSessionsQuery,
  ): Promise<ListSessionsResponse> {
    const u = new URL(
      `${this.baseUrl}/v1/agents/${agentId}/sessions`,
    );
    if (query?.skip !== undefined) {
      u.searchParams.set("skip", String(query.skip));
    }
    if (query?.take !== undefined) {
      u.searchParams.set("take", String(query.take));
    }
    if (query?.versionId) {
      u.searchParams.set("versionId", query.versionId);
    }
    if (query?.status) {
      u.searchParams.set("status", query.status);
    }
    return this.requestJson<ListSessionsResponse>("GET", u.pathname + u.search);
  }

  // --- Runs ---

  /** `GET /v1/runs/{runId}` */
  getRun(runId: string): Promise<RunStatus> {
    return this.requestJson<RunStatus>("GET", `/v1/runs/${runId}`);
  }

  /**
   * `GET /v1/runs/{runId}/conversation`
   */
  getConversation(
    runId: string,
    query?: ConversationQuery,
  ): Promise<ConversationResponse> {
    const u = new URL(`${this.baseUrl}/v1/runs/${runId}/conversation`);
    if (query?.stepContent) {
      u.searchParams.set("stepContent", query.stepContent);
    }
    return this.requestJson<ConversationResponse>("GET", u.pathname + u.search);
  }

  /**
   * `POST /v1/runs/{runId}/messages` or `.../input` (same body).
   * Success: **202 Accepted**.
   */
  sendRunMessage(
    runId: string,
    body: Omit<SendRunMessageBody, "runId"> & { runId?: string },
    options?: { path?: RunMessagePath },
  ): Promise<AcceptMessageResponse> {
    const pathSeg = options?.path ?? "messages";
    const full: SendRunMessageBody = { ...body, runId };
    return this.requestJson<AcceptMessageResponse>(
      "POST",
      `/v1/runs/${runId}/${pathSeg}`,
      { body: full },
    );
  }

  /**
   * End a **phrony_wait** timer early when the run is **`WaitingForTimer`**.
   * `POST /v1/runs/{runId}/skip-agent-wait` — **202 Accepted** on success (same shape as {@link sendRunMessage}).
   */
  skipAgentWaitTimer(runId: string): Promise<AcceptMessageResponse> {
    return this.requestJson<AcceptMessageResponse>(
      "POST",
      `/v1/runs/${runId}/skip-agent-wait`,
    );
  }

  /**
   * `GET /v1/runs/{runId}/stream` (SSE). Yields one {@link StreamEvent} per `data` JSON line.
   */
  async *streamRunEvents(
    runId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    const url = `${this.baseUrl}/v1/runs/${runId}/stream`;
    const res = await this.fetchImpl(url, {
      headers: { "X-API-Key": this.apiKey },
      signal,
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new PhronyAPIError(
        res.status,
        `Phrony API ${res.status} ${res.statusText}: GET /v1/runs/${runId}/stream`,
        `/v1/runs/${runId}/stream`,
        errBody,
      );
    }
    yield* parseSSEStream(res.body);
  }

  // --- File library ---

  /** `POST /v1/file-library/presign` */
  presignFile(req: PresignRequest): Promise<PresignResponse> {
    return this.requestJson<PresignResponse>("POST", "/v1/file-library/presign", {
      body: req,
    });
  }

  /** `POST /v1/file-library/finalize` */
  finalizeFile(req: FinalizeRequest): Promise<FinalizeResponse> {
    return this.requestJson<FinalizeResponse>("POST", "/v1/file-library/finalize", {
      body: req,
    });
  }

  /**
   * Presign, `PUT` bytes to `uploadUrl` with `requiredHeaders`, then finalize.
   * Uses the same API key for all three steps.
   */
  async uploadWorkspaceFile(
    file: {
      filename: string;
      mediaType: string;
      data: ArrayBuffer | Uint8Array;
    },
    putOptions?: { signal?: AbortSignal },
  ): Promise<{
    presign: PresignResponse;
    finalize: FinalizeResponse;
    /** Last path segment of `objectKey` — use in run `input` as `filename` in phrony file refs. */
    leafName: string;
  }> {
    const data =
      file.data instanceof ArrayBuffer
        ? new Uint8Array(file.data)
        : new Uint8Array(
            file.data.buffer,
            file.data.byteOffset,
            file.data.byteLength,
          );
    /** Copy to a stand-alone `ArrayBuffer` so `Blob` accepts it across TS 5+ lib typings. */
    const uploadBytes = new Uint8Array(data);
    const maxContentLength = uploadBytes.byteLength;
    const presign = await this.presignFile({
      filename: file.filename,
      mediaType: file.mediaType,
      maxContentLength,
    });
    const put = await this.fetchImpl(presign.uploadUrl, {
      method: presign.httpMethod,
      headers: { ...presign.requiredHeaders },
      body: new Blob([uploadBytes], { type: file.mediaType }),
      signal: putOptions?.signal,
    });
    const errText = await put.text();
    if (!put.ok) {
      throw new PhronyAPIError(
        put.status,
        `Upload PUT failed: ${put.status} ${put.statusText}`,
        presign.uploadUrl,
        errText,
      );
    }
    const finalize = await this.finalizeFile({
      objectKey: presign.objectKey,
      maxContentLength,
      filename: file.filename,
      mediaType: file.mediaType,
    });
    const leafName =
      presign.objectKey.split("/").pop() ?? file.filename;
    return { presign, finalize, leafName };
  }
}

/** Leaf file name from a full `objectKey` (for `phronyFile` references in `input`). */
export function leafNameFromObjectKey(objectKey: string): string {
  return objectKey.split("/").pop() ?? objectKey;
}

/**
 * `input` / message attachment shape: `{ phronyFile: true, filename, mediaType }` with a leaf filename.
 */
export function fileRefFromObjectKey(
  objectKey: string,
  mediaType: string,
): { phronyFile: true; filename: string; mediaType: string } {
  return {
    phronyFile: true,
    filename: leafNameFromObjectKey(objectKey),
    mediaType,
  };
}
