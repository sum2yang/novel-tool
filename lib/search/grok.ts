import "server-only";

import { randomUUID } from "node:crypto";

import { ApiError } from "@/lib/api/http";
import { env } from "@/lib/env";
import { createGrokSearchTrace, getGrokSearchTrace } from "@/lib/search/grok-source-cache";
import type { GrokRuntimeConfig } from "@/lib/search/grok-config";
import type { GrokToolName, TaskType } from "@/lib/types/domain";

const TOOL_TIMEOUTS: Record<GrokToolName, number> = {
  web_search: 90000,
  get_sources: 45000,
  web_fetch: 90000,
  web_map: 90000,
  get_config_info: 30000,
  search_planning: 45000,
};

const RETRY_BASE_DELAY = 1000;
const MAX_PROMPT_PREVIEW = 2400;
const MAX_SUMMARY_PREVIEW = 1200;
const DEFAULT_SEARCH_RESULTS = 6;

type GrokStatus = "ok" | "AUTH_ERROR" | "TIMEOUT" | "NETWORK_ERROR" | "SEARCH_UNAVAILABLE";

export type GrokToolResult = {
  toolName: GrokToolName;
  enabled: boolean;
  status: GrokStatus;
  attemptCount: number;
  httpStatus?: number;
  detail?: string;
  data?: unknown;
};

type ExternalFactsInput = {
  projectId?: string;
  taskType: TaskType;
  userInstruction: string;
  projectContext: string;
  selectedReferences?: string;
  currentTime: string;
};

type GrokInvocationContext = {
  projectId?: string;
};

type FactItem = {
  title: string | null;
  url: string | null;
  snippet: string | null;
};

class GrokToolInvocationError extends Error {
  status: GrokStatus;
  httpStatus?: number;
  data?: unknown;

  constructor(status: GrokStatus, detail: string, options?: { httpStatus?: number; data?: unknown }) {
    super(detail);
    this.name = "GrokToolInvocationError";
    this.status = status;
    this.httpStatus = options?.httpStatus;
    this.data = options?.data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilled(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function serializePreview(value: unknown, maxLength: number) {
  if (typeof value === "string") {
    return truncateText(value, maxLength);
  }

  try {
    return truncateText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

function pickTextField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapHttpStatusToGrokStatus(status: number): GrokStatus {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 408 || status === 504) {
    return "TIMEOUT";
  }

  return "SEARCH_UNAVAILABLE";
}

export function mapGrokStatusToHttpStatus(status: GrokStatus) {
  switch (status) {
    case "AUTH_ERROR":
      return 401;
    case "TIMEOUT":
      return 504;
    case "NETWORK_ERROR":
      return 502;
    case "SEARCH_UNAVAILABLE":
      return 503;
    default:
      return 200;
  }
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableGrokStatus(status: GrokStatus) {
  return status === "TIMEOUT" || status === "NETWORK_ERROR" || status === "SEARCH_UNAVAILABLE";
}

function normalizeFetchFailure(error: unknown) {
  if (error instanceof GrokToolInvocationError) {
    return {
      status: error.status,
      detail: error.message,
      httpStatus: error.httpStatus,
      data: error.data,
    };
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    const normalized = message.toLowerCase();

    if (normalized.includes("abort") || normalized.includes("timeout") || normalized.includes("timed out")) {
      return {
        status: "TIMEOUT" as const,
        detail: message || "The GrokSearch request timed out.",
      };
    }

    if (
      normalized.includes("fetch failed") ||
      normalized.includes("network") ||
      normalized.includes("econnreset") ||
      normalized.includes("econnrefused") ||
      normalized.includes("enotfound")
    ) {
      return {
        status: "NETWORK_ERROR" as const,
        detail: message || "The GrokSearch request failed due to a network error.",
      };
    }

    return {
      status: "SEARCH_UNAVAILABLE" as const,
      detail: message || "The GrokSearch request failed.",
    };
  }

  return {
    status: "SEARCH_UNAVAILABLE" as const,
    detail: "The GrokSearch request failed.",
  };
}

function getRetryDelay(attempt: number, config: Pick<GrokRuntimeConfig, "retryMultiplier" | "retryMaxWait">) {
  const exponentialDelay = RETRY_BASE_DELAY * config.retryMultiplier ** Math.max(0, attempt - 1);
  return Math.min(exponentialDelay, config.retryMaxWait);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRuntimeConfig(config?: GrokRuntimeConfig | null): GrokRuntimeConfig | null {
  if (config) {
    return config;
  }

  const grokConfigured = isFilled(env.GROK_API_URL) && isFilled(env.GROK_API_KEY) && isFilled(env.GROK_MODEL);
  const tavilyConfigured = isFilled(env.TAVILY_API_URL) && isFilled(env.TAVILY_API_KEY);
  const firecrawlConfigured = isFilled(env.FIRECRAWL_API_URL) && isFilled(env.FIRECRAWL_API_KEY);

  if (!grokConfigured && !tavilyConfigured && !firecrawlConfigured) {
    return null;
  }

  const sources = [
    grokConfigured ? "env" : "none",
    tavilyConfigured ? "env" : "none",
    firecrawlConfigured ? "env" : "none",
  ].filter((value) => value !== "none");

  return {
    source: sources.length > 1 ? "env" : "env",
    grok: grokConfigured
      ? {
          apiUrl: env.GROK_API_URL!.trim(),
          apiKey: env.GROK_API_KEY!.trim(),
          model: env.GROK_MODEL!.trim(),
          source: "env",
        }
      : null,
    tavily: tavilyConfigured
      ? {
          apiUrl: env.TAVILY_API_URL!.trim(),
          apiKey: env.TAVILY_API_KEY!.trim(),
          source: "env",
        }
      : null,
    firecrawl: firecrawlConfigured
      ? {
          apiUrl: env.FIRECRAWL_API_URL!.trim(),
          apiKey: env.FIRECRAWL_API_KEY!.trim(),
          source: "env",
        }
      : null,
    retryMaxAttempts: env.GROK_RETRY_MAX_ATTEMPTS,
    retryMultiplier: env.GROK_RETRY_MULTIPLIER,
    retryMaxWait: env.GROK_RETRY_MAX_WAIT,
  };
}

function buildGrokUrl(baseUrl: string, resourcePath: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  const cleanResource = resourcePath.replace(/^\//, "");

  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}/${cleanResource}`;
  }

  return `${normalized}/v1/${cleanResource}`;
}

function looksLikeLegacyGrokService(baseUrl: string) {
  return !/\/v\d+(\/|$)/i.test(baseUrl);
}

function buildFirecrawlUrl(baseUrl: string, resourcePath: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  const cleanResource = resourcePath.replace(/^\//, "");

  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}/${cleanResource}`;
  }

  return `${normalized}/v2/${cleanResource}`;
}

async function invokeLegacyServiceTool(
  toolName: GrokToolName,
  payload: Record<string, unknown>,
  runtimeConfig: GrokRuntimeConfig,
) {
  if (!runtimeConfig.grok || !looksLikeLegacyGrokService(runtimeConfig.grok.apiUrl)) {
    return null;
  }

  return postJson(
    buildGenericUrl(runtimeConfig.grok.apiUrl, `tools/${toolName}`),
    {
      model: runtimeConfig.grok.model,
      payload,
    },
    {
      Authorization: `Bearer ${runtimeConfig.grok.apiKey}`,
    },
    TOOL_TIMEOUTS[toolName],
  );
}

function buildGenericUrl(baseUrl: string, resourcePath: string) {
  return `${baseUrl.replace(/\/$/, "")}/${resourcePath.replace(/^\//, "")}`;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new GrokToolInvocationError(
        mapHttpStatusToGrokStatus(response.status),
        extractDetail(data, `Upstream request failed with status ${response.status}.`),
        {
          httpStatus: response.status,
          data,
        },
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function extractDetail(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (isRecord(data)) {
    const nestedError = data.error;

    if (typeof nestedError === "string" && nestedError.trim()) {
      return nestedError.trim();
    }

    if (isRecord(nestedError) && typeof nestedError.message === "string" && nestedError.message.trim()) {
      return nestedError.message.trim();
    }

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
  }

  return fallback;
}

function toFactItem(value: Record<string, unknown>) {
  const title =
    pickTextField(value.title) ??
    pickTextField(value.name) ??
    pickTextField(value.headline) ??
    pickTextField(value.source);
  const url =
    pickTextField(value.url) ??
    pickTextField(value.link) ??
    pickTextField(value.sourceUrl) ??
    pickTextField(value.href);
  const snippet =
    pickTextField(value.snippet) ??
    pickTextField(value.summary) ??
    pickTextField(value.description) ??
    pickTextField(value.content) ??
    pickTextField(value.text);

  if (!title && !url && !snippet) {
    return null;
  }

  return { title, url, snippet };
}

function collectFactItems(value: unknown, depth = 0, seen = new Set<string>()): FactItem[] {
  if (depth > 4) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFactItems(item, depth + 1, seen));
  }

  if (!isRecord(value)) {
    return [];
  }

  const items: FactItem[] = [];
  const factItem = toFactItem(value);

  if (factItem) {
    const key = `${factItem.title ?? ""}|${factItem.url ?? ""}|${factItem.snippet ?? ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      items.push(factItem);
    }
  }

  for (const nestedValue of Object.values(value)) {
    items.push(...collectFactItems(nestedValue, depth + 1, seen));
  }

  return items;
}

function buildFallbackSearchSummary(query: string, sources: FactItem[], answer?: string | null) {
  const lines = [`检索问题：${query}`];

  if (answer?.trim()) {
    lines.push(`检索摘要：${answer.trim()}`);
  }

  if (sources.length > 0) {
    lines.push("命中来源：");
    sources.slice(0, 5).forEach((item, index) => {
      const fragments = [item.title, item.url, item.snippet].filter(Boolean);
      lines.push(`${index + 1}. ${fragments.join(" | ")}`);
    });
  } else {
    lines.push("未返回可用来源。");
  }

  return lines.join("\n");
}

async function callGrokChat(
  config: NonNullable<GrokRuntimeConfig["grok"]>,
  messages: Array<{ role: "system" | "user"; content: string }>,
  timeoutMs: number,
  maxTokens = 700,
) {
  const data = await postJson(
    buildGrokUrl(config.apiUrl, "chat/completions"),
    {
      model: config.model,
      temperature: 0,
      max_tokens: maxTokens,
      messages,
    },
    {
      Authorization: `Bearer ${config.apiKey}`,
    },
    timeoutMs,
  );

  const content = Array.isArray((data as Record<string, unknown>)?.choices)
    ? pickTextField(
        (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content,
      )
    : null;

  if (!content) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "Grok 返回内容为空。", { data });
  }

  return content;
}

async function summarizeSearchResultsWithGrok(
  runtimeConfig: GrokRuntimeConfig,
  query: string,
  sources: FactItem[],
  answer?: string | null,
) {
  if (!runtimeConfig.grok) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "当前运行时缺少 Grok 配置，无法整理检索结果。");
  }

  const sourceContext = sources
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${(item.title ?? "未命名来源").trim()} | ${item.url ?? "无链接"} | ${item.snippet ?? "无摘要"}`)
    .join("\n");

  const prompt = [
    `检索问题：${query}`,
    answer?.trim() ? `Tavily 初步摘要：${answer.trim()}` : null,
    sourceContext ? `来源列表：\n${sourceContext}` : "来源列表：无",
    "请只输出中文摘要，保留关键事实和来源线索，不要编造未出现的信息。控制在 180 字以内。",
  ]
    .filter(Boolean)
    .join("\n\n");

  return callGrokChat(
    runtimeConfig.grok,
    [
      {
        role: "system",
        content: "你是小说工作台里的事实检索整理助手。你只能基于给定来源做简洁、可追溯的中文摘要。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    TOOL_TIMEOUTS.web_search,
    240,
  );
}

function resolveSearchQuery(payload: Record<string, unknown>) {
  return (
    pickTextField(payload.query) ??
    pickTextField(payload.keyword) ??
    pickTextField(payload.question) ??
    serializePreview(payload, 240)
  );
}

async function performWebSearch(
  payload: Record<string, unknown>,
  runtimeConfig: GrokRuntimeConfig,
  context?: GrokInvocationContext,
) {
  if (!runtimeConfig.tavily) {
    const legacyResponse = await invokeLegacyServiceTool("web_search", payload, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }

    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "当前运行时缺少 Tavily 配置，无法执行联网检索。");
  }

  if (!runtimeConfig.grok) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "当前运行时缺少 Grok 配置，无法整理检索结果。");
  }

  const query = resolveSearchQuery(payload);
  const tavilyData = await postJson(
    buildGenericUrl(runtimeConfig.tavily.apiUrl, "search"),
    {
      query,
      search_depth: "advanced",
      topic: "general",
      include_answer: true,
      include_raw_content: false,
      max_results:
        typeof payload.max_results === "number" && Number.isFinite(payload.max_results)
          ? Math.max(1, Math.min(10, Math.trunc(payload.max_results)))
          : DEFAULT_SEARCH_RESULTS,
    },
    {
      Authorization: `Bearer ${runtimeConfig.tavily.apiKey}`,
    },
    TOOL_TIMEOUTS.web_search,
  );

  const sourceItems = collectFactItems(tavilyData).slice(0, 12);
  const answer = isRecord(tavilyData) ? pickTextField(tavilyData.answer) : null;
  const content = await summarizeSearchResultsWithGrok(runtimeConfig, query, sourceItems, answer).catch((error) => {
    if (error instanceof GrokToolInvocationError) {
      throw error;
    }

    return buildFallbackSearchSummary(query, sourceItems, answer);
  });
  const upstreamSessionId =
    isRecord(tavilyData) && typeof tavilyData.request_id === "string" && tavilyData.request_id.trim()
      ? tavilyData.request_id.trim()
      : null;
  const sessionId = upstreamSessionId ?? randomUUID();
  const responsePayload = {
    session_id: sessionId,
    request_id: upstreamSessionId,
    sources_count: sourceItems.length,
    content,
    answer,
    query,
    sources: sourceItems,
    tavily: tavilyData,
  };

  if (context?.projectId) {
    await createGrokSearchTrace({
      projectId: context.projectId,
      sessionId,
      toolName: "web_search",
      requestPayload: payload,
      responsePayload,
      sourceItems,
    });
  }

  return responsePayload;
}

async function performGetSources(
  payload: Record<string, unknown>,
  runtimeConfig: GrokRuntimeConfig,
  context?: GrokInvocationContext,
) {
  const sessionId = pickTextField(payload.session_id) ?? pickTextField(payload.sessionId);

  if (!context?.projectId || !sessionId) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "缺少 projectId 或 session_id，无法读取来源明细。");
  }

  const trace = await getGrokSearchTrace(context.projectId, sessionId);

  if (!trace) {
    const legacyResponse = await invokeLegacyServiceTool("get_sources", payload, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }
  }

  if (!trace) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "未找到对应的来源缓存，请重新执行一次联网检索。", {
      httpStatus: 404,
    });
  }

  return trace.responsePayload;
}

async function performWebFetch(payload: Record<string, unknown>, runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.firecrawl) {
    const legacyResponse = await invokeLegacyServiceTool("web_fetch", payload, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }

    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "当前运行时缺少 Firecrawl 配置，无法抓取网页正文。");
  }

  const url = pickTextField(payload.url);

  if (!url) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "web_fetch 缺少 url。");
  }

  return postJson(
    buildFirecrawlUrl(runtimeConfig.firecrawl.apiUrl, "scrape"),
    {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    },
    {
      Authorization: `Bearer ${runtimeConfig.firecrawl.apiKey}`,
    },
    TOOL_TIMEOUTS.web_fetch,
  );
}

async function performWebMap(payload: Record<string, unknown>, runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.firecrawl) {
    const legacyResponse = await invokeLegacyServiceTool("web_map", payload, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }

    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "当前运行时缺少 Firecrawl 配置，无法执行站点映射。");
  }

  const url = pickTextField(payload.url);

  if (!url) {
    throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", "web_map 缺少 url。");
  }

  return postJson(
    buildFirecrawlUrl(runtimeConfig.firecrawl.apiUrl, "map"),
    {
      url,
      limit:
        typeof payload.limit === "number" && Number.isFinite(payload.limit)
          ? Math.max(1, Math.min(20, Math.trunc(payload.limit)))
          : 5,
      search: pickTextField(payload.search) ?? undefined,
    },
    {
      Authorization: `Bearer ${runtimeConfig.firecrawl.apiKey}`,
    },
    TOOL_TIMEOUTS.web_map,
  );
}

function mapProbeStatus(status: string) {
  if (status === "healthy") {
    return "ok";
  }

  if (status === "invalid_auth") {
    return "AUTH_ERROR";
  }

  if (status === "unreachable") {
    return "NETWORK_ERROR";
  }

  return "SEARCH_UNAVAILABLE";
}

async function probeTavily(runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.tavily) {
    return {
      configured: false,
      source: "none",
      status: "misconfigured",
      detail: "未配置 Tavily。",
    };
  }

  try {
    await postJson(
      buildGenericUrl(runtimeConfig.tavily.apiUrl, "search"),
      {
        query: "ping",
        search_depth: "basic",
        include_answer: false,
        max_results: 1,
      },
      {
        Authorization: `Bearer ${runtimeConfig.tavily.apiKey}`,
      },
      TOOL_TIMEOUTS.get_config_info,
    );

    return {
      configured: true,
      source: runtimeConfig.tavily.source,
      status: "healthy",
      detail: "Tavily 最小检索探测成功。",
    };
  } catch (error) {
    const failure = normalizeFetchFailure(error);
    return {
      configured: true,
      source: runtimeConfig.tavily.source,
      status: mapProbeStatus(failure.status),
      detail: failure.detail,
    };
  }
}

async function probeFirecrawl(runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.firecrawl) {
    return {
      configured: false,
      source: "none",
      status: "misconfigured",
      detail: "未配置 Firecrawl。",
    };
  }

  try {
    await postJson(
      buildFirecrawlUrl(runtimeConfig.firecrawl.apiUrl, "map"),
      {
        url: "https://example.com",
        limit: 1,
      },
      {
        Authorization: `Bearer ${runtimeConfig.firecrawl.apiKey}`,
      },
      TOOL_TIMEOUTS.get_config_info,
    );

    return {
      configured: true,
      source: runtimeConfig.firecrawl.source,
      status: "healthy",
      detail: "Firecrawl 最小映射探测成功。",
    };
  } catch (error) {
    const failure = normalizeFetchFailure(error);
    return {
      configured: true,
      source: runtimeConfig.firecrawl.source,
      status: mapProbeStatus(failure.status),
      detail: failure.detail,
    };
  }
}

async function probeGrok(runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.grok) {
    return {
      configured: false,
      source: "none",
      status: "misconfigured",
      detail: "未配置 Grok。",
    };
  }

  try {
    const text = await callGrokChat(
      runtimeConfig.grok,
      [
        {
          role: "system",
          content: "Reply with exactly OK.",
        },
        {
          role: "user",
          content: "OK",
        },
      ],
      TOOL_TIMEOUTS.get_config_info,
      16,
    );

    return {
      configured: true,
      source: runtimeConfig.grok.source,
      status: "healthy",
      detail: `Grok 最小模型探测成功：${truncateText(text, 32)}`,
    };
  } catch (error) {
    const failure = normalizeFetchFailure(error);
    return {
      configured: true,
      source: runtimeConfig.grok.source,
      status: mapProbeStatus(failure.status),
      detail: failure.detail,
    };
  }
}

function summarizeOverallHealth(providerStatuses: string[]) {
  if (providerStatuses.includes("invalid_auth")) {
    return "invalid_auth";
  }

  if (providerStatuses.includes("unreachable")) {
    return "unreachable";
  }

  if (providerStatuses.every((status) => status === "healthy")) {
    return "healthy";
  }

  if (providerStatuses.every((status) => status === "misconfigured")) {
    return "misconfigured";
  }

  if (providerStatuses.includes("misconfigured")) {
    return "misconfigured";
  }

  return "degraded";
}

async function performGetConfigInfo(runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.tavily && !runtimeConfig.firecrawl) {
    const legacyResponse = await invokeLegacyServiceTool("get_config_info", {}, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }
  }

  const [grok, tavily, firecrawl] = await Promise.all([
    probeGrok(runtimeConfig),
    probeTavily(runtimeConfig),
    probeFirecrawl(runtimeConfig),
  ]);
  const providerStatuses = [grok.status, tavily.status, firecrawl.status].filter((status) => status !== "misconfigured");
  const overallHealthStatus = providerStatuses.length > 0 ? summarizeOverallHealth(providerStatuses) : "misconfigured";

  return {
    source: runtimeConfig.source,
    overallHealthStatus,
    providers: {
      grok,
      tavily,
      firecrawl,
    },
    capabilities: {
      web_search: grok.status === "healthy" && tavily.status === "healthy",
      get_sources: true,
      web_fetch: firecrawl.status === "healthy",
      web_map: firecrawl.status === "healthy",
      get_config_info: true,
      search_planning: grok.status === "healthy",
    },
    retry: {
      maxAttempts: runtimeConfig.retryMaxAttempts,
      multiplier: runtimeConfig.retryMultiplier,
      maxWait: runtimeConfig.retryMaxWait,
    },
  };
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]+?)```/i)?.[1];
  const raw = fenced ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildFallbackSearchPlan(payload: Record<string, unknown>) {
  const query = resolveSearchQuery(payload);

  return {
    coreQuestion: query,
    subQueries: [
      {
        id: "sq1",
        goal: "先确认用户真正要核查的事实点",
        tool: "web_search",
      },
      {
        id: "sq2",
        goal: "必要时进一步抓取命中页面正文",
        tool: "web_fetch",
      },
    ],
    execution: {
      sequential: ["sq1", "sq2"],
    },
    note: "当前返回的是平台内的最小搜索规划结果。",
  };
}

async function performSearchPlanning(payload: Record<string, unknown>, runtimeConfig: GrokRuntimeConfig) {
  if (!runtimeConfig.tavily && !runtimeConfig.firecrawl) {
    const legacyResponse = await invokeLegacyServiceTool("search_planning", payload, runtimeConfig);
    if (legacyResponse) {
      return legacyResponse;
    }
  }

  if (!runtimeConfig.grok) {
    return buildFallbackSearchPlan(payload);
  }

  const query = resolveSearchQuery(payload);
  const responseText = await callGrokChat(
    runtimeConfig.grok,
    [
      {
        role: "system",
        content:
          "你是检索规划助手。请把用户问题拆成 2-4 个子问题，并输出 JSON，包含 coreQuestion、subQueries、execution、note。",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n请优先考虑 web_search，再决定是否需要 web_fetch 或 web_map。`,
      },
    ],
    TOOL_TIMEOUTS.search_planning,
    420,
  ).catch(() => JSON.stringify(buildFallbackSearchPlan(payload)));

  return extractJsonObject(responseText) ?? buildFallbackSearchPlan(payload);
}

async function executeTool(
  toolName: GrokToolName,
  payload: Record<string, unknown>,
  runtimeConfig: GrokRuntimeConfig,
  context?: GrokInvocationContext,
) {
  switch (toolName) {
    case "web_search":
      return performWebSearch(payload, runtimeConfig, context);
    case "get_sources":
      return performGetSources(payload, runtimeConfig, context);
    case "web_fetch":
      return performWebFetch(payload, runtimeConfig);
    case "web_map":
      return performWebMap(payload, runtimeConfig);
    case "get_config_info":
      return performGetConfigInfo(runtimeConfig);
    case "search_planning":
      return performSearchPlanning(payload, runtimeConfig);
    default:
      throw new GrokToolInvocationError("SEARCH_UNAVAILABLE", `Unsupported GrokSearch tool: ${toolName}`);
  }
}

export async function invokeGrokTool(
  toolName: GrokToolName,
  payload: Record<string, unknown>,
  config?: GrokRuntimeConfig | null,
  context?: GrokInvocationContext,
): Promise<GrokToolResult> {
  const runtimeConfig = resolveRuntimeConfig(config);

  if (!runtimeConfig) {
    return {
      toolName,
      enabled: false,
      status: "SEARCH_UNAVAILABLE",
      detail: "GrokSearch is not configured for the current user and no platform fallback is available.",
      attemptCount: 0,
    };
  }

  const maxAttempts = Math.max(1, runtimeConfig.retryMaxAttempts);
  let lastFailure: GrokToolResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const data = await executeTool(toolName, payload, runtimeConfig, context);

      return {
        toolName,
        enabled: true,
        status: "ok",
        data,
        attemptCount: attempt,
        httpStatus: 200,
      };
    } catch (error) {
      const failureDetails = normalizeFetchFailure(error);
      const failure: GrokToolResult = {
        toolName,
        enabled: true,
        status: failureDetails.status,
        detail: failureDetails.detail,
        data: failureDetails.data,
        attemptCount: attempt,
        httpStatus: failureDetails.httpStatus,
      };

      lastFailure = failure;

      if (attempt < maxAttempts && ((failure.httpStatus && isRetryableHttpStatus(failure.httpStatus)) || isRetryableGrokStatus(failure.status))) {
        await sleep(getRetryDelay(attempt, runtimeConfig));
        continue;
      }

      return failure;
    }
  }

  return (
    lastFailure ?? {
      toolName,
      enabled: true,
      status: "SEARCH_UNAVAILABLE",
      detail: "GrokSearch request failed.",
      attemptCount: maxAttempts,
    }
  );
}

function buildExternalFactsPayload(input: ExternalFactsInput) {
  const referenceExcerpt = input.selectedReferences?.trim()
    ? truncateText(input.selectedReferences.trim(), 2000)
    : undefined;

  return {
    query: input.userInstruction,
    taskType: input.taskType,
    currentTime: input.currentTime,
    projectContext: truncateText(input.projectContext.trim(), 4000),
    selectedReferences: referenceExcerpt,
  };
}

export function formatExternalFactsForPrompt(result: GrokToolResult) {
  if (result.status !== "ok") {
    return "无";
  }

  const lines = [
    "以下内容来自 GrokSearch，只能作为真实世界事实补充，不能覆盖项目既有剧情事实。",
    `搜索工具：${result.toolName}`,
  ];
  const factItems = collectFactItems(result.data).slice(0, 8);

  if (factItems.length > 0) {
    lines.push("", "来源摘要：");

    factItems.forEach((item: FactItem, index: number) => {
      const fragments = [item.title, item.url, item.snippet].filter(Boolean);
      lines.push(`${index + 1}. ${fragments.join(" | ")}`);
    });
  } else if (typeof result.data !== "undefined") {
    lines.push("", "原始结果摘要：", serializePreview(result.data, MAX_PROMPT_PREVIEW));
  }

  return lines.join("\n");
}

export async function resolveExternalFacts(input: ExternalFactsInput, config?: GrokRuntimeConfig | null) {
  const payload = buildExternalFactsPayload(input);
  const runtimeConfig = resolveRuntimeConfig(config);
  const result = await invokeGrokTool("web_search", payload, runtimeConfig, {
    projectId: input.projectId,
  });

  if (result.status !== "ok") {
    throw new ApiError(
      mapGrokStatusToHttpStatus(result.status),
      result.status,
      result.detail ?? "GrokSearch request failed.",
      {
        toolName: result.toolName,
        attemptCount: result.attemptCount,
        httpStatus: result.httpStatus ?? null,
      },
    );
  }

  return {
    factsForPrompt: formatExternalFactsForPrompt(result),
    toolCallSummary: {
      externalSearch: {
        provider: "groksearch",
        configSource: runtimeConfig?.source ?? "none",
        toolName: result.toolName,
        status: result.status,
        attemptCount: result.attemptCount,
        sessionId:
          isRecord(result.data) && typeof result.data.session_id === "string" && result.data.session_id.trim()
            ? result.data.session_id.trim()
            : null,
        sourcesCount:
          isRecord(result.data) && typeof result.data.sources_count === "number"
            ? result.data.sources_count
            : null,
        contentPreview:
          isRecord(result.data) && typeof result.data.content === "string" && result.data.content.trim()
            ? truncateText(result.data.content.trim(), 400)
            : null,
        payload: {
          query: input.userInstruction,
          taskType: input.taskType,
        },
        dataPreview: serializePreview(result.data, MAX_SUMMARY_PREVIEW),
      },
    },
  };
}
