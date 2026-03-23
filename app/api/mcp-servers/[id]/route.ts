import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api/http";
import { resolveRequestUser } from "@/lib/auth/identity";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const server = await prisma.mcpServer.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!server) {
      return Response.json({ error: { code: "NOT_FOUND", message: "MCP server not found." } }, { status: 404 });
    }

    await prisma.mcpServer.delete({
      where: { id: server.id },
    });

    return jsonOk({
      removed: true,
      id: server.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
