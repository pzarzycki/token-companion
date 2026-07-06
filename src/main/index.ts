import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppInfo, PricingTable, SourceId } from '@shared/types'
import { scanAll } from './scan'
import { loadPricing, savePricing, resetPricing } from './pricing'
import { parseSessionEntries } from './parsers/sessionEntries'
import { parseCodexSessionEntries } from './parsers/codexSessionEntries'
import { isAllowedSessionFile } from './sources'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string

// Some Windows environments fail to initialize Chromium's GPU process and end up
// with a blank renderer surface or a fatal startup exit. This app is mostly
// charts and tables, so software rendering is an acceptable fallback.
app.disableHardwareAcceleration()

app.setName('Token Companion')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.pzarzycki.tokencompanion')
}

const REPO_URL = 'https://github.com/pzarzycki/token-companion'
const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`
const LATEST_RELEASE_API_URL =
  'https://api.github.com/repos/pzarzycki/token-companion/releases/latest'
const UPDATE_CHECK_DELAY_MS = 1500
const UPDATE_CHECK_TIMEOUT_MS = 3000

let appInfoPromise: Promise<void> | null = null
let appInfoState: AppInfo = {
  version: app.getVersion(),
  repoUrl: REPO_URL,
  hasUpdate: false,
  latestVersion: null,
  latestUrl: LATEST_RELEASE_URL
}

function normalizeVersion(raw: string): number[] {
  const match = raw.trim().replace(/^v/i, '').match(/^\d+(?:\.\d+)*/)
  if (!match) return [0]
  return match[0].split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function isVersionNewer(candidate: string, current: string): boolean {
  const left = normalizeVersion(candidate)
  const right = normalizeVersion(current)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const a = left[i] ?? 0
    const b = right[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

function broadcastAppInfo(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.onAppInfoChanged, appInfoState)
    }
  }
}

async function refreshAppInfo(): Promise<void> {
  const version = appInfoState.version
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `token-companion/${version}`
      },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`GitHub update check failed: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
    const latestVersion =
      typeof payload.tag_name === 'string' ? payload.tag_name.replace(/^v/i, '') : null
    const latestUrl = typeof payload.html_url === 'string' ? payload.html_url : LATEST_RELEASE_URL

    if (!latestVersion) {
      throw new Error('GitHub update check failed: release tag_name missing')
    }

    appInfoState = {
      version,
      repoUrl: REPO_URL,
      hasUpdate: isVersionNewer(latestVersion, version),
      latestVersion,
      latestUrl
    }
    broadcastAppInfo()
  } catch (error) {
    console.error('Update check failed', error)
  } finally {
    clearTimeout(timeout)
  }
}

function scheduleStartupUpdateCheck(): void {
  setTimeout(() => {
    if (!appInfoPromise) {
      appInfoPromise = refreshAppInfo().finally(() => {
        appInfoPromise = null
      })
    }
  }, UPDATE_CHECK_DELAY_MS)
}

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function openExternalUrl(rawUrl: string): void {
  if (!isAllowedExternalUrl(rawUrl)) return
  void shell.openExternal(rawUrl)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Token Companion',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.webContents.session.setPermissionCheckHandler(() => false)
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    openExternalUrl(url)
  })

  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
}

function registerIpc(): void {
  ipcMain.handle(IPC.scan, async () => scanAll())
  ipcMain.handle(IPC.getPricing, async () => loadPricing())
  ipcMain.handle(IPC.getAppInfo, async () => appInfoState)
  ipcMain.handle(IPC.savePricing, async (_e, table: PricingTable) => {
    await savePricing(table)
    return table
  })
  ipcMain.handle(IPC.resetPricing, async () => resetPricing())
  ipcMain.handle(
    IPC.getSessionEntries,
    async (_e, filePath: string, sessionId: string, source: SourceId) => {
      if (!isAllowedSessionFile(filePath, source)) {
        throw new Error(`Refusing to read non-session file: ${filePath}`)
      }

      return source === 'codex'
        ? parseCodexSessionEntries(filePath, sessionId)
        : parseSessionEntries(filePath, sessionId)
    }
  )
}

function setDevDockIcon(): void {
  if (app.isPackaged || process.platform !== 'darwin' || !app.dock) return
  const iconPath = join(app.getAppPath(), 'resources', 'icon.png')
  if (existsSync(iconPath)) app.dock.setIcon(iconPath)
}

app.whenReady().then(() => {
  setDevDockIcon()
  registerIpc()
  createWindow()
  scheduleStartupUpdateCheck()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
