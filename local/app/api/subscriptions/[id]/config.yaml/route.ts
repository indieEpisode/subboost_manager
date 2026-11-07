import { apiError } from "@local/lib/http";
import { generateSubscriptionYaml } from "@local/lib/subscription-service";
import { adaptSubscriptionForUserAgent } from "@local/lib/subscription-client-profile";
import { getAppUrl } from "@local/lib/env";
import { buildSubscriptionResponseHeaders } from "@subboost/server-core/subscription";
import {
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
} from "@local/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id: token } = await params;
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const clientLimit = consumeLocalRateLimit("subscription-yaml-client", clientKey, {
      limit: 600,
      windowMs: 60_000,
    });
    if (!clientLimit.allowed) {
      return localRateLimitResponse("Too many subscription requests. Try again later.", clientLimit.retryAfterSeconds);
    }
  }
  const tokenLimit = consumeLocalRateLimit("subscription-yaml-token", hashLocalRateLimitKey(token), {
    limit: 120,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    return localRateLimitResponse("Too many subscription requests. Try again later.", tokenLimit.retryAfterSeconds);
  }
  const result = await generateSubscriptionYaml(token);

  if (result.status === "not_found") {
    return apiError("Subscription YAML not found.", "NOT_FOUND", 404);
  }
  if (result.status === "throttled") {
    // 冷却期内不生成、不发 YAML，只回 429 + Retry-After，CPU 和流量都省。
    return new Response("订阅拉取过于频繁，已触发限流保护，请稍后再试。", {
      status: 429,
      headers: {
        "content-type": "text/plain;charset=utf-8",
        "cache-control": "no-store",
        "retry-after": String(result.retryAfterSeconds),
      },
    });
  }
  if (result.status === "refresh_failed") {
    // 强制刷新开启时，去上游拉取失败：明确返回错误，不下发可能过期的快照。
    return new Response(`订阅强制刷新失败：${result.message}`, {
      status: 502,
      headers: {
        "content-type": "text/plain;charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const data = result.data;
  let responseYaml: string;
  try {
    const userAgent = request.headers.get("user-agent");
    responseYaml = adaptSubscriptionForUserAgent(data.yaml, userAgent, /\bShadowrocket\b/i.test(userAgent ?? "") ? getAppUrl() : undefined);
  } catch {
    // YAML parser errors can contain node credentials; do not expose their details.
    const response = apiError("Unable to prepare client subscription.", "INTERNAL_ERROR", 500);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "User-Agent");
    return response;
  }

  const headers = new Headers(
    buildSubscriptionResponseHeaders(data.name, data.subscriptionInfo, {
      cacheControl: "no-store",
      cacheExpirySeconds: data.cacheExpirySeconds,
      autoUpdateIntervalSeconds: data.autoUpdateIntervalSeconds,
      isAdmin: data.isAdmin,
    })
  );
  headers.append("Vary", "User-Agent");
  return new Response(responseYaml, { headers });
}
