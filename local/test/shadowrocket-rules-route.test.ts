import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/rules/shadowrocket/[kind]/[file]/route";
import { loadShadowrocketRules, RuleFetchBusyError } from "../src/lib/shadowrocket-rules";
import { clearLocalRateLimitsForTests } from "../src/lib/rate-limit";

vi.mock("../src/lib/shadowrocket-rules", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/shadowrocket-rules")>(),
  loadShadowrocketRules: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearLocalRateLimitsForTests();
});

function request(file = "cn.list", kind = "geosite", withIp = false) {
  const req = new Request(`https://app.invalid/api/rules/shadowrocket/${kind}/${file}`);
  if (withIp) Object.assign(req, { ip: "203.0.113.1" });
  return GET(req, { params: Promise.resolve({ kind, file }) });
}

describe("Shadowrocket public text rule route", () => {
  it("serves public classical text without subscription credentials", async () => {
    vi.mocked(loadShadowrocketRules).mockResolvedValue("DOMAIN,example.com\n");
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.text()).toBe("DOMAIN,example.com\n");
    expect(loadShadowrocketRules).toHaveBeenCalledWith({ kind: "geosite", name: "cn" });
  });
  it("rejects unsupported paths before fetching", async () => {
    expect((await request("../cn.list")).status).toBe(404);
    expect((await request("cn.list", "custom")).status).toBe(404);
    expect(loadShadowrocketRules).not.toHaveBeenCalled();
  });
  it.each([new Error("private details"), new RuleFetchBusyError()])("returns uncached generic failures", async error => {
    vi.mocked(loadShadowrocketRules).mockRejectedValue(error);
    const response = await request();
    expect(response.status).toBe(error instanceof RuleFetchBusyError ? 503 : 502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.text()).not.toContain("private details");
  });
  it("allows the 51-provider initial load and limits excessive requests from a trusted client", async () => {
    vi.mocked(loadShadowrocketRules).mockResolvedValue("DOMAIN,example.com\n");
    for (let i = 0; i < 600; i += 1) expect((await request("cn.list", "geosite", true)).status).toBe(200);
    const response = await request("cn.list", "geosite", true);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(loadShadowrocketRules).toHaveBeenCalledTimes(600);
  });
});
