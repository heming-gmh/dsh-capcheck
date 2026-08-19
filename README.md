# dsh-capcheck

**V0 capability-disclosure scanner for DeepSeek Harness (DSH) cordis plugins.**

Before you trust a third-party DSH plugin, know what it can actually touch: credentials, shell/bash, approval, sandbox, filesystem, the tool registry, the cordis loader itself. `dsh-capcheck` answers that with pure static analysis — it never executes the code it scans.

## Why

Cordis plugins run as ordinary Node modules inside the same process as the DSH host: there is no capability sandbox around plugin code itself (see DSH's own `dsh-cordis-host-runner` docs: "treat a dynamic package like bash access"). `dsh-capcheck` reads what a plugin actually declares/references before you decide to trust it.

## Three signals

- **Signal A — declared `inject`**: the structural, framework-enforced dependency declaration every cordis plugin already has (`static inject = [...]` / `const inject = [...]`). Highest confidence.
- **Signal B — bare `ctx.<service>` member access**: lower confidence, restricted to a literal `ctx`/`context` identifier base to avoid false positives (e.g. `client.shell(...)` from an unrelated library is NOT flagged).
- **Signal C — `package.json` dependencies**: cross-referenced against the same tier registry, works without even downloading the plugin's code.

All three signals are cross-checked against `data/capability-tiers.yaml`, a manually maintained sensitivity registry. **Anything not in the registry reports as `unknown`, never as silently safe.**

## Install as a CLI

```sh
node bin/cli.js <local-plugin-dir> [--json]
node bin/batch-npm.js <npm-package-name> ...   # scans the REAL published tarball, not GitHub source
node bin/batch.js <owner/repo> ...              # scans GitHub repo contents directly (less reliable — see Known Limitations)
```

## Install as a DSH plugin

```sh
dsh plugin --profile web add dsh-capcheck
```

Registers the `dsh_capcheck` agent tool: ask the model to "scan this plugin before I install it" and it calls the tool directly. Verified end-to-end via:

```sh
dsh --profile headless --patch <(printf -- '- insert:\n    - id: dsh-capcheck\n      name: dsh-capcheck\n') \
  "Use the dsh_capcheck tool to scan the local plugin at <path> with kind=local, then report the summary counts by tier."
```

## Known limitations (found by actually running this against real plugins — see `reports/`)

1. **GitHub repo source is often NOT what gets installed.** Many plugins gitignore their build output; scanning GitHub directly failed on 52% of a 25-repo sample. Prefer the npm-tarball scanner (`bin/batch-npm.js`).
2. **`main`/`exports` field resolution matters.** A naive `pkgJson.main || 'index.js'` silently mis-resolves most community plugins that only declare `exports`. See `src/resolve-entry.js`.
3. **Signal B is a heuristic, not proof.** It only looks at property names on a literal `ctx`/`context` identifier; it will miss access through a renamed/destructured alias, and cannot verify the object identity at parse time.
4. **The capability-tier registry needs continuous maintenance.** It currently covers the official `@deepseek-ai/dsh-*` surface plus a handful of well-known third-party services; anything else reports `unknown` by design.
5. **No dynamic verification yet (planned V1).** A malicious plugin could avoid declaring `inject` and still reach a sensitive service through an indirect handle; only a runtime Proxy-instrumented smoke test (loading the plugin in a disposable Cordis context) can catch that class of evasion.

## Project layout

```
src/extract-inject.js   acorn-based static analyzer (Signal A + B)
src/resolve-entry.js    package.json main/exports resolver
src/tiers.js            capability-tiers.yaml loader
src/scan-package.js     scan an already-on-disk package directory
src/scan-npm.js         scan the REAL published npm tarball (recommended)
src/scan-remote.js      scan a GitHub repo's contents API (known-unreliable, see limitations)
src/plugin.js           the DSH/cordis plugin shell registering the dsh_capcheck tool
bin/cli.js              single-target CLI
bin/batch.js            batch GitHub-repo scan
bin/batch-npm.js        batch npm-tarball scan
data/capability-tiers.yaml   the maintained sensitivity registry
reports/                 point-in-time ecosystem scans
```

## Status

V0 pilot. Scanned locally: 4 official `@deepseek-ai/dsh-*` packages. Scanned via real npm tarball: 14/15 real community plugins (1 has neither `main` nor `exports`, reported as incomplete rather than silently clean). Full methodology and findings: `reports/ecosystem-capability-landscape-v0.md`.

## License

MIT
