import { beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "js-yaml";
import { generateClashYaml } from "@subboost/core/generator";

const mocks = vi.hoisted(() => ({
  consumeLocalRateLimit: vi.fn(),
  generateSubscriptionYaml: vi.fn(),
  getTrustedClientRateLimitKey: vi.fn(),
  hashLocalRateLimitKey: vi.fn(() => "token-hash"),
  localRateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "limited", code: "RATE_LIMITED" }), { status: 429 })
  ),
}));

vi.mock("@local/lib/rate-limit", () => ({
  consumeLocalRateLimit: mocks.consumeLocalRateLimit,
  getTrustedClientRateLimitKey: mocks.getTrustedClientRateLimitKey,
  hashLocalRateLimitKey: mocks.hashLocalRateLimitKey,
  localRateLimitResponse: mocks.localRateLimitResponse,
}));
vi.mock("@local/lib/subscription-service", () => ({
  generateSubscriptionYaml: mocks.generateSubscriptionYaml,
}));

import { GET } from "./route";

describe("local subscription YAML route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLocalRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.getTrustedClientRateLimitKey.mockReturnValue("client-hash");
    mocks.generateSubscriptionYaml.mockResolvedValue({
      status: "ok",
      data: {
        yaml: "mixed-port: 7890\n",
        name: "Test",
        subscriptionInfo: {},
        cacheExpirySeconds: 3600,
        autoUpdateIntervalSeconds: null,
        isAdmin: true,
      },
    });
  });

  it("applies available client and per-token limits before generating YAML", async () => {
    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.hashLocalRateLimitKey).toHaveBeenCalledWith("secret-token");
    expect(mocks.consumeLocalRateLimit).toHaveBeenNthCalledWith(
      1,
      "subscription-yaml-client",
      "client-hash",
      { limit: 600, windowMs: 60_000 }
    );
    expect(mocks.consumeLocalRateLimit).toHaveBeenNthCalledWith(
      2,
      "subscription-yaml-token",
      "token-hash",
      { limit: 120, windowMs: 60_000 }
    );
    expect(mocks.generateSubscriptionYaml).toHaveBeenCalledWith("secret-token");
  });

  it("returns 429 before touching subscription data", async () => {
    mocks.consumeLocalRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 17 });

    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(429);
    expect(mocks.localRateLimitResponse).toHaveBeenCalledWith(
      "Too many subscription requests. Try again later.",
      17
    );
    expect(mocks.generateSubscriptionYaml).not.toHaveBeenCalled();
  });

  it("skips the client bucket when no trustworthy client key is available", async () => {
    mocks.getTrustedClientRateLimitKey.mockReturnValueOnce(null);

    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.consumeLocalRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.consumeLocalRateLimit).toHaveBeenCalledWith(
      "subscription-yaml-token",
      "token-hash",
      { limit: 120, windowMs: 60_000 }
    );
  });

  it("serves the same generated subscription repeatedly without contaminating other clients", async () => {
    const source = generateClashYaml({
      nodes: [{
        id: "node-a",
        name: "A",
        type: "vless",
        server: "example.invalid",
        port: 443,
        uuid: "00000000-0000-0000-0000-000000000001",
        tls: true,
        flow: "xtls-rprx-vision",
        "client-fingerprint": "chrome120",
        "reality-opts": { "public-key": "A".repeat(43), "short-id": "abcd", "support-x25519mlkem768": true },
        "dialer-proxy": "Entry",
      }],
    });
    const data = {
      yaml: source,
      name: "Test",
      subscriptionInfo: { total: 1024 },
      cacheExpirySeconds: 3600,
      autoUpdateIntervalSeconds: null,
      isAdmin: true,
    };
    mocks.generateSubscriptionYaml.mockResolvedValue({ status: "ok", data });
    const url = "https://local.test/api/subscriptions/same-token/config.yaml";
    const agents = ["Clash.Meta/1.19.0", "Shadowrocket/2.2.93", "mihomo/1.19.0", "Shadowrocket/3488 CFNetwork/1 Darwin/22", ""];

    for (const userAgent of agents) {
      const response = await GET(new Request(url, { headers: { "User-Agent": userAgent } }), {
        params: Promise.resolve({ id: "same-token" }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toBe("User-Agent");
      expect(response.headers.get("content-type")).toBe("text/yaml;charset=utf-8");
      expect(response.headers.get("content-disposition")).toContain("Test");
      expect(response.headers.get("subscription-userinfo")).toBe("total=1024");
      expect(response.headers.get("profile-update-interval")).toBe("1");
      const body = await response.text();
      if (userAgent.startsWith("Shadowrocket")) {
        const expected = yaml.load(source) as { proxies: Array<Record<string, unknown>> };
        expect(expected.proxies[0]["client-fingerprint"]).toBe("chrome120");
        expect((expected.proxies[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"]).toBe(true);
        expected.proxies[0]["client-fingerprint"] = "chrome140";
        delete (expected.proxies[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
        expect(yaml.load(body)).toEqual(expected);
      } else {
        expect(body).toBe(source);
      }
    }
    expect(data.yaml).toBe(source);
    expect(mocks.generateSubscriptionYaml).toHaveBeenCalledTimes(agents.length);
    expect(mocks.generateSubscriptionYaml).toHaveBeenCalledWith("same-token");
  });

  it("preserves the not-found response", async () => {
    mocks.generateSubscriptionYaml.mockResolvedValue({ status: "not_found" });
    const response = await GET(new Request("https://local.test/config.yaml", {
      headers: { "User-Agent": "Shadowrocket/2.2.93" },
    }), { params: Promise.resolve({ id: "unknown-token" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("preserves persistent pull cooldowns and Retry-After", async () => {
    mocks.generateSubscriptionYaml.mockResolvedValue({ status: "throttled", retryAfterSeconds: 83 });
    const response = await GET(new Request("https://local.test/config.yaml", {
      headers: { "User-Agent": "Shadowrocket/2.2.93" },
    }), { params: Promise.resolve({ id: "same-token" }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("83");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("订阅拉取过于频繁，已触发限流保护，请稍后再试。");
  });

  it("preserves forced-refresh failures without returning a stale profile", async () => {
    mocks.generateSubscriptionYaml.mockResolvedValue({ status: "refresh_failed", message: "upstream unavailable" });
    const response = await GET(new Request("https://local.test/config.yaml", {
      headers: { "User-Agent": "Shadowrocket/2.2.93" },
    }), { params: Promise.resolve({ id: "same-token" }) });
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("订阅强制刷新失败：upstream unavailable");
  });

  it("does not leak malformed YAML or credentials through adaptation errors", async () => {
    mocks.generateSubscriptionYaml.mockResolvedValue({
      status: "ok",
      data: {
        yaml: "proxies: [uuid: secret-credential", name: "Test", subscriptionInfo: {},
        cacheExpirySeconds: 3600, autoUpdateIntervalSeconds: null, isAdmin: true,
      },
    });
    const response = await GET(new Request("https://local.test/config.yaml", {
      headers: { "User-Agent": "Shadowrocket/2.2.93" },
    }), { params: Promise.resolve({ id: "secret-token" }) });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("User-Agent");
    const body = await response.text();
    expect(body).toContain("Unable to prepare client subscription.");
    expect(body).not.toContain("secret-credential");
    expect(body).not.toContain("secret-token");
  });
});
