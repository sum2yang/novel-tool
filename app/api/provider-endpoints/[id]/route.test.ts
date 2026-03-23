import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  providerEndpoint: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  generationRun: {
    findFirst: vi.fn(),
  },
};

const resolveRequestUserMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/identity", () => ({
  resolveRequestUser: resolveRequestUserMock,
}));

describe("provider endpoint delete route", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.providerEndpoint.findFirst.mockReset();
    prismaMock.providerEndpoint.delete.mockReset();
    prismaMock.generationRun.findFirst.mockReset();
    resolveRequestUserMock.mockReset();
    resolveRequestUserMock.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("deletes an unused provider endpoint", async () => {
    prismaMock.providerEndpoint.findFirst.mockResolvedValue({
      id: "endpoint-1",
      label: "OpenAI Prod",
    });
    prismaMock.generationRun.findFirst.mockResolvedValue(null);
    prismaMock.providerEndpoint.delete.mockResolvedValue({
      id: "endpoint-1",
    });

    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/provider-endpoints/endpoint-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "endpoint-1" }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.providerEndpoint.delete).toHaveBeenCalledWith({
      where: { id: "endpoint-1" },
    });
  });

  it("blocks deletion when the endpoint is referenced by generation runs", async () => {
    prismaMock.providerEndpoint.findFirst.mockResolvedValue({
      id: "endpoint-1",
      label: "OpenAI Prod",
    });
    prismaMock.generationRun.findFirst.mockResolvedValue({
      id: "run-1",
    });

    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/provider-endpoints/endpoint-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "endpoint-1" }),
    });

    expect(response.status).toBe(409);
    expect(prismaMock.providerEndpoint.delete).not.toHaveBeenCalled();
  });
});
