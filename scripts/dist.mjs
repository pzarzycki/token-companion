#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const platformArg = process.argv[2] ?? platformToBuilder(process.platform)
const archArg = process.argv[3] ?? process.arch
let npmCliPath

const supportedPlatforms = new Set(['win', 'mac', 'linux'])
const supportedArches = new Set(['x64', 'arm64'])

if (!supportedPlatforms.has(platformArg)) {
  console.error(`Unsupported dist platform: ${platformArg}`)
  process.exit(1)
}

if (!supportedArches.has(archArg)) {
  console.error(`Unsupported dist architecture: ${archArg}`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const forgePlatform = builderToForgePlatform(platformArg)
  run('npm', ['run', packageScriptName(platformArg)])
  const prepackaged = await findPrepackagedApp(forgePlatform, archArg)
  await fs.rm(join(root, 'out', 'dist'), { recursive: true, force: true })
  runBuilder(
    ['--publish', 'never', `--${platformArg}`, archFlag(archArg), '--config', 'electron-builder.yml', '--prepackaged', prepackaged],
    {
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      APPLE_ID: '',
      APPLE_APP_SPECIFIC_PASSWORD: '',
      CSC_LINK: '',
      CSC_KEY_PASSWORD: ''
    }
  )
}

function platformToBuilder(platform) {
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  if (platform === 'linux') return 'linux'
  return ''
}

function builderToForgePlatform(platform) {
  if (platform === 'win') return 'win32'
  if (platform === 'mac') return 'darwin'
  return 'linux'
}

function packageScriptName(platform) {
  if (platform === 'win') return 'package:win'
  if (platform === 'mac') return 'package:mac'
  return 'package:linux'
}

function archFlag(arch) {
  return arch === 'arm64' ? '--arm64' : '--x64'
}

function run(command, args, extraEnv = {}) {
  console.log(`> ${[command, ...args].join(' ')}`)
  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runBuilder(args, extraEnv = {}) {
  const builderCli = join(root, 'node_modules', 'electron-builder', 'cli.js')
  console.log(`> node ${[builderCli, ...args].join(' ')}`)
  const result = spawnSync(process.execPath, [builderCli, ...args], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function commandInvocation(command, args) {
  if (command === 'npm' && process.platform === 'win32') {
    const npmCli = locateNpmCli()
    if (npmCli) return { command: process.execPath, args: [npmCli, ...args] }
    return { command: 'npm.cmd', args }
  }
  return { command, args }
}

function locateNpmCli() {
  if (npmCliPath !== undefined) return npmCliPath
  npmCliPath = ''

  if (process.platform !== 'win32') return npmCliPath

  const where = spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8' })
  const npmCmd = where.status === 0 ? where.stdout.split(/\r?\n/).find(Boolean) : undefined
  if (!npmCmd) return npmCliPath

  const candidate = join(dirname(npmCmd), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(candidate)) npmCliPath = candidate
  return npmCliPath
}

async function findPrepackagedApp(platform, arch) {
  const outDir = join(root, 'out')
  const candidates = await fs.readdir(outDir, { withFileTypes: true }).catch(() => [])
  const suffix = `-${platform}-${arch}`
  const matches = candidates
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => join(outDir, entry.name))

  for (const candidate of matches) {
    if (platform === 'darwin') {
      const appPath = await findFile(candidate, (full) => basename(full) === 'Token Companion.app')
      if (appPath) return appPath
    } else if (platform === 'win32') {
      if (existsSync(join(candidate, 'resources', 'app.asar'))) return candidate
    } else if (existsSync(join(candidate, 'resources', 'app.asar'))) {
      return candidate
    }
  }

  throw new Error(`Could not find packaged app for ${platform}/${arch} under out/`)
}

async function findFile(start, predicate) {
  const entries = await fs.readdir(start, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(start, entry.name)
    if (predicate(full)) return full
    if (entry.isDirectory()) {
      const nested = await findFile(full, predicate)
      if (nested) return nested
    }
  }
  return undefined
}
