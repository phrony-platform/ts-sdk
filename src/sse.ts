/**
 * Phrony run stream: each SSE `data` line is one JSON object.
 * @see https://docs.phrony.com — Runs API stream (SSE)
 */
export type StreamEventKind =
  | "step"
  | "session"
  | "run"
  | "user_task"
  | "aitl";

export interface StreamEvent {
  ts: string;
  kind: StreamEventKind;
  subject: string;
  data: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * Parse a Phrony `text/event-stream` body into async iterable JSON events.
 * Each event's `data` field (possibly multiple lines) is concatenated and JSON-parsed.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<StreamEvent, void, undefined> {
  if (!body) {
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let data = "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        data += line.slice(5).trimStart();
      }
    }
    if (data.length === 0) {
      return;
    }
    try {
      return JSON.parse(data) as StreamEvent;
    } catch {
      // skip malformed line
      return undefined;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.trim()) {
          continue;
        }
        const ev = parseBlock(part);
        if (ev) {
          yield ev;
        }
      }
    }
    if (buffer.trim()) {
      const ev = parseBlock(buffer);
      if (ev) {
        yield ev;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
