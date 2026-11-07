import { isIP } from "node:net";

export type MetaRuleSource = { kind: "geosite" | "geoip"; name: string };

export function parseMetaRuleFile(kind: string, file: string): MetaRuleSource | null {
  if (kind !== "geosite" && kind !== "geoip") return null;
  if (!/^[a-z0-9][a-z0-9@!._-]{0,127}\.list$/.test(file) || file.includes("..")) return null;
  return { kind, name: file.slice(0, -5) };
}

/** Only recognize the official catalog. Custom hosts, queries and branches stay untouched. */
export function parseMetaMrsUrl(value: unknown): MetaRuleSource | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  const prefix = url.hostname === "raw.githubusercontent.com"
    ? "/MetaCubeX/meta-rules-dat/meta/geo/"
    : url.hostname === "github.com"
      ? "/MetaCubeX/meta-rules-dat/raw/(?:refs/heads/)?meta/geo/"
      : null;
  if (!prefix) return null;
  const match = new RegExp(`^${prefix}(geosite|geoip)/([^/]+)\\.mrs$`).exec(url.pathname);
  return match ? parseMetaRuleFile(match[1], `${match[2]}.list`) : null;
}

/** Convert the catalog's plain lists to classical RULE-SET text, without broadening matches. */
export function convertMetaRuleList(source: string, kind: MetaRuleSource["kind"]): string {
  const rules: string[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (kind === "geosite") {
      const suffix = line.startsWith("+.");
      const domain = suffix ? line.slice(2) : line;
      // Do not silently drop or approximate future wildcard/regex syntax.
      if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(domain)) throw new Error("Unsupported domain rule.");
      rules.push(`${suffix ? "DOMAIN-SUFFIX" : "DOMAIN"},${domain}`);
    } else {
      const match = /^([^/]+)\/(\d{1,3})$/.exec(line);
      const version = match ? isIP(match[1]) : 0;
      if (!match || !version || Number(match[2]) > (version === 6 ? 128 : 32)) throw new Error("Invalid IP rule.");
      rules.push(`${version === 6 ? "IP-CIDR6" : "IP-CIDR"},${line}`);
    }
  }
  if (!rules.length) throw new Error("Empty rule list.");
  return `${rules.join("\n")}\n`;
}
