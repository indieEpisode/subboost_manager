# Shadowrocket fingerprint import probe

This manual fixture isolates the import behavior that server-side YAML tests cannot exercise. It contains four synthetic VLESS Reality nodes on reserved `.invalid` hosts, with separate names, addresses and UUIDs so they become new entries rather than reusing existing node settings. It contains no working credentials or subscription tokens.

Add `probe.yaml` as a separate subscription in Shadowrocket, then inspect the TLS fingerprint of each newly imported node without changing its value. Report the app version and the values shown for A/B/C/D. If an entry is missing or the import fails, record that result as well. These entries are for inspecting the importer; they cannot be used for network access.

| Entry | Field(s) being tested |
| --- | --- |
| A | `client-fingerprint: chrome140` (current server output) |
| B | `client-fingerprint: Chrome140` (value casing) |
| C | `fingerprint: Chrome140` (alternate field hypothesis) |
| D | Both fields set to `Chrome140` (interaction) |

The alternate field is an experiment, not a production recommendation. In Mihomo YAML, `fingerprint` is a certificate fingerprint, distinct from `client-fingerprint`; a `fingerprint=Chrome140` parameter exported in a Shadowrocket `vless://` URI does not establish the meaning of the similarly named YAML field. See the [Mihomo TLS documentation](https://github.com/MetaCubeX/Meta-Docs/blob/main/docs/config/proxies/tls.en.md).

Interpretation:

- If B imports Chrome140 while A does not, a casing change is a candidate for the response adapter.
- If C or D imports Chrome140, validate Shadowrocket's field semantics before changing production output; do not apply that field to Clash/Mihomo responses.
- If A imports Chrome140 on a fresh entry, inspect the actual production download's User-Agent and existing-node update behavior.
- If every entry stays Chrome120, compare native URI import with YAML import before choosing another output format. Preserve routing, DNS, groups and chaining requirements when evaluating a format change.

## Reported device result (2026-11-07)

A manual run in Shadowrocket 2.2.93 reported the following values for newly imported entries:

| Entry | Displayed TLS fingerprint |
| --- | --- |
| A | `Chrome140` |
| B | `Chrome140` |
| C | `Safari26_3` |
| D | `Safari26_3` |

This confirms that the current `client-fingerprint: chrome140` field/value is recognized on fresh import; changing its casing is unnecessary. The alternate `fingerprint` field produces a different result and must not be added as a fix.

This run does not establish how an existing subscription updates saved nodes, what User-Agent a particular subscription sends, or whether a real proxy connection works. If an existing subscription still displays Chrome120, compare a newly added copy of the real subscription with its old entries and inspect the actual download request before changing server output.

Remove this diagnostic subscription after testing.
