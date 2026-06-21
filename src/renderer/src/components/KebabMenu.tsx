import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

const SUBMENU_WIDTH = 180
const SUBMENU_MARGIN = 8
const MENU_MIN_WIDTH = 160
const VIEWPORT_EDGE_MARGIN = 8
const TRIGGER_GAP = 4

export interface KebabMenuItem {
  key: string
  label: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
  // If provided, hovering the item opens a submenu with these entries.
  submenu?: KebabMenuItem[]
}

interface KebabMenuProps {
  items: KebabMenuItem[]
  /** ARIA / title text for the trigger button. */
  label?: string
  /** Override trigger styles; useful when the surrounding card has a custom look. */
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  /** Called before a selection fires — use to close parent containers, etc. */
  onBeforeSelect?: () => void
  /** Align menu to right (default) or left edge. */
  align?: 'left' | 'right'
  /** Notifies caller when the menu opens/closes (e.g. to keep the trigger visible). */
  onOpenChange?: (open: boolean) => void
}

interface MenuPosition {
  top: number
  left: number
}

interface SubMenuPosition {
  top: number
  left: number
}

export function KebabMenu({
  items,
  label,
  triggerClassName,
  triggerStyle,
  onBeforeSelect,
  align = 'right',
  onOpenChange,
}: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const [subOpenKey, setSubOpenKey] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)
  const [subPos, setSubPos] = useState<SubMenuPosition | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // Small helper so every state change stays in sync with onOpenChange.
  const setOpenState = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) {
      setSubOpenKey(null)
      setMenuPos(null)
      setSubPos(null)
    }
  }

  // Outside-click: portal means the menu is not inside triggerRef's subtree,
  // so check both trigger and the menu (and any open submenu).
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      if (subMenuRef.current?.contains(target)) return
      setOpenState(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)

  }, [open])

  // Close on scroll (anywhere) / resize — simpler and matches user expectation
  // (a pop-over that "sticks" while scrolling inside the sidebar looks broken).
  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpenState(false)
    const onResize = () => setOpenState(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }

  }, [open])

  // Initial menu position — compute from trigger rect.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    // Measured size (after mount) gives precise alignment; fall back to mins
    // before we know.
    const measuredWidth = menuRef.current?.offsetWidth ?? MENU_MIN_WIDTH
    const measuredHeight = menuRef.current?.offsetHeight ?? 0
    const width = Math.max(measuredWidth, MENU_MIN_WIDTH)
    let left: number
    if (align === 'left') {
      left = rect.left
    } else {
      left = rect.right - width
    }
    // Clamp horizontally into viewport.
    if (left + width + VIEWPORT_EDGE_MARGIN > window.innerWidth) {
      left = window.innerWidth - width - VIEWPORT_EDGE_MARGIN
    }
    if (left < VIEWPORT_EDGE_MARGIN) left = VIEWPORT_EDGE_MARGIN
    // Flip up if there is not enough room below.
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const needsFlip =
      measuredHeight > 0 &&
      spaceBelow < measuredHeight + TRIGGER_GAP + VIEWPORT_EDGE_MARGIN &&
      spaceAbove > spaceBelow
    const top = needsFlip
      ? Math.max(VIEWPORT_EDGE_MARGIN, rect.top - measuredHeight - TRIGGER_GAP)
      : rect.bottom + TRIGGER_GAP
    setMenuPos({ top, left })

  }, [open, align])

  // Re-measure after the menu mounts so alignment uses real size.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const width = menuRef.current.offsetWidth
    const height = menuRef.current.offsetHeight
    let left: number
    if (align === 'left') {
      left = rect.left
    } else {
      left = rect.right - width
    }
    if (left + width + VIEWPORT_EDGE_MARGIN > window.innerWidth) {
      left = window.innerWidth - width - VIEWPORT_EDGE_MARGIN
    }
    if (left < VIEWPORT_EDGE_MARGIN) left = VIEWPORT_EDGE_MARGIN
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const needsFlip =
      spaceBelow < height + TRIGGER_GAP + VIEWPORT_EDGE_MARGIN &&
      spaceAbove > spaceBelow
    const top = needsFlip
      ? Math.max(VIEWPORT_EDGE_MARGIN, rect.top - height - TRIGGER_GAP)
      : rect.bottom + TRIGGER_GAP
    setMenuPos((prev) => {
      if (prev && prev.top === top && prev.left === left) return prev
      return { top, left }
    })

  }, [open, align, items.length])

  // Submenu position — based on the hovered item's rect, flipped if needed.
  useLayoutEffect(() => {
    if (!subOpenKey) {
      setSubPos(null)
      return
    }
    const itemEl = itemRefs.current.get(subOpenKey)
    if (!itemEl) return
    const rect = itemEl.getBoundingClientRect()
    const overflowsRight =
      rect.right + SUBMENU_WIDTH + SUBMENU_MARGIN > window.innerWidth
    const left = overflowsRight
      ? rect.left - SUBMENU_WIDTH - 4
      : rect.right + 4
    // Clamp vertically so a long submenu near the viewport bottom doesn't
    // get clipped — align its bottom to the hovered item if needed.
    const subHeight = subMenuRef.current?.offsetHeight ?? 0
    let top = rect.top
    if (subHeight > 0 && top + subHeight + VIEWPORT_EDGE_MARGIN > window.innerHeight) {
      top = Math.max(VIEWPORT_EDGE_MARGIN, rect.bottom - subHeight)
    }
    setSubPos({ top, left })
  }, [subOpenKey])

  return (
    <div
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ??
          'p-1.5 rounded-md transition-all'
        }
        style={
          triggerStyle ?? { color: 'var(--text-secondary)', backgroundColor: 'transparent' }
        }
        onClick={(e) => {
          e.stopPropagation()
          setOpenState(!open)
        }}
        onMouseEnter={(e) => {
          if (!triggerStyle) {
            const el = e.currentTarget as HTMLElement
            el.style.color = 'var(--text-primary)'
            el.style.backgroundColor = 'var(--bg-card-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!triggerStyle) {
            const el = e.currentTarget as HTMLElement
            el.style.color = 'var(--text-secondary)'
            el.style.backgroundColor = 'transparent'
          }
        }}
        title={label}
      >
        <MoreVertical size={14} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="rounded-xl border shadow-2xl overflow-visible"
          style={{
            position: 'fixed',
            top: menuPos?.top ?? -9999,
            left: menuPos?.left ?? -9999,
            // Hide until we have a measured position, so we don't flash at (0,0).
            visibility: menuPos ? 'visible' : 'hidden',
            backgroundColor: 'var(--bg-sidebar)',
            borderColor: 'var(--border)',
            minWidth: MENU_MIN_WIDTH,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => {
            const hasSub = !!item.submenu && item.submenu.length > 0
            const isSubOpen = subOpenKey === item.key
            return (
              <div
                key={item.key}
                className="relative"
                ref={(el) => {
                  if (hasSub) {
                    itemRefs.current.set(item.key, el)
                  } else {
                    itemRefs.current.delete(item.key)
                  }
                  // Explicit void return: Map#set returns the Map (truthy),
                  // which some React typings treat as a cleanup function.
                  return undefined
                }}
                onMouseEnter={() => {
                  if (hasSub) setSubOpenKey(item.key)
                  else setSubOpenKey(null)
                }}
              >
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (item.disabled) return
                    if (hasSub) {
                      setSubOpenKey((k) => (k === item.key ? null : item.key))
                      return
                    }
                    onBeforeSelect?.()
                    item.onSelect()
                    setOpenState(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors disabled:opacity-40"
                  style={{
                    color: item.danger ? 'var(--status-confirm)' : 'var(--text-primary)',
                    backgroundColor: 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (item.disabled) return
                    const el = e.currentTarget as HTMLElement
                    el.style.backgroundColor = item.danger ? '#2d1e1e' : 'var(--bg-card)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement
                    el.style.backgroundColor = 'transparent'
                  }}
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasSub && <span style={{ color: '#6e7681' }}>▸</span>}
                </button>

                {hasSub && isSubOpen && createPortal(
                  <div
                    ref={subMenuRef}
                    className="rounded-xl border shadow-2xl overflow-hidden"
                    style={{
                      position: 'fixed',
                      top: subPos?.top ?? -9999,
                      left: subPos?.left ?? -9999,
                      visibility: subPos ? 'visible' : 'hidden',
                      backgroundColor: 'var(--bg-sidebar)',
                      borderColor: 'var(--border)',
                      minWidth: SUBMENU_WIDTH,
                      zIndex: 1001,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.submenu!.map((sub) => (
                      <button
                        key={sub.key}
                        type="button"
                        disabled={sub.disabled}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (sub.disabled) return
                          onBeforeSelect?.()
                          sub.onSelect()
                          setOpenState(false)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors disabled:opacity-40"
                        style={{
                          color: sub.danger ? 'var(--status-confirm)' : 'var(--text-primary)',
                          backgroundColor: 'transparent',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                          if (sub.disabled) return
                          const el = e.currentTarget as HTMLElement
                          el.style.backgroundColor = sub.danger ? '#2d1e1e' : 'var(--bg-card)'
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLElement
                          el.style.backgroundColor = 'transparent'
                        }}
                      >
                        {sub.icon && <span className="flex-shrink-0">{sub.icon}</span>}
                        <span className="flex-1 text-left">{sub.label}</span>
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
