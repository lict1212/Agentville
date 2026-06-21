import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { T } from '../i18n'

export interface ConfirmOptions {
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
  /** Red destructive styling for the confirm button. Defaults to true. */
  danger?: boolean
}

type Resolver = (ok: boolean) => void

// Module-level handle registered by the mounted host. Lets any call site invoke
// `await confirmDialog(...)` imperatively without threading a hook through props.
let openRef: ((opts: ConfirmOptions, resolve: Resolver) => void) | null = null

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const options = typeof opts === 'string' ? { message: opts } : opts
  return new Promise((resolve) => {
    if (!openRef) {
      // Host not mounted yet — fall back to the native dialog so we never swallow a confirm.
      resolve(window.confirm(options.message))
      return
    }
    openRef(options, resolve)
  })
}

/** Mount once near the app root. Renders the themed confirm dialog on demand. */
export function ConfirmDialogHost(): React.ReactElement | null {
  const [req, setReq] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null)
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  useEffect(() => {
    openRef = (opts, resolve) => setReq({ opts, resolve })
    return () => { openRef = null }
  }, [])

  const close = useCallback((ok: boolean) => {
    setReq((cur) => { cur?.resolve(ok); return null })
  }, [])

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false) }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [req, close])

  if (!req) return null
  const { opts } = req
  const danger = opts.danger !== false
  const title = opts.title ?? t.confirmTitle
  const confirmText = opts.confirmText ?? t.confirmOk
  const cancelText = opts.cancelText ?? t.cancel

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.8)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) close(false) }}
    >
      <div
        className="w-80 rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{ backgroundColor: danger ? 'rgba(248, 81, 73, 0.12)' : 'rgba(47, 129, 247, 0.12)' }}
          >
            <AlertTriangle size={16} style={{ color: danger ? 'var(--status-confirm)' : 'var(--accent-blue)' }} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{opts.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => close(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card-hover)'; el.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
          >
            {cancelText}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
            style={{ backgroundColor: danger ? 'var(--status-confirm)' : 'var(--accent-blue)', color: '#ffffff' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
