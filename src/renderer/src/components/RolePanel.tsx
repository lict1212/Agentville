import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, User, ListChecks, Activity, ScrollText, Plus, Puzzle, Sparkles } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'
import { SkillManagerBody } from './SkillManagerBody'
import { McpManagerBody } from './McpManagerBody'
import { confirmDialog } from './ConfirmDialog'

interface Project {
  id: string
  name: string
  path: string
  role: string
}

interface RolePanelProps {
  project: Project
  memoryFile?: string | null
  onClose: () => void
  onSave: (role: string) => void
}

interface StatusItem { key: string; value: string }

// CLI file tabs (used inside the Role tab)
const CLI_FILE_MAP = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
} as const
type CliTab = keyof typeof CLI_FILE_MAP
const CLI_TAB_ORDER: CliTab[] = ['claude', 'codex', 'gemini']
const CLI_TAB_LABEL: Record<CliTab, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

function cliTabFromMemoryFile(mf?: string | null): CliTab {
  if (mf === 'GEMINI.md') return 'gemini'
  if (mf === 'AGENTS.md') return 'codex'
  return 'claude'
}

// Top-level tabs
type TopTab = 'role' | 'skills' | 'mcp'

// Rule presets — snippet is what's written to the file (English, CLI-friendly).
export const RULE_PRESETS = [
  { id: 'replyChinese', labelKey: 'rulePresetReplyChinese', snippet: 'Always reply in Chinese.' },
  { id: 'noAutoCommit', labelKey: 'rulePresetNoAutoCommit', snippet: "Do not run git commit until I explicitly say 'commit'." },
  { id: 'preCommitChecks', labelKey: 'rulePresetPreCommitChecks', snippet: 'Run lint and typecheck before committing.' },
  { id: 'noExtras', labelKey: 'rulePresetNoExtras', snippet: 'Do not add features, refactors, or abstractions that were not explicitly requested.' },
  { id: 'minimalComments', labelKey: 'rulePresetMinimalComments', snippet: 'Do not add comments unless strictly necessary to explain a non-obvious reason.' },
  { id: 'reviewFirst', labelKey: 'rulePresetReviewFirst', snippet: 'After changes, wait for my review before proceeding to the next step.' },
] as const
export type RulePresetId = typeof RULE_PRESETS[number]['id']
const PRESET_BY_SNIPPET = new Map<string, RulePresetId>(
  RULE_PRESETS.map((p) => [p.snippet as string, p.id as RulePresetId]),
)

export interface CustomRule { id: string; text: string }

// ── Markdown helpers ─────────────────────────────────────────────────────────

function parseSections(md: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = md.split(/(?=^## )/m)
  for (const part of parts) {
    const m = part.match(/^## (.+)\n([\s\S]*)/)
    if (m) sections[m[1].trim()] = m[2].trim()
  }
  return sections
}

function parseStatus(text: string): StatusItem[] {
  return text.split('\n').flatMap((line) => {
    const m = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/)
    return m ? [{ key: m[1].trim(), value: m[2].trim() }] : []
  })
}

function buildStatus(items: StatusItem[]): string {
  return items.map(({ key, value }) => `- ${key}：${value}`).join('\n')
}

function replaceSection(md: string, name: string, body: string, keepEmpty = false): string {
  const re = new RegExp(`(^## ${name}[ \t]*\n)([\\s\\S]*?)(?=\\n## |$)`, 'm')
  if (re.test(md)) {
    if (!body.trim() && !keepEmpty) {
      return md.replace(re, '').replace(/\n\n+/g, '\n\n').trimEnd() + '\n'
    }
    return md.replace(re, `$1${body}\n`)
  }
  if (!body.trim() && !keepEmpty) return md
  return md.replace(/\s*$/, '') + `\n\n## ${name}\n${body}\n`
}

interface RuleParseResult {
  presetChecked: Set<RulePresetId>
  customChecked: Set<string>
  orphanLines: string[]   // lines that don't match any known preset or custom rule
}

function parseRules(body: string, customs: CustomRule[]): RuleParseResult {
  const presetChecked = new Set<RulePresetId>()
  const customChecked = new Set<string>()
  const orphanLines: string[] = []
  const customBySnippet = new Map(customs.map((c) => [c.text.trim(), c.id]))
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const inner = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed
    const presetId = PRESET_BY_SNIPPET.get(inner)
    if (presetId) { presetChecked.add(presetId); continue }
    const customId = customBySnippet.get(inner)
    if (customId) { customChecked.add(customId); continue }
    orphanLines.push(inner)
  }
  return { presetChecked, customChecked, orphanLines }
}

function buildRules(
  presetChecked: Set<RulePresetId>,
  customs: CustomRule[],
  customChecked: Set<string>,
  orphanLines: string[],
): string {
  const lines: string[] = []
  for (const p of RULE_PRESETS) {
    if (presetChecked.has(p.id)) lines.push(`- ${p.snippet}`)
  }
  for (const c of customs) {
    if (customChecked.has(c.id)) lines.push(`- ${c.text}`)
  }
  for (const o of orphanLines) {
    if (o.trim()) lines.push(`- ${o.trim()}`)
  }
  return lines.join('\n')
}

function eqSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function eqStatus(a: StatusItem[], b: StatusItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].value !== b[i].value) return false
  }
  return true
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon, title, accent = 'var(--border)', children
}: {
  icon: React.ReactNode
  title: string
  accent?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </span>
      </div>
      <div style={{ backgroundColor: 'var(--bg-base)' }}>{children}</div>
    </div>
  )
}

function StatusGrid({ items, onChange }: { items: StatusItem[]; onChange: (items: StatusItem[]) => void }) {
  const lang = useStore((s) => s.lang)
  const update = (i: number, value: string) => {
    const next = items.map((item, idx) => idx === i ? { ...item, value } : item)
    onChange(next)
  }
  return (
    <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: 'var(--border)' }}>
      {items.map((item, i) => (
        <div key={item.key} className="flex flex-col px-4 py-3" style={{ backgroundColor: 'var(--bg-base)' }}>
          <label className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{item.key}</label>
          <input
            value={item.value}
            onChange={(e) => update(i, e.target.value)}
            className="text-sm outline-none bg-transparent"
            style={{ color: 'var(--text-primary)' }}
            placeholder={lang === 'en' ? 'TBD' : '待确定'}
          />
        </div>
      ))}
    </div>
  )
}

function TextSection({
  value, onChange, placeholder, minHeight = 80
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className="w-full px-4 py-3 text-sm outline-none resize-none font-mono"
      style={{
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
        lineHeight: '1.6',
        minHeight,
      }}
    />
  )
}

// Exported chip section used by RolePanel and SettingsModal.
export function RulesChipSection({
  presets,
  customs,
  presetChecked,
  customChecked,
  orphanLines,
  onTogglePreset,
  onToggleCustom,
  onAddCustom,
  onDeleteCustom,
  onDeleteOrphan,
  t,
  lang,
}: {
  presets: typeof RULE_PRESETS
  customs: CustomRule[]
  presetChecked: Set<RulePresetId>
  customChecked: Set<string>
  orphanLines: string[]
  onTogglePreset: (id: RulePresetId) => void
  onToggleCustom: (id: string) => void
  onAddCustom: (text: string) => void | Promise<void>
  onDeleteCustom: (id: string) => void | Promise<void>
  onDeleteOrphan?: (text: string) => void
  t: typeof T['zh']
  lang: 'zh' | 'en'
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const submit = async () => {
    const text = draft.trim()
    if (!text) { setAdding(false); return }
    await onAddCustom(text)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ backgroundColor: 'var(--bg-base)' }}>
      {presets.map((p) => {
        const checked = presetChecked.has(p.id)
        const label = (t as any)[p.labelKey] as string
        return (
          <button
            key={`preset:${p.id}`}
            onClick={() => onTogglePreset(p.id)}
            className="text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              backgroundColor: checked ? 'var(--accent-blue)' : 'transparent',
              border: `1px solid ${checked ? 'var(--accent-blue)' : 'var(--border)'}`,
              color: checked ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            {checked ? '✓ ' : ''}{label}
          </button>
        )
      })}

      {customs.map((c) => {
        const checked = customChecked.has(c.id)
        return (
          <span
            key={`custom:${c.id}`}
            className="inline-flex items-center gap-1 text-xs pl-2.5 pr-1 py-0.5 rounded-full transition-colors"
            style={{
              backgroundColor: checked ? 'var(--accent-blue)' : 'transparent',
              border: `1px solid ${checked ? 'var(--accent-blue)' : 'var(--border)'}`,
              color: checked ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            <button onClick={() => onToggleCustom(c.id)} className="outline-none">
              {checked ? '✓ ' : ''}{c.text}
            </button>
            <button
              onClick={async () => {
                if (!(await confirmDialog({ message: t.ruleDeleteCustomConfirm, danger: true }))) return
                await onDeleteCustom(c.id)
              }}
              className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center transition-colors"
              style={{ color: checked ? '#ffffff' : 'var(--text-muted)' }}
              title={t.ruleDeleteChip}
            >
              <X size={10} />
            </button>
          </span>
        )
      })}

      {orphanLines.map((o, idx) => (
        <span
          key={`orphan:${idx}:${o}`}
          className="inline-flex items-center gap-1 text-xs pl-2.5 pr-1 py-0.5 rounded-full"
          style={{
            backgroundColor: 'var(--accent-blue)',
            border: '1px solid var(--accent-blue)',
            color: '#ffffff',
          }}
          title={t.ruleOrphanHint}
        >
          <span>✓ {o}</span>
          {onDeleteOrphan && (
            <button
              onClick={() => onDeleteOrphan(o)}
              className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ color: '#ffffff' }}
              title={t.ruleDeleteChip}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}

      {adding ? (
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{ border: '1px solid var(--accent-blue)', backgroundColor: 'var(--bg-card)' }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') { setDraft(''); setAdding(false) }
            }}
            onBlur={submit}
            placeholder={t.ruleAddPlaceholder}
            className="text-xs outline-none bg-transparent"
            style={{ color: 'var(--text-primary)', minWidth: lang === 'zh' ? 150 : 180 }}
          />
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <Plus size={11} /> {t.ruleAddButton}
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RolePanel({ project, memoryFile = 'CLAUDE.md', onClose }: RolePanelProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [topTab, setTopTab] = useState<TopTab>('role')
  const [cliTab, setCliTab] = useState<CliTab>(cliTabFromMemoryFile(memoryFile))

  // Per-tab persisted raw md (for the Role tab only)
  const [rawMd, setRawMd] = useState<string>('')   // latest read file contents
  const [fileLoading, setFileLoading] = useState(true)
  const [statusItems, setStatusItems] = useState<StatusItem[]>([])
  const [roleText, setRoleText] = useState('')
  const [decisionsText, setDecisionsText] = useState('')
  const [presetChecked, setPresetChecked] = useState<Set<RulePresetId>>(new Set())
  const [customChecked, setCustomChecked] = useState<Set<string>>(new Set())
  const [orphanLines, setOrphanLines] = useState<string[]>([])
  // Initial snapshots (for per-field dirty comparison)
  const initialRef = useRef({
    statusItems: [] as StatusItem[],
    roleText: '',
    decisionsText: '',
    presetChecked: new Set<RulePresetId>(),
    customChecked: new Set<string>(),
    orphanLines: [] as string[],
  })

  // Global custom rule library (shared with Settings)
  const [customRules, setCustomRules] = useState<CustomRule[]>([])

  const [saving, setSaving] = useState(false)

  const activeFile = CLI_FILE_MAP[cliTab]

  const MD_WORKSPACE  = 'Workspace Status'
  const MD_ROLE       = 'Role Definition'
  const MD_DECISIONS  = 'Key Decisions'
  const MD_RULES      = 'Rules'

  const refreshCustomRules = async () => {
    const list: CustomRule[] = await (window.api as any).getCustomRules()
    setCustomRules(list ?? [])
    return list ?? []
  }

  // Load custom rules once on mount
  useEffect(() => { refreshCustomRules() }, [])

  // Load the active file when cliTab changes (or project changes).
  useEffect(() => {
    let cancelled = false
    setFileLoading(true)
    const fn = (window.api as any).readClaudeMd
    if (!fn) { setFileLoading(false); return }
    ;(async () => {
      const customs = await refreshCustomRules()
      const text: string | null = await fn(project.id, activeFile)
      if (cancelled) return
      const md = text ?? ''
      const sections = parseSections(md)
      const nextStatus = parseStatus(sections[MD_WORKSPACE] ?? sections['工位状态'] ?? '')
      const nextRole = sections[MD_ROLE] ?? sections['角色设定'] ?? ''
      const nextDecisions = sections[MD_DECISIONS] ?? sections['关键决策'] ?? ''
      const parsedRules = parseRules(sections[MD_RULES] ?? '', customs)
      setRawMd(md)
      setStatusItems(nextStatus)
      setRoleText(nextRole)
      setDecisionsText(nextDecisions)
      setPresetChecked(parsedRules.presetChecked)
      setCustomChecked(parsedRules.customChecked)
      setOrphanLines(parsedRules.orphanLines)
      initialRef.current = {
        statusItems: nextStatus,
        roleText: nextRole,
        decisionsText: nextDecisions,
        presetChecked: new Set(parsedRules.presetChecked),
        customChecked: new Set(parsedRules.customChecked),
        orphanLines: [...parsedRules.orphanLines],
      }
      setFileLoading(false)
    })()
    return () => { cancelled = true }
  }, [project.id, activeFile])

  const isDirty = useMemo(() => {
    const init = initialRef.current
    if (roleText !== init.roleText) return true
    if (decisionsText !== init.decisionsText) return true
    if (!eqStatus(statusItems, init.statusItems)) return true
    if (!eqSet(presetChecked, init.presetChecked)) return true
    if (!eqSet(customChecked, init.customChecked)) return true
    if (orphanLines.length !== init.orphanLines.length) return true
    for (let i = 0; i < orphanLines.length; i++) {
      if (orphanLines[i] !== init.orphanLines[i]) return true
    }
    return false
  }, [statusItems, roleText, decisionsText, presetChecked, customChecked, orphanLines])

  const composeMd = (): string => {
    let updated = rawMd
    // Strip legacy Chinese section names
    updated = updated.replace(/^## 工位状态[ \t]*\n[\s\S]*?(?=\n## |$)/m, '')
    updated = updated.replace(/^## 角色设定[ \t]*\n[\s\S]*?(?=\n## |$)/m, '')
    updated = updated.replace(/^## 关键决策[ \t]*\n[\s\S]*?(?=\n## |$)/m, '')
    updated = replaceSection(updated, MD_WORKSPACE, buildStatus(statusItems))
    updated = replaceSection(updated, MD_ROLE, roleText, true)
    updated = replaceSection(updated, MD_DECISIONS, decisionsText)
    updated = replaceSection(updated, MD_RULES, buildRules(presetChecked, customRules, customChecked, orphanLines))
    return updated
  }

  const switchCliTab = async (next: CliTab) => {
    if (next === cliTab) return
    if (isDirty) {
      const msg = lang === 'zh'
        ? '当前有未保存的修改，切换会丢失。继续？'
        : 'You have unsaved changes. Switching will discard them. Continue?'
      if (!(await confirmDialog(msg))) return
    }
    setCliTab(next)
  }

  const handleSave = async () => {
    setSaving(true)
    const updated = composeMd()
    const fn = (window.api as any).writeClaudeMd
    const syncMemory = activeFile === (memoryFile ?? 'CLAUDE.md')
    if (fn) await fn(project.id, updated, activeFile, syncMemory)
    setSaving(false)
    // refresh initial snapshot so save button settles
    initialRef.current = {
      statusItems,
      roleText,
      decisionsText,
      presetChecked: new Set(presetChecked),
      customChecked: new Set(customChecked),
      orphanLines: [...orphanLines],
    }
    setRawMd(updated)
    onClose()
  }

  const togglePreset = (id: RulePresetId) => {
    setPresetChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleCustom = (id: string) => {
    setCustomChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const addCustom = async (text: string) => {
    const added: CustomRule = await (window.api as any).addCustomRule(text)
    if (!added) return
    setCustomRules((prev) => [...prev, added])
    setCustomChecked((prev) => new Set(prev).add(added.id))
  }

  const deleteCustom = async (id: string) => {
    await (window.api as any).removeCustomRule(id)
    setCustomRules((prev) => prev.filter((c) => c.id !== id))
    setCustomChecked((prev) => {
      const n = new Set(prev); n.delete(id); return n
    })
  }

  const deleteOrphan = (text: string) => {
    setOrphanLines((prev) => prev.filter((o) => o !== text))
  }

  const renderRoleTab = () => (
    <>
      {/* CLI Tabs */}
      <div className="flex gap-1 px-5 pt-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {CLI_TAB_ORDER.map((key) => {
          const active = key === cliTab
          return (
            <button
              key={key}
              onClick={() => switchCliTab(key)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${active ? 'var(--accent-blue)' : 'transparent'}`,
                marginBottom: -1,
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            >
              {CLI_TAB_LABEL[key]}
              <span className="ml-1.5 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {CLI_FILE_MAP[key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ minHeight: 0 }}>
        {fileLoading && rawMd === '' ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.loading}</span>
          </div>
        ) : (
          <>
            <SectionCard icon={<Activity size={13} />} title={t.sectionWorkspaceStatus} accent="var(--status-working)">
              {statusItems.length > 0 ? (
                <StatusGrid items={statusItems} onChange={setStatusItems} />
              ) : (
                <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{t.noStatusFields}</p>
              )}
            </SectionCard>

            <SectionCard icon={<User size={13} />} title={t.sectionRoleDefinition} accent="var(--accent-blue)">
              <TextSection value={roleText} onChange={setRoleText} placeholder={t.rolePlaceholder} minHeight={100} />
            </SectionCard>

            <SectionCard icon={<ScrollText size={13} />} title={t.sectionRules} accent="#f0883e">
              <RulesChipSection
                presets={RULE_PRESETS}
                customs={customRules}
                presetChecked={presetChecked}
                customChecked={customChecked}
                orphanLines={orphanLines}
                onTogglePreset={togglePreset}
                onToggleCustom={toggleCustom}
                onAddCustom={addCustom}
                onDeleteCustom={deleteCustom}
                onDeleteOrphan={deleteOrphan}
                t={t as any}
                lang={lang}
              />
            </SectionCard>

            <SectionCard icon={<ListChecks size={13} />} title={t.sectionKeyDecisions} accent="#bc8cff">
              <TextSection value={decisionsText} onChange={setDecisionsText} placeholder={t.decisionsPlaceholder} minHeight={80} />
            </SectionCard>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 px-5 pb-5 pt-3 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors"
          style={{ backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || fileLoading}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
          onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </>
  )

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
          width: 760,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 64px)',
          height: topTab === 'role' ? 'auto' : 'calc(100vh - 64px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <User size={15} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t.projectSettingsTitle}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— {project.name}</span>
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

        {/* Top Tabs */}
        <div className="flex gap-1 px-5 pt-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <TopTabButton icon={<User size={12} />} label={t.projectTabRole} active={topTab === 'role'} onClick={() => setTopTab('role')} />
          <TopTabButton icon={<Sparkles size={12} />} label={t.projectTabSkills} active={topTab === 'skills'} onClick={() => setTopTab('skills')} />
          <TopTabButton icon={<Puzzle size={12} />} label={t.projectTabMcp} active={topTab === 'mcp'} onClick={() => setTopTab('mcp')} />
        </div>

        {topTab === 'role' && renderRoleTab()}

        {topTab === 'skills' && (
          <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
            <SkillManagerBody scope="project" projectPath={project.path} />
          </div>
        )}

        {topTab === 'mcp' && (
          <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
            <McpManagerBody scope="project" projectPath={project.path} />
          </div>
        )}
      </div>
    </div>
  )
}

function TopTabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderBottom: `2px solid ${active ? 'var(--accent-blue)' : 'transparent'}`,
        marginBottom: -1,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
    >
      {icon} {label}
    </button>
  )
}
