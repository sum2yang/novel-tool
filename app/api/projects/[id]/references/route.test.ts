import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
  referenceDocument: {
    create: vi.fn(),
  },
};

const resolveRequestUserMock = vi.fn();
const ingestUploadedReferenceMock = vi.fn();
const deleteObjectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/identity", () => ({
  resolveRequestUser: resolveRequestUserMock,
}));

vi.mock("@/lib/references/ingest", () => ({
  ingestUploadedReference: ingestUploadedReferenceMock,
}));

vi.mock("@/lib/storage/object-store", () => ({
  deleteObject: deleteObjectMock,
}));

describe("project references route", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.project.findFirst.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.referenceDocument.create.mockReset();
    resolveRequestUserMock.mockReset();
    ingestUploadedReferenceMock.mockReset();
    deleteObjectMock.mockReset();

    resolveRequestUserMock.mockResolvedValue({ id: "user-1" });
    prismaMock.project.findFirst.mockResolvedValue({ id: "project-1" });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("accepts multipart uploads and persists extracted reference fields", async () => {
    ingestUploadedReferenceMock.mockResolvedValue({
      filename: "notes.txt",
      mimeType: "text/plain",
      sourceType: "txt",
      storageKey: "projects/project-1/references/file.txt",
      extractionMethod: "text:utf8",
      extractedText: "资料正文",
      normalizedText: "资料正文",
      tags: ["设定"],
      sourceUrl: "https://example.com/source",
    });
    prismaMock.referenceDocument.create.mockResolvedValue({
      id: "reference-1",
      projectId: "project-1",
      filename: "notes.txt",
    });

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("files", new File(["资料正文"], "notes.txt", { type: "text/plain" }));
    formData.set("tags", "设定, 角色");
    formData.set("sourceUrl", "https://example.com/source");

    const response = await POST(new Request("http://localhost/api/projects/project-1/references", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "project-1" }),
    });

    expect(response.status).toBe(201);
    expect(ingestUploadedReferenceMock).toHaveBeenCalledWith({
      projectId: "project-1",
      file: expect.any(File),
      tags: ["设定", "角色"],
      sourceUrl: "https://example.com/source",
    });
    expect(prismaMock.referenceDocument.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        filename: "notes.txt",
        mimeType: "text/plain",
        sourceType: "txt",
        storageKey: "projects/project-1/references/file.txt",
        extractionMethod: "text:utf8",
        extractedText: "资料正文",
        normalizedText: "资料正文",
        tags: ["设定"],
        sourceUrl: "https://example.com/source",
      },
    });
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.filenames).toEqual(["notes.txt"]);
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("accepts multiple files in one multipart upload", async () => {
    ingestUploadedReferenceMock
      .mockResolvedValueOnce({
        filename: "notes.txt",
        mimeType: "text/plain",
        sourceType: "txt",
        storageKey: "projects/project-1/references/notes.txt",
        extractionMethod: "text:utf8",
        extractedText: "资料一",
        normalizedText: "资料一",
        tags: ["设定"],
      })
      .mockResolvedValueOnce({
        filename: "outline.md",
        mimeType: "text/markdown",
        sourceType: "markdown",
        storageKey: "projects/project-1/references/outline.md",
        extractionMethod: "markdown:utf8",
        extractedText: "# 提纲",
        normalizedText: "# 提纲",
        tags: ["设定"],
      });
    prismaMock.referenceDocument.create
      .mockResolvedValueOnce({ id: "reference-1", filename: "notes.txt" })
      .mockResolvedValueOnce({ id: "reference-2", filename: "outline.md" });

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("files", new File(["资料一"], "notes.txt", { type: "text/plain" }));
    formData.append("files", new File(["# 提纲"], "outline.md", { type: "text/markdown" }));
    formData.set("tags", "设定");

    const response = await POST(new Request("http://localhost/api/projects/project-1/references", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "project-1" }),
    });

    expect(response.status).toBe(201);
    expect(ingestUploadedReferenceMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.referenceDocument.create).toHaveBeenCalledTimes(2);
    const payload = await response.json();
    expect(payload.count).toBe(2);
    expect(payload.filenames).toEqual(["notes.txt", "outline.md"]);
  });

  it("cleans up uploaded objects when batch persistence fails", async () => {
    ingestUploadedReferenceMock
      .mockResolvedValueOnce({
        filename: "notes.txt",
        mimeType: "text/plain",
        sourceType: "txt",
        storageKey: "projects/project-1/references/notes.txt",
        extractionMethod: "text:utf8",
        extractedText: "资料一",
        normalizedText: "资料一",
        tags: [],
      })
      .mockResolvedValueOnce({
        filename: "outline.md",
        mimeType: "text/markdown",
        sourceType: "markdown",
        storageKey: "projects/project-1/references/outline.md",
        extractionMethod: "markdown:utf8",
        extractedText: "# 提纲",
        normalizedText: "# 提纲",
        tags: [],
      });
    prismaMock.$transaction.mockRejectedValueOnce(new Error("database write failed"));

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("files", new File(["资料一"], "notes.txt", { type: "text/plain" }));
    formData.append("files", new File(["# 提纲"], "outline.md", { type: "text/markdown" }));

    const response = await POST(new Request("http://localhost/api/projects/project-1/references", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "project-1" }),
    });

    expect(response.status).toBe(500);
    expect(deleteObjectMock).toHaveBeenCalledTimes(2);
    expect(deleteObjectMock).toHaveBeenNthCalledWith(1, "projects/project-1/references/notes.txt");
    expect(deleteObjectMock).toHaveBeenNthCalledWith(2, "projects/project-1/references/outline.md");
  });

  it("keeps the legacy JSON create path working", async () => {
    prismaMock.referenceDocument.create.mockResolvedValue({
      id: "reference-2",
      projectId: "project-1",
      filename: "legacy.md",
    });

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/references", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filename: "legacy.md",
          sourceType: "markdown",
          mimeType: "text/markdown",
          extractedText: "# 标题",
          normalizedText: "# 标题",
          tags: ["旧入口"],
        }),
      }),
      {
        params: Promise.resolve({ id: "project-1" }),
      },
    );

    expect(response.status).toBe(201);
    expect(ingestUploadedReferenceMock).not.toHaveBeenCalled();
    expect(prismaMock.referenceDocument.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        filename: "legacy.md",
        sourceType: "markdown",
        mimeType: "text/markdown",
        extractedText: "# 标题",
        normalizedText: "# 标题",
        tags: ["旧入口"],
      },
    });
  });
});
