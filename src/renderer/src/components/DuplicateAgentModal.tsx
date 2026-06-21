import React, { useState } from 'react'
import { X, Copy, FolderOpen, RotateCcw } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'

interface DuplicateAgentModalProps {
  /** Display name of the source agent (for the subtitle). */
  sourceName: string
  /** Pre-filled unique copy name (e.g. "<name> 副本"). */
  initialName: string
  onClose: () => void
  /** Resolve with the picked name + folder; folderPath null = fresh auto-shell. */
  onConfirm: (name: string, folderPath: string | null) => Promise<void>
}

export function DuplicateAgentModal({ sourceName, initialName, onClose, onConfirm }: DuplicateAgentModalProps) {
  const [name, setName] = useState(initialName)
  const [customFolder, setCustomFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  const handlePickFolder = async () => {
    const picked = await window.api.openFolder()
    if (picked) setCustomFolder(picked)
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(name.trim() || initialName, customFolder)
      onClose()
    } catch {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-80 rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Copy size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.duplicateAgent}</h2>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }} title={sourceName}>
                {t.duplicateFrom(sourceName)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card-hover)'; el.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#6e7681' }}>
              {t.duplicateNameLabel}
            </p>
            <input
              autoFocus
              value={name}
              disabled={loading}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
              className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Working-directory picker — default is a fresh auto-shell, user can override */}
          <div className="pt-3 border-t flex items-start gap-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#6e7681' }}>
                {customFolder ? t.workingDirCustom : t.workingDirDefault}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: customFolder ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                title={customFolder ?? t.workingDirDefaultHint}
              >
                {customFolder ?? t.workingDirDefaultHint}
              </p>
            </div>
            {customFolder ? (
              <button
                type="button"
                onClick={() => setCustomFolder(null)}
                disabled={loading}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all disabled:opacity-50"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
                title={t.workingDirReset}
              >
                <RotateCcw size={11} />
                {t.workingDirReset}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePickFolder}
                disabled={loading}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all disabled:opacity-50"
                style={{ color: 'var(--accent-blue)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent-blue)' }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border)' }}
                title={t.workingDirPick}
              >
                <FolderOpen size={11} />
                {t.workingDirPick}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{ backgroundColor: '#1f3f6e', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)' }}
            >
              {t.duplicateCreate}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
