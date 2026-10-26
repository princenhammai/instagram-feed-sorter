import { createRoot } from 'react-dom/client'
import { init, onMessage } from './controller'
import css from './ui/overlay.css?inline'
import { App } from './ui/App'

function controlIn(event: Event): HTMLElement | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement) return node
    if (node instanceof HTMLLabelElement) {
      const nested = node.querySelector('textarea, input, select')
      if (nested instanceof HTMLElement) return nested
    }
  }
  return null
}

const flag = globalThis as typeof globalThis & { __IFS_BOOTED__?: boolean }
if (!flag.__IFS_BOOTED__) {
  flag.__IFS_BOOTED__ = true
  const host = document.createElement('div')
  host.id = 'ifs-root'
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const mount = document.createElement('div')
  shadow.append(style, mount)
  document.documentElement.append(host)
  const blockPageShortcuts = (event: Event) => {
    if (event.composedPath().includes(host)) event.stopPropagation()
  }
  const focusPanelField = (event: Event) => {
    if (!event.composedPath().includes(host)) return
    event.stopPropagation()
    const field = controlIn(event)
    if (field && host.shadowRoot?.activeElement !== field) field.focus()
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, blockPageShortcuts, true)
  }
  for (const type of ['pointerdown', 'mousedown']) {
    window.addEventListener(type, focusPanelField, true)
  }
  createRoot(mount).render(<App />)
  init()
  chrome.runtime.onMessage.addListener(onMessage)
}
