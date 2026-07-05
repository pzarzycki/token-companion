#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const ref = process.argv[2] ?? process.env.GITHUB_REF ?? ''
const packagePath = process.argv[3] ?? new URL('../package.json', import.meta.url)
if (!ref) {
  console.error('Missing Git ref. Pass a ref or set GITHUB_REF.')
  process.exit(1)
}

const match = /^refs\/tags\/v(.+)$/.exec(ref)
if (!match) {
  console.error(`Expected a version tag ref like refs/tags/v1.2.3, got: ${ref}`)
  process.exit(1)
}

const tagVersion = match[1]
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))

if (pkg.version !== tagVersion) {
  console.error(`package.json version ${pkg.version} does not match tag version ${tagVersion}`)
  process.exit(1)
}

console.log(`Verified package version ${pkg.version} matches tag v${tagVersion}`)
