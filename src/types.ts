export type JsonObject = Record<string, unknown>;

export interface StartRunResponse {
  sessionId: string;
  runId: string;
  status: string;
  totalTokensUsed: number;
  output: unknown;
  error?: string;
  agentId?: string;
  triggerId?: string | null;
  duplicateDelivery?: boolean;
  [k: string]: unknown;
}

export interface RunStatus {
  runId: string;
  status: string;
  output: unknown;
  error?: string;
  [k: string]: unknown;
}

export interface SessionListItem {
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
  output: unknown;
  error: string | null;
  input: unknown;
  startContext: object | null;
  rootRunId: string | null;
  startedAt: string;
  finishedAt: string | null;
  runCount: number;
  entryRunId: string | null;
  [k: string]: unknown;
}

export interface ListSessionsResponse {
  items: SessionListItem[];
  total: number;
  [k: string]: unknown;
}

export interface ListSessionsQuery {
  skip?: number;
  take?: number;
  versionId?: string;
}

export type ConversationQuery = {
  stepContent?: "slim" | "full";
};

export type {
  ConversationItemContentNarrow,
  ConversationItemType,
  ConversationResponse,
  ConversationRunSummary,
  ConversationSession,
  ConversationTimelineItem,
  EngineStepContentStanza,
  JsonValue,
  LlmRequestPreparedContent,
  OutputStepContent,
  ReasoningStepContent,
  RunCompletedItemContent,
  SessionCompletedItemContent,
  SessionStartContext,
  ToolCallStepContent,
  ToolResultPayload,
  ToolResultStepContent,
} from "./conversation.js";

export type SendRunMessageBody = {
  runId: string;
  userTaskId?: string;
  approved?: boolean;
  selectedOptionId?: string;
  textValue?: string;
  numberValue?: number;
  metadata?: JsonObject;
  text?: string;
  message?: string;
  files?: PhronyFileMessageAttachment[];
  completedByEmail?: string;
} & JsonObject;

export interface PhronyFileMessageAttachment {
  phronyFile: true;
  objectKey: string;
  filename?: string;
  mediaType?: string;
}

export interface PresignRequest {
  filename: string;
  mediaType: string;
  maxContentLength: number;
}

export interface PresignResponse {
  objectKey: string;
  uploadUrl: string;
  httpMethod: "PUT";
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
  [k: string]: unknown;
}

export interface FinalizeRequest {
  objectKey: string;
  maxContentLength: number;
  filename?: string;
  mediaType?: string;
}

export interface FinalizeResponse {
  objectKey: string;
  sizeBytes: string;
  alreadyFinalized: boolean;
  [k: string]: unknown;
}

export interface AcceptMessageResponse {
  status: string;
  error?: string;
  [k: string]: unknown;
}
