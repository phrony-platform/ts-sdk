import { describe, expect, it, vi } from "vitest";
import { Phrony, fileRefFromObjectKey, leafNameFromObjectKey } from "./client.js";
import { PhronyAPIError } from "./errors.js";
import { parseSSEStream } from "./sse.js";

describe("Phrony", () => {
  it("startRun maps to POST with X-API-Key", async () => {
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/agents/agent-1/runs");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("phk_test");
      return new Response(
        JSON.stringify({
          sessionId: "s1",
          runId: "r1",
          status: "Running",
          totalTokensUsed: 0,
          output: null,
        }),
        { status: 202 },
      );
    });
    const client = new Phrony({ apiKey: "phk_test", baseUrl: "https://api.example", fetch });
    const out = await client.startRun("agent-1", { input: { x: 1 } });
    expect(out.runId).toBe("r1");
  });

  it("throws PhronyAPIError on HTTP error", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 401 }));
    const client = new Phrony({ apiKey: "phk_x", fetch });
    await expect(client.getRun("r1")).rejects.toMatchObject({ status: 401, name: "PhronyAPIError" });
  });
});

describe("file helpers", () => {
  it("leafNameFromObjectKey and fileRefFromObjectKey", () => {
    expect(leafNameFromObjectKey("tenant/x/file.pdf")).toBe("file.pdf");
    expect(
      fileRefFromObjectKey("a/b/c.doc", "application/msword"),
    ).toEqual({
      phronyFile: true,
      filename: "c.doc",
      mediaType: "application/msword",
    });
  });
});

describe("parseSSEStream", () => {
  it("yields json from SSE data", async () => {
    const enc = new TextEncoder();
    const data =
      "data: {\"ts\":\"1\",\"kind\":\"run\",\"subject\":\"x\",\"data\":{}}\n\n";
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(data));
        c.close();
      },
    });
    const evs: unknown[] = [];
    for await (const ev of parseSSEStream(stream)) {
      evs.push(ev);
    }
    expect(evs).toHaveLength(1);
    expect((evs[0] as { kind: string }).kind).toBe("run");
  });
});

describe("PhronyAPIError", () => {
  it("is instanceof Error", () => {
    const e = new PhronyAPIError(500, "msg", "/p", "body");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(PhronyAPIError);
  });
});
