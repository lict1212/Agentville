import React, { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, AlertCircle, Loader2, Plus, Trash2, X } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'

interface McpPreset {
  id: string
  name: string
  description: string
  descriptionEn: string
  emoji: string
  command: string
  args: string[]
  pathArg?: { label: string; labelEn: string; placeholder?: string }
  envKeys?: Array<{ key: string; label: string; labelEn: string; secret?: boolean }>
  homepage?: string
}

interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
}

type Scope = 'global' | 'project'

interface McpManagerBodyProps {
  scope: Scope
  projectPath?: string
}

function extractPathFromEntry(preset: McpPreset, entry: McpServerEntry): string {
  if (!preset.pathArg) return ''
  const extra = (entry.args ?? []).slice(preset.args.length)
  return extra.join(' ') || ''
}

function buildEntry(preset: McpPreset, pathValue: string, envValues: Record<string, string>): McpServerEntry {
  const args = [...preset.args]
  if (preset.pathArg && pathValue.trim()) args.push(pathValue.trim())
  const entry: McpServerEntry = { command: preset.command, args }
  if (preset.envKeys && preset.envKeys.length > 0) {
    const env: Record<string, string> = {}
    for (const spec of preset.envKeys) {
      if (envValues[spec.key]?.trim()) env[spec.key] = envValues[spec.key].trim()
    }
    if (Object.keys(env).length > 0) entry.env = env
  }
  return entry
}

function presetNeedsConfig(preset: McpPreset): boolean {
  return !!preset.pathArg || (preset.envKeys && preset.envKeys.length > 0) || false
}

export function McpManagerBody({ scope, projectPath }: McpManagerBodyProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const api = (window as any).api

  const [presets, setPresets] = useState<McpPreset[]>([])
  const [servers, setServers] = useState<Record<string, McpServerEntry>>({})
  const [disabledServers, setDisabledServers] = useState<Record<string, McpServerEntry>>({})
  const [configPath, setConfigPath] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pathInputs, setPathInputs] = useState<Record<string, string>>({})
  const [envInputs, setEnvInputs] = useState<Record<string, Record<string, string>>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ id: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Custom-server "add" form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newEnv, setNewEnv] = useState<Array<{ key: string; value: string }>>([])
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    const [presetList, data, disabled] = await Promise.all([
      api.listMcpPresets() as Promise<McpPreset[]>,
      api.getMcpServers(scope, projectPath) as Promise<{ servers: Record<string, McpServerEntry>; configPath: string }>,
      api.getDisabledMcpServers(scope, projectPath) as Promise<{ servers: Record<string, McpServerEntry> }>,
    ])
    setPresets(presetList)
    setServers(data.servers ?? {})
    setDisabledServers(disabled?.servers ?? {})
    setConfigPath(data.configPath ?? '')
    const nextPath: Record<string, string> = {}
    const nextEnv: Record<string, Record<string, string>> = {}
    for (const preset of presetList) {
      const existing = data.servers?.[preset.id]
      if (existing) {
        if (preset.pathArg) nextPath[preset.id] = extractPathFromEntry(preset, existing)
        if (preset.envKeys) {
          nextEnv[preset.id] = {}
          for (const spec of preset.envKeys) {
            nextEnv[preset.id][spec.key] = existing.env?.[spec.key] ?? ''
          }
        }
      } else {
        if (preset.pathArg) nextPath[preset.id] = ''
        if (preset.envKeys) {
          nextEnv[preset.id] = Object.fromEntries(preset.envKeys.map((k) => [k.key, '']))
        }
      }
    }
    setPathInputs(nextPath)
    setEnvInputs(nextEnv)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [scope, projectPath])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(timer)
  }, [flash])

  const handleEnable = async (preset: McpPreset) => {
    if (preset.pathArg && !pathInputs[preset.id]?.trim()) {
      setFlash({ id: preset.id, msg: t.mcpEmptyValue })
      setExpandedId(preset.id)
      return
    }
    if (preset.envKeys) {
      const envState = envInputs[preset.id] ?? {}
      for (const spec of preset.envKeys) {
        if (!envState[spec.key]?.trim()) {
          setFlash({ id: preset.id, msg: t.mcpEmptyValue })
          setExpandedId(preset.id)
          return
        }
      }
    }
    setBusyId(preset.id)
    const entry = buildEntry(preset, pathInputs[preset.id] ?? '', envInputs[preset.id] ?? {})
    await api.setMcpServer(preset.id, entry, scope, projectPath)
    setServers((prev) => ({ ...prev, [preset.id]: entry }))
    setBusyId(null)
    setFlash({ id: preset.id, msg: t.mcpApplied })
    setExpandedId(null)
  }

  const handleDisable = async (preset: McpPreset) => {
    setBusyId(preset.id)
    await api.removeMcpServer(preset.id, scope, projectPath)
    setServers((prev) => {
      const next = { ...prev }
      delete next[preset.id]
      return next
    })
    setBusyId(null)
    setFlash({ id: preset.id, msg: t.mcpRemoved })
    setExpandedId(null)
  }

  const enabledCount = useMemo(
    () => presets.filter((p) => !!servers[p.id]).length,
    [presets, servers],
  )

  // Custom servers = anything not matching a preset id, whether currently
  // active (in the config) or disabled (stashed). Active ones win on name clash.
  const customRows = useMemo(() => {
    const presetIds = new Set(presets.map((p) => p.id))
    const rows: Array<{ name: string; entry: McpServerEntry; enabled: boolean }> = []
    for (const name of Object.keys(servers)) {
      if (!presetIds.has(name)) rows.push({ name, entry: servers[name], enabled: true })
    }
    const activeNames = new Set(rows.map((r) => r.name))
    for (const name of Object.keys(disabledServers)) {
      if (!presetIds.has(name) && !activeNames.has(name)) {
        rows.push({ name, entry: disabledServers[name], enabled: false })
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [presets, servers, disabledServers])

  const resetAddForm = () => {
    setNewName('')
    setNewCommand('')
    setNewArgs('')
    setNewEnv([])
    setAddError(null)
    setShowAddForm(false)
  }

  const handleAddCustom = async () => {
    const name = newName.trim()
    const command = newCommand.trim()
    if (!name || !command) {
      setAddError(t.mcpNameCommandRequired)
      return
    }
    if (servers[name] || disabledServers[name] || presets.some((p) => p.id === name)) {
      setAddError(t.mcpNameExists)
      return
    }
    const args = newArgs.trim() ? newArgs.trim().split(/\s+/) : []
    const env: Record<string, string> = {}
    for (const pair of newEnv) {
      if (pair.key.trim()) env[pair.key.trim()] = pair.value
    }
    const entry: McpServerEntry = { command, args }
    if (Object.keys(env).length > 0) entry.env = env
    setAdding(true)
    await api.setMcpServer(name, entry, scope, projectPath)
    setServers((prev) => ({ ...prev, [name]: entry }))
    setAdding(false)
    resetAddForm()
    setFlash({ id: name, msg: t.mcpAdded })
  }

  const handleDeleteCustom = async (name: string) => {
    setBusyId(name)
    await api.removeMcpServer(name, scope, projectPath)
    setServers((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setDisabledServers((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setBusyId(null)
  }

  // Toggle a custom server between active (in config) and disabled (stashed).
  const handleToggleCustom = async (name: string, currentlyEnabled: boolean) => {
    setBusyId(name)
    if (currentlyEnabled) {
      const entry = servers[name]
      await api.disableMcpServer(name, scope, projectPath)
      setServers((prev) => { const n = { ...prev }; delete n[name]; return n })
      if (entry) setDisabledServers((prev) => ({ ...prev, [name]: entry }))
    } else {
      const entry = disabledServers[name]
      await api.enableMcpServer(name, scope, projectPath)
      setDisabledServers((prev) => { const n = { ...prev }; delete n[name]; return n })
      if (entry) setServers((prev) => ({ ...prev, [name]: entry }))
    }
    setBusyId(null)
  }

  const scopeLabel = scope === 'global' ? t.mcpScopeGlobal : t.mcpScopeProject

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t.mcpDescription} · <span style={{ color: 'var(--text-muted)' }}>{enabledCount} / {presets.length}</span>
        </p>
        <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
          {scopeLabel}{configPath ? ` · ${configPath}` : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {presets.map((preset) => {
            const enabled = !!servers[preset.id]
            const expanded = expandedId === preset.id
            const needsConfig = presetNeedsConfig(preset)
            const busy = busyId === preset.id
            const description = lang === 'zh' ? preset.description : preset.descriptionEn

            return (
              <div
                key={preset.id}
                className="rounded-lg transition-all"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: `1px solid ${enabled ? 'var(--accent-blue)' : 'var(--border)'}`,
                }}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{preset.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {preset.name}
                      </span>
                      {preset.envKeys && preset.envKeys.length > 0 && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}
                        >
                          {t.mcpRequiresKey}
                        </span>
                      )}
                      {preset.pathArg && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}
                        >
                          {t.mcpRequiresPath}
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {description}
                    </p>
                  </div>

                  {flash?.id === preset.id && (
                    <span
                      className="text-xs flex items-center gap-1"
                      style={{ color: 'var(--status-working)' }}
                    >
                      <Check size={12} /> {flash.msg}
                    </span>
                  )}

                  {preset.homepage && (
                    <button
                      onClick={() => window.open(preset.homepage, '_blank')}
                      className="p-1 rounded"
                      style={{ color: 'var(--text-muted)' }}
                      title={t.mcpOpenHomepage}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}

                  <Toggle
                    checked={enabled}
                    disabled={busy}
                    onChange={(v) => {
                      if (v) {
                        if (needsConfig && !enabled) setExpandedId(preset.id)
                        else handleEnable(preset)
                      } else {
                        handleDisable(preset)
                      }
                    }}
                  />
                </div>

                {expanded && needsConfig && (
                  <div
                    className="px-3 py-3 flex flex-col gap-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    {preset.pathArg && (
                      <Field
                        label={lang === 'zh' ? preset.pathArg.label : preset.pathArg.labelEn}
                        placeholder={preset.pathArg.placeholder}
                        value={pathInputs[preset.id] ?? ''}
                        onChange={(v) => setPathInputs((prev) => ({ ...prev, [preset.id]: v }))}
                      />
                    )}
                    {preset.envKeys?.map((spec) => (
                      <Field
                        key={spec.key}
                        label={lang === 'zh' ? spec.label : spec.labelEn}
                        secret={spec.secret}
                        value={envInputs[preset.id]?.[spec.key] ?? ''}
                        onChange={(v) =>
                          setEnvInputs((prev) => ({
                            ...prev,
                            [preset.id]: { ...(prev[preset.id] ?? {}), [spec.key]: v },
                          }))
                        }
                      />
                    ))}

                    {flash?.id === preset.id && flash.msg === t.mcpEmptyValue && (
                      <div
                        className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--status-confirm)' }}
                      >
                        <AlertCircle size={12} />
                        {t.mcpEmptyValue}
                      </div>
                    )}

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => handleEnable(preset)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                        style={{
                          backgroundColor: 'var(--accent-blue)',
                          color: '#ffffff',
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : t.mcpSave}
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                        style={{
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {t.mcpCancel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t.mcpCustomSection}
              {customRows.length > 0 && (
                <span style={{ color: 'var(--text-muted)' }}> · {customRows.length}</span>
              )}
            </span>
            {!showAddForm && (
              <button
                onClick={() => { setShowAddForm(true); setAddError(null) }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
              >
                <Plus size={12} /> {t.mcpAddCustom}
              </button>
            )}
          </div>

          {customRows.map(({ name, entry, enabled }) => {
            const summary = [entry.command, ...(entry.args ?? [])].join(' ')
            const busy = busyId === name
            return (
              <div
                key={name}
                className="rounded-lg flex items-center gap-3 px-3 py-2.5"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: `1px solid ${enabled ? 'var(--accent-blue)' : 'var(--border)'}`,
                  opacity: enabled ? 1 : 0.65,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{name}</span>
                    {flash?.id === name && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--status-working)' }}>
                        <Check size={12} /> {flash.msg}
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate font-mono" style={{ color: 'var(--text-secondary)' }} title={summary}>
                    {summary}
                  </p>
                  {entry.env && Object.keys(entry.env).length > 0 && (
                    <p className="text-[10px] truncate font-mono" style={{ color: 'var(--text-muted)' }}>
                      env: {Object.keys(entry.env).join(', ')}
                    </p>
                  )}
                </div>
                <Toggle
                  checked={enabled}
                  disabled={busy}
                  onChange={() => handleToggleCustom(name, enabled)}
                />
                <button
                  onClick={() => handleDeleteCustom(name)}
                  disabled={busy}
                  className="p-1.5 rounded flex-shrink-0 transition-all"
                  style={{ color: 'var(--text-muted)', opacity: busy ? 0.5 : 1 }}
                  title={t.mcpDelete}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--status-confirm)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            )
          })}

          {!showAddForm && customRows.length === 0 && (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.mcpCustomHint}</p>
          )}

          {showAddForm && (
            <div
              className="rounded-lg px-3 py-3 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <Field
                label={t.mcpFieldName}
                placeholder={t.mcpFieldNamePlaceholder}
                value={newName}
                onChange={setNewName}
              />
              <Field
                label={t.mcpFieldCommand}
                placeholder={t.mcpFieldCommandPlaceholder}
                value={newCommand}
                onChange={setNewCommand}
              />
              <Field
                label={t.mcpFieldArgs}
                placeholder="-y @scope/server"
                value={newArgs}
                onChange={setNewArgs}
              />

              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.mcpFieldEnv}</span>
                {newEnv.map((pair, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      value={pair.key}
                      onChange={(e) => setNewEnv((prev) => prev.map((p, j) => (j === i ? { ...p, key: e.target.value } : p)))}
                      placeholder="KEY"
                      className="flex-1 px-2.5 py-1.5 rounded text-sm outline-none font-mono"
                      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <input
                      value={pair.value}
                      onChange={(e) => setNewEnv((prev) => prev.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)))}
                      placeholder="value"
                      className="flex-1 px-2.5 py-1.5 rounded text-sm outline-none"
                      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <button
                      onClick={() => setNewEnv((prev) => prev.filter((_, j) => j !== i))}
                      className="p-1 rounded flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      title={t.mcpDelete}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setNewEnv((prev) => [...prev, { key: '', value: '' }])}
                  className="self-start text-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.mcpAddEnvPair}
                </button>
              </div>

              {addError && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--status-confirm)' }}>
                  <AlertCircle size={12} /> {addError}
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleAddCustom}
                  disabled={adding}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                  style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff', opacity: adding ? 0.6 : 1 }}
                >
                  {adding ? <Loader2 size={12} className="animate-spin" /> : t.mcpAdd}
                </button>
                <button
                  onClick={resetAddForm}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                  style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {t.mcpCancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.mcpRestartHint}</p>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative flex-shrink-0 transition-all"
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        backgroundColor: checked ? 'var(--accent-blue)' : 'var(--bg-base)',
        border: `1px solid ${checked ? 'var(--accent-blue)' : 'var(--border)'}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="absolute transition-all"
        style={{
          top: 1,
          left: checked ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  secret?: boolean
}) {
  const [reveal, setReveal] = useState(false)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div className="flex items-stretch gap-1">
        <input
          type={secret && !reveal ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-2.5 py-1.5 rounded text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-base)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />
        {secret && (
          <button
            onClick={(e) => {
              e.preventDefault()
              setReveal((v) => !v)
            }}
            type="button"
            className="px-2 rounded text-xs"
            style={{
              backgroundColor: 'var(--bg-base)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {reveal ? '•••' : '👁'}
          </button>
        )}
      </div>
    </label>
  )
}
