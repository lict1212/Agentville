import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { T } from '../i18n'

export interface SwitcherItem {
  id: string
  name: string
  cliCommand?: string
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
}

interface SessionSwitcherProps {
  items: SwitcherItem[]
  index: number
  onHover: (index: number) => void
  onPick: (index: number) => void
}

// Mirrors ProjectItem's CLI avatar palette so the switcher reads identically to the sidebar.
const CLI_AVATAR: Record<string, { letter: string; color: string; bg: string }> = {
  claude: { letter: 'C', color: 'var(--accent-blue)', bg: '#1f3f6e' },
  gemini: { letter: 'G', color: '#d2a8ff', bg: '#3d1f6e' },
  codex: { letter: 'X', color: 'var(--status-working)', bg: '#1a3a1f' },
  aider: { letter: 'A', color: 'var(--status-warn)', bg: '#3a2a0e' },
}

function avatarOf(cliCommand?: string) {
  const key = (cliCommand ?? 'claude').trim().split(/\s+/)[0].toLowerCase()
  return CLI_AVATAR[key] ?? { letter: key[0]?.toUpperCase() ?? '?', color: 'var(--text-secondary)', bg: 'var(--bg-card-hover)' }
}

function dotColor(status: SwitcherItem['status']) {
  return status === 'working' ? 'var(--status-working)'
    : status === 'needs_confirmation' ? 'var(--status-confirm)'
    : status === 'waiting' ? 'var(--accent-blue)' : 'var(--text-muted)'
}

export function SessionSwitcher({ items, index, onHover, onPick }: SessionSwitcherProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the highlighted row scrolled into view when navigating a long list.
  useEffect(() => {
    const row = listRef.current?.children[index] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10050, backgroundColor: 'rgba(0,0,0,0.32)' }}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: 380,
          maxHeight: '70vh',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="px-4 pt-3 pb-2 text-xs font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t.switcherTitle}
        </div>

        <div ref={listRef} className="px-2 pb-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 84px)' }}>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.switcherEmpty}
            </div>
          ) : (
            items.map((item, i) => {
              const avatar = avatarOf(item.cliCommand)
              const active = i === index
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                  style={{ backgroundColor: active ? 'var(--bg-card-hover)' : 'transparent' }}
                  onMouseEnter={() => onHover(i)}
                  onMouseDown={(e) => { e.preventDefault(); onPick(i) }}
                >
                  <div className="relative flex-shrink-0" style={{ width: 28, height: 28 }}>
                    <div
                      className="w-full h-full rounded-lg flex items-center justify-center font-bold"
                      style={{ backgroundColor: avatar.bg, color: avatar.color, fontSize: 11 }}
                    >
                      {avatar.letter}
                    </div>
                    <span
                      className="absolute w-2 h-2 rounded-full border"
                      style={{ backgroundColor: dotColor(item.status), borderColor: 'var(--bg-card)', bottom: -1, right: -1 }}
                    />
                  </div>
                  <span
                    className="flex-1 min-w-0 truncate text-sm"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400 }}
                  >
                    {item.name}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div
          className="px-4 py-2 text-[11px] border-t"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >
          {t.switcherHint}
        </div>
      </div>
    </div>,
    document.body,
  )
}
