/**
 * Types for `GET /v1/runs/{runId}/conversation`.
 * Agent `input` and some step `content` shapes are contract-specific; we model known engine fields
 * and keep escape hatches via `JsonValue` / index signatures.
 */

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * `session` in the conversation response: session row plus merged view used by the API.
 * `input` is your agent’s start payload; shape depends on the trigger and agent version.
 */
export interface ConversationSession {
  id: string;
  tenantId: string;
  agentId: string;
  agentVersionId: string;
  llmModel: string | null;
  triggerType: string;
  triggeredBy: string | null;
  triggerId: string | null;
  triggerName: string | null;
  status: string;
  totalTokensUsed: number;
  output: JsonValue;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Start input (often mirrors `startContext.userInput` when present). */
  input: JsonValue;
  /**
   * Frozen config + user input snapshot when the session/run started
   * (version limits, instructions, `userInput`, and related fields).
   */
  startContext: SessionStartContext | null;
  [key: string]: unknown;
}

/**
 * Snapshot of version/runtime limits and user input for the run (often under `session.startContext`).
 */
export interface SessionStartContext {
  version?: number;
  userInput?: JsonValue;
  llmModel?: string;
  temperature?: number;
  maxTokensPerRun?: number;
  maxSessionTokens?: number;
  maxSessionDurationSec?: number;
  maxIterations?: number;
  maxToolCalls?: number;
  instructions?: string;
  subAgentExecutionModel?: string;
  canExecuteSubAgents?: boolean;
  topP?: number | null;
  topK?: number | null;
  agentExecutionMode?: string;
  rootAgentExecutionMode?: string;
  maxDepth?: number;
  [key: string]: unknown;
}

/**
 * One row in `runs[]`: every run in the session (root and sub-runs), with summaries.
 */
export interface ConversationRunSummary {
  id: string;
  sessionId: string;
  agentId: string;
  agentVersionId: string;
  parentRunId: string | null;
  depth: number;
  status: string;
  totalTokensUsed: number;
  output: JsonValue;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggerType: string;
  triggeredBy: string | null;
  triggerId: string | null;
  triggerName: string | null;
  agentName: string | null;
  versionLabel: string | null;
  llmModel: string | null;
  input: JsonValue;
  [key: string]: unknown;
}

/**
 * `items[]` type field: engine step names, plus synthetic `RunCompleted` / `SessionCompleted`.
 * The service may add new strings over time; treat unknown `type` values as extensible.
 */
export type ConversationItemType =
  | "llm_request_prepared"
  | "reasoning"
  | "ToolCall"
  | "ToolResult"
  | "output"
  | "RunCompleted"
  | "SessionCompleted"
  | "UserTaskReq"
  | (string & {});

/**
 * Merged, sorted session timeline step (or synthetic completion row).
 */
export interface ConversationTimelineItem {
  runId: string;
  id: string;
  /** Monotonic per run; not a global sort key (use `ordinal` for full timeline order). */
  sequence: number;
  /** 1-based order after the service merges and sorts the full session timeline. */
  ordinal: number;
  type: ConversationItemType;
  /**
   * Step payload; structure depends on `type`.
   * With `stepContent=slim`, redundant keys may be omitted from object `content` values
   * (see API docs: `session_id`, `run_id`, `tenant_id`, `agent_id`, `event_id` stripped from nested objects).
   */
  content: JsonValue;
  tokensUsed: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  [key: string]: unknown;
}

// --- Optional narrow types for `content` when you branch on `type` (shapes are engine-specific) ---

/** Common snake_case fields on many engine `content` objects (full / non-slim). */
export interface EngineStepContentStanza {
  run_id: string;
  session_id: string;
  tenant_id: string;
  agent_id: string;
  agent_version_id: string;
  event_id: string;
  sequence: number;
  step_kind: string;
  iteration?: number;
  [key: string]: unknown;
}

export type LlmRequestPreparedContent = EngineStepContentStanza & {
  step_kind: "llm_request_prepared";
  model: string;
};

export type ReasoningStepContent = EngineStepContentStanza & {
  step_kind: "reasoning";
  message: string;
  preview: string;
  tokens_used?: number;
};

export type ToolCallStepContent = EngineStepContentStanza & {
  step_kind: "ToolCall";
  /** Tool or capability id, depending on engine wiring. */
  name: string;
  arguments: JsonValue;
  tool_call_id: string;
  operation_name?: string;
};

export type ToolResultPayload = {
  data?: JsonValue;
  error: JsonValue;
  log_id?: string;
  successful?: boolean;
  [key: string]: unknown;
};

export type ToolResultStepContent = EngineStepContentStanza & {
  step_kind: "ToolResult";
  result: ToolResultPayload;
  tool_call_id: string;
};

export type OutputStepContent = EngineStepContentStanza & {
  step_kind: "output";
  tokens_used?: number | null;
  total_tokens_used?: number;
};

export type RunCompletedItemContent = {
  run_id: string;
  status: string;
  output: JsonValue;
  error: JsonValue;
  total_tokens_used?: number;
  [key: string]: unknown;
};

export type SessionCompletedItemContent = {
  session_id: string;
  status: string;
  output: JsonValue;
  error: JsonValue;
  total_tokens_used?: number;
  [key: string]: unknown;
};

export type ConversationItemContentNarrow =
  | LlmRequestPreparedContent
  | ReasoningStepContent
  | ToolCallStepContent
  | ToolResultStepContent
  | OutputStepContent
  | RunCompletedItemContent
  | SessionCompletedItemContent
  | JsonValue;

/**
 * Top-level body from `GET .../conversation`.
 */
export interface ConversationResponse {
  session: ConversationSession;
  runs: ConversationRunSummary[];
  items: ConversationTimelineItem[];
  [key: string]: unknown;
}
