import "server-only";

import { generateText, stepCountIs, type LanguageModelUsage, type StepResult, type ToolSet } from "ai";
import type { McpServer, Prisma, ProviderEndpoint } from "@prisma/client";

import { ApiError } from "@/lib/api/http";
import { createRemoteMcpClient } from "@/lib/mcp/client";
import { toPrismaJson } from "@/lib/prisma-json";
import { createLanguageModel } from "@/lib/providers/factory";

const GENERATION_REQUEST_TIMEOUT_MS = 180000;

type McpClient = Awaited<ReturnType<typeof createRemoteMcpClient>>;

type GenerationExecutionInput = {
  endpoint: ProviderEndpoint;
  modelId: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  mcpServers?: McpServer[];
};

type ToolInventoryRow = {
  serverId: string;
  serverName: string;
  toolName: string;
  namespacedToolName: string;
};

type LoadedMcpTools = {
  tools: ToolSet;
  toolInventory: ToolInventoryRow[];
  closeAll: () => Promise<void>;
};

export type GenerationExecutionResult = {
  output: string;
  usage: Prisma.InputJsonValue;
  toolCallsSummary: Prisma.InputJsonValue;
};

function sanitizeToolNamespace(name: string, fallback: string) {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || fallback;
}

function toSerializableUsage(usage: LanguageModelUsage, finishReason: string, warnings: string[]) {
  return toPrismaJson({
    finishReason,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    inputTokenDetails: usage.inputTokenDetails,
    outputTokenDetails: usage.outputTokenDetails,
    raw: usage.raw ?? null,
    warnings,
  });
}

function formatWarning(warning: { type: string; feature?: string; details?: string; message?: string }) {
  if ("message" in warning && warning.message) {
    return warning.message;
  }

  return [warning.type, warning.feature, warning.details].filter(Boolean).join(": ");
}

function summarizeToolSteps(steps: Array<StepResult<ToolSet>>) {
  return toPrismaJson(
    steps.flatMap((step, stepIndex) => {
      const toolResults = new Map(step.toolResults.map((toolResult) => [toolResult.toolCallId, toolResult]));

      return step.toolCalls.map((toolCall) => ({
        step: stepIndex + 1,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
        output: toolResults.get(toolCall.toolCallId)?.output ?? null,
      }));
    }),
  );
}

async function loadMcpTools(servers: McpServer[]): Promise<LoadedMcpTools> {
  if (!servers.length) {
    return {
      tools: {},
      toolInventory: [],
      closeAll: async () => undefined,
    };
  }

  const clients = await Promise.all(servers.map((server) => createRemoteMcpClient(server)));

  try {
    const toolSets = await Promise.all(clients.map((client) => client.tools()));
    const tools: ToolSet = {};
    const toolInventory: ToolInventoryRow[] = [];

    toolSets.forEach((toolSet, index) => {
      const server = servers[index];
      const namespace = sanitizeToolNamespace(server.name, `mcp_${index + 1}`);

      Object.entries(toolSet).forEach(([toolName, toolDefinition]) => {
        const namespacedToolName = `${namespace}__${toolName}`;
        tools[namespacedToolName] = toolDefinition;
        toolInventory.push({
          serverId: server.id,
          serverName: server.name,
          toolName,
          namespacedToolName,
        });
      });
    });

    return {
      tools,
      toolInventory,
      closeAll: async () => {
        await Promise.allSettled(clients.map((client) => client.close()));
      },
    };
  } catch (error) {
    await Promise.allSettled(clients.map((client) => client.close()));
    throw new ApiError(
      502,
      "MCP_UNAVAILABLE",
      error instanceof Error ? `MCP tool loading failed: ${error.message}` : "MCP tool loading failed.",
    );
  }
}

function isRetryableFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound")
  );
}

export function normalizeGenerationError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    const normalized = message.toLowerCase();

    if (
      normalized.includes("401") ||
      normalized.includes("403") ||
      normalized.includes("unauthorized") ||
      normalized.includes("forbidden") ||
      normalized.includes("api key") ||
      normalized.includes("authentication")
    ) {
      return new ApiError(401, "AUTH_ERROR", message);
    }

    if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("abort")) {
      return new ApiError(504, "TIMEOUT", message);
    }

    if (isRetryableFailureMessage(message)) {
      return new ApiError(502, "NETWORK_ERROR", message);
    }

    return new ApiError(502, "MODEL_UNAVAILABLE", message);
  }

  return new ApiError(500, "MODEL_UNAVAILABLE", "The model call failed.");
}

export async function executeGeneration(input: GenerationExecutionInput): Promise<GenerationExecutionResult> {
  const model = createLanguageModel(input.endpoint, input.modelId);
  const loadedMcpTools = await loadMcpTools(input.mcpServers ?? []);
  const warnings: string[] = [];

  if ((input.mcpServers?.length ?? 0) > 0 && loadedMcpTools.toolInventory.length === 0) {
    await loadedMcpTools.closeAll();
    throw new ApiError(502, "MCP_UNAVAILABLE", "Selected MCP servers did not expose any runtime tools.");
  }

  try {
    const result = await generateText({
      model,
      prompt: input.prompt,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      timeout: {
        totalMs: GENERATION_REQUEST_TIMEOUT_MS,
      },
      tools: Object.keys(loadedMcpTools.tools).length > 0 ? loadedMcpTools.tools : undefined,
      stopWhen: Object.keys(loadedMcpTools.tools).length > 0 ? stepCountIs(5) : undefined,
    });

    const output = result.text.trim();

    if (!output) {
      throw new ApiError(502, "OUTPUT_CONTRACT_ERROR", "The model returned an empty response.");
    }

    warnings.push(...(result.warnings?.map((warning) => formatWarning(warning)) ?? []));

    return {
      output,
      usage: toSerializableUsage(result.totalUsage, result.finishReason, warnings),
      toolCallsSummary: toPrismaJson({
        toolInventory: loadedMcpTools.toolInventory,
        calls: summarizeToolSteps(result.steps),
      }),
    };
  } catch (error) {
    throw normalizeGenerationError(error);
  } finally {
    await loadedMcpTools.closeAll();
  }
}
