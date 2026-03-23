import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api/http";
import { resolveRequestUser } from "@/lib/auth/identity";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, resolveRequestUser(request)]);
    const endpoint = await prisma.providerEndpoint.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        label: true,
      },
    });

    if (!endpoint) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }, { status: 404 });
    }

    const linkedRun = await prisma.generationRun.findFirst({
      where: {
        endpointId: endpoint.id,
      },
      select: {
        id: true,
      },
    });

    if (linkedRun) {
      return Response.json(
        {
          error: {
            code: "CONFLICT",
            message: "这个模型接口已经被历史生成记录引用，当前不能直接删除。请新建替代接口后停止继续使用它。",
          },
        },
        { status: 409 },
      );
    }

    await prisma.providerEndpoint.delete({
      where: { id: endpoint.id },
    });

    return jsonOk({
      removed: true,
      id: endpoint.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
