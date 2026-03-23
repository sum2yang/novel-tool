import { describe, expect, it } from "vitest";

import { draftCreateSchema, generateRequestSchema, mcpServerInputSchema, providerEndpointInputSchema } from "./schemas";

describe("API input schemas", () => {
  it("requires a secret when provider auth is enabled", () => {
    const result = providerEndpointInputSchema.safeParse({
      providerType: "openai",
      label: "OpenAI",
      baseURL: "https://api.example.com/v1",
      authMode: "bearer",
      extraHeaders: {},
      defaultModel: "gpt-4o-mini",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected provider endpoint schema to fail.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "secret")).toBe(true);
  });

  it("defaults OpenAI API style to responses", () => {
    const result = providerEndpointInputSchema.safeParse({
      providerType: "openai",
      label: "OpenAI",
      baseURL: "https://api.example.com/v1",
      authMode: "none",
      extraHeaders: {},
      defaultModel: "gpt-4o-mini",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected provider endpoint schema to succeed.");
    }
    expect(result.data.openaiApiStyle).toBe("responses");
  });

  it("rejects OpenAI API style for non-OpenAI providers", () => {
    const result = providerEndpointInputSchema.safeParse({
      providerType: "gemini",
      openaiApiStyle: "chat_completions",
      label: "Gemini",
      baseURL: "https://api.example.com/v1beta",
      authMode: "none",
      extraHeaders: {},
      defaultModel: "gemini-2.5-pro",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected non-OpenAI provider schema to reject openaiApiStyle.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "openaiApiStyle")).toBe(true);
  });

  it("requires authPayload when MCP auth is enabled", () => {
    const result = mcpServerInputSchema.safeParse({
      name: "Archive Search",
      transportType: "streamable_http",
      serverUrl: "https://mcp.example.com",
      authMode: "bearer",
      extraHeaders: {},
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected MCP server schema to fail.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "authPayload")).toBe(true);
  });

  it("rejects generate requests that select more than five MCP servers", () => {
    const result = generateRequestSchema.safeParse({
      taskType: "review_content",
      userInstruction: "检查冲突",
      endpointId: "endpoint-1",
      modelId: "gpt-4o-mini",
      selectedArtifactIds: [],
      selectedReferenceIds: [],
      selectedMcpServerIds: ["1", "2", "3", "4", "5", "6"],
      generationOptions: {},
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected generate request schema to fail.");
    }
    expect(result.error.issues[0]).toMatchObject({
      code: "too_big",
      maximum: 5,
      path: ["selectedMcpServerIds"],
    });
  });

  it("allows editor autosave drafts without runId", () => {
    const result = draftCreateSchema.safeParse({
      artifactId: "artifact-1",
      taskType: "generate_chapter",
      outputContent: "新的章节草稿",
      draftKind: "editor_autosave",
      status: "pending",
      suggestedPatches: [],
    });

    expect(result.success).toBe(true);
  });

  it("requires runId for non-editor drafts", () => {
    const result = draftCreateSchema.safeParse({
      taskType: "generate_chapter",
      outputContent: "新的章节草稿",
      draftKind: "generated_output",
      status: "ready",
      suggestedPatches: [],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected draft create schema to fail.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "runId")).toBe(true);
  });

  it("requires artifactId for editor autosave drafts", () => {
    const result = draftCreateSchema.safeParse({
      taskType: "generate_chapter",
      outputContent: "新的章节草稿",
      draftKind: "editor_autosave",
      status: "pending",
      suggestedPatches: [],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected editor autosave schema to fail without artifactId.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "artifactId")).toBe(true);
  });
});
