import { parseMetaRuleFile } from "@local/lib/shadowrocket-rule-format";
import { loadShadowrocketRules, RuleFetchBusyError } from "@local/lib/shadowrocket-rules";
import { consumeLocalRateLimit, getTrustedClientRateLimitKey } from "@local/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ kind: string; file: string }> }) {
  const { kind, file } = await context.params;
  const source = parseMetaRuleFile(kind, file);
  if (!source) return new Response("Rule list not found.", { status: 404 });
  const key = getTrustedClientRateLimitKey(request);
  if (key) {
    const limit = consumeLocalRateLimit("shadowrocket-rules", key, { limit: 600, windowMs: 60_000 });
    if (!limit.allowed) return new Response("Too many rule requests.", {
      status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  try {
    return new Response(await loadShadowrocketRules(source), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response("Unable to prepare rule list. Try again later.", {
      status: error instanceof RuleFetchBusyError ? 503 : 502,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
