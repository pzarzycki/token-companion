#!/usr/bin/env node
import { createWriteStream, existsSync, promises as fs } from 'node:fs'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as tar from 'tar'

const repo = 'pzarzycki/token-companion'
const args = process.argv.slice(2)
const npmPackageVersion = process.env.npm_package_version ?? '0.1.3'
const defaultRef = `v${npmPackageVersion}`
const version = parseVersion(args)
const localSourceOverride = process.env.TOKEN_COMPANION_SOURCE_DIR

function parseVersion(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--version') return argv[index + 1] ?? defaultRef
    if (arg.startsWith('--version=')) return arg.slice('--version='.length)
  }
  return defaultRef
}

function refKind(ref) {
  return ref === 'main' || ref === 'master' ? 'heads' : 'tags'
}

function safeRef(ref) {
  return ref.replace(/[^A-Za-z0-9._-]/g, '-')
}

function download(url, target) {
  return new Promise((resolvePromise, rejectPromise) => {
    const file = createWriteStream(target)
    get(
      url,
      {
        headers: {
          'user-agent': `token-companion/${npmPackageVersion}`
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close()
          fs.rm(target, { force: true }).then(() => download(response.headers.location, target).then(resolvePromise, rejectPromise))
          return
        }

        if (response.statusCode !== 200) {
          file.close()
          rejectPromise(new Error(`Download failed with status ${response.statusCode} for ${url}`))
          return
        }

        response.pipe(file)
        file.on('finish', () => file.close(() => resolvePromise(undefined)))
      }
    ).on('error', (error) => {
      file.close()
      rejectPromise(error)
    })
  })
}

async function main() {
  let sourceDir
  if (localSourceOverride) {
    sourceDir = resolve(localSourceOverride)
    console.log(`Using local Token Companion source from ${sourceDir}`)
  } else {
    let ref = version
    const buildRoot = join(tmpdir(), 'token-companion-npm')
    await fs.mkdir(buildRoot, { recursive: true })

    async function prepareSource(targetRef) {
      const extractedDir = join(buildRoot, `source-${safeRef(targetRef)}`)
      const archivePath = join(buildRoot, `source-${safeRef(targetRef)}.tar.gz`)
      const sourceUrl = `https://github.com/${repo}/archive/refs/${refKind(targetRef)}/${targetRef}.tar.gz`

      await fs.rm(extractedDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      await fs.rm(archivePath, { force: true })
      console.log(`Downloading Token Companion source from ${sourceUrl}`)
      await download(sourceUrl, archivePath)
      await fs.mkdir(extractedDir, { recursive: true })
      await tar.x({ file: archivePath, cwd: extractedDir, strip: 1 })
      return extractedDir
    }

    try {
      sourceDir = await prepareSource(ref)
    } catch (error) {
      if (ref === defaultRef) {
        ref = 'main'
        console.log(`Falling back to ${ref} because ${defaultRef} is not available yet.`)
        sourceDir = await prepareSource(ref)
      } else {
        throw error
      }
    }
  }

  const installer = resolve(sourceDir, 'scripts', 'install.mjs')
  if (!existsSync(installer)) throw new Error(`Downloaded source is missing installer: ${installer}`)

  const result = spawnSync(process.execPath, [installer, ...args], {
    cwd: sourceDir,
    stdio: 'inherit',
    env: process.env
  })

  if (result.error) throw result.error
  process.exit(result.status ?? 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
