import React, { useEffect, useState } from 'react'
import { Power } from 'lucide-react'
import { useStore } from '../store/useStore'
import { T } from '../i18n'

interface Props {
  runningCount: number
  onCancel: () => void
}

/**
 * In-app close confirmation. Shown when the main process intercepts the window
 * `close` event and asks the renderer to confirm. On confirm we call
 * `window.api.confirmQuit()`, which saves running agents in the main process and
 * then destroys the window (so this modal disappears with it).
 */
export function QuitConfirmModal({ runningCount, onCancel }: Props): React.ReactElement {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [dontAsk, setDontAsk] = useState(false)
  const [exiting, setExiting] = useState(false)

  const confirm = async (): Promise<void> => {
    setExiting(true)
    await (window.api as any).confirmQuit?.(dontAsk)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (exiting) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirm() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [exiting, dontAsk])

  const message = runningCount > 0 ? t.quitMessageRunning(runningCount) : t.quitMessageIdle

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.8)', zIndex: 10000 }}
      onClick={(e) => { if (e.target === e.currentTarget && !exiting) onCancel() }}
    >
      <div
        className="w-80 rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'rgba(248, 81, 73, 0.12)' }}
          >
            <Power size={16} style={{ color: 'var(--status-confirm)' }} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t.quitTitle}</h2>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {exiting ? t.quitSavingExiting : message}
            </p>
          </div>
        </div>

        {!exiting && (
          <div className="px-5 pb-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              {t.quitDontAskAgain}
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onCancel}
            disabled={exiting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { if (exiting) return; const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card-hover)'; el.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
          >
            {t.cancel}
          </button>
          <button
            autoFocus
            onClick={confirm}
            disabled={exiting}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-70"
            style={{ backgroundColor: 'var(--status-confirm)', color: '#ffffff' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {exiting ? t.quitSavingExiting : t.quitConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}
