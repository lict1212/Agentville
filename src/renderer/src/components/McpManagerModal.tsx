import React, { useEffect } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'
import { McpManagerBody } from './McpManagerBody'

interface McpManagerModalProps {
  onClose: () => void
  // When provided, the modal is a drill-in from Settings: Esc / backdrop /
  // the ← button return to Settings, while ✕ closes everything.
  onBack?: () => void
}

export function McpManagerModal({ onClose, onBack }: McpManagerModalProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const dismiss = onBack ?? onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={dismiss}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxWidth: '92vw',
          maxHeight: '86vh',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 -ml-1 rounded transition-all flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                title={t.back}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-card)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t.mcpManager}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-all"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-card)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <McpManagerBody scope="global" />
        </div>
      </div>
    </div>
  )
}
