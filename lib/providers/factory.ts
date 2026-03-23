import "server-only";

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderEndpoint } from "@prisma/client";

import { ApiError } from "@/lib/api/http";
import { decryptRecord, decryptString } from "@/lib/security/crypto";
import type { HealthStatus } from "@/lib/types/domain";
import { assertSafeRemoteUrl } from "@/lib/security/url";

const PROVIDER_PROBE_TIMEOUT_MS = 20000;
const PROVIDER_PROBE_PROMPT = "Reply with exactly OK.";

export function resolveEndpointSecret(endpoint: Pick<ProviderEndpoint, "authMode" | "encryptedSecret">) {
  if (endpoint.authMode === "none") {
    return "";
  }

  return decryptString(endpoint.encryptedSecret);
}

export function createLanguageProvider(endpoint: ProviderEndpoint) {
  assertSafeRemoteUrl(endpoint.baseURL);
  const apiKey = resolveEndpointSecret(endpoint);
  const headers = decryptRecord(endpoint.encryptedHeaders);

  switch (endpoint.providerType) {
    case "openai":
      return createOpenAI({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      });
    case "gemini":
      return createGoogleGenerativeAI({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      });
    case "anthropic":
      return createAnthropic({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      });
    default:
      throw new ApiError(422, "MODEL_UNAVAILABLE", `Unsupported provider type: ${endpoint.providerType}`);
  }
}

export function createLanguageModel(endpoint: ProviderEndpoint, modelId: string) {
  assertSafeRemoteUrl(endpoint.baseURL);
  const apiKey = resolveEndpointSecret(endpoint);
  const headers = decryptRecord(endpoint.encryptedHeaders);

  switch (endpoint.providerType) {
    case "openai": {
      const provider = createOpenAI({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      });

      if (endpoint.openaiApiStyle === "chat_completions") {
        return provider.chat(modelId);
      }

      return provider.responses(modelId);
    }
    case "gemini":
      return createGoogleGenerativeAI({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      })(modelId);
    case "anthropic":
      return createAnthropic({
        baseURL: endpoint.baseURL,
        apiKey,
        headers,
      })(modelId);
    default:
      throw new ApiError(422, "MODEL_UNAVAILABLE", `Unsupported provider type: ${endpoint.providerType}`);
  }
}

function buildProbeNote(prefix: string, message?: string) {
  if (!message) {
    return prefix;
  }

  return `${prefix} ${message}`;
}

function getProbeErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message.trim() || "Unknown provider probe error.";
  }

  return "Unknown provider probe error.";
}

function mapProbeErrorToStatus(error: unknown): HealthStatus {
  const message = getProbeErrorMessage(error).toLowerCase();

  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("api key") ||
    message.includes("authentication")
  ) {
    return "invalid_auth";
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "unreachable";
  }

  if (
    message.includes("400") ||
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("unknown model") ||
    message.includes("unsupported") ||
    message.includes("url format is invalid") ||
    message.includes("only http") ||
    message.includes("private, loopback")
  ) {
    return "misconfigured";
  }

  if (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("overloaded") ||
    message.includes("service unavailable")
  ) {
    return "degraded";
  }

  return "misconfigured";
}

export async function probeEndpoint(
  endpoint: ProviderEndpoint,
): Promise<{ status: HealthStatus; checkedAt: string; note: string }> {
  const checkedAt = new Date().toISOString();

  if (endpoint.authMode !== "none" && !endpoint.encryptedSecret) {
    return {
      status: "invalid_auth",
      checkedAt,
      note: 'Endpoint probe skipped because no credential is stored for the selected auth mode.',
    };
  }

  if (!endpoint.defaultModel.trim()) {
    return {
      status: "misconfigured",
      checkedAt,
      note: "Endpoint probe failed because no default model is configured.",
    };
  }

  try {
    assertSafeRemoteUrl(endpoint.baseURL);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_PROBE_TIMEOUT_MS);

    try {
      const result = await generateText({
        model: createLanguageModel(endpoint, endpoint.defaultModel),
        prompt: PROVIDER_PROBE_PROMPT,
        maxOutputTokens: 8,
        temperature: 0,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      const output = result.text.trim();

      return {
        status: "healthy",
        checkedAt,
        note: buildProbeNote(
          `Minimal model probe succeeded for "${endpoint.defaultModel}" on ${endpoint.providerType}.`,
          output ? `Preview: ${output.slice(0, 32)}` : undefined,
        ),
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const status = mapProbeErrorToStatus(error);

    return {
      status,
      checkedAt,
      note: buildProbeNote(
        `Minimal model probe failed for "${endpoint.defaultModel}" on ${endpoint.providerType}.`,
        getProbeErrorMessage(error),
      ),
    };
  };
}
