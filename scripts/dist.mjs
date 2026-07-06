#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const platformArg = process.argv[2] ?? platformToBuilder(process.platform)
const archArg = process.argv[3] ?? process.arch
const macBundleId = 'com.pzarzycki.tokencompanion'
const macDistDir = join(root, 'out', 'dist')
const macBuildMetaPath = join(root, 'out', 'mac-build.json')
const macHelperBundleIds = new Map([
  ['Token Companion Helper.app', `${macBundleId}.helper`],
  ['Token Companion Helper (GPU).app', `${macBundleId}.helper.GPU`],
  ['Token Companion Helper (Renderer).app', `${macBundleId}.helper.Renderer`],
  ['Token Companion Helper (Plugin).app', `${macBundleId}.helper.Plugin`]
])
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
  let prepackaged = await findPrepackagedApp(forgePlatform, archArg)
  await fs.rm(macDistDir, { recursive: true, force: true })
  await fs.mkdir(macDistDir, { recursive: true })
  if (platformArg === 'mac') {
    prepackaged = await repairMacApp(prepackaged)
    await writeMacBuildMetadata(prepackaged)
  }
  const builderEnv = {
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false',
    APPLE_ID: process.env.APPLE_ID ?? '',
    APPLE_APP_SPECIFIC_PASSWORD: process.env.APPLE_APP_SPECIFIC_PASSWORD ?? ''
  }

  if (!process.env.CSC_LINK) builderEnv.CSC_LINK = ''
  if (!process.env.CSC_KEY_PASSWORD) builderEnv.CSC_KEY_PASSWORD = ''

  runBuilder(
    ['--publish', 'never', `--${platformArg}`, archFlag(archArg), '--config', 'electron-builder.yml', '--prepackaged', prepackaged],
    builderEnv
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
  const result = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  })
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

function spawn(command, args, options = {}) {
  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? 'pipe',
    encoding: options.encoding
  })
  if (result.error) throw result.error
  return result
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

async function repairMacApp(appPath) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS bundle repair requires a macOS runner')
  }

  console.log(`Repairing macOS app bundle: ${appPath}`)
  await validateMacBundleShape(appPath)
  await stripMacSignatures(appPath)

  run('codesign', ['--force', '--deep', '--sign', '-', appPath])
  run('codesign', ['--verify', '--deep', '--strict', appPath])
  run('codesign', ['-dv', '--verbose=4', appPath])

  return appPath
}

async function validateMacBundleShape(appPath) {
  const infoPlist = join(appPath, 'Contents', 'Info.plist')
  const bundleId = readPlistValue(infoPlist, 'CFBundleIdentifier')
  if (bundleId !== macBundleId) {
    throw new Error(`Unexpected macOS bundle id: ${bundleId}`)
  }

  const frameworksDir = join(appPath, 'Contents', 'Frameworks')
  for (const [helperName, helperBundleId] of macHelperBundleIds) {
    const helperPath = join(frameworksDir, helperName)
    if (!existsSync(helperPath)) {
      throw new Error(`Missing helper app: ${helperName}`)
    }

    const helperInfoPlist = join(helperPath, 'Contents', 'Info.plist')
    const actualBundleId = readPlistValue(helperInfoPlist, 'CFBundleIdentifier')
    if (actualBundleId !== helperBundleId) {
      throw new Error(`Unexpected helper bundle id for ${helperName}: ${actualBundleId}`)
    }
  }

  const electronHelpers = await findPaths(frameworksDir, (full) => basename(full).startsWith('Electron Helper'))
  if (electronHelpers.length) {
    throw new Error(`Found stale Electron helper bundle names:\n${electronHelpers.join('\n')}`)
  }
}

async function stripMacSignatures(appPath) {
  const targets = await macSignatureTargets(appPath)
  for (const target of targets) {
    if (hasCodeSignature(target)) {
      console.log(`Removing signature: ${target}`)
      run('codesign', ['--remove-signature', target])
    }
  }

  const staleSignaturePaths = await findPaths(appPath, (full) => {
    const name = basename(full)
    return name === '_CodeSignature' || name === 'CodeResources'
  })

  for (const stalePath of staleSignaturePaths.sort((left, right) => right.length - left.length)) {
    console.log(`Removing stale signature data: ${stalePath}`)
    await fs.rm(stalePath, { recursive: true, force: true })
  }
}

async function macSignatureTargets(appPath) {
  const targets = [appPath]
  const frameworksDir = join(appPath, 'Contents', 'Frameworks')

  for (const helperName of macHelperBundleIds.keys()) {
    const helperPath = join(frameworksDir, helperName)
    targets.push(helperPath)
    const helperExecutable = await bundleExecutablePath(helperPath)
    if (helperExecutable) targets.push(helperExecutable)
  }

  const appExecutable = await bundleExecutablePath(appPath)
  if (appExecutable) targets.push(appExecutable)

  return [...new Set(targets)]
}

async function bundleExecutablePath(appPath) {
  const infoPlist = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(infoPlist)) return undefined
  const executable = readPlistValue(infoPlist, 'CFBundleExecutable')
  return join(appPath, 'Contents', 'MacOS', executable)
}

async function writeMacBuildMetadata(appPath) {
  const payload = {
    repairedAppPath: appPath
  }
  await fs.writeFile(macBuildMetaPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function hasCodeSignature(target) {
  const result = spawn('codesign', ['-dv', target], { stdio: 'pipe' })
  return result.status === 0
}

function readPlistValue(plistPath, key) {
  const result = spawn('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath], {
    stdio: 'pipe',
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    const message = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`Failed to read ${key} from ${plistPath}${message ? `\n${message}` : ''}`)
  }
  return result.stdout.trim()
}

async function findPaths(start, predicate) {
  const out = []
  const entries = await fs.readdir(start, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const full = join(start, entry.name)
    if (predicate(full)) out.push(full)
    if (entry.isDirectory()) out.push(...(await findPaths(full, predicate)))
  }

  return out
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
