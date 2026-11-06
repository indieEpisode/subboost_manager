import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { adaptSubscriptionForUserAgent } from "./subscription-client-profile";

const realityNode = {
  name: "A",
  type: "vless",
  server: "example.invalid",
  port: 443,
  uuid: "00000000-0000-0000-0000-000000000001",
  tls: true,
  servername: "example.invalid",
  "skip-cert-verify": false,
  "client-fingerprint": "chrome",
  network: "tcp",
  flow: "xtls-rprx-vision",
  udp: true,
  "reality-opts": {
    "public-key": "test-public-key",
    "short-id": "0000000000000000",
    "support-x25519mlkem768": true,
  },
};

describe("Shadowrocket subscription response profile", () => {
  it.each([null, "", "Clash.Meta/1.19.0", "mihomo/1.19.0", "ClashMi/1.0", "NotShadowrocket/1.0", "ShadowrocketPlus/1.0"])(
    "preserves the complete original response for user-agent %s",
    (userAgent) => {
      const source = `# Keep this comment and formatting\n${yaml.dump({ proxies: [realityNode] })}`;
      expect(adaptSubscriptionForUserAgent(source, userAgent)).toBe(source);
    }
  );

  it("changes every VLESS Reality fingerprint while preserving rules, credentials, DNS and chaining", () => {
    const plainVless = { ...realityNode, name: "TLS", "reality-opts": undefined };
    const original = {
      proxies: [
        realityNode,
        { ...realityNode, name: "B", "client-fingerprint": "chrome120", "dialer-proxy": "Entry" },
        plainVless,
        { name: "SS", type: "ss", server: "ss.invalid", port: 443, password: "test-password" },
        { name: "Entry", type: "socks5", server: "entry.invalid", port: 1080 },
      ],
      "proxy-groups": [{ name: "Proxy", type: "select", proxies: ["A", "B", "TLS", "SS"] }],
      dns: { enable: true, nameserver: ["https://dns.example.invalid/dns-query"] },
      "global-client-fingerprint": "chrome",
      "rule-providers": { custom: { type: "http", behavior: "domain", url: "https://rules.example.invalid/list" } },
      rules: ["DOMAIN-SUFFIX,example.com,Proxy", "MATCH,Proxy"],
    };
    const source = yaml.dump(original);
    const expected = yaml.load(source) as { proxies: Array<Record<string, unknown>> };
    expected.proxies[0]["client-fingerprint"] = "chrome140";
    expected.proxies[1]["client-fingerprint"] = "chrome140";
    delete (expected.proxies[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
    delete (expected.proxies[1]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];

    const actual = yaml.load(adaptSubscriptionForUserAgent(source, "Shadowrocket/2.2.93"));
    expect(actual).toEqual(expected);
    // Adapting a response must not mutate the generator's input or future Clash responses.
    expect(realityNode["client-fingerprint"]).toBe("chrome");
    expect(realityNode["reality-opts"]["support-x25519mlkem768"]).toBe(true);
    expect(adaptSubscriptionForUserAgent(source, "Clash.Meta/1.19.0")).toBe(source);
  });

  it("also adapts generated inline provider payloads and preserves remote provider definitions", () => {
    const original = {
      "proxy-providers": {
        shared: { type: "inline", payload: [realityNode], "health-check": { enable: true } },
        remote: { type: "http", url: "https://example.invalid/provider.yaml", interval: 3600 },
        local: { type: "file", path: "./local.yaml", payload: [realityNode] },
      },
      "proxy-groups": [{ name: "Proxy", type: "select", use: ["shared", "remote"] }],
    };
    const expected = structuredClone(original);
    // The source has a YAML node alias shared with the file provider; keep that
    // remote definition unchanged rather than following the adapted inline copy.
    expected["proxy-providers"].local.payload = [structuredClone(realityNode)];
    expected["proxy-providers"].shared.payload[0]["client-fingerprint"] = "chrome140";
    delete (expected["proxy-providers"].shared.payload[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
    expect(yaml.load(adaptSubscriptionForUserAgent(yaml.dump(original), "shadowrocket/2.2.93")))
      .toEqual(expected);
  });

  it("does not change non-Reality protocols, empty public keys, or already compatible nodes", () => {
    const source = yaml.dump({
      proxies: [
        { ...realityNode, "client-fingerprint": "chrome140", "reality-opts": { "public-key": "test-public-key" } },
        { ...realityNode, type: "trojan" },
        { ...realityNode, "reality-opts": {} },
        { ...realityNode, "reality-opts": { "public-key": " " } },
        null,
      ],
    });
    expect(adaptSubscriptionForUserAgent(source, "Shadowrocket/2.2.93")).toBe(source);
  });

  it("prevents an inline provider fingerprint override from undoing the fix", () => {
    const config = {
      "proxy-providers": {
        shared: {
          type: "inline",
          payload: [
            { ...realityNode, "client-fingerprint": "chrome140" },
            { name: "TLS", type: "vless", "client-fingerprint": "firefox" },
            null,
          ],
          override: { "client-fingerprint": "chrome120", udp: true },
        },
      },
    };
    const expected = structuredClone(config);
    const expectedRealityNode = expected["proxy-providers"].shared.payload[0]! as Record<string, unknown>;
    delete (expectedRealityNode["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
    expected["proxy-providers"].shared.payload[1]!["client-fingerprint"] = "chrome120";
    const expectedOverride = expected["proxy-providers"].shared.override as Record<string, unknown>;
    delete expectedOverride["client-fingerprint"];
    expect(yaml.load(adaptSubscriptionForUserAgent(yaml.dump(config), "Shadowrocket/2.2.93")))
      .toEqual(expected);
  });

  it("keeps compatible overrides and ignores providers without applicable Reality nodes", () => {
    const config = {
      "proxy-providers": {
        compatible: { type: "inline", payload: [realityNode], override: { "client-fingerprint": "chrome140" } },
        plain: { type: "inline", payload: [{ name: "TLS", type: "vless" }], override: { "client-fingerprint": "firefox" } },
        malformed: { type: "inline", payload: {} },
        missing: { type: "inline" },
        ignored: null,
      },
    };
    const expected = structuredClone(config);
    expected["proxy-providers"].compatible.payload[0]["client-fingerprint"] = "chrome140";
    delete (expected["proxy-providers"].compatible.payload[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
    expect(yaml.load(adaptSubscriptionForUserAgent(yaml.dump(config), "Shadowrocket/2.2.93"))).toEqual(expected);
  });

  it.each([true, false])("removes the Mihomo ML-KEM option even when Chrome140 is already selected (%s)", (enabled) => {
    const node = {
      ...realityNode,
      "client-fingerprint": "chrome140",
      "reality-opts": { ...realityNode["reality-opts"], "support-x25519mlkem768": enabled },
    };
    const expectedReality = { "public-key": "test-public-key", "short-id": "0000000000000000" };
    const result = yaml.load(adaptSubscriptionForUserAgent(yaml.dump({ proxies: [node] }), "Shadowrocket/3488"));
    expect(result).toEqual({ proxies: [{ ...node, "reality-opts": expectedReality }] });
  });

  it("adapts the production-shaped device probes without changing public keys or short IDs", () => {
    const source = readFileSync(new URL("../../../test/fixtures/shadowrocket-fingerprint/production-shape.yaml", import.meta.url), "utf8");
    const original = yaml.load(source) as { proxies: Array<Record<string, unknown>> };
    const expected = structuredClone(original);
    for (const node of expected.proxies) {
      delete (node["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"];
    }
    const adapted = adaptSubscriptionForUserAgent(source, "Shadowrocket/3488 CFNetwork/1 Darwin/22");
    expect(yaml.load(adapted)).toEqual(expected);
    expect(adaptSubscriptionForUserAgent(adapted, "Shadowrocket/3488")).toBe(adapted);
    expect(adaptSubscriptionForUserAgent(source, "mihomo/1.19.0")).toBe(source);
    expect((original.proxies[0]["reality-opts"] as Record<string, unknown>)["support-x25519mlkem768"]).toBe(true);
  });

  it.each(["", "null\n", "[]\n", "mixed-port: 7890\n"])(
    "leaves a document without applicable nodes unchanged: %s",
    (source) => expect(adaptSubscriptionForUserAgent(source, "Shadowrocket/2.2.93")).toBe(source)
  );

  it("does not parse the YAML of other clients", () => {
    const invalidYaml = "proxies: [invalid";
    expect(adaptSubscriptionForUserAgent(invalidYaml, "Clash.Meta/1.19.0")).toBe(invalidYaml);
  });
});
