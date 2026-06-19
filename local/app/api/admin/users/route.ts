import { withAdminAccount } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { createManagedUser, listManagedUsers } from "@local/lib/user-admin-service";

export async function GET() {
  return withAdminAccount(async () => json({ users: await listManagedUsers() }));
}

export async function POST(request: Request) {
  return withAdminAccount(async () => {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }
    try {
      const user = await createManagedUser(body);
      return json({ user }, 201);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "创建用户失败。", "BAD_REQUEST", 400);
    }
  });
}
