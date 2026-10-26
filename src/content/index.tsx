import { createRoot } from 'react-dom/client'
import { init, onMessage } from './controller'
import css from './ui/overlay.css?inline'
import { App } from './ui/App'

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
  createRoot(mount).render(<App />)
  init()
  chrome.runtime.onMessage.addListener(onMessage)
}
