import React, { useState } from 'react'
import { X, FolderOpen, ArrowRight, AlertTriangle } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'

interface MigrateWorkspaceModalProps {
  projectId: string
  currentPath: string
  isRunning: boolean
  onClose: () => void
  onMigrated: (newPath: string) => void
}

type Phase = 'idle' | 'migrating' | 'conflict' | 'error'

export function MigrateWorkspaceModal({
  projectId, currentPath, isRunning, onClose, onMigrated,
}: MigrateWorkspaceModalProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [target, setTarget] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  const [conflictMode, setConflictMode] = useState<'full' | 'memory-only' | null>(null)
  const [overwriteSet, setOverwriteSet] = useState<Set<string>>(new Set())

  const pickFolder = async () => {
    const picked = await window.api.openFolder()
    if (picked) setTarget(picked)
  }

  const runMigrate = async (
    strategy: 'abort-on-conflict' | 'selective' = 'abort-on-conflict',
    overwriteNames?: string[]
  ) => {
    if (!target) return
    setPhase('migrating')
    setErrorMsg('')
    const res = await window.api.migrateProject(projectId, target, strategy, overwriteNames)
    if (res.ok) {
      onMigrated(res.project.path)
      onClose()
      return
    }
    const conflict = (res as { conflict?: string[] }).conflict
    if (Array.isArray(conflict) && conflict.length > 0) {
      setConflictFiles(conflict)
      setConflictMode((res as { mode?: 'full' | 'memory-only' }).mode ?? null)
      // Default: overwrite everything (user can untick items to skip)
      setOverwriteSet(new Set(conflict))
      setPhase('conflict')
      return
    }
    const err = (res as { error?: string; detail?: string }).error ?? 'unknown'
    if (err === 'running') setErrorMsg(t.migrateRunningWarning)
    else if (err === 'same-path') setErrorMsg(t.migrateSamePath)
    else setErrorMsg(`${t.migrateFailed}: ${err}`)
    setPhase('error')
  }

  const showConflict = phase === 'conflict'
  const canMigrate = !!target && !isRunning && phase !== 'migrating'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[480px] rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.migrateTitle}</h2>
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

        <div className="px-5 py-4 space-y-4">
          {isRunning && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: '#3a1a1a', border: '1px solid var(--status-confirm)', color: '#ffa198' }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{t.migrateRunningWarning}</span>
            </div>
          )}

          {/* Current → target */}
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#6e7681' }}>
                {t.migrateCurrentLabel}
              </p>
              <p className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }} title={currentPath}>
                {currentPath}
              </p>
            </div>
            <div className="flex justify-center" style={{ color: 'var(--text-muted)' }}>
              <ArrowRight size={16} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#6e7681' }}>
                {t.migrateTargetLabel}
              </p>
              <div className="flex items-center gap-2">
                <p
                  className="flex-1 text-xs font-mono truncate"
                  style={{ color: target ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  title={target ?? ''}
                >
                  {target ?? t.migrateTargetPlaceholder}
                </p>
                <button
                  onClick={pickFolder}
                  disabled={phase === 'migrating'}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all disabled:opacity-50"
                  style={{ color: 'var(--accent-blue)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--accent-blue)' }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--border)' }}
                >
                  <FolderOpen size={11} />
                  {t.migratePick}
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: '#6e7681' }}>
            {t.migrateNote}
          </p>

          {phase === 'error' && errorMsg && (
            <p className="text-xs" style={{ color: 'var(--status-confirm)' }}>{errorMsg}</p>
          )}

          {/* Conflict resolution — per-file overwrite/skip choice */}
          {showConflict && (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{ backgroundColor: '#2d2600', border: '1px solid #4a3800' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--status-warn)' }}>
                {t.migrateConflictTitle}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {conflictMode === 'memory-only' ? t.migrateConflictBodyMemory : t.migrateConflictBodyFull}
              </p>
              <ul
                className="text-xs space-y-1 max-h-40 overflow-y-auto pr-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {conflictFiles.map((f) => {
                  const checked = overwriteSet.has(f)
                  return (
                    <li key={f}>
                      <label className="flex items-center gap-2 cursor-pointer font-mono">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setOverwriteSet((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(f)
                              else next.delete(f)
                              return next
                            })
                          }}
                          className="cursor-pointer"
                        />
                        <span style={{ color: checked ? '#ffa198' : 'var(--text-secondary)' }}>{f}</span>
                        <span className="text-[10px] font-sans" style={{ color: '#6e7681' }}>
                          {checked ? t.migrateChoiceOverwrite : t.migrateChoiceSkip}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[10px]" style={{ color: '#6e7681' }}>
                {t.migrateConflictHint}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => { setPhase('idle'); setConflictFiles([]); setOverwriteSet(new Set()) }}
                  className="flex-1 px-2 py-1.5 rounded text-[11px] transition-all"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {t.migrateCancel}
                </button>
                <button
                  onClick={() => runMigrate('selective', Array.from(overwriteSet))}
                  className="flex-1 px-2 py-1.5 rounded text-[11px] transition-all"
                  style={{ backgroundColor: '#1a3a22', color: 'var(--status-working)', border: '1px solid var(--status-working)' }}
                >
                  {t.migrateContinue}
                </button>
              </div>
            </div>
          )}

          {/* Primary actions */}
          {!showConflict && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 h-8 rounded-lg text-xs transition-all"
                style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {t.migrateCancel}
              </button>
              <button
                onClick={() => runMigrate('abort-on-conflict')}
                disabled={!canMigrate}
                className="px-4 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff', border: '1px solid var(--accent-blue)' }}
              >
                {phase === 'migrating' ? '...' : t.migrateConfirm}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
