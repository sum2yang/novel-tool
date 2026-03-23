import { prisma } from "@/lib/db";
import { ApiError, jsonCreated, jsonError, parseJson } from "@/lib/api/http";
import { onboardingSessionFinalizeSchema } from "@/lib/api/schemas";
import { resolveRequestUser } from "@/lib/auth/identity";
import { createProjectWithBootstrap } from "@/lib/projects/create-project";
import {
  buildOnboardingBootstrapPackage,
  normalizeOnboardingSummary,
  serializeOnboardingSession,
} from "@/lib/projects/onboarding";
import { toPrismaJson } from "@/lib/prisma-json";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const payload = await parseJson(request, onboardingSessionFinalizeSchema);
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

    if (!summary.completion.isReadyToFinalize) {
      throw new ApiError(422, "VALIDATION_ERROR", "Finish or skip all onboarding questions before finalizing.");
    }
    const bootstrapPackage = buildOnboardingBootstrapPackage({
      name: payload.name,
      genre: payload.genre,
      platform: payload.platform,
      summary,
    });

    const result = await prisma.$transaction(async (tx) => {
      const created = await createProjectWithBootstrap(
        tx,
        {
          userId: user.id,
          name: payload.name,
          genre: payload.genre,
          platform: payload.platform,
          status: payload.status,
        },
        {
          artifactContentOverrides: bootstrapPackage.artifactContentOverrides,
          extraArtifacts: bootstrapPackage.extraArtifacts,
        },
      );

      const onboardingSession = await tx.projectOnboardingSession.update({
        where: { id: session.id },
        data: {
          status: "finalized",
          currentQuestionIndex: summary.completion.totalQuestions,
          finalizedProjectId: created.project.id,
          completedAt: new Date(),
          summary: toPrismaJson(summary),
          answers: toPrismaJson(answers),
        },
      });

      return {
        ...created,
        onboardingSession,
      };
    });

    return jsonCreated({
      project: result.project,
      preference: result.preference,
      onboardingSession: serializeOnboardingSession({
        ...result.onboardingSession,
        status: result.onboardingSession.status,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
