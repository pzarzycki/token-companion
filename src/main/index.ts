import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { PricingTable, SourceId } from '@shared/types'
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
  app.setAppUserModelId('com.pawelzarzycki.tokencompanion')
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
