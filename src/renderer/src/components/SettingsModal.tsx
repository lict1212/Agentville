import React, { useState, useEffect, useMemo } from 'react'
import { X, Settings, Puzzle, ChevronRight, Sparkles, ScrollText, Bell, Play, FolderOpen, Sliders } from 'lucide-react'
import { T, type Lang } from '../i18n'
import { useStore } from '../store/useStore'
import { RULE_PRESETS, RulesChipSection, type RulePresetId, type CustomRule } from './RolePanel'
import { playSelection, BUNDLED_SOUNDS } from '../utils/sound'

interface SettingsModalProps {
  onClose: () => void
  onOpenMcp?: () => void
  onOpenSkills?: () => void
}

interface ThemeDef {
  id: string
  bg: string; sidebar: string; card: string
  border: string; text: string; accent: string
  titleBar: { color: string; symbolColor: string }
}

const THEMES: ThemeDef[] = [
  {
    id: 'default',
    bg: '#0d1117', sidebar: '#161b22', card: '#1c2128',
    border: '#30363d', text: '#e6edf3', accent: '#58a6ff',
    titleBar: { color: '#161b22', symbolColor: '#8b949e' },
  },
  {
    id: 'slate',
    bg: '#08090a', sidebar: '#0e1011', card: '#15171a',
    border: '#1f2226', text: '#e6e8eb', accent: '#7c83d8',
    titleBar: { color: '#0e1011', symbolColor: '#8a8f98' },
  },
  {
    id: 'apple-light',
    bg: '#f2f2f7', sidebar: '#ffffff', card: '#e5e5ea',
    border: '#c6c6c8', text: '#1c1c1e', accent: '#007aff',
    titleBar: { color: '#ffffff', symbolColor: '#1c1c1e' },
  },
  {
    id: 'warm',
    bg: '#1a1510', sidebar: '#221c16', card: '#2e261e',
    border: '#4a3f35', text: '#f0e6d3', accent: '#c8874a',
    titleBar: { color: '#221c16', symbolColor: '#a89880' },
  },
  {
    id: 'strawberry',
    bg: '#fff5f7', sidebar: '#ffe9ee', card: '#ffd9e1',
    border: '#f4b2c0', text: '#4a2535', accent: '#ff5c8a',
    titleBar: { color: '#ffe9ee', symbolColor: '#8e5a6a' },
  },
]

const THEME_NAMES: Record<string, keyof typeof T['zh']> = {
  'default':     'themeDefault',
  'slate':       'themeSlate',
  'apple-light': 'themeAppleLight',
  'warm':        'themeWarm',
  'strawberry':  'themeStrawberry',
}

function applyTheme(id: string) {
  if (id === 'default') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', id)
  }
  localStorage.setItem('app-theme', id)
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
  ;(window.api as any).setTitleBarOverlay?.(theme.titleBar.color, theme.titleBar.symbolColor)
}

function ThemeCard({ theme, name, selected, onSelect }: { theme: ThemeDef; name: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-1.5 transition-all"
      style={{ outline: 'none' }}
    >
      <div
        className="rounded-lg overflow-hidden flex-shrink-0"
        style={{
          width: 72, height: 50,
          border: selected ? `2px solid ${theme.accent}` : `2px solid ${theme.border}`,
          boxShadow: selected ? `0 0 0 2px ${theme.accent}40` : 'none',
        }}
      >
        <div className="flex h-full">
          <div style={{ width: 22, backgroundColor: theme.sidebar, borderRight: `1px solid ${theme.border}`, flexShrink: 0 }}>
            <div style={{ margin: '6px 4px 3px', height: 3, borderRadius: 2, backgroundColor: theme.text, opacity: 0.5 }} />
            <div style={{ margin: '3px 4px', height: 3, borderRadius: 2, backgroundColor: theme.card }} />
            <div style={{ margin: '3px 4px', height: 3, borderRadius: 2, backgroundColor: theme.card }} />
          </div>
          <div style={{ flex: 1, backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 12, backgroundColor: theme.sidebar, borderBottom: `1px solid ${theme.border}` }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: theme.accent, opacity: 0.7 }} />
            </div>
          </div>
        </div>
      </div>
      <span className="text-xs" style={{ color: selected ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: selected ? 600 : 400 }}>
        {name}
      </span>
    </button>
  )
}

// Sound options rendered in <select>. 'silent' is included last as a fallback.
const BUILTIN_SOUND_OPTIONS: Array<{ id: string; labelKey: keyof typeof T['zh'] }> = [
  { id: 'synth-default', labelKey: 'soundSynthDefault' },
  { id: 'alert-default', labelKey: 'soundAlertDefault' },
  { id: 'ding', labelKey: 'soundDing' },
  { id: 'chime', labelKey: 'soundChime' },
  { id: 'pop', labelKey: 'soundPop' },
  { id: 'bell', labelKey: 'soundBell' },
  { id: 'silent', labelKey: 'soundSilent' },
]

type TabId = 'general' | 'notifications' | 'rules' | 'extensions'

// ------- Panel header ----------------------------------------------------
function PanelHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
      </div>
      <hr className="mb-4" style={{ borderColor: 'var(--border)', borderTopWidth: 1, borderStyle: 'solid' }} />
    </>
  )
}

// ------- Nav item --------------------------------------------------------
function NavItem({
  id,
  active,
  icon,
  label,
  onSelect,
}: {
  id: TabId
  active: boolean
  icon: React.ReactNode
  label: string
  onSelect: (id: TabId) => void
}) {
  const [hover, setHover] = useState(false)
  const background = active ? 'var(--accent-blue)' : hover ? 'var(--bg-card)' : 'transparent'
  const color = active ? '#ffffff' : 'var(--text-primary)'
  return (
    <button
      onClick={() => onSelect(id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-colors"
      style={{ background, color }}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// =========================================================================
// Panels
// =========================================================================

interface GeneralPanelProps {
  t: any
  lang: Lang
  setLang: (l: Lang) => void
  activeTheme: string
  onThemeSelect: (id: string) => void
  autoSaveEnabled: boolean
  setAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>
}

function GeneralPanel({
  t, lang, setLang,
  activeTheme, onThemeSelect,
  autoSaveEnabled, setAutoSaveEnabled,
}: GeneralPanelProps) {
  return (
    <div>
      <PanelHeader title={t.navGeneral} desc={t.navGeneralDesc} />

      {/* Theme */}
      <div>
        <label className="block text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t.themeSection}
        </label>
        <div className="flex items-start gap-4 flex-wrap">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              name={t[THEME_NAMES[theme.id] as keyof typeof t] as string}
              selected={activeTheme === theme.id}
              onSelect={() => onThemeSelect(theme.id)}
            />
          ))}
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '20px 0' }} />

      {/* Language */}
      <div>
        <label className="block text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t.languageSection}
        </label>
        <div className="flex gap-2">
          {(['zh', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-4 py-1.5 rounded-full text-xs font-medium border transition-all"
              style={{
                backgroundColor: lang === l ? 'var(--accent-blue)' : 'var(--bg-card)',
                borderColor: lang === l ? 'var(--accent-blue)' : 'var(--border)',
                color: lang === l ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              {l === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '20px 0' }} />

      {/* Auto-save */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t.autoSaveLabel}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.autoSaveDesc}</p>
        </div>
        <button
          onClick={() => setAutoSaveEnabled((v) => !v)}
          className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors"
          style={{ backgroundColor: autoSaveEnabled ? 'var(--accent-blue)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{ backgroundColor: '#ffffff', left: 2, transform: autoSaveEnabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>
    </div>
  )
}

interface NotificationsPanelProps {
  t: any
  notifEnabled: boolean
  setNotifEnabled: React.Dispatch<React.SetStateAction<boolean>>
  notifVolume: number
  setNotifVolume: React.Dispatch<React.SetStateAction<number>>
  notifDone: string
  setNotifDone: React.Dispatch<React.SetStateAction<string>>
  notifConfirm: string
  setNotifConfirm: React.Dispatch<React.SetStateAction<string>>
  notifOsToast: boolean
  setNotifOsToast: React.Dispatch<React.SetStateAction<boolean>>
  customSounds: string[]
  previewSound: (id: string) => void
  handleOpenSoundsFolder: () => void
}

function NotificationsPanel({
  t,
  notifEnabled, setNotifEnabled,
  notifVolume, setNotifVolume,
  notifDone, setNotifDone,
  notifConfirm, setNotifConfirm,
  notifOsToast, setNotifOsToast,
  customSounds,
  previewSound,
  handleOpenSoundsFolder,
}: NotificationsPanelProps) {
  return (
    <div>
      <PanelHeader title={t.notifSectionTitle} desc={t.navNotificationsDesc} />

      {/* Enable sound toggle */}
      <div className="flex items-center justify-between py-1">
        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t.notifEnableSound}</p>
        <button
          onClick={() => setNotifEnabled((v) => !v)}
          className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors"
          style={{ backgroundColor: notifEnabled ? 'var(--accent-blue)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{ backgroundColor: '#ffffff', left: 2, transform: notifEnabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      {/* Volume slider */}
      <div className={`mt-3 ${notifEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.notifVolume}</p>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {Math.round(notifVolume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(notifVolume * 100)}
          onChange={(e) => setNotifVolume(Number(e.target.value) / 100)}
          className="w-full"
          style={{ accentColor: 'var(--accent-blue)' }}
        />
      </div>

      {/* Done sound */}
      <div className={`mt-3 ${notifEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.notifDoneSound}</p>
        <div className="flex items-center gap-2">
          <select
            value={notifDone}
            onChange={(e) => setNotifDone(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-xs"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {BUILTIN_SOUND_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{t[opt.labelKey] as string}</option>
            ))}
            {BUNDLED_SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>{t.soundName[s.id] ?? s.name}</option>
            ))}
            {customSounds.length > 0 && (
              <optgroup label={t.notifCustomGroupLabel}>
                {customSounds.map((f) => (
                  <option key={`custom:${f}`} value={`custom:${f}`}>{f}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={() => previewSound(notifDone)}
            title={t.notifPreview}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          >
            <Play size={11} />
            {t.notifPreview}
          </button>
        </div>
      </div>

      {/* Confirmation sound */}
      <div className={`mt-3 ${notifEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.notifConfirmSound}</p>
        <div className="flex items-center gap-2">
          <select
            value={notifConfirm}
            onChange={(e) => setNotifConfirm(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-xs"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {BUILTIN_SOUND_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{t[opt.labelKey] as string}</option>
            ))}
            {BUNDLED_SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>{t.soundName[s.id] ?? s.name}</option>
            ))}
            {customSounds.length > 0 && (
              <optgroup label={t.notifCustomGroupLabel}>
                {customSounds.map((f) => (
                  <option key={`custom:${f}`} value={`custom:${f}`}>{f}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={() => previewSound(notifConfirm)}
            title={t.notifPreview}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          >
            <Play size={11} />
            {t.notifPreview}
          </button>
        </div>
      </div>

      {/* Add custom sound */}
      <div className="mt-3">
        <button
          type="button"
          onClick={handleOpenSoundsFolder}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <FolderOpen size={12} />
          {t.notifAddCustom}
        </button>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          {t.notifAddCustomHint}
        </p>
      </div>

      {/* System toast toggle */}
      <div className="flex items-center justify-between py-1 mt-3">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t.notifOsToast}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.notifOsToastHint}</p>
        </div>
        <button
          onClick={() => setNotifOsToast((v) => !v)}
          className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors"
          style={{ backgroundColor: notifOsToast ? 'var(--accent-blue)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{ backgroundColor: '#ffffff', left: 2, transform: notifOsToast ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>
    </div>
  )
}

interface RulesPanelProps {
  t: any
  lang: Lang
  customRules: CustomRule[]
  defaultPreset: Set<RulePresetId>
  defaultCustom: Set<string>
  togglePreset: (id: RulePresetId) => void
  toggleCustom: (id: string) => void
  addCustom: (text: string) => void
  deleteCustom: (id: string) => void
}

function RulesPanel({
  t, lang,
  customRules,
  defaultPreset,
  defaultCustom,
  togglePreset,
  toggleCustom,
  addCustom,
  deleteCustom,
}: RulesPanelProps) {
  return (
    <div>
      <PanelHeader title={t.settingsDefaultRules} desc={t.navRulesDesc} />
      <div
        className="rounded-lg"
        style={{ border: '1px solid var(--border)', overflow: 'hidden' }}
      >
        <RulesChipSection
          presets={RULE_PRESETS}
          customs={customRules}
          presetChecked={defaultPreset}
          customChecked={defaultCustom}
          orphanLines={[]}
          onTogglePreset={togglePreset}
          onToggleCustom={toggleCustom}
          onAddCustom={addCustom}
          onDeleteCustom={deleteCustom}
          t={t as any}
          lang={lang}
        />
      </div>
    </div>
  )
}

interface ExtensionsPanelProps {
  t: any
  onOpenMcp?: () => void
  onOpenSkills?: () => void
}

function ExtensionsPanel({ t, onOpenMcp, onOpenSkills }: ExtensionsPanelProps) {
  return (
    <div>
      <PanelHeader title={t.navExtensions} desc={t.navExtensionsDesc} />
      <div className="flex flex-col gap-3">
        {onOpenMcp && (
          <button
            onClick={onOpenMcp}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <Puzzle size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <div className="flex-1 text-left">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t.mcpManager}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.mcpDescription}</p>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
        )}

        {onOpenSkills && (
          <button
            onClick={onOpenSkills}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <div className="flex-1 text-left">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t.skillManager}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.skillDescription}</p>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
        )}
      </div>
    </div>
  )
}

// =========================================================================
// Main component
// =========================================================================

export function SettingsModal({ onClose, onOpenMcp, onOpenSkills }: SettingsModalProps) {
  const {
    lang,
    setLang,
    notificationSoundEnabled,
    notificationVolume,
    notificationDoneSound,
    notificationConfirmSound,
    notificationOsToastEnabled,
    notificationCustomSoundDir,
    setNotificationPrefs,
  } = useStore()
  const t = T[lang]
  const [tab, setTab] = useState<TabId>('general')
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('app-theme') ?? 'default')

  // Local mirror of notification prefs — committed to store + electron-store on Save
  const [notifEnabled, setNotifEnabled] = useState(notificationSoundEnabled)
  const [notifVolume, setNotifVolume] = useState(notificationVolume)
  const [notifDone, setNotifDone] = useState(notificationDoneSound)
  const [notifConfirm, setNotifConfirm] = useState(notificationConfirmSound)
  const [notifOsToast, setNotifOsToast] = useState(notificationOsToastEnabled)
  const [customSounds, setCustomSounds] = useState<string[]>([])

  // Default rules (applied to new sessions)
  const [customRules, setCustomRules] = useState<CustomRule[]>([])
  const [defaultPreset, setDefaultPreset] = useState<Set<RulePresetId>>(new Set())
  const [defaultCustom, setDefaultCustom] = useState<Set<string>>(new Set())

  const customSoundDir = notificationCustomSoundDir

  const resolveCustomAbs = useMemo(() => {
    return (filename: string): string | null => {
      if (!customSoundDir) return null
      const sep = customSoundDir.includes('\\') && !customSoundDir.includes('/') ? '\\' : '/'
      const trimmed = customSoundDir.replace(/[\\/]+$/, '')
      return `${trimmed}${sep}${filename}`
    }
  }, [customSoundDir])

  useEffect(() => {
    const api = window.api as any
    api.getSettings?.().then((s: { autoSaveEnabled?: boolean }) => {
      setAutoSaveEnabled(s?.autoSaveEnabled ?? false)
    })
    // Load list of user-imported custom audio files
    api.listCustomSounds?.().then((files: string[]) => {
      if (Array.isArray(files)) setCustomSounds(files)
    })
    ;(async () => {
      const list: CustomRule[] = (await api.getCustomRules?.()) ?? []
      setCustomRules(list)
      const d = await api.getDefaultRules?.()
      setDefaultPreset(new Set((d?.presetIds ?? []) as RulePresetId[]))
      setDefaultCustom(new Set((d?.customIds ?? []) as string[]))
    })()
  }, [])

  const previewSound = (id: string) => {
    playSelection(id, notifVolume, (f) => resolveCustomAbs(f))
  }

  const handleOpenSoundsFolder = async () => {
    const api = window.api as any
    await api.openSoundsFolder?.()
  }

  const persistDefaults = async (presets: Set<RulePresetId>, customs: Set<string>) => {
    const api = window.api as any
    await api.setDefaultRules?.(Array.from(presets), Array.from(customs))
  }

  const handleThemeSelect = (id: string) => {
    setActiveTheme(id)
    applyTheme(id)
  }

  const togglePreset = (id: RulePresetId) => {
    setDefaultPreset((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      persistDefaults(next, defaultCustom)
      return next
    })
  }

  const toggleCustom = (id: string) => {
    setDefaultCustom((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      persistDefaults(defaultPreset, next)
      return next
    })
  }

  const addCustom = async (text: string) => {
    const api = window.api as any
    const added: CustomRule | null = await api.addCustomRule?.(text)
    if (!added) return
    setCustomRules((prev) => (prev.some((c) => c.id === added.id) ? prev : [...prev, added]))
    setDefaultCustom((prev) => {
      const next = new Set(prev).add(added.id)
      persistDefaults(defaultPreset, next)
      return next
    })
  }

  const deleteCustom = async (id: string) => {
    const api = window.api as any
    await api.removeCustomRule?.(id)
    setCustomRules((prev) => prev.filter((c) => c.id !== id))
    setDefaultCustom((prev) => {
      const next = new Set(prev); next.delete(id)
      persistDefaults(defaultPreset, next)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    await (window.api as any).setSettings?.({
      autoSaveEnabled,
      notificationSoundEnabled: notifEnabled,
      notificationVolume: notifVolume,
      notificationDoneSound: notifDone,
      notificationConfirmSound: notifConfirm,
      notificationOsToastEnabled: notifOsToast,
    })
    // Push into the in-memory store too so playback picks it up immediately
    setNotificationPrefs({
      notificationSoundEnabled: notifEnabled,
      notificationVolume: notifVolume,
      notificationDoneSound: notifDone,
      notificationConfirmSound: notifConfirm,
      notificationOsToastEnabled: notifOsToast,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
          width: 720,
          height: 'min(600px, 80vh)',
          maxWidth: 'calc(100vw - 48px)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Settings size={15} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.settingsTitle}</span>
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

        {/* Body: nav + panel */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <nav
            className="flex-shrink-0 flex flex-col gap-1 py-3 px-2 border-r"
            style={{ width: 180, borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
          >
            <NavItem
              id="general"
              active={tab === 'general'}
              icon={<Sliders size={16} />}
              label={t.navGeneral}
              onSelect={setTab}
            />
            <NavItem
              id="notifications"
              active={tab === 'notifications'}
              icon={<Bell size={16} />}
              label={t.navNotifications}
              onSelect={setTab}
            />
            <NavItem
              id="rules"
              active={tab === 'rules'}
              icon={<ScrollText size={16} />}
              label={t.navRules}
              onSelect={setTab}
            />
            <NavItem
              id="extensions"
              active={tab === 'extensions'}
              icon={<Puzzle size={16} />}
              label={t.navExtensions}
              onSelect={setTab}
            />
          </nav>

          {/* Right panel */}
          <div
            className="flex-1 overflow-y-auto px-6 py-5"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
          >
            {tab === 'general' && (
              <GeneralPanel
                t={t}
                lang={lang}
                setLang={setLang}
                activeTheme={activeTheme}
                onThemeSelect={handleThemeSelect}
                autoSaveEnabled={autoSaveEnabled}
                setAutoSaveEnabled={setAutoSaveEnabled}
              />
            )}
            {tab === 'notifications' && (
              <NotificationsPanel
                t={t}
                notifEnabled={notifEnabled}
                setNotifEnabled={setNotifEnabled}
                notifVolume={notifVolume}
                setNotifVolume={setNotifVolume}
                notifDone={notifDone}
                setNotifDone={setNotifDone}
                notifConfirm={notifConfirm}
                setNotifConfirm={setNotifConfirm}
                notifOsToast={notifOsToast}
                setNotifOsToast={setNotifOsToast}
                customSounds={customSounds}
                previewSound={previewSound}
                handleOpenSoundsFolder={handleOpenSoundsFolder}
              />
            )}
            {tab === 'rules' && (
              <RulesPanel
                t={t}
                lang={lang}
                customRules={customRules}
                defaultPreset={defaultPreset}
                defaultCustom={defaultCustom}
                togglePreset={togglePreset}
                toggleCustom={toggleCustom}
                addCustom={addCustom}
                deleteCustom={deleteCustom}
              />
            )}
            {tab === 'extensions' && (
              <ExtensionsPanel
                t={t}
                onOpenMcp={onOpenMcp}
                onOpenSkills={onOpenSkills}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5 pt-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
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
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
            onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  )
}
