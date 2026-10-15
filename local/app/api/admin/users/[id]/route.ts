import { withAdminAccount } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { deleteManagedUser, updateManagedUser } from "@local/lib/user-admin-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  return withAdminAccount(async () => {
    const { id } = await params;
    const parsed = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsed.ok) return jsonBodyError(parsed);
    const body = parsed.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }
    try {
      const user = await updateManagedUser(id, body);
      if (!user) return apiError("用户不存在。", "NOT_FOUND", 404);
      return json({ user });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "更新用户失败。", "BAD_REQUEST", 400);
    }
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  return withAdminAccount(async (admin) => {
    const { id } = await params;
    try {
      const deleted = await deleteManagedUser(admin.id, id);
      if (!deleted) return apiError("用户不存在。", "NOT_FOUND", 404);
      return json({ success: true });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "删除用户失败。", "BAD_REQUEST", 400);
    }
  });
}
