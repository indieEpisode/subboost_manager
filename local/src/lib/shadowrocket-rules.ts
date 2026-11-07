import { convertMetaRuleList, type MetaRuleSource } from "./shadowrocket-rule-format";

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const TTL_MS = 60 * 60 * 1000;
const MAX_PENDING = 128;

export class RuleFetchBusyError extends Error {}

/** Bounded, shared cache: no subscription tokens or arbitrary upstream URLs. */
export function createShadowrocketRuleLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { text: string; bytes: number; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const failures = new Map<string, number>();
  const waiters: Array<() => void> = [];
  let cacheBytes = 0;
  let active = 0;

  async function load(source: MetaRuleSource): Promise<string> {
    const key = `${source.kind}/${source.name}`;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.text;
    const running = pending.get(key);
    if (running) return running;
    if ((failures.get(key) ?? 0) > now()) throw new Error("Rule source temporarily unavailable.");
    if (pending.size >= MAX_PENDING) throw new RuleFetchBusyError();

    const task = (async () => {
      if (active >= 8) await new Promise<void>((resolve) => waiters.push(resolve));
      else active += 1;
      try {
        const response = await fetcher(`https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/${source.kind}/${encodeURIComponent(source.name)}.list`, {
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
        if (!response.ok || !response.body) throw new Error("Rule source unavailable.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_SOURCE_BYTES) throw new Error("Rule source too large.");
            chunks.push(value);
          }
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally { reader.releaseLock(); }
        const text = convertMetaRuleList(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), source.kind);
        const bytes = Buffer.byteLength(text);
        const previous = cache.get(key);
        if (previous) { cache.delete(key); cacheBytes -= previous.bytes; }
        while (cache.size && (cacheBytes + bytes > MAX_CACHE_BYTES || cache.size >= 128)) {
          const oldest = cache.keys().next().value!;
          cacheBytes -= cache.get(oldest)!.bytes;
          cache.delete(oldest);
        }
        cache.set(key, { text, bytes, expires: now() + TTL_MS });
        cacheBytes += bytes;
        failures.delete(key);
        return text;
      } catch {
        if (failures.size >= 128) failures.delete(failures.keys().next().value!);
        failures.set(key, now() + 30_000);
        throw new Error("Unable to prepare rule list.");
      } finally {
        const next = waiters.shift();
        if (next) next();
        else active -= 1;
      }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return load;
}

export const loadShadowrocketRules = createShadowrocketRuleLoader();
