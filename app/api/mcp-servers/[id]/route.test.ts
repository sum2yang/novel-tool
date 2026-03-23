import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  mcpServer: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
};

const resolveRequestUserMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/identity", () => ({
  resolveRequestUser: resolveRequestUserMock,
}));

describe("mcp server delete route", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.mcpServer.findFirst.mockReset();
    prismaMock.mcpServer.delete.mockReset();
    resolveRequestUserMock.mockReset();
    resolveRequestUserMock.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("deletes a saved MCP server", async () => {
    prismaMock.mcpServer.findFirst.mockResolvedValue({
      id: "mcp-1",
    });
    prismaMock.mcpServer.delete.mockResolvedValue({
      id: "mcp-1",
    });

    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/mcp-servers/mcp-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "mcp-1" }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.mcpServer.delete).toHaveBeenCalledWith({
      where: { id: "mcp-1" },
    });
  });
});
