#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs'
import { scanPackageDir } from '../src/scan-package.js'

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const target = args.find((a) => !a.startsWith('--'))

if (!target) {
  console.error('usage: dsh-capcheck <local-package-dir> [--json]')
  process.exit(2)
}

const dir = path.resolve(target)
if (!fs.existsSync(dir)) {
  console.error('not found: ' + dir)
  process.exit(2)
}

const report = scanPackageDir(dir)

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const t = report.target
  console.log('capcheck: ' + (t.name || dir) + (t.version ? '@' + t.version : ''))
  if (report.error) {
    console.log('  ERROR: ' + report.error)
  } else {
    for (const cap of report.capabilities) {
      const tag = { critical: '[CRIT]', high: '[HIGH]', medium: '[MED] ', low: '[LOW] ', unknown: '[UNK] ' }[cap.tier]
      console.log('  ' + tag + ' ' + cap.service + '  (declared=' + cap.declared + ' scoped=' + cap.scoped + ' referenced=' + cap.referenced + ')')
    }
    for (const flag of report.flags) {
      console.log('  FLAG[' + flag.severity + '] ' + flag.type + ': ' + (flag.service ? flag.service + ' - ' : '') + flag.detail)
    }
    console.log('  summary: ' + JSON.stringify(report.summary))
  }
}

const hasHighSeverity = report.flags && report.flags.some((f) => f.severity === 'high')
process.exit(hasHighSeverity ? 1 : 0)
