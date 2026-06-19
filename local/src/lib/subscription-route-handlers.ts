import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import {
  createSubscription,
  deleteSubscription,
  getSubscription,
  listSubscriptions,
  refreshSubscription,
  updateSubscription,
} from "@local/lib/subscription-service";

export function getSubscriptionIdFromQuery(request: Request): string {
  return new URL(request.url).searchParams.get("id")?.trim() || "";
}

export async function listSubscriptionsResponse() {
  return withCurrentAdmin(async (admin) => json({ subscriptions: await listSubscriptions(admin.id) }));
}

export async function createSubscriptionResponse(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const body = await readJsonBody(request);
    if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

    try {
      const subscription = await createSubscription(admin.id, body);
      return json({ subscription }, 201);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Unable to create subscription.", "BAD_REQUEST", 400);
    }
  });
}

export async function getSubscriptionResponse(id: string) {
  return withCurrentAdmin(async (admin) => {
    const subscription = await getSubscription(admin.id, id);
    if (!subscription) return apiError("Subscription not found.", "NOT_FOUND", 404);
    return json({ subscription });
  });
}

export async function updateSubscriptionResponse(request: Request, id: string) {
  return withCurrentAdmin(async (admin) => {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }

    try {
      const subscription = await updateSubscription(admin.id, id, body);
      if (!subscription) return apiError("Subscription not found.", "NOT_FOUND", 404);
      return json({ subscription });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Unable to update subscription.", "BAD_REQUEST", 400);
    }
  });
}

export async function deleteSubscriptionResponse(id: string) {
  return withCurrentAdmin(async (admin) => {
    const deleted = await deleteSubscription(admin.id, id);
    if (!deleted) return apiError("Subscription not found.", "NOT_FOUND", 404);
    return json({ success: true });
  });
}

export async function refreshSubscriptionResponse(id: string) {
  return withCurrentAdmin(async (admin) => {
    const result = await refreshSubscription(admin.id, id);
    if (!result) return apiError("Subscription not found.", "NOT_FOUND", 404);
    if ("throttled" in result && result.throttled) {
      const res = json({ error: "刷新过于频繁，请稍后再试。", retryAfterSeconds: result.retryAfterSeconds }, 429);
      res.headers.set("retry-after", String(result.retryAfterSeconds));
      return res;
    }
    if (!result.ok) return json(result.response.body, result.response.status);
    return json(result.body);
  });
}
