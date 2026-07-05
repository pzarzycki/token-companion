import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { PricingTable, SourceId } from '@shared/types'
import { scanAll } from './scan'
import { loadPricing, savePricing, resetPricing } from './pricing'
import { parseSessionEntries } from './parsers/sessionEntries'
import { parseCodexSessionEntries } from './parsers/codexSessionEntries'

// Override the app name so the dock tooltip / menu bar don't show "Electron"
// in dev. Must run before app.whenReady(). In the packaged build productName
// already handles this, but calling it here is harmless and keeps dev in sync.
app.setName('Token Companion')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Token Companion',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // preload needs Node built-ins via the bridge
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
    async (_e, filePath: string, sessionId: string, source: SourceId) =>
      source === 'codex'
        ? parseCodexSessionEntries(filePath, sessionId)
        : parseSessionEntries(filePath, sessionId)
  )
}

// In dev, macOS shows the default Electron dock icon because the .icns is only
// applied by electron-builder when packaging. Set it explicitly so dev matches prod.
function setDevDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  // __dirname is out/main during dev → repo root is two levels up.
  const iconPath = join(__dirname, '../../resources/icon.png')
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
