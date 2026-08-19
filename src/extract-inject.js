import { parse } from 'acorn'
import * as walk from 'acorn-walk'

/**
 * Signal A + B extractor.
 * Parses one compiled JS/ESM source file (NEVER executed) and returns:
 *  - declared: services found in a structural inject declaration
 *  - scoped: services found via ctx.inject([...], cb) runtime scoped calls
 *  - referenced: `ctx.<service>` member-expression hits (Signal B, lower confidence
 *      than declared/scoped, but scoped to the literal `ctx` identifier -- see
 *      known-limitations note below).
 *
 * This module performs ZERO execution: acorn.parse only builds a syntax tree.
 *
 * KNOWN LIMITATION (found via dogfooding on a real third-party plugin):
 * an earlier version matched ANY object's `.shell`/`.credentials`/... property,
 * which produced a false positive on `client.shell({...})` -- an ssh2 library
 * call, unrelated to DSH's ctx.shell service. Restricting the object identifier
 * to CTX_IDENTIFIER_NAMES removes that class of false positive, at the cost of
 * missing access through a renamed/destructured alias (e.g. `const c = ctx; c.shell`
 * or `const { shell } = ctx`). Destructuring detection is left for a later pass.
 */

const SENSITIVE_PROPERTY_WATCHLIST = new Set([
  'credentials', 'shell', 'bash', 'approval', 'sandbox', 'fs', 'ssh',
])

// Only trust `<ident>.<service>` when <ident> is one of these -- the near-universal
// cordis Context parameter naming convention observed across the entire official
// package set and every third-party plugin sampled.
const CTX_IDENTIFIER_NAMES = new Set(['ctx', 'context'])

export function extractCapabilitySignals(sourceCode, filePath) {
  const declared = new Set()
  const scoped = new Set()
  const referenced = new Set()
  const errors = []

  let ast
  try {
    ast = parse(sourceCode, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
  } catch (err) {
    errors.push('parse-failed: ' + err.message)
    return { declared: [], scoped: [], referenced: [], errors, evidence: [], file: filePath }
  }

  const evidence = []

  const collectArrayStrings = (node) => {
    if (!node || node.type !== 'ArrayExpression') return []
    return node.elements
      .filter((el) => el && el.type === 'Literal' && typeof el.value === 'string')
      .map((el) => el.value)
  }

  walk.simple(ast, {
    VariableDeclarator(node) {
      if (node.id && node.id.type === 'Identifier' && node.id.name === 'inject') {
        const values = collectArrayStrings(node.init)
        for (const v of values) {
          declared.add(v)
          evidence.push({ signal: 'declared-inject', service: v, line: node.loc ? node.loc.start.line : null, kind: 'const-export' })
        }
      }
    },
    PropertyDefinition(node) {
      if (node.static && node.key && node.key.type === 'Identifier' && node.key.name === 'inject') {
        const values = collectArrayStrings(node.value)
        for (const v of values) {
          declared.add(v)
          evidence.push({ signal: 'declared-inject', service: v, line: node.loc ? node.loc.start.line : null, kind: 'static-class-field' })
        }
      }
    },
    CallExpression(node) {
      if (
        node.callee && node.callee.type === 'MemberExpression' &&
        node.callee.property && node.callee.property.name === 'inject' &&
        node.arguments.length > 0
      ) {
        const values = collectArrayStrings(node.arguments[0])
        for (const v of values) {
          scoped.add(v)
          evidence.push({ signal: 'scoped-inject', service: v, line: node.loc ? node.loc.start.line : null })
        }
      }
    },
    MemberExpression(node) {
      const isCtxBase = node.object && node.object.type === 'Identifier' && CTX_IDENTIFIER_NAMES.has(node.object.name)
      if (isCtxBase && node.property && node.property.type === 'Identifier' && SENSITIVE_PROPERTY_WATCHLIST.has(node.property.name)) {
        referenced.add(node.property.name)
        evidence.push({ signal: 'member-reference', service: node.property.name, line: node.loc ? node.loc.start.line : null })
      }
    },
  })

  return {
    declared: [...declared],
    scoped: [...scoped],
    referenced: [...referenced],
    errors,
    evidence,
    file: filePath,
  }
}
