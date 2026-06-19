import { withAdminAccount } from "@local/lib/api-auth";
import { json } from "@local/lib/http";
import { buildAdminStats } from "@local/lib/admin-stats-service";

export async function GET() {
  return withAdminAccount(async () => json(await buildAdminStats()));
}
