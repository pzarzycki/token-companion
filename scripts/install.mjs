#!/usr/bin/env node
import { existsSync, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const platform = process.platform
const arch = process.arch
const macBuildMetaPath = join(root, 'out', 'mac-build.json')

const options = parseArgs(process.argv.slice(2))
let npmCliPath

function parseArgs(args) {
  const out = {
    dryRun: false,
    packageOnly: false,
    installDir: undefined,
    help: false
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--package-only') out.packageOnly = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--install-dir') out.installDir = requireValue(args, ++i, arg)
    else if (arg.startsWith('--install-dir=')) out.installDir = arg.slice('--install-dir='.length)
    else if (arg === '--version') i += 1
    else if (arg.startsWith('--version=')) continue
    else throw new Error(`Unknown option: ${arg}`)
  }

  return out
}

function requireValue(args, index, name) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function usage() {
  console.log(`Token Companion source installer

Usage:
  npx token-companion [options]

Options:
  --dry-run              Print commands and install targets without building.
  --package-only         Build packages but do not copy/install the built app.
  --install-dir <path>   Install destination. Supported on macOS only.
  --help                 Show this help.
`)
}

function commandLine(command, args) {
  return [command, ...args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(' ')
}

function spawnCommand(command) {
  if (platform !== 'win32') return command
  if (command === 'where') return 'where.exe'
  return command
}

function locateNpmCli() {
  if (npmCliPath !== undefined) return npmCliPath
  npmCliPath = ''

  if (platform !== 'win32') return npmCliPath

  const where = spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8' })
  const npmCmd = where.status === 0 ? where.stdout.split(/\r?\n/).find(Boolean) : undefined
  if (!npmCmd) return npmCliPath

  const candidate = join(dirname(npmCmd), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(candidate)) npmCliPath = candidate
  return npmCliPath
}

function commandInvocation(command, args) {
  if (command === 'npm' && platform === 'win32') {
    const npmCli = locateNpmCli()
    if (npmCli) return { command: process.execPath, args: [npmCli, ...args] }
  }

  return { command: spawnCommand(command), args }
}

function run(command, args, runOptions = {}) {
  console.log(`> ${commandLine(command, args)}`)
  if (options.dryRun) return

  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: runOptions.cwd ?? root,
    env: { ...process.env, ...runOptions.env },
    stdio: 'inherit'
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function hasCommand(command, args = ['--version']) {
  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    stdio: 'ignore'
  })
  return result.status === 0
}

async function readPackage() {
  const text = await fs.readFile(join(root, 'package.json'), 'utf8')
  return JSON.parse(text)
}

async function assertRepoShape() {
  const required = ['package.json', 'forge.config.ts', 'src', 'resources']
  for (const entry of required) {
    if (!existsSync(join(root, entry))) throw new Error(`Missing required project entry: ${entry}`)
  }
}

function installCommand() {
  return existsSync(join(root, 'package-lock.json')) ? ['ci'] : ['install']
}

function assertSupportedPlatform() {
  if (!['darwin', 'win32', 'linux'].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  if (!Number.isFinite(major) || major < 24) {
    throw new Error(`Node.js 24 or newer is required. Current version: ${process.version}`)
  }
}

function assertPrereqs() {
  assertSupportedPlatform()
  assertNodeVersion()
  if (!hasCommand('npm')) throw new Error('npm is required but was not found on PATH')

  if (platform === 'darwin' && !hasCommand('xcode-select', ['-p'])) {
    throw new Error('Xcode Command Line Tools are required. Install them with: xcode-select --install')
  }

  if (platform === 'linux') {
    const missing = []
    if (!hasCommand('python3')) missing.push('python3')
    if (!hasCommand('fakeroot')) missing.push('fakeroot')
    if (!hasCommand('dpkg')) missing.push('dpkg')
    if (!hasCommand('rpm')) missing.push('rpm')
    if (missing.length) {
      throw new Error(`Missing Linux build tools: ${missing.join(', ')}`)
    }
  }
}

function makeScriptName() {
  if (platform === 'darwin') return 'dist:mac'
  if (platform === 'win32') return 'dist:win'
  return 'dist:linux'
}

async function findFiles(start, predicate) {
  const out = []

  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && predicate(full)) out.push(full)
    }
  }

  await walk(start)
  return out
}

async function findMacApp() {
  let payload
  try {
    payload = JSON.parse(await fs.readFile(macBuildMetaPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read mac build metadata at ${macBuildMetaPath}\n${detail}`)
  }

  const app = payload?.repairedAppPath
  if (typeof app !== 'string' || app.length === 0) {
    throw new Error(`mac build metadata at ${macBuildMetaPath} does not contain repairedAppPath`)
  }
  if (!existsSync(app)) {
    throw new Error(`Repaired mac app not found: ${app}`)
  }
  return app
}

async function installMacApp() {
  const app = await findMacApp()
  const installDir = resolve(options.installDir ?? join(homedir(), 'Applications'))
  const dest = join(installDir, 'Token Companion.app')

  console.log(`macOS app: ${app}`)
  console.log(`Install target: ${dest}`)
  if (options.dryRun || options.packageOnly) return

  await fs.mkdir(installDir, { recursive: true })
  await fs.rm(dest, { recursive: true, force: true })
  await fs.cp(app, dest, { recursive: true })
  console.log(`Installed Token Companion to ${dest}`)
}

async function findWindowsInstaller() {
  const installers = await findFiles(join(root, 'out', 'dist'), (file) => file.endsWith('.exe'))
  const match = installers.find((file) => basename(file).toLowerCase().includes('token companion'))
  if (!match) throw new Error('Could not find Windows NSIS installer under out/dist/')
  return match
}

async function runWindowsInstaller() {
  if (options.installDir) {
    throw new Error('--install-dir is not supported on Windows because the NSIS installer runs in one-click mode.')
  }

  const installer = await findWindowsInstaller()
  console.log(`Windows installer: ${installer}`)
  if (options.dryRun || options.packageOnly) return
  run(installer, [])
}

async function installLinuxPackage() {
  const packages = await findFiles(join(root, 'out', 'dist'), (file) => file.endsWith('.deb') || file.endsWith('.rpm'))
  if (!packages.length) throw new Error('Could not find .deb or .rpm package under out/dist/')

  const deb = packages.find((file) => file.endsWith('.deb'))
  const rpm = packages.find((file) => file.endsWith('.rpm'))
  const osRelease = existsSync('/etc/os-release') ? await fs.readFile('/etc/os-release', 'utf8') : ''
  const useDeb = deb && /ID_LIKE=.*debian|ID=debian|ID=ubuntu/i.test(osRelease)
  const useRpm = rpm && /ID_LIKE=.*rhel|ID=fedora|ID=rhel|ID=centos/i.test(osRelease)
  const selected = useDeb ? deb : useRpm ? rpm : deb ?? rpm

  console.log(`Linux package: ${selected}`)
  if (options.packageOnly) {
    console.log('Package-only mode: install the package above with your distro package manager.')
    return
  }

  if (selected.endsWith('.deb')) run('sudo', ['apt', 'install', '-y', selected])
  else if (hasCommand('dnf')) run('sudo', ['dnf', 'install', '-y', selected])
  else run('sudo', ['rpm', '-Uvh', selected])
}

async function installBuiltArtifact() {
  if (options.dryRun) {
    if (platform === 'darwin') {
      const installDir = resolve(options.installDir ?? join(homedir(), 'Applications'))
      console.log(`Would copy Token Companion.app to ${join(installDir, 'Token Companion.app')}`)
    } else if (platform === 'win32') {
      if (options.installDir) {
        throw new Error('--install-dir is not supported on Windows because the NSIS installer runs in one-click mode.')
      }
      console.log('Would run the locally built Windows NSIS installer from out/dist.')
    } else {
      console.log('Would install the locally built .deb or .rpm package from out/dist.')
    }
    return
  }

  if (platform === 'darwin') await installMacApp()
  else if (platform === 'win32') await runWindowsInstaller()
  else await installLinuxPackage()
}

async function main() {
  if (options.help) {
    usage()
    return
  }

  await assertRepoShape()
  const pkg = await readPackage()

  console.log(`Token Companion ${pkg.version}`)
  console.log(`Project: ${root}`)
  console.log(`Platform: ${platform}/${arch}`)
  assertPrereqs()

  run('npm', installCommand())
  run('npm', ['run', 'typecheck'])
  run('npm', ['run', makeScriptName()], {
    env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  })
  await installBuiltArtifact()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
