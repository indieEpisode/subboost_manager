import { describe, expect, it } from "vitest";
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

    const actual = yaml.load(adaptSubscriptionForUserAgent(source, "Shadowrocket/2.2.93"));
    expect(actual).toEqual(expected);
    // Adapting a response must not mutate the generator's input or future Clash responses.
    expect(realityNode["client-fingerprint"]).toBe("chrome");
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
    expected["proxy-providers"].shared.payload[0]["client-fingerprint"] = "chrome140";
    expect(yaml.load(adaptSubscriptionForUserAgent(yaml.dump(original), "shadowrocket/2.2.93")))
      .toEqual(expected);
  });

  it("does not change non-Reality protocols, empty public keys, or already compatible nodes", () => {
    const source = yaml.dump({
      proxies: [
        { ...realityNode, "client-fingerprint": "chrome140" },
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
    expect(yaml.load(adaptSubscriptionForUserAgent(yaml.dump(config), "Shadowrocket/2.2.93"))).toEqual(expected);
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
