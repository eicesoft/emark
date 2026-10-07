// Wails bridge: safe to import in plain vite dev (no Wails runtime).
import { ClipboardGetText, ClipboardSetText, EventsOn } from '../wailsjs/runtime/runtime'
import { ExportMarkdown as goExportMarkdown, SaveMarkdown as goSaveMarkdown } from '../wailsjs/go/main/App'

interface WailsWindow extends Window {
  runtime?: unknown
  go?: unknown
}

export const inWails: boolean =
  typeof window !== 'undefined' && !!(window as WailsWindow).runtime && !!(window as WailsWindow).go

/** Subscribe to a Wails menu event. No-op outside Wails. Returns unsubscribe. */
export function onMenuEvent(name: string, callback: (...data: any[]) => void): () => void {
  if (!inWails) return () => {}
  return EventsOn(name, callback)
}

/** Native save-dialog export. Rejects on error. */
export function nativeExport(content: string): Promise<string> {
  return goExportMarkdown(content)
}

/** Native save: writes to last opened file, or save dialog. Rejects on error. */
export function nativeSave(content: string): Promise<string> {
  return goSaveMarkdown(content)
}

export async function clipGet(): Promise<string> {
  if (inWails) return ClipboardGetText()
  return navigator.clipboard.readText()
}

export async function clipSet(text: string): Promise<void> {
  if (inWails) {
    await ClipboardSetText(text)
    return
  }
  await navigator.clipboard.writeText(text)
}
