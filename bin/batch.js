import { scanGithubRepo } from '../src/scan-remote.js'

const targets = process.argv.slice(2)
const results = []
for (const t of targets) {
  process.stderr.write('scanning ' + t + '...\n')
  const r = scanGithubRepo(t)
  results.push(r)
}
console.log(JSON.stringify(results, null, 2))
