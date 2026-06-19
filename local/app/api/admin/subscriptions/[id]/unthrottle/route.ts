import { withAdminAccount } from "@local/lib/api-auth";
import { apiError, json } from "@local/lib/http";
import { clearSubscriptionThrottle } from "@local/lib/user-admin-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// 仅管理员可手动解除某订阅的限流；普通用户无此权限（否则被限流者自己一键解除，限流形同虚设）。
export async function POST(_request: Request, { params }: RouteContext) {
  return withAdminAccount(async () => {
    const { id } = await params;
    const ok = await clearSubscriptionThrottle(id);
    if (!ok) return apiError("订阅不存在。", "NOT_FOUND", 404);
    return json({ success: true });
  });
}
