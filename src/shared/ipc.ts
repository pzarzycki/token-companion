import type {
  AppInfo,
  ScanResult,
  PricingTable,
  SessionEntries,
  SourceId
} from './types'

/** IPC channel names, shared between main and preload. */
export const IPC = {
  scan: 'scan',
  getPricing: 'pricing:get',
  savePricing: 'pricing:save',
  resetPricing: 'pricing:reset',
  getSessionEntries: 'session:entries',
  getAppInfo: 'app:info',
  onAppInfoChanged: 'app:info:changed'
} as const

/** Shape of the API exposed on window.api via contextBridge. */
export interface RendererApi {
  scan(): Promise<ScanResult>
  getPricing(): Promise<PricingTable>
  savePricing(table: PricingTable): Promise<PricingTable>
  resetPricing(): Promise<PricingTable>
  getSessionEntries(filePath: string, sessionId: string, source: SourceId): Promise<SessionEntries>
  getAppInfo(): Promise<AppInfo>
  onAppInfoChanged(listener: (info: AppInfo) => void): () => void
}
