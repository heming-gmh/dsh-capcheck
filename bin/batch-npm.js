import { scanNpmPackage } from '../src/scan-npm.js'

const targets = process.argv.slice(2)
const results = []
for (const t of targets) {
  process.stderr.write('npm-pack scanning ' + t + '...\n')
  results.push(scanNpmPackage(t))
}
console.log(JSON.stringify(results, null, 2))
