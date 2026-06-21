import React, { useEffect, useMemo, useState } from 'react'
import { X, Trash2, FolderOpen, Plus, Loader2, AlertCircle } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'
import { confirmDialog } from './ConfirmDialog'

interface SkillPreset {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  emoji: string
  body: string
}

interface SkillInfo {
  id: string
  name: string
  description: string
  folder: string
  valid: boolean
}

type Scope = 'global' | 'project'

interface SkillManagerBodyProps {
  scope: Scope
  projectPath?: string
}

export function SkillManagerBody({ scope, projectPath }: SkillManagerBodyProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const api = (window as any).api

  const [presets, setPresets] = useState<SkillPreset[]>([])
  const [installed, setInstalled] = useState<SkillInfo[]>([])
  const [skillsDir, setSkillsDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const [presetList, listResult] = await Promise.all([
      api.listSkillPresets() as Promise<SkillPreset[]>,
      api.listSkills(scope, projectPath) as Promise<{ installed: SkillInfo[]; skillsDir: string }>,
    ])
    setPresets(presetList)
    setInstalled(listResult.installed ?? [])
    setSkillsDir(listResult.skillsDir ?? '')
    setLoading(false)
  }

  useEffect(() => { refresh() }, [scope, projectPath])

  const installedIds = useMemo(() => new Set(installed.map((s) => s.id)), [installed])

  const applyPreset = (preset: SkillPreset) => {
    setFormName(lang === 'zh' ? preset.name : preset.nameEn)
    setFormDesc(lang === 'zh' ? preset.description : preset.descriptionEn)
    setFormBody(preset.body)
    setFormError(null)
    setFormOpen(true)
  }

  const handleCreate = async () => {
    setFormError(null)
    if (!formName.trim() || !formDesc.trim()) {
      setFormError(t.skillErrorRequired)
      return
    }
    setSubmitting(true)
    const res = await api.installSkill(
      { name: formName.trim(), description: formDesc.trim(), body: formBody },
      scope,
      projectPath,
    )
    setSubmitting(false)
    if (!res?.ok) {
      setFormError(res?.error === 'skill already exists' ? t.skillErrorExists : (res?.error ?? 'failed'))
      return
    }
    setFormName(''); setFormDesc(''); setFormBody('')
    setFormOpen(false)
    await refresh()
  }

  const handleRemove = async (skill: SkillInfo) => {
    const msg = t.skillConfirmRemove(skill.name || skill.id)
    if (!(await confirmDialog({ message: msg, danger: true }))) return
    setBusyId(skill.id)
    await api.uninstallSkill(skill.id, scope, projectPath)
    setBusyId(null)
    await refresh()
  }

  const handleOpenFolder = async () => {
    await api.openSkillsFolder(scope, projectPath)
  }

  const scopeLabel = scope === 'global' ? t.skillScopeGlobal : t.skillScopeProject

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t.skillDescription}
          </p>
          <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
            {scopeLabel} · {skillsDir}
          </p>
        </div>
        <button
          onClick={handleOpenFolder}
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs flex-shrink-0"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
        >
          <FolderOpen size={12} /> {t.skillOpenFolder}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {t.skillInstalled} ({installed.length})
              </span>
              <button
                onClick={() => { setFormOpen(true); setFormError(null) }}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
              >
                <Plus size={12} /> {t.skillAdd}
              </button>
            </div>
            {installed.length === 0 ? (
              <p className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>
                {t.skillNone}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {installed.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: `1px solid ${skill.valid ? 'var(--border)' : 'var(--status-confirm)'}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {skill.name}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {skill.id}
                        </span>
                        {!skill.valid && (
                          <span className="text-[10px]" style={{ color: 'var(--status-confirm)' }}>
                            (SKILL.md missing)
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {skill.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(skill)}
                      disabled={busyId === skill.id}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title={t.skillRemove}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--status-confirm)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
                    >
                      {busyId === skill.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {formOpen && (
            <section
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-blue)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  {t.skillFormTitle}
                </span>
                <button
                  onClick={() => { setFormOpen(false); setFormError(null) }}
                  className="text-xs" style={{ color: 'var(--text-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>

              <Field label={t.skillFieldName} value={formName} onChange={setFormName} />
              <Field label={t.skillFieldDescription} value={formDesc} onChange={setFormDesc} />
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.skillFieldBody}</span>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  spellCheck={false}
                  className="px-2.5 py-1.5 rounded text-xs outline-none font-mono resize-y"
                  rows={6}
                  style={{
                    backgroundColor: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--status-confirm)' }}>
                  <AlertCircle size={12} /> {formError}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={submitting}
                className="self-end px-4 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : t.skillCreate}
              </button>
            </section>
          )}

          <section>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t.skillStarterTemplates}
            </div>
            <div className="flex flex-col gap-1.5">
              {presets.map((preset) => {
                const already = installedIds.has(preset.id)
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    disabled={already}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      cursor: already ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!already) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{preset.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {lang === 'zh' ? preset.name : preset.nameEn}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {lang === 'zh' ? preset.description : preset.descriptionEn}
                      </p>
                    </div>
                    {already && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                        {t.skillInstalled}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Field({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2.5 py-1.5 rounded text-sm outline-none"
        style={{
          backgroundColor: 'var(--bg-base)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
      />
    </label>
  )
}
