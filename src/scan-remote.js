import { extractCapabilitySignals } from './extract-inject.js'
import { tierOf, TIER_RANK } from './tiers.js'
import { execFileSync } from 'node:child_process'

function ghApiJson(pathSpec) {
  try {
    const out = execFileSync('gh', ['api', pathSpec], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 })
    return JSON.parse(out)
  } catch (err) {
    return null
  }
}

function ghApiRawFile(owner, repo, filePath) {
  // Uses the contents API with a raw media type accept header via --header,
  // decoding base64 ourselves keeps this independent of gh's own content-negotiation.
  try {
    const out = execFileSync('gh', ['api', 'repos/' + owner + '/' + repo + '/contents/' + filePath, '--jq', '.content'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 })
    const b64 = out.trim()
    if (!b64) return null
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch (err) {
    return null
  }
}

function resolveTier(serviceName) {
  const direct = tierOf(serviceName)
  if (direct !== 'unknown') return direct
  const guessed = tierOf('dsh-' + serviceName)
  return guessed
}

function scanDependencies(pkgJson) {
  const hits = []
  for (const section of ['dependencies', 'peerDependencies']) {
    const deps = (pkgJson && pkgJson[section]) || {}
    for (const depName of Object.keys(deps)) {
      const tier = tierOf(depName)
      if (tier !== 'unknown') hits.push({ service: depName, tier, evidence: { signal: 'package-dependency', ref: depName } })
    }
  }
  return hits
}

// Scans one GitHub repo WITHOUT cloning or installing it: fetches package.json
// and its declared main entry file as raw text via the GitHub Contents API,
// then runs the exact same static (never-executed) analysis as the local scanner.
export function scanGithubRepo(ownerRepo) {
  const [owner, repo] = ownerRepo.split('/')
  const pkgJsonRaw = ghApiRawFile(owner, repo, 'package.json')
  if (!pkgJsonRaw) {
    return { target: { repo: ownerRepo }, error: 'package.json-unreadable', capabilities: [], flags: [], summary: {} }
  }
  let pkgJson
  try { pkgJson = JSON.parse(pkgJsonRaw) } catch { return { target: { repo: ownerRepo }, error: 'package.json-invalid-json', capabilities: [], flags: [], summary: {} } }

  const mainRel = pkgJson.main || 'index.js'
  const mainSource = ghApiRawFile(owner, repo, mainRel)

  const capabilityMap = new Map()
  const upsert = (service, tier, bucket) => {
    if (!capabilityMap.has(service)) capabilityMap.set(service, { service, tier, declared: false, scoped: false, referenced: false })
    const entry = capabilityMap.get(service)
    entry[bucket] = true
    if (TIER_RANK[tier] > TIER_RANK[entry.tier]) entry.tier = tier
  }

  for (const hit of scanDependencies(pkgJson)) upsert(hit.service, hit.tier, 'declared')

  let parseError = null
  if (mainSource) {
    const sig = extractCapabilitySignals(mainSource, mainRel)
    if (sig.errors.length) parseError = sig.errors.join('; ')
    for (const s of sig.declared) upsert(s, resolveTier(s), 'declared')
    for (const s of sig.scoped) upsert(s, resolveTier(s), 'scoped')
    for (const s of sig.referenced) upsert(s, resolveTier(s), 'referenced')
  } else {
    parseError = 'main-file-unreadable: ' + mainRel
  }

  const capabilities = [...capabilityMap.values()].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
  const flags = []
  for (const cap of capabilities) {
    if (cap.referenced && !cap.declared && !cap.scoped) {
      flags.push({ type: 'silent-access', service: cap.service, tier: cap.tier, severity: (cap.tier === 'critical' || cap.tier === 'high') ? 'high' : 'medium' })
    }
    if (cap.tier === 'unknown') flags.push({ type: 'unregistered-service', service: cap.service, severity: 'info' })
  }
  if (parseError) flags.push({ type: 'scan-incomplete', detail: parseError, severity: 'info' })

  const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  for (const cap of capabilities) summary[cap.tier] = (summary[cap.tier] || 0) + 1

  return {
    target: { name: pkgJson.name, version: pkgJson.version, repo: ownerRepo },
    capabilities,
    flags,
    summary,
  }
}
