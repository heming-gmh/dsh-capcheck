import fs from 'node:fs'
import path from 'node:path'
import { extractCapabilitySignals } from './extract-inject.js'
import { tierOf, TIER_RANK } from './tiers.js'
import { resolveEntryFile } from './resolve-entry.js'

// Map a cordis SERVICE NAME (e.g. 'credentials') back to a registrable PACKAGE-ish
// key so it can be looked up in the tier registry, which is keyed by package name
// for Signal C but by bare service name for Signal A/B. We keep both key shapes
// in the same registry file (see data/capability-tiers.yaml) and just try the
// raw service name first, then a 'dsh-' + name heuristic fallback.
function resolveTier(serviceName) {
  const direct = tierOf(serviceName)
  if (direct !== 'unknown') return { tier: direct, matchedAs: serviceName }
  const guessed = 'dsh-' + serviceName
  const guessedTier = tierOf(guessed)
  if (guessedTier !== 'unknown') return { tier: guessedTier, matchedAs: guessed }
  return { tier: 'unknown', matchedAs: serviceName }
}

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function safeReadFile(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return null }
}

// Signal C: package.json dependencies / peerDependencies cross-referenced
// against the tier registry (keyed by npm package name).
function scanDependencies(pkgJson) {
  const hits = []
  const depSections = ['dependencies', 'peerDependencies']
  for (const section of depSections) {
    const deps = pkgJson[section] || {}
    for (const depName of Object.keys(deps)) {
      const tier = tierOf(depName)
      if (tier !== 'unknown') {
        hits.push({ service: depName, tier, evidence: [{ signal: 'package-dependency', ref: depName + '@' + deps[depName], section, confidence: 'medium' }] })
      }
    }
  }
  return hits
}

// Scans one already-on-disk package directory (never installs, never executes).
export function scanPackageDir(dir) {
  const pkgJsonPath = path.join(dir, 'package.json')
  const pkgJson = safeReadJson(pkgJsonPath)
  if (!pkgJson) {
    return { target: { path: dir }, error: 'no-readable-package-json', capabilities: [], flags: [] }
  }

  const mainRel = resolveEntryFile(pkgJson)
  const mainPath = mainRel ? path.join(dir, mainRel) : null
  const source = mainPath ? safeReadFile(mainPath) : null

  const capabilityMap = new Map() // service -> { tier, evidenceList, declared, scoped, referenced }

  const upsert = (service, tier, evidenceItem, bucket) => {
    if (!capabilityMap.has(service)) {
      capabilityMap.set(service, { service, tier, evidence: [], declared: false, scoped: false, referenced: false })
    }
    const entry = capabilityMap.get(service)
    entry.evidence.push(evidenceItem)
    entry[bucket] = true
    if (TIER_RANK[tier] > TIER_RANK[entry.tier]) entry.tier = tier
  }

  // Signal C first (cheapest, works even if main file is missing/unparsable)
  for (const hit of scanDependencies(pkgJson)) {
    upsert(hit.service, hit.tier, hit.evidence[0], 'declared')
  }

  let parseError = null
  if (source) {
    const sig = extractCapabilitySignals(source, mainPath)
    if (sig.errors.length) parseError = sig.errors.join('; ')
    for (const service of sig.declared) {
      const { tier, matchedAs } = resolveTier(service)
      upsert(service, tier, { signal: 'declared-inject', matchedAs, confidence: 'high' }, 'declared')
    }
    for (const service of sig.scoped) {
      const { tier, matchedAs } = resolveTier(service)
      upsert(service, tier, { signal: 'scoped-inject', matchedAs, confidence: 'high' }, 'scoped')
    }
    for (const service of sig.referenced) {
      const { tier, matchedAs } = resolveTier(service)
      upsert(service, tier, { signal: 'member-reference', matchedAs, confidence: 'low' }, 'referenced')
    }
  } else {
    parseError = 'main-file-unreadable: ' + (mainRel || '<unresolvable from package.json>')
  }

  const capabilities = [...capabilityMap.values()].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])

  const flags = []
  for (const cap of capabilities) {
    const declaredOrScoped = cap.declared || cap.scoped
    if (cap.referenced && !declaredOrScoped) {
      flags.push({
        type: 'silent-access',
        service: cap.service,
        tier: cap.tier,
        detail: 'referenced via bare member access but absent from any declared/scoped inject list',
        severity: cap.tier === 'critical' || cap.tier === 'high' ? 'high' : 'medium',
      })
    }
    if (cap.tier === 'unknown') {
      flags.push({
        type: 'unregistered-service',
        service: cap.service,
        detail: 'not found in capability-tiers registry; manual review required',
        severity: 'info',
      })
    }
  }
  if (parseError) {
    flags.push({ type: 'scan-incomplete', detail: parseError, severity: 'info' })
  }

  const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  for (const cap of capabilities) summary[cap.tier] = (summary[cap.tier] || 0) + 1

  return {
    target: { name: pkgJson.name, version: pkgJson.version, path: dir },
    scannedAt: new Date().toISOString(),
    capabilities,
    flags,
    summary,
  }
}