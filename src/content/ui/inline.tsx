import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import css from './overlay.css?inline'
import type { SortableSurface } from '../../lib/types'

interface Placement {
  host: HTMLElement
  mount: HTMLElement
  hidden: Map<HTMLElement, string>
}

function profileTabBar(main: Element, surface: SortableSurface): Element | null {
  const tablist = main.querySelector('[role="tablist"]')
  if (tablist) return tablist
  if (!('username' in surface)) return null
  const name = surface.username
  const link =
    main.querySelector(`a[href="/${name}/reels/"]`) ||
    main.querySelector(`a[href="/${name}/tagged/"]`) ||
    main.querySelector(`a[href="/${name}/saved/"]`)
  return link?.parentElement?.parentElement ?? null
}

function hideFrom(start: Element, main: Element, hidden: Map<HTMLElement, string>, host: HTMLElement): void {
  const hide = (node: Element) => {
    if (!(node instanceof HTMLElement) || node === host || node.contains(host)) return
    if (!hidden.has(node)) hidden.set(node, node.style.display)
    node.style.display = 'none'
  }
  hide(start)
  for (let level: Element | null = start; level && level !== main; level = level.parentElement) {
    for (let sibling = level.nextElementSibling; sibling; sibling = sibling.nextElementSibling) hide(sibling)
  }
}

function place(surface: SortableSurface, existing: Placement | null): Placement | null {
  const main = document.querySelector('main')
  if (!main) return null
  const placement =
    existing ??
    (() => {
      const host = document.createElement('div')
      host.id = 'ifs-inline'
      host.style.cssText = 'display:block;width:100%;'
      const shadow = host.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = css
      const mount = document.createElement('div')
      mount.className = 'inline-root'
      shadow.append(style, mount)
      return { host, mount, hidden: new Map<HTMLElement, string>() }
    })()

  const bar = profileTabBar(main, surface)
  if (bar?.parentElement) {
    if (!placement.host.isConnected) bar.parentElement.insertBefore(placement.host, bar)
    hideFrom(bar, main, placement.hidden, placement.host)
    return placement
  }

  const container = main.firstElementChild ?? main
  if (!placement.host.isConnected) container.insertBefore(placement.host, container.firstChild)
  for (const child of Array.from(container.children)) {
    if (child === placement.host || !(child instanceof HTMLElement)) continue
    if (!placement.hidden.has(child)) placement.hidden.set(child, child.style.display)
    child.style.display = 'none'
  }
  return placement
}

function restore(placement: Placement): void {
  for (const [node, display] of placement.hidden) node.style.display = display
  placement.hidden.clear()
  placement.host.remove()
}

export function InlinePanel({ surface, children }: { surface: SortableSurface; children: ReactNode }) {
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = place(surface, null)
    setPlacement(current)
    setFailed(!current)
    window.scrollTo(0, 0)
    const timer = window.setInterval(() => {
      const next = place(surface, current)
      if (next !== current) {
        current = next
        setPlacement(next)
        setFailed(!next)
      }
    }, 1000)
    return () => {
      window.clearInterval(timer)
      if (current) restore(current)
    }
  }, [surface])

  if (placement) return createPortal(children, placement.mount)
  if (failed) return <div className="shell">{children}</div>
  return null
}
