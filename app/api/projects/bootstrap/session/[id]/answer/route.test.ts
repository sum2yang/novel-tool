import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  projectOnboardingSession: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  providerEndpoint: {
    findFirst: vi.fn(),
  },
};

const resolveRequestUserMock = vi.fn();
const planAiOnboardingQuestionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/identity", () => ({
  resolveRequestUser: resolveRequestUserMock,
}));

vi.mock("@/lib/projects/onboarding-ai", () => ({
  planAiOnboardingQuestion: planAiOnboardingQuestionMock,
}));

describe("project onboarding answer route", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.projectOnboardingSession.findFirst.mockReset();
    prismaMock.projectOnboardingSession.update.mockReset();
    prismaMock.providerEndpoint.findFirst.mockReset();
    resolveRequestUserMock.mockReset();
    planAiOnboardingQuestionMock.mockReset();
    resolveRequestUserMock.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("records an answer and advances the onboarding session", async () => {
    prismaMock.projectOnboardingSession.findFirst.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      status: "active",
      currentQuestionIndex: 0,
      answers: [],
      summary: {},
      finalizedProjectId: null,
      completedAt: null,
      createdAt: new Date("2026-03-20T22:50:00.000Z"),
      updatedAt: new Date("2026-03-20T22:50:00.000Z"),
    });
    prismaMock.projectOnboardingSession.update.mockImplementation(async ({ data }) => ({
      id: "session-1",
      userId: "user-1",
      status: data.status,
      currentQuestionIndex: data.currentQuestionIndex,
      answers: data.answers,
      summary: data.summary,
      finalizedProjectId: null,
      completedAt: null,
      createdAt: new Date("2026-03-20T22:50:00.000Z"),
      updatedAt: new Date("2026-03-20T22:51:00.000Z"),
    }));

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/projects/bootstrap/session/session-1/answer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "answer",
          answer: "暂定名《港综资本局》，题材是港综商战，平台走番茄，目标长篇。",
        }),
      }),
      {
        params: Promise.resolve({ id: "session-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.projectOnboardingSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        status: "active",
        currentQuestionIndex: 1,
        answers: [
          expect.objectContaining({
            questionKey: "project_basics",
            answer: "暂定名《港综资本局》，题材是港综商战，平台走番茄，目标长篇。",
            skipped: false,
          }),
        ],
      }),
    });

    const body = await response.json();
    expect(body.session.status).toBe("active");
    expect(body.session.currentQuestionIndex).toBe(1);
    expect(body.session.currentQuestion).toMatchObject({
      key: "core_conflict",
      title: "主角目标与核心冲突",
    });
    expect(body.session.currentQuestion.recommendedOptions).toHaveLength(3);
    expect(body.session.summary.metadata).toMatchObject({
      nameHint: "港综资本局",
      genreHint: "港综",
      platformHint: "番茄",
      lengthHint: "长篇",
    });
  });

  it("uses AI planning to decide the next onboarding question when the session is dynamic", async () => {
    prismaMock.projectOnboardingSession.findFirst.mockResolvedValue({
      id: "session-ai",
      userId: "user-1",
      status: "active",
      currentQuestionIndex: 0,
      answers: [
        {
          questionKey: "project_basics",
          answer: "暂定名《港综资本局》，题材是港综商战，平台走番茄，目标长篇。",
          skipped: false,
          updatedAt: "2026-03-22T10:00:00.000Z",
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
          ],
        },
      },
      finalizedProjectId: null,
      completedAt: null,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:00:00.000Z"),
    });
    prismaMock.providerEndpoint.findFirst.mockResolvedValue({
      id: "endpoint-1",
      userId: "user-1",
      providerType: "openai",
      label: "Mock Endpoint",
      baseURL: "https://api.example.com/v1",
      authMode: "none",
      encryptedSecret: "",
      encryptedHeaders: {},
      defaultModel: "gpt-4o-mini",
      healthStatus: "healthy",
      lastHealthCheckAt: null,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:00:00.000Z"),
    });
    planAiOnboardingQuestionMock.mockResolvedValue({
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
      askedAt: "2026-03-22T10:05:00.000Z",
      source: "ai",
    });
    prismaMock.projectOnboardingSession.update.mockImplementation(async ({ data }) => ({
      id: "session-ai",
      userId: "user-1",
      status: data.status,
      currentQuestionIndex: data.currentQuestionIndex,
      answers: data.answers,
      summary: data.summary,
      finalizedProjectId: null,
      completedAt: null,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:06:00.000Z"),
    }));

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/projects/bootstrap/session/session-ai/answer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "answer",
          answer: "主角必须先赢下一场能证明自己价值的小局，否则没人敢继续押注他。",
        }),
      }),
      {
        params: Promise.resolve({ id: "session-ai" }),
      },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.providerEndpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: "endpoint-1",
        userId: "user-1",
      },
    });
    expect(planAiOnboardingQuestionMock).toHaveBeenCalled();

    const body = await response.json();
    expect(body.session.mode).toBe("ai_dynamic");
    expect(body.session.currentQuestionIndex).toBe(1);
    expect(body.session.currentQuestion).toMatchObject({
      key: "world_rules",
      source: "ai",
      title: "这套规则最怕什么越线",
    });
  });
});
