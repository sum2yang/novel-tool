import { prisma } from "@/lib/db";
import { ApiError, jsonCreated, jsonError, parseJson } from "@/lib/api/http";
import { onboardingSessionCreateSchema } from "@/lib/api/schemas";
import { resolveRequestUser } from "@/lib/auth/identity";
import {
  buildOnboardingSeedAnswers,
  buildOnboardingSummary,
  getRemainingOnboardingQuestions,
  ONBOARDING_QUESTIONS,
  serializeOnboardingSession,
} from "@/lib/projects/onboarding";
import { planAiOnboardingQuestion } from "@/lib/projects/onboarding-ai";
import { toPrismaJson } from "@/lib/prisma-json";

export async function POST(request: Request) {
  try {
    const user = await resolveRequestUser(request);
    const payload = await parseJson(request, onboardingSessionCreateSchema);
    const initialAnswers = buildOnboardingSeedAnswers(payload);
    let status: "active" | "ready" = "active";
    let currentQuestionIndex = 0;
    let summary = buildOnboardingSummary(initialAnswers);

    if (payload.endpointId) {
      const endpoint = await prisma.providerEndpoint.findFirst({
        where: {
          id: payload.endpointId,
          userId: user.id,
        },
      });

      if (!endpoint) {
        return Response.json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }, { status: 404 });
      }

      const resolvedModelId = payload.modelId?.trim() || endpoint.defaultModel.trim();
      if (!resolvedModelId) {
        throw new ApiError(422, "VALIDATION_ERROR", "Please fill in a model name for AI-guided onboarding.");
      }

      const runtime = {
        endpointId: endpoint.id,
        endpointLabel: endpoint.label,
        modelId: resolvedModelId,
        providerType: endpoint.providerType,
      };
      const pendingQuestions = getRemainingOnboardingQuestions(initialAnswers);

      if (pendingQuestions.length === 0) {
        status = "ready";
        currentQuestionIndex = ONBOARDING_QUESTIONS.length;
        summary = buildOnboardingSummary(initialAnswers, {
          mode: "ai_dynamic",
          runtime,
          dynamicHistory: [],
        });
      } else {
        const seededSummary = buildOnboardingSummary(initialAnswers, {
          mode: "ai_dynamic",
          runtime,
          dynamicHistory: [],
        });
        const firstQuestion = await planAiOnboardingQuestion({
          endpoint,
          modelId: resolvedModelId,
          answers: initialAnswers,
          summary: seededSummary,
        });

        summary = buildOnboardingSummary(initialAnswers, {
          mode: "ai_dynamic",
          runtime,
          dynamicHistory: [firstQuestion],
        });
      }
    }

    const session = await prisma.projectOnboardingSession.create({
      data: {
        userId: user.id,
        status,
        currentQuestionIndex,
        answers: toPrismaJson(initialAnswers),
        summary: toPrismaJson(summary),
      },
    });

    return jsonCreated({
      session: serializeOnboardingSession({
        ...session,
        status: session.status,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
