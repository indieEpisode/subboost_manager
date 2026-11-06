import * as yaml from "js-yaml";

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
  for (const node of realityNodes) {
    if (node["client-fingerprint"] === "chrome140") continue;
    node["client-fingerprint"] = "chrome140";
    changed = true;
  }
  return changed;
}

/** Adapt the generated response only; never persist client-specific fingerprints. */
export function adaptSubscriptionForUserAgent(source: string, userAgent: string | null): string {
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

  return changed ? yaml.dump(config, { lineWidth: -1 }) : source;
}
