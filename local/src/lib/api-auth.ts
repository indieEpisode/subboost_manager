import { getCurrentAdmin, type CurrentAdmin } from "@local/lib/auth";
import { apiError } from "@local/lib/http";

type AdminResponseHandler = (admin: CurrentAdmin) => Response | Promise<Response>;

export function localAdminRequiredResponse(): Response {
  return apiError("Authentication required.", "UNAUTHORIZED", 401);
}

export async function getOptionalCurrentAdmin(): Promise<CurrentAdmin | null> {
  return getCurrentAdmin();
}

export async function withCurrentAdmin(handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  return handler(admin);
}

/** 仅管理员（role === "admin"）可访问；用于 /api/admin/* 等管理端点。 */
export async function withAdminAccount(handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  if (admin.role !== "admin") {
    return apiError("需要管理员权限。", "FORBIDDEN", 403);
  }
  return handler(admin);
}
