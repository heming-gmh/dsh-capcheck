import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'capability-tiers.yaml')

let _cache = null

const TIER_KEYS = {
  critical: ['critical', 'critical_extra_service_names'],
  high: ['high', 'high_extra_service_names'],
  medium: ['medium', 'medium_extra_service_names'],
  low: ['low', 'low_extra_service_names'],
}

export function loadTierRegistry() {
  if (_cache) return _cache
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8')
  const doc = yaml.load(raw)
  const map = new Map()
  for (const [tier, keys] of Object.entries(TIER_KEYS)) {
    for (const key of keys) {
      for (const name of doc[key] || []) map.set(name, tier)
    }
  }
  const prefixes = (doc.low_prefix_wildcards || []).map((p) => ({ prefix: p, tier: 'low' }))
  _cache = { map, prefixes }
  return _cache
}

export function tierOf(serviceOrPackageName) {
  const { map, prefixes } = loadTierRegistry()
  if (map.has(serviceOrPackageName)) return map.get(serviceOrPackageName)
  for (const { prefix, tier } of prefixes) {
    if (serviceOrPackageName.startsWith(prefix)) return tier
  }
  return 'unknown'
}

export const TIER_RANK = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 }
