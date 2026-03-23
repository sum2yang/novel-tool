import { z } from "zod";

import {
  AUTH_MODES,
  DRAFT_KINDS,
  DRAFT_STATUSES,
  GROK_TOOL_NAMES,
  MCP_TRANSPORT_TYPES,
  PROJECT_STATUSES,
  PROVIDER_TYPES,
  REFERENCE_SOURCE_TYPES,
  TASK_TYPES,
} from "@/lib/types/domain";
import { API_PRESET_LIMIT } from "@/lib/projects/api-presets";
import { EXPORT_BUNDLE_KEYS } from "@/lib/projects/export-bundles";

const keyValueRecord = z.record(z.string(), z.string()).default({});
const unknownValueRecord = z.record(z.string(), z.unknown());
const externalPromptTemplateSchema = z.object({
  source: z.literal("mcp_prompt"),
  serverId: z.string().min(1),
  serverName: z.string().min(1).max(80),
  promptName: z.string().min(1).max(120),
  content: z.string().min(1),
});

export const providerEndpointInputSchema = z
  .object({
    providerType: z.enum(PROVIDER_TYPES),
    label: z.string().min(1).max(80),
    baseURL: z.string().url(),
    authMode: z.enum(AUTH_MODES).default("bearer"),
    secret: z.string().min(1).optional(),
    extraHeaders: keyValueRecord,
    defaultModel: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.authMode !== "none" && !value.secret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secret"],
        message: "A secret is required when auth mode is enabled.",
      });
    }
  });

export const mcpServerInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    transportType: z.enum(MCP_TRANSPORT_TYPES),
    serverUrl: z.string().url(),
    authMode: z.enum(AUTH_MODES).default("none"),
    authPayload: z.string().optional(),
    extraHeaders: keyValueRecord,
  })
  .superRefine((value, ctx) => {
    if (value.authMode !== "none" && !value.authPayload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authPayload"],
        message: "Authentication payload is required when auth mode is enabled.",
      });
    }
  });

export const projectInputSchema = z.object({
  name: z.string().min(1).max(120),
  genre: z.string().min(1).max(80),
  platform: z.string().min(1).max(80),
  status: z.enum(PROJECT_STATUSES).default("active"),
});

export const onboardingSessionCreateSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    genre: z.string().trim().max(80).optional(),
    platform: z.string().trim().max(80).optional(),
    lengthHint: z.string().trim().max(80).optional(),
    era: z.string().trim().max(120).optional(),
    keywords: z.string().trim().max(240).optional(),
    endpointId: z.string().trim().min(1).max(120).optional(),
    modelId: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.modelId && !value.endpointId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endpointId"],
        message: "Select an endpoint before setting the onboarding model.",
      });
    }
  });

export const onboardingSessionAnswerSchema = z.object({
  action: z.enum(["answer", "skip", "back"]).default("answer"),
  answer: z.string().max(4000).optional(),
});

export const onboardingSessionFinalizeSchema = z.object({
  name: z.string().min(1).max(120),
  genre: z.string().min(1).max(80),
  platform: z.string().min(1).max(80),
  status: z.enum(PROJECT_STATUSES).default("active"),
});

export const blankOnboardingFinalizeSchema = z.object({
  digestDraftId: z.string().min(1).nullable().optional(),
  digestOutput: z.string().min(1).max(40000),
  authorNotes: z.string().max(4000).optional(),
  importedReferenceIds: z.array(z.string().min(1)).max(50).default([]),
  followUpAnswers: z
    .array(
      z.object({
        questionKey: z.enum(["core_conflict", "world_rules", "factions", "style_research"]),
        answer: z.string().max(4000),
      }),
    )
    .max(4)
    .default([]),
});

const apiPresetInputSchema = z.object({
  presetKey: z.string().trim().min(1).max(80),
  label: z.string().min(1).max(80),
  endpointId: z.string().min(1).nullable(),
  modelId: z.string().min(1).max(120).nullable(),
  taskType: z.enum(TASK_TYPES),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().positive().nullable().optional(),
});

export const projectPreferenceUpdateSchema = z.object({
  defaultEndpointId: z.string().min(1).nullable().optional(),
  defaultModel: z.string().min(1).max(120).nullable().optional(),
  defaultTaskType: z.enum(TASK_TYPES).nullable().optional(),
  activeChapterArtifactId: z.string().min(1).nullable().optional(),
  apiPresets: z.array(apiPresetInputSchema).max(API_PRESET_LIMIT).optional(),
});

export const referenceInputSchema = z.object({
  filename: z.string().min(1),
  sourceType: z.enum(REFERENCE_SOURCE_TYPES),
  mimeType: z.string().min(1),
  storageKey: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  extractionMethod: z.string().min(1).optional(),
  extractedText: z.string().optional(),
  normalizedText: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const generateRequestSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  userInstruction: z.string().min(1),
  endpointId: z.string().min(1),
  modelId: z.string().min(1),
  targetArtifactId: z.string().min(1).optional(),
  selectedArtifactIds: z.array(z.string()).default([]),
  selectedReferenceIds: z.array(z.string()).default([]),
  selectedMcpServerIds: z.array(z.string()).max(5).default([]),
  generationOptions: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
      requireExternalFacts: z.boolean().optional(),
      externalPromptTemplate: externalPromptTemplateSchema.optional(),
      mode: z.enum(["draft", "review", "rewrite"]).optional(),
    })
    .default({}),
});

export const draftUpdateSchema = z.object({
  status: z.enum(DRAFT_STATUSES).optional(),
  draftKind: z.enum(DRAFT_KINDS).optional(),
  artifactId: z.string().min(1).nullable().optional(),
  outputContent: z.string().optional(),
  suggestedPatches: z.array(z.unknown()).optional(),
});

export const draftCreateSchema = z
  .object({
    runId: z.string().min(1).nullable().optional(),
    artifactId: z.string().min(1).nullable().optional(),
    taskType: z.enum(TASK_TYPES),
    outputContent: z.string(),
    suggestedPatches: z.array(z.unknown()).default([]),
    status: z.enum(DRAFT_STATUSES).default("pending"),
    draftKind: z.enum(DRAFT_KINDS).default("generated_output"),
  })
  .superRefine((value, ctx) => {
    if (value.draftKind === "editor_autosave" && !value.artifactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactId"],
        message: "An artifactId is required for editor_autosave drafts.",
      });
    }

    if (value.draftKind !== "editor_autosave" && !value.runId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runId"],
        message: "A runId is required unless draftKind is editor_autosave.",
      });
    }
  });

export const chapterArtifactCreateSchema = z.object({
  chapterTitle: z.string().min(1).max(120).optional(),
});

export const workspaceArtifactUpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename_chapter"),
    chapterTitle: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal("save_overlay"),
    revisionContent: z.string(),
    summary: z.string().min(1).max(200),
  }),
]);

export const draftAcceptSchema = z.object({
  artifactId: z.string().min(1),
  summary: z.string().min(1).max(200),
});

export const grokSearchSchema = z.object({
  toolName: z.enum(GROK_TOOL_NAMES).default("web_search"),
  payload: z.record(z.string(), z.unknown()),
});

const optionalRemoteUrlSchema = z.string().url().optional().or(z.literal(""));

export const grokConfigInputSchema = z.object({
  grokApiUrl: optionalRemoteUrlSchema,
  grokApiKey: z.string().optional(),
  grokModel: z.string().max(120).optional(),
  tavilyApiUrl: optionalRemoteUrlSchema,
  tavilyApiKey: z.string().optional(),
  firecrawlApiUrl: optionalRemoteUrlSchema,
  firecrawlApiKey: z.string().optional(),
});

export const mcpCapabilitiesActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("read_resource"),
    uri: z.string().min(1),
  }),
  z.object({
    action: z.literal("get_prompt"),
    name: z.string().min(1),
    arguments: unknownValueRecord.optional(),
  }),
]);

export const exportRequestSchema = z.object({
  bundleKey: z.enum(EXPORT_BUNDLE_KEYS),
});
