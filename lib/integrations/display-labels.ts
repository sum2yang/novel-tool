const PROVIDER_TYPE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

const OPENAI_API_STYLE_LABELS: Record<string, string> = {
  responses: "Responses API",
  chat_completions: "Chat Completions API",
};

const AUTH_MODE_LABELS: Record<string, string> = {
  none: "无需鉴权",
  bearer: "Bearer Token",
  api_key: "API Key",
  custom_header: "自定义请求头",
};

const MCP_TRANSPORT_LABELS: Record<string, string> = {
  streamable_http: "Streamable HTTP",
  sse: "SSE",
};

export function getProviderTypeLabel(value: string) {
  return PROVIDER_TYPE_LABELS[value] ?? value;
}

export function getOpenAIApiStyleLabel(value: string) {
  return OPENAI_API_STYLE_LABELS[value] ?? value;
}

export function getAuthModeLabel(value: string) {
  return AUTH_MODE_LABELS[value] ?? value;
}

export function getMcpTransportTypeLabel(value: string) {
  return MCP_TRANSPORT_LABELS[value] ?? value;
}
