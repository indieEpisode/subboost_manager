import { getOptionalCurrentAdmin, localAdminRequiredResponse, withAdminAccount } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { getTemplateDetail, setTemplateDefault } from "@local/lib/template-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const admin = await getOptionalCurrentAdmin();

  try {
    const template = await getTemplateDetail(admin?.id ?? null, id);
    if (!template) return apiError("Template not found.", "NOT_FOUND", 404);
    return json({ template });
  } catch (error) {
    if (!admin) return localAdminRequiredResponse();
    return apiError(error instanceof Error ? error.message : "Unable to load template.", "BAD_REQUEST", 400);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  return withAdminAccount(async (admin) => {
    const { id } = await params;
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const payload = parsedBody.value as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.isDefault !== "boolean") {
      return apiError("Invalid default template setting.", "VALIDATION_ERROR", 400);
    }

    const updated = await setTemplateDefault(admin.id, id, payload.isDefault);
    if (!updated) return apiError("Template not found.", "NOT_FOUND", 404);
    return json({ success: true });
  });
}
