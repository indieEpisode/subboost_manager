import * as yaml from "js-yaml";
import { parseMetaMrsUrl } from "./shadowrocket-rule-format";

type Mapping = Record<string, unknown>;

function isMapping(value: unknown): value is Mapping {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isVlessReality(node: unknown): node is Mapping {
  if (!isMapping(node) || node.type !== "vless") return false;
  const reality = node["reality-opts"];
  return isMapping(reality) && typeof reality["public-key"] === "string" && !!reality["public-key"].trim();
}

function updateRealityNodes(nodes: unknown, override?: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  const realityNodes = nodes.filter(isVlessReality);
  if (!realityNodes.length) return false;
  let changed = false;
  if (isMapping(override) && typeof override["client-fingerprint"] === "string" && override["client-fingerprint"] !== "chrome140") {
    // Materialize the existing provider override so it cannot undo the Reality fix.
    // Other nodes retain the same effective fingerprint as before.
    for (const node of nodes) {
      if (isMapping(node)) node["client-fingerprint"] = override["client-fingerprint"];
    }
    delete override["client-fingerprint"];
    changed = true;
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!isVlessReality(node)) continue;
    const reality = node["reality-opts"] as Mapping;
    let nextNode = node;
    if (Object.hasOwn(reality, "support-x25519mlkem768")) {
      // This Mihomo option overrides the selected profile in Shadowrocket 2.2.93.
      // Copy both mappings so YAML aliases cannot change other provider definitions.
      const nextReality = { ...reality };
      delete nextReality["support-x25519mlkem768"];
      nextNode = { ...nextNode, "reality-opts": nextReality };
    }
    if (nextNode["client-fingerprint"] !== "chrome140") {
      nextNode = { ...nextNode, "client-fingerprint": "chrome140" };
    }
    if (nextNode !== node) {
      nodes[index] = nextNode;
      changed = true;
    }
  }
  return changed;
}

/** Adapt the generated response only; never persist client-specific fingerprints. */
export function adaptSubscriptionForUserAgent(source: string, userAgent: string | null, ruleBaseUrl?: string): string {
  if (!/\bShadowrocket\b/i.test(userAgent ?? "") || !source.trim()) return source;

  const config: unknown = yaml.load(source);
  if (!isMapping(config)) return source;

  let changed = updateRealityNodes(config.proxies);
  const providers = config["proxy-providers"];
  if (isMapping(providers)) {
    for (const provider of Object.values(providers)) {
      // Remote providers are fetched by the client and are outside this response.
      if (!isMapping(provider) || provider.type !== "inline") continue;
      if (updateRealityNodes(provider.payload, provider.override)) changed = true;
    }
  }

  const ruleProviders = config["rule-providers"];
  if (ruleBaseUrl && isMapping(ruleProviders)) {
    for (const [key, provider] of Object.entries(ruleProviders)) {
      if (!isMapping(provider) || provider.type !== "http" || provider.format !== "mrs") continue;
      const source = parseMetaMrsUrl(provider.url);
      if (!source || provider.behavior !== (source.kind === "geosite" ? "domain" : "ipcidr")) continue;
      ruleProviders[key] = {
        ...provider,
        behavior: "classical",
        format: "text",
        url: `${ruleBaseUrl.replace(/\/+$/, "")}/api/rules/shadowrocket/${source.kind}/${source.name}.list`,
        ...(typeof provider.path === "string" ? { path: `${provider.path}.shadowrocket.list` } : {}),
      };
      changed = true;
    }
  }

  return changed ? yaml.dump(config, { lineWidth: -1 }) : source;
}
