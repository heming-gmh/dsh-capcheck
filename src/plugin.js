import { defineTool } from '@deepseek-ai/dsh-tools'
import { scanPackageDir } from './scan-package.js'
import { scanNpmPackage } from './scan-npm.js'

const capcheckTool = defineTool({
  name: 'dsh_capcheck',
  description: 'Static, never-executed cordis-capability scan for a DSH plugin: reports which sensitive services (credentials, shell, approval, sandbox, fs, tools, ...) it declares or references, cross-checked against a maintained capability-tier registry. Use before installing an unfamiliar DSH plugin, or to audit one already installed.',
  parameters: {
    target: { type: 'string', description: 'A local filesystem path to an already-installed plugin directory, or an npm package specifier (name or name@version) to fetch and scan via npm pack.' },
    kind: { type: 'string', enum: ['local', 'npm'], description: "'local' for a filesystem path already on disk, 'npm' to fetch the published tarball first. Defaults to 'npm' when target does not look like a path." },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render(_args, value) {
      return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
  },
  async execute(args) {
    const isPathLike = args.target.startsWith('.') || args.target.startsWith('/') || args.target.includes('node_modules')
    const kind = args.kind || (isPathLike ? 'local' : 'npm')
    const report = kind === 'local' ? scanPackageDir(args.target) : scanNpmPackage(args.target)
    return report
  },
})

export const name = 'dsh-capcheck'
export const inject = ['tools']

export function apply(ctx) {
  ctx.effect(() => {
    const dispose = ctx.tools.register(capcheckTool)
    return () => dispose()
  }, 'dsh-capcheck: tool')
}