import React, { useEffect, useState } from 'react'
import { X, Plus, FolderOpen, RotateCcw, Download } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'
import { InstallCliModal } from './InstallCliModal'

interface CliOption {
  key: string
  name: string
  installHint?: string
}

interface NewProjectModalProps {
  globalCliDefault: string
  cliOptions: CliOption[]
  onClose: () => void
  onCreate: (name: string, role: string, cliCommand: string, folderPath?: string) => Promise<void>
}

export function NewProjectModal({ globalCliDefault, cliOptions, onClose, onCreate }: NewProjectModalProps) {
  const defaultCli = globalCliDefault.trim().split(/\s+/)[0].toLowerCase()
  const [selectedCli, setSelectedCli] = useState(defaultCli)
  const [loading, setLoading] = useState(false)
  // null = keep default (Documents/Agentville/<auto-name>); non-null = user-picked absolute path
  const [customFolder, setCustomFolder] = useState<string | null>(null)
  // Per-CLI installed state (undefined = still detecting)
  const [installed, setInstalled] = useState<Record<string, boolean>>({})
  const [installTarget, setInstallTarget] = useState<CliOption | null>(null)
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  const detect = async () => {
    const map = await (window.api as any).detectClis?.()
    if (map) setInstalled(map)
  }
  useEffect(() => { detect() }, [])

  const handlePickFolder = async () => {
    const picked = await window.api.openFolder()
    if (picked) setCustomFolder(picked)
  }

  const handleSubmit = async (cli: string) => {
    setLoading(true)
    try {
      await onCreate('', '', cli, customFolder ?? undefined)
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
        className="w-72 rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Plus size={16} style={{ color: 'var(--accent-blue)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.newSession2}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card-hover)'; el.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.selectCli}</p>
          <div className="flex flex-col gap-2">
            {cliOptions.map((cli) => {
              const active = selectedCli === cli.key
              const notInstalled = installed[cli.key] === false
              return (
                <button
                  key={cli.key}
                  type="button"
                  disabled={loading}
                  onClick={() => notInstalled ? setInstallTarget(cli) : handleSubmit(cli.key)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left disabled:opacity-50 flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: active ? '#1f3f6e' : 'var(--bg-card)',
                    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`
                  }}
                  onMouseEnter={(e) => { if (!loading) { const el = e.currentTarget; el.style.backgroundColor = active ? '#1f3f6e' : 'var(--bg-card-hover)'; el.style.color = active ? 'var(--accent-blue)' : 'var(--text-primary)' } }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = active ? '#1f3f6e' : 'var(--bg-card)'; el.style.color = active ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
                >
                  <span>{cli.name}</span>
                  {notInstalled && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--accent-blue)', border: '1px solid var(--border)' }}
                    >
                      <Download size={10} /> {t.installOneClick}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Working-directory picker — default is Documents/Agentville/<auto>, users can override */}
          <div
            className="mt-3 pt-3 border-t flex items-start gap-2"
            style={{ borderColor: 'var(--border)' }}
          >
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
        </div>
      </div>

      {installTarget && (
        <InstallCliModal
          cliKey={installTarget.key}
          cliName={installTarget.name}
          installHint={installTarget.installHint}
          onInstalled={detect}
          onClose={() => { setInstallTarget(null); detect() }}
        />
      )}
    </div>
  )
}
