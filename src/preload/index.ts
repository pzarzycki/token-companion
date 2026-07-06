import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RendererApi } from '@shared/ipc'
import type { PricingTable, SourceId } from '@shared/types'

const api: RendererApi = {
  scan: () => ipcRenderer.invoke(IPC.scan),
  getPricing: () => ipcRenderer.invoke(IPC.getPricing),
  savePricing: (table: PricingTable) => ipcRenderer.invoke(IPC.savePricing, table),
  resetPricing: () => ipcRenderer.invoke(IPC.resetPricing),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getSessionEntries: (filePath: string, sessionId: string, source: SourceId) =>
    ipcRenderer.invoke(IPC.getSessionEntries, filePath, sessionId, source)
}

contextBridge.exposeInMainWorld('api', api)
