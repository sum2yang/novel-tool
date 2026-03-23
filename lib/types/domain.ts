export const TASK_TYPES = [
  "ingest_sources",
  "workflow_check",
  "generate_setting",
  "generate_outline",
  "generate_chapter",
  "review_content",
  "minimal_fix",
  "sync_state",
  "research_fact_check",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const PROVIDER_TYPES = ["openai", "gemini", "anthropic"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const OPENAI_API_STYLES = ["responses", "chat_completions"] as const;
export type OpenAIApiStyle = (typeof OPENAI_API_STYLES)[number];

export const AUTH_MODES = ["none", "bearer", "api_key", "custom_header"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const HEALTH_STATUSES = [
  "healthy",
  "degraded",
  "invalid_auth",
  "unreachable",
  "misconfigured",
] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const MCP_TRANSPORT_TYPES = ["streamable_http", "sse"] as const;
export type McpTransportType = (typeof MCP_TRANSPORT_TYPES)[number];

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const REFERENCE_SOURCE_TYPES = [
  "txt",
  "markdown",
  "html_static_topic",
  "html_attachment_text",
  "html_attachment_binary",
] as const;
export type ReferenceSourceType = (typeof REFERENCE_SOURCE_TYPES)[number];

export const ARTIFACT_KINDS = [
  "canonical",
  "project_setting",
  "project_state",
  "project_outline",
  "project_chapter",
  "review_report",
  "ledger",
  "hook_pool",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const DRAFT_STATUSES = ["pending", "ready", "accepted", "rejected", "superseded"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_KINDS = ["generated_output", "editor_autosave", "review_revision"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const GROK_TOOL_NAMES = [
  "web_search",
  "get_sources",
  "web_fetch",
  "web_map",
  "get_config_info",
  "search_planning",
] as const;
export type GrokToolName = (typeof GROK_TOOL_NAMES)[number];
