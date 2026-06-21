import React, { useState, useEffect } from 'react'
import { X, Terminal } from 'lucide-react'

interface CliModalProps {
  projectId: string
  projectName: string
  currentCommand: string | undefined // project-level override (undefined = use global default)
  globalDefault: string
  onClose: () => void
  onSave: (command: string | undefined) => void
}

const CLI_PRESETS = [
  { label: 'Claude Code', value: 'claude' },
  { label: 'Gemini CLI', value: 'gemini' },
  { label: 'Aider', value: 'aider' },
]

export function CliModal({ projectName, currentCommand, globalDefault, onClose, onSave }: CliModalProps) {
  // If currentCommand is undefined, show empty (will use global default)
  const [value, setValue] = useState(currentCommand ?? '')
  const [useGlobal, setUseGlobal] = useState(currentCommand === undefined || currentCommand === '')

  const effectiveCommand = useGlobal ? globalDefault : (value.trim() || globalDefault)

  const handleSave = () => {
    onSave(useGlobal ? undefined : (value.trim() || undefined))
    onClose()
  }

  const selectedPreset = CLI_PRESETS.find((p) => p.value === value.trim())?.value ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
          width: 420,
          maxWidth: 'calc(100vw - 48px)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Terminal size={15} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>CLI 命令 — {projectName}</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Use global toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setUseGlobal((v) => !v)}
              className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: useGlobal ? 'var(--accent-blue)' : 'var(--border)', cursor: 'pointer' }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: useGlobal ? 'translateX(17px)' : 'translateX(2px)' }}
              />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              使用全局默认（<code className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>{globalDefault}</code>）
            </span>
          </label>

          {/* Custom command */}
          {!useGlobal && (
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                本会话启动命令
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {CLI_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setValue(p.value)}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: selectedPreset === p.value ? 'var(--accent-blue)' : 'var(--bg-card)',
                      borderColor: selectedPreset === p.value ? 'var(--accent-blue)' : 'var(--border)',
                      color: selectedPreset === p.value ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={globalDefault}
                autoFocus
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-blue)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              />
            </div>
          )}

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            将在下次启动时生效（当前运行中的会话不受影响）。
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors"
            style={{ backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card-hover)'; el.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-blue)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-blue)' }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
