import { describe, expect, it, vi } from "vitest";
import { convertMetaRuleList, parseMetaMrsUrl, parseMetaRuleFile } from "./shadowrocket-rule-format";
import { createShadowrocketRuleLoader, RuleFetchBusyError } from "./shadowrocket-rules";

describe("Shadowrocket catalog rules", () => {
  it("recognizes only fixed catalog paths, kinds and safe filenames", () => {
    for (const prefix of [
      "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/",
      "https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/",
      "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/",
    ]) expect(parseMetaMrsUrl(`${prefix}geosite/category-games@cn.mrs`)).toEqual({ kind: "geosite", name: "category-games@cn" });
    expect(parseMetaRuleFile("geoip", "cn.list")).toEqual({ kind: "geoip", name: "cn" });
    for (const url of [null, "broken", "https://evil.invalid/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs",
      "http://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs",
      ...["?token=x", "#x"].map(suffix => `https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs${suffix}`),
      "https://user:pass@github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/cn.mrs",
      "https://github.com:444/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/cn.mrs",
      "https://github.com/MetaCubeX/meta-rules-dat/raw/master/geo/geosite/cn.mrs",
      "https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/cn.yaml",
    ]) expect(parseMetaMrsUrl(url)).toBeNull();
    for (const [kind, file] of [["other", "cn.list"], ["geosite", "../cn.list"], ["geoip", "cn..list"], ["geoip", "%2fcn.list"], ["geosite", "cn.mrs"]]) {
      expect(parseMetaRuleFile(kind, file)).toBeNull();
    }
  });

  it("preserves exact-domain, suffix and IPv4/IPv6 semantics as classical text", () => {
    expect(convertMetaRuleList("# comment\r\nexample.com\r\n+.example.net\n\n_local\n", "geosite"))
      .toBe("DOMAIN,example.com\nDOMAIN-SUFFIX,example.net\nDOMAIN,_local\n");
    expect(convertMetaRuleList("10.0.0.0/8\n2001:db8::/32\n", "geoip"))
      .toBe("IP-CIDR,10.0.0.0/8\nIP-CIDR,2001:db8::/32\n");
    for (const line of ["*.example.com", ".example.com", "example.com,REJECT", "regexp:.*", "a..com", ""]) {
      expect(() => convertMetaRuleList(line, "geosite")).toThrow();
    }
    for (const line of ["999.0.0.0/8", "10.0.0.0/33", "::/129", "10.0.0.0", "10.0.0.0/-1"]) {
      expect(() => convertMetaRuleList(line, "geoip")).toThrow();
    }
  });

  it("deduplicates concurrent requests and refreshes expired data from the fixed upstream", async () => {
    let time = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("+.example.com\n"));
    const load = createShadowrocketRuleLoader(fetcher, () => time);
    const source = { kind: "geosite", name: "category-games@cn" } as const;
    const result = await Promise.all([load(source), load(source)]);
    expect(result).toEqual(["DOMAIN-SUFFIX,example.com\n", "DOMAIN-SUFFIX,example.com\n"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-games%40cn.list");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(await load(source)).toBe(result[0]);
    time = 3_600_001;
    await load(source);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["http", "empty", "utf8", "large", "syntax", "network"])("rejects %s failures without caching invalid rules or exposing fetch errors", async (failure) => {
    let time = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (failure === "http") return new Response("not found", { status: 404 });
      if (failure === "empty") return new Response(null);
      if (failure === "utf8") return new Response(new Uint8Array([0xff]));
      if (failure === "large") return new Response("a".repeat(4 * 1024 * 1024 + 1));
      if (failure === "syntax") return new Response("*.example.com");
      throw new Error("sensitive fetch details");
    });
    const load = createShadowrocketRuleLoader(fetcher, () => time);
    const source = { kind: "geosite", name: "test" } as const;
    await expect(load(source)).rejects.toThrow("Unable to prepare rule list.");
    await expect(load(source)).rejects.toThrow("temporarily unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 30_001;
    fetcher.mockResolvedValue(new Response("example.com"));
    await expect(load(source)).resolves.toBe("DOMAIN,example.com\n");
  });

  it("bounds concurrency, pending requests and cached entries", async () => {
    const releases: Array<() => void> = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => {
      releases.push(() => resolve(new Response("example.com")));
    }));
    const load = createShadowrocketRuleLoader(fetcher);
    const tasks = Array.from({ length: 128 }, (_, index) => load({ kind: "geosite", name: `n${index}` }));
    expect(fetcher).toHaveBeenCalledTimes(8);
    await expect(load({ kind: "geoip", name: "overflow" })).rejects.toBeInstanceOf(RuleFetchBusyError);
    while (releases.length) {
      releases.splice(0).forEach(release => release());
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await Promise.all(tasks);
    fetcher.mockImplementation(async () => new Response("example.net"));
    await load({ kind: "geosite", name: "extra" });
    await load({ kind: "geosite", name: "n0" });
    expect(fetcher).toHaveBeenCalledTimes(130);
  });
});
