import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanPackageDir } from './scan-package.js'

// Downloads and extracts the REAL published tarball for one npm package (no
// install, no lifecycle scripts executed -- `npm pack` only fetches+unpacks),
// then runs the exact same never-executed static scanner used for local dirs.
export function scanNpmPackage(specifier) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-capcheck-'))
  try {
    execFileSync('npm', ['pack', specifier, '--pack-destination', workDir, '--silent'], { encoding: 'utf8', timeout: 30000 })
    const tarball = fs.readdirSync(workDir).find((f) => f.endsWith('.tgz'))
    if (!tarball) return { target: { name: specifier }, error: 'npm-pack-produced-no-tarball', capabilities: [], flags: [], summary: {} }
    execFileSync('tar', ['-xzf', tarball, '-C', workDir], { cwd: workDir })
    const pkgDir = path.join(workDir, 'package')
    if (!fs.existsSync(pkgDir)) return { target: { name: specifier }, error: 'unexpected-tarball-layout', capabilities: [], flags: [], summary: {} }
    const report = scanPackageDir(pkgDir)
    report.target.viaNpmTarball = true
    return report
  } catch (err) {
    return { target: { name: specifier }, error: 'npm-pack-failed: ' + err.message.split('\n')[0], capabilities: [], flags: [], summary: {} }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
