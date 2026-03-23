import { describe, expect, it } from "vitest";

import { buildSeededProjectBasicsAnswer, serializeOnboardingSession } from "@/lib/projects/onboarding";

describe("onboarding helpers", () => {
  it("builds a seeded project basics answer from the author's initial inputs", () => {
    expect(
      buildSeededProjectBasicsAnswer({
        name: "港综资本局",
        genre: "港综商战",
        platform: "番茄",
        lengthHint: "180 万字长篇",
        era: "90 年代港岛",
        keywords: "资本局、势力经营、上位",
      }),
    ).toContain("关键词包括资本局、势力经营、上位");
  });

  it("includes recommended options in the current onboarding question payload", () => {
    const payload = serializeOnboardingSession({
      id: "session-1",
      status: "active",
      currentQuestionIndex: 1,
      answers: [
        {
          questionKey: "project_basics",
          answer: "暂定名《港综资本局》，题材是港综商战，发布平台偏番茄，目标做长篇。",
          skipped: false,
          updatedAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      summary: {},
      finalizedProjectId: null,
      completedAt: null,
      createdAt: "2026-03-22T10:00:00.000Z",
      updatedAt: "2026-03-22T10:00:00.000Z",
    });

    expect(payload.currentQuestion).toMatchObject({
      key: "core_conflict",
    });
    expect(payload.currentQuestion?.recommendedOptions).toHaveLength(3);
    expect(payload.currentQuestion?.recommendedOptions[0]?.value).toContain("主角");
  });

  it("restores AI dynamic current questions from session summary", () => {
    const payload = serializeOnboardingSession({
      id: "session-ai",
      status: "active",
      currentQuestionIndex: 1,
      answers: [
        {
          questionKey: "project_basics",
          answer: "暂定名《港综资本局》，题材是港综商战，发布平台偏番茄，目标做长篇。",
          skipped: false,
          updatedAt: "2026-03-22T10:00:00.000Z",
        },
        {
          questionKey: "core_conflict",
          answer: "主角必须先赢下一场能证明自己价值的小局。",
          skipped: false,
          updatedAt: "2026-03-22T10:02:00.000Z",
        },
      ],
      summary: {
        mode: "ai_dynamic",
        runtime: {
          endpointId: "endpoint-1",
          endpointLabel: "Mock Endpoint",
          modelId: "gpt-4o-mini",
          providerType: "openai",
        },
        dynamic: {
          isAiDriven: true,
          history: [
            {
              key: "core_conflict",
              title: "主角先要赢哪一局",
              prompt: "主角眼下最重要的一场局是什么？",
              placeholder: "例如：先赢下第一场翻盘机会。",
              optional: false,
              recommendedOptions: [],
              askedAt: "2026-03-22T10:00:00.000Z",
              source: "ai",
            },
            {
              key: "world_rules",
              title: "这套规则最怕什么越线",
              prompt: "这个世界里最不能碰的底线和失败代价分别是什么？",
              placeholder: "例如：越线后会遭遇制度和地下势力双重清场。",
              optional: false,
              recommendedOptions: [
                {
                  label: "越线有代价",
                  value: "一旦碰到某条底线，就会被制度力量和地下势力同时清场。",
                },
              ],
              askedAt: "2026-03-22T10:03:00.000Z",
              source: "ai",
            },
          ],
        },
      },
      finalizedProjectId: null,
      completedAt: null,
      createdAt: "2026-03-22T10:00:00.000Z",
      updatedAt: "2026-03-22T10:03:00.000Z",
    });

    expect(payload.mode).toBe("ai_dynamic");
    expect(payload.runtime).toMatchObject({
      endpointId: "endpoint-1",
      modelId: "gpt-4o-mini",
    });
    expect(payload.currentQuestion).toMatchObject({
      key: "world_rules",
      source: "ai",
      title: "这套规则最怕什么越线",
    });
    expect(payload.currentQuestion?.recommendedOptions).toHaveLength(1);
  });
});
