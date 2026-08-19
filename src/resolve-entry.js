// Resolves the file cordis actually loads when it imports this package,
// following the same precedence Node's own package resolution uses:
// `main` first, then `exports['.']` in its various shapes, then a legacy
// `index.js` guess as the last resort.
export function resolveEntryFile(pkgJson) {
  if (typeof pkgJson.main === 'string' && pkgJson.main.length > 0) return pkgJson.main

  const exp = pkgJson.exports
  if (typeof exp === 'string') return exp
  if (exp && typeof exp === 'object') {
    const root = exp['.'] ?? exp
    if (typeof root === 'string') return root
    if (root && typeof root === 'object') {
      return root.import || root.default || root.node || root.require || null
    }
  }
  return 'index.js'
}
