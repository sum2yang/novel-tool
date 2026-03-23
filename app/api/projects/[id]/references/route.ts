import { prisma } from "@/lib/db";
import { ApiError, jsonCreated, jsonError, jsonOk, parseJson } from "@/lib/api/http";
import { referenceInputSchema } from "@/lib/api/schemas";
import { resolveRequestUser } from "@/lib/auth/identity";
import { deleteObject } from "@/lib/storage/object-store";
import { ingestUploadedReference } from "@/lib/references/ingest";

export const runtime = "nodejs";

async function ensureProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    select: { id: true },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const project = await ensureProject(id, user.id);
    if (!project) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Project not found." } }, { status: 404 });
    }

    const items = await prisma.referenceDocument.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uploadedStorageKeys: string[] = [];

  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const project = await ensureProject(id, user.id);
    if (!project) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Project not found." } }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const payloads = await parseReferenceUpload(request, id);
      uploadedStorageKeys.push(
        ...payloads
          .map((payload) => payload.storageKey)
          .filter((storageKey): storageKey is string => Boolean(storageKey)),
      );

      const references = await prisma.$transaction(async (tx) =>
        Promise.all(
          payloads.map((payload) =>
            tx.referenceDocument.create({
              data: {
                projectId: id,
                ...payload,
              },
            }),
          ),
        ),
      );

      return jsonCreated({
        count: references.length,
        filenames: references.map((reference) => reference.filename),
        items: references,
      });
    }

    const payload = await parseJson(request, referenceInputSchema);
    const reference = await prisma.referenceDocument.create({
      data: {
        projectId: id,
        ...payload,
      },
    });

    return jsonCreated(reference);
  } catch (error) {
    if (uploadedStorageKeys.length > 0) {
      await Promise.allSettled(uploadedStorageKeys.map((storageKey) => deleteObject(storageKey)));
    }

    return jsonError(error);
  }
}

function parseTagList(rawValues: FormDataEntryValue[]) {
  const tags = rawValues.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    return entry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });

  return Array.from(new Set(tags));
}

function parseFileList(formData: FormData) {
  const entries = [...formData.getAll("files"), ...formData.getAll("files[]"), ...formData.getAll("file")];
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.name.trim().length > 0);

  if (files.length === 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "At least one reference file is required.");
  }

  return files;
}

async function parseReferenceUpload(request: Request, projectId: string) {
  const formData = await request.formData();
  const sourceUrlValue = formData.get("sourceUrl");
  const sourceUrl = typeof sourceUrlValue === "string" ? sourceUrlValue.trim() : "";
  const files = parseFileList(formData);

  if (sourceUrl) {
    try {
      // Reuse URL validation instead of trusting browser-side input validation.
      new URL(sourceUrl);
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "Reference sourceUrl must be a valid URL.");
    }
  }

  const tags = parseTagList([...formData.getAll("tags"), ...formData.getAll("tags[]")]);

  const payloads = [];
  for (const file of files) {
    payloads.push(
      await ingestUploadedReference({
        projectId,
        file,
        sourceUrl: sourceUrl || undefined,
        tags,
      }),
    );
  }

  return payloads;
}
