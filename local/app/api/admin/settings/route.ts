import { withAdminAccount } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { getLocalSettings, updateLocalSettings } from "@local/lib/settings-service";

export async function GET() {
  return withAdminAccount(async () => json({ settings: await getLocalSettings() }));
}

export async function PUT(request: Request) {
  return withAdminAccount(async () => {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }
    try {
      const settings = await updateLocalSettings(body);
      return json({ settings });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "保存设置失败。", "BAD_REQUEST", 400);
    }
  });
}
