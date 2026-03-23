import { prisma } from "@/lib/db";
import { ApiError, jsonError, jsonOk, parseJson } from "@/lib/api/http";
import { onboardingSessionAnswerSchema } from "@/lib/api/schemas";
import { resolveRequestUser } from "@/lib/auth/identity";
import {
  buildOnboardingSummary,
  getRemainingOnboardingQuestions,
  normalizeOnboardingSummary,
  ONBOARDING_QUESTIONS,
  serializeOnboardingSession,
  upsertOnboardingAnswer,
} from "@/lib/projects/onboarding";
import { planAiOnboardingQuestion } from "@/lib/projects/onboarding-ai";
import { toPrismaJson } from "@/lib/prisma-json";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const payload = await parseJson(request, onboardingSessionAnswerSchema);
    const session = await prisma.projectOnboardingSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!session) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Onboarding session not found." } }, { status: 404 });
    }

    if (session.status === "finalized") {
      throw new ApiError(409, "CONFLICT", "This onboarding session has already been finalized.");
    }

    const serializedSession = serializeOnboardingSession({
      ...session,
      status: session.status,
    });
    const answers = serializedSession.answers;
    const summary = normalizeOnboardingSummary(session.summary, answers);
    let nextAnswers = answers;
    let nextQuestionIndex = session.currentQuestionIndex;
    let nextStatus: "active" | "ready" = session.status === "ready" ? "ready" : "active";
    let nextSummary = summary;

    if (payload.action === "back") {
      if (summary.mode === "ai_dynamic") {
        const nextHistory = [...summary.dynamic.history];

        if (session.status === "ready") {
          nextStatus = "active";
          nextQuestionIndex = Math.max(nextHistory.length - 1, 0);
        } else if (nextHistory.length > 1) {
          nextHistory.pop();
          nextQuestionIndex = Math.max(nextHistory.length - 1, 0);
        } else {
          nextQuestionIndex = 0;
        }

        nextSummary = buildOnboardingSummary(nextAnswers, {
          mode: summary.mode,
          runtime: summary.runtime,
          dynamicHistory: nextHistory,
        });
      } else {
        nextQuestionIndex = Math.max(session.currentQuestionIndex - 1, 0);
        nextStatus = "active";
        nextSummary = buildOnboardingSummary(nextAnswers, {
          mode: summary.mode,
          runtime: summary.runtime,
          dynamicHistory: summary.dynamic.history,
        });
      }
    } else {
      const currentQuestion = serializedSession.currentQuestion;

      if (!currentQuestion) {
        throw new ApiError(422, "VALIDATION_ERROR", "The onboarding session is ready to finalize.");
      }

      if (payload.action === "skip" && !currentQuestion.optional) {
        throw new ApiError(422, "VALIDATION_ERROR", "This question cannot be skipped.");
      }

      const answer = (payload.answer ?? "").trim();
      if (payload.action === "answer" && !answer) {
        throw new ApiError(422, "VALIDATION_ERROR", "Answer content is required.");
      }

      nextAnswers = upsertOnboardingAnswer(answers, currentQuestion.key, answer, payload.action === "skip");
      const remainingQuestions = getRemainingOnboardingQuestions(nextAnswers);

      if (summary.mode === "ai_dynamic") {
        const nextHistory = [...summary.dynamic.history];

        if (remainingQuestions.length === 0) {
          nextQuestionIndex = ONBOARDING_QUESTIONS.length;
          nextStatus = "ready";
          nextSummary = buildOnboardingSummary(nextAnswers, {
            mode: summary.mode,
            runtime: summary.runtime,
            dynamicHistory: nextHistory,
          });
        } else {
          if (!summary.runtime?.endpointId || !summary.runtime.modelId) {
            throw new ApiError(422, "VALIDATION_ERROR", "The AI onboarding runtime is incomplete.");
          }

          const endpoint = await prisma.providerEndpoint.findFirst({
            where: {
              id: summary.runtime.endpointId,
              userId: user.id,
            },
          });

          if (!endpoint) {
            return Response.json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }, { status: 404 });
          }

          const partialSummary = buildOnboardingSummary(nextAnswers, {
            mode: summary.mode,
            runtime: summary.runtime,
            dynamicHistory: nextHistory,
          });
          const nextQuestion = await planAiOnboardingQuestion({
            endpoint,
            modelId: summary.runtime.modelId,
            answers: nextAnswers,
            summary: partialSummary,
          });
          const nextDynamicHistory = [...nextHistory, nextQuestion];

          nextQuestionIndex = Math.max(nextDynamicHistory.length - 1, 0);
          nextStatus = "active";
          nextSummary = buildOnboardingSummary(nextAnswers, {
            mode: summary.mode,
            runtime: summary.runtime,
            dynamicHistory: nextDynamicHistory,
          });
        }
      } else {
        nextQuestionIndex = Math.min(session.currentQuestionIndex + 1, ONBOARDING_QUESTIONS.length);
        nextStatus = nextQuestionIndex >= ONBOARDING_QUESTIONS.length ? "ready" : "active";
        nextSummary = buildOnboardingSummary(nextAnswers, {
          mode: summary.mode,
          runtime: summary.runtime,
          dynamicHistory: summary.dynamic.history,
        });
      }
    }

    const updatedSession = await prisma.projectOnboardingSession.update({
      where: { id: session.id },
      data: {
        status: nextStatus,
        currentQuestionIndex: nextQuestionIndex,
        answers: toPrismaJson(nextAnswers),
        summary: toPrismaJson(nextSummary),
      },
    });

    return jsonOk({
      session: serializeOnboardingSession({
        ...updatedSession,
        status: updatedSession.status,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
