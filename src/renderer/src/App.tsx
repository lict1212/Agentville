import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalPane } from './components/TerminalPane'
import { confirmDialog } from './components/ConfirmDialog'
import { MonitorGrid } from './components/MonitorGrid'
import { RolePanel } from './components/RolePanel'
import { SettingsModal } from './components/SettingsModal'
import { McpManagerModal } from './components/McpManagerModal'
import { SkillManagerModal } from './components/SkillManagerModal'
import { CliModal } from './components/CliModal'
import { CliSwitcher } from './components/CliSwitcher'
import { NewProjectModal } from './components/NewProjectModal'
import { DuplicateAgentModal } from './components/DuplicateAgentModal'
import { MigrateWorkspaceModal } from './components/MigrateWorkspaceModal'
import { SessionSwitcher, type SwitcherItem } from './components/SessionSwitcher'
import { QuitConfirmModal } from './components/QuitConfirmModal'
import { useStore } from './store/useStore'
import { T } from './i18n'
import { playDoneSound, playAlertSound } from './utils/sound'

export default function App() {
  const {
    projects, activeProjectId, notifications,
    groups, setGroups, addGroup, updateGroup, removeGroup,
    setProjects, addProject, updateProject, removeProject, setActiveProject,
    addNotification, clearNotification, setNotificationPrefs
  } = useStore()
  const [runningProjects, setRunningProjects] = useState<Set<string>>(new Set())
  const [savingProjects, setSavingProjects] = useState<Set<string>>(new Set())
  const [manualSavingProjects, setManualSavingProjects] = useState<Set<string>>(new Set())
  const [autoSavingProjects, setAutoSavingProjects] = useState<Set<string>>(new Set())
  const [cliErrors, setCliErrors] = useState<Map<string, { cliName: string; installHint: string | null; cliKey: string }>>(new Map())
  const [terminalNotify, setTerminalNotify] = useState<{ message: string; level: 'info' | 'success' | 'error' } | null>(null)
  const notifyTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [showRolePanel, setShowRolePanel] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMcpManager, setShowMcpManager] = useState(false)
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [showCliModal, setShowCliModal] = useState(false)
  const [showCliSwitcher, setShowCliSwitcher] = useState(false)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [newProjectTargetGroup, setNewProjectTargetGroup] = useState<string | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<{ id: string; name: string; initialName: string } | null>(null)
  const [showMigrateModal, setShowMigrateModal] = useState(false)
  // In-app close confirmation: set when the main process intercepts window close.
  const [quitPrompt, setQuitPrompt] = useState<{ runningCount: number } | null>(null)
  const [globalCliDefault, setGlobalCliDefault] = useState('claude')
  const [cliRegistry, setCliRegistry] = useState<Record<string, { memoryFile: string | null; name?: string; installHint?: string }>>({})
  const [mainView, setMainView] = useState<'terminal' | 'monitor'>('terminal')
  // Ctrl+Tab session switcher (VSCode-style: hold Ctrl, Tab/scroll to cycle, release to commit)
  const [switcher, setSwitcher] = useState<{ open: boolean; items: SwitcherItem[]; index: number }>({
    open: false, items: [], index: 0,
  })
  // Stripped-text buffers for monitor preview (accumulated even when monitor is closed)
  const monitorBuffers = useRef<Map<string, string>>(new Map())
  // Only enable "done" notifications for projects the user has actually sent a message to
  const userInteractedRef = useRef<Set<string>>(new Set())
  // Track project start times — suppress notifications for first 15s after startup
  const projectStartTimesRef = useRef<Map<string, number>>(new Map())

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  // First launch: adopt the language picked in the installer. localStorage
  // 'app-lang' only exists once the user (or this effect) has chosen a
  // language, so this can never override an explicit in-app choice.
  useEffect(() => {
    if (localStorage.getItem('app-lang')) return
    ;(window.api as any).getInstallerLanguage?.().then((l: 'zh' | 'en' | null) => {
      if (l === 'zh' || l === 'en') useStore.getState().setLang(l)
    })
  }, [])

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('app-theme') ?? 'default'
    if (saved === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', saved)
    }
    // Sync titlebar overlay color with saved theme
    const TITLEBAR_COLORS: Record<string, { color: string; symbolColor: string }> = {
      'default':     { color: 'var(--bg-sidebar)',        symbolColor: 'var(--text-secondary)' },
      'apple-dark':  { color: '#2c2c2e',        symbolColor: '#98989d' },
      'midnight':    { color: '#000000',         symbolColor: '#86868b' },
      'apple-light': { color: '#ffffff',           symbolColor: '#1c1c1e' },
      'warm':        { color: '#221c16',         symbolColor: '#a89880' },
    }
    const tb = TITLEBAR_COLORS[saved] ?? TITLEBAR_COLORS['default']
    ;(window.api as any).setTitleBarOverlay?.(tb.color, tb.symbolColor)
  }, [])

  useEffect(() => {
    window.api.listProjects().then((loaded) => {
      // On startup no PTY is running — reset any non-paused status.
      // Also defensively normalize groupId/pinned in case any Project slips through without them.
      const reset = loaded.map((p: any) => ({
        ...p,
        groupId: p.groupId ?? null,
        pinned: p.pinned ?? false,
        status: p.status !== 'paused' ? 'paused' : p.status,
      }))
      setProjects(reset)
    })
    ;(window.api as any).listGroups?.().then((loaded: any[]) => {
      if (Array.isArray(loaded)) setGroups(loaded)
    })
    ;(window.api as any).getSettings?.().then((s: {
      defaultCliCommand?: string
      notificationSoundEnabled?: boolean
      notificationVolume?: number
      notificationDoneSound?: string
      notificationConfirmSound?: string
      notificationOsToastEnabled?: boolean
      notificationCustomSoundDir?: string | null
    }) => {
      if (s?.defaultCliCommand) setGlobalCliDefault(s.defaultCliCommand)
      setNotificationPrefs({
        notificationSoundEnabled: s?.notificationSoundEnabled ?? true,
        notificationVolume: typeof s?.notificationVolume === 'number' ? s.notificationVolume : 0.7,
        notificationDoneSound: s?.notificationDoneSound ?? 'bundled:quiet',
        notificationConfirmSound: s?.notificationConfirmSound ?? 'bundled:clever-touch',
        notificationOsToastEnabled: s?.notificationOsToastEnabled ?? false,
        notificationCustomSoundDir: s?.notificationCustomSoundDir ?? null,
      })
    })
    ;(window.api as any).getCliRegistry?.().then((res: { registry: Record<string, any> }) => {
      if (res?.registry) setCliRegistry(res.registry)
    })
  }, [])

  // Accumulate stripped-text buffers for MonitorGrid (runs regardless of view)
  useEffect(() => {
    const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*[\x07\x1b\\])/g
    return window.api.onPtyData((id: string, data: string) => {
      const stripped = data.replace(ANSI_RE, '').replace(/\r/g, '')
      if (!stripped) return
      const prev = monitorBuffers.current.get(id) ?? ''
      const combined = prev + stripped
      const lines = combined.split('\n')
      monitorBuffers.current.set(id, lines.slice(-80).join('\n'))
    })
  }, [])

  // Refs so event handlers always see latest values without re-registering
  const activeProjectIdRef = useRef<string | null>(activeProjectId)
  activeProjectIdRef.current = activeProjectId
  // Live mirrors for the global Ctrl+Tab handler (registered once, must read latest)
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const runningProjectsRef = useRef(runningProjects)
  runningProjectsRef.current = runningProjects
  const switcherRef = useRef(switcher)
  switcherRef.current = switcher
  // Most-recently-used order of project ids — front = most recent. Drives switcher order.
  const mruRef = useRef<string[]>([])
  const prevStatusesRef = useRef<Map<string, string>>(new Map())
  // Projects we have explicitly stopped — ignore stale status events for these
  const explicitlyStoppedRef = useRef<Set<string>>(new Set())
  // Window focus tracking — when blurred, fire OS-level notifications
  const isFocusedRef = useRef<boolean>(typeof document !== 'undefined' && document.hasFocus())

  useEffect(() => {
    const onFocus = () => { isFocusedRef.current = true }
    const onBlur = () => { isFocusedRef.current = false }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [])

  // Maintain MRU order: whenever the active session changes, move it to the front.
  useEffect(() => {
    if (!activeProjectId) return
    mruRef.current = [activeProjectId, ...mruRef.current.filter((id) => id !== activeProjectId)]
  }, [activeProjectId])

  // Global Ctrl+Tab / Ctrl+scroll session switcher.
  // Registered once; reads live state through refs. Captures keys before xterm.
  useEffect(() => {
    const commit = () => {
      const s = switcherRef.current
      if (!s.open) return
      const target = s.items[s.index]
      setSwitcher({ open: false, items: [], index: 0 })
      if (target) { setActiveProject(target.id); clearNotification(target.id) }
    }
    const cancel = () => setSwitcher({ open: false, items: [], index: 0 })

    // Build the running-session list in MRU order. Front of MRU (the current active
    // session) lands at index 0, so opening highlights index 1 — a single tap flips back.
    const buildItems = (): SwitcherItem[] => {
      const running = projectsRef.current.filter((p) => runningProjectsRef.current.has(p.id) && !p.archived)
      const byId = new Map(running.map((p) => [p.id, p]))
      const ordered: typeof running = []
      for (const id of mruRef.current) {
        const p = byId.get(id)
        if (p) { ordered.push(p); byId.delete(id) }
      }
      for (const p of byId.values()) ordered.push(p) // running but never activated yet
      return ordered.map((p) => ({ id: p.id, name: p.name, cliCommand: p.cliCommand, status: p.status }))
    }

    const open = (backwards: boolean) => {
      const items = buildItems()
      const activeId = activeProjectIdRef.current
      // Only open if there's somewhere to go — at least one running bot that isn't the current page.
      if (!items.some((it) => it.id !== activeId)) return false
      // Highlight relative to the current page. If the current page isn't a running bot
      // (e.g. a paused one), land on the first/last running bot directly.
      const activeIdx = items.findIndex((it) => it.id === activeId)
      const n = items.length
      const index = activeIdx >= 0
        ? (backwards ? (activeIdx - 1 + n) % n : (activeIdx + 1) % n)
        : (backwards ? n - 1 : 0)
      setSwitcher({ open: true, items, index })
      return true
    }

    const step = (delta: number) => {
      const s = switcherRef.current
      if (!s.open || s.items.length === 0) return
      const n = s.items.length
      const index = ((s.index + delta) % n + n) % n
      setSwitcher({ ...s, index })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.ctrlKey) {
        const handled = switcherRef.current.open ? (step(e.shiftKey ? -1 : 1), true) : open(e.shiftKey)
        if (handled) { e.preventDefault(); e.stopImmediatePropagation() }
        return
      }
      if (switcherRef.current.open) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancel() }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); commit() }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      // Releasing Ctrl commits the highlighted session.
      if ((e.key === 'Control' || e.key === 'Ctrl') && switcherRef.current.open) commit()
    }

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      if (switcherRef.current.open) {
        e.preventDefault(); e.stopImmediatePropagation()
        step(e.deltaY > 0 ? 1 : -1)
      } else if (open(e.deltaY < 0)) {
        e.preventDefault(); e.stopImmediatePropagation()
      }
    }

    // Lose Ctrl while the window is blurred (e.g. OS Alt+Tab away) — cancel cleanly.
    const onBlur = () => { if (switcherRef.current.open) cancel() }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const unsubStatus = window.api.onPtyStatus((id, status) => {
      // Ignore non-paused status events for projects we've explicitly stopped
      if (explicitlyStoppedRef.current.has(id) && status !== 'paused') return
      if (status === 'paused') explicitlyStoppedRef.current.delete(id)

      const prev = prevStatusesRef.current.get(id)
      prevStatusesRef.current.set(id, status)
      updateProject(id, { status: status as any })

      const isActive = id === activeProjectIdRef.current
      // Suppress all notifications for 15s after startup (Claude boot-up permission prompts)
      const startTime = projectStartTimesRef.current.get(id) ?? 0
      const pastStartupGrace = Date.now() - startTime > 8000
      if (pastStartupGrace) {
        const isConfirm = status === 'needs_confirmation' && prev !== 'needs_confirmation'
        const isDone = status === 'waiting' && prev === 'working' && userInteractedRef.current.has(id)
        if (isDone) userInteractedRef.current.delete(id)

        if (isConfirm || isDone) {
          // Badge: only for sessions the user isn't currently viewing
          if (!isActive) addNotification(id)
          // Sound: fire whenever the user isn't actively watching — either session inactive, or window blurred (e.g. gaming)
          const st = useStore.getState()
          if (st.notificationSoundEnabled && (!isActive || !isFocusedRef.current)) {
            if (isConfirm) playAlertSound()
            else playDoneSound()
          }
          // OS-level toast — opt-in via settings; only fires when user isn't watching this session
          if (st.notificationOsToastEnabled && (!isActive || !isFocusedRef.current)) {
            const proj = projects.find((p) => p.id === id)
            const projectName = proj?.name ?? ''
            const lang = st.lang
            const title = isConfirm
              ? (lang === 'zh' ? `需要确认 · ${projectName}` : `Needs Confirmation · ${projectName}`)
              : (lang === 'zh' ? `任务完成 · ${projectName}` : `Task Complete · ${projectName}`)
            const body = isConfirm
              ? (lang === 'zh' ? `${projectName} 需要你的确认` : `${projectName} needs your confirmation`)
              : (lang === 'zh' ? `${projectName} 已完成当前任务` : `${projectName} has finished the current task`)
            ;(window.api as any).notifySystem?.({ title, body, projectId: id })
          }
        }
      }
    })
    const unsubExit = window.api.onPtyExit((id) => {
      setRunningProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
      updateProject(id, { status: 'paused' })
    })
    const unsubName = (window.api as any).onProjectNameUpdate?.((id: string, name: string) => {
      updateProject(id, { name })
    }) ?? (() => {})
    const unsubCliNotFound = (window.api as any).onCliNotFound?.((id: string, cliName: string, installHint: string | null, cliKey: string) => {
      setRunningProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
      setCliErrors((prev) => new Map(prev).set(id, { cliName, installHint, cliKey }))
    }) ?? (() => {})
    const unsubAutoSave = (window.api as any).onAutoSave?.((id: string, saving: boolean) => {
      setAutoSavingProjects((prev) => {
        const n = new Set(prev)
        saving ? n.add(id) : n.delete(id)
        return n
      })
    }) ?? (() => {})
    const unsubNotify = (window.api as any).onPtyNotify?.((id: string, message: string, level: 'info' | 'success' | 'error') => {
      if (id !== activeProjectIdRef.current) return
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
      setTerminalNotify({ message, level })
      notifyTimerRef.current = setTimeout(() => setTerminalNotify(null), 4000)
    }) ?? (() => {})
    const unsubFocusReq = (window.api as any).onProjectFocusRequest?.((projectId: string) => {
      setActiveProject(projectId)
      clearNotification(projectId)
    }) ?? (() => {})
    return () => { unsubStatus(); unsubExit(); unsubName(); unsubAutoSave(); unsubCliNotFound(); unsubNotify(); unsubFocusReq() }
  }, [])

  // Main process asks us to confirm before quitting (in-app modal).
  useEffect(() => {
    return (window.api as any).onCloseRequested?.((runningCount: number) => {
      setQuitPrompt({ runningCount })
    })
  }, [])

  const handleNewProject = useCallback((groupId: string | null) => {
    setNewProjectTargetGroup(groupId)
    setShowNewProjectModal(true)
  }, [])

  const handleCreateProject = useCallback(async (name: string, role: string, cliCommand: string, folderPath?: string, groupId: string | null = null) => {
    // 占位名同时认中英文，避免历史项目 / 切换语言后计数错乱
    const PLACEHOLDER_PREFIXES = ['新项目', 'New Project']
    const base = T[useStore.getState().lang].newProjectName
    const existingCount = projects.filter((p) => PLACEHOLDER_PREFIXES.some((ph) => p.name.startsWith(ph))).length
    const autoName = name.trim() || (existingCount === 0 ? base : `${base} ${existingCount + 1}`)
    const created = await window.api.createProject({ name: autoName, role, folderPath, cliCommand, groupId })
    // Normalize shape for the store (main process already sets these, but the shared
    // env.d.ts types them as optional — narrow here so the store's required fields are satisfied).
    const newProject = { ...created, groupId: created.groupId ?? null, pinned: created.pinned ?? false }
    addProject(newProject)
    setActiveProject(newProject.id)
    setRunningProjects((prev) => new Set([...prev, newProject.id]))
    updateProject(newProject.id, { status: 'working', lastUsed: new Date().toISOString() })
    projectStartTimesRef.current.set(newProject.id, Date.now())
    await window.api.startPty(newProject.id, newProject.path)
  }, [])

  const handleSelectProject = useCallback((id: string) => {
    setActiveProject(id)
    clearNotification(id)
  }, [])

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    await window.api.updateProject(id, { name })
    updateProject(id, { name })
  }, [])

  const handleDeleteProject = useCallback(async (id: string) => {
    await window.api.stopPty(id).catch(() => {})
    await window.api.deleteProject(id)
    removeProject(id)
    setRunningProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
    userInteractedRef.current.delete(id)
  }, [])

  const handleArchiveProject = useCallback(async (id: string) => {
    await window.api.stopPty(id).catch(() => {})
    await window.api.updateProject(id, { archived: true, status: 'paused' })
    updateProject(id, { archived: true, status: 'paused' })
    setRunningProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
    if (activeProjectId === id) setActiveProject(null)
  }, [activeProjectId])

  const handleUnarchiveProject = useCallback(async (id: string) => {
    await window.api.updateProject(id, { archived: false })
    updateProject(id, { archived: false })
  }, [])

  const handleTogglePinProject = useCallback(async (id: string) => {
    const p = projects.find((x) => x.id === id)
    if (!p) return
    const next = !p.pinned
    await window.api.updateProject(id, { pinned: next })
    updateProject(id, { pinned: next })
  }, [projects])

  const handleDuplicateProject = useCallback((id: string) => {
    const source = projects.find((p) => p.id === id)
    if (!source) return
    const t = T[useStore.getState().lang]
    // Build a unique "<name> 副本" / "<name> copy", incrementing if it collides.
    const base = `${source.name} ${t.copySuffix}`
    let initialName = base
    let n = 2
    while (projects.some((p) => p.name === initialName)) {
      initialName = `${base} ${n++}`
    }
    setDuplicateSource({ id, name: source.name, initialName })
  }, [projects])

  const handleConfirmDuplicate = useCallback(async (name: string, folderPath: string | null) => {
    if (!duplicateSource) return
    const t = T[useStore.getState().lang]
    let result = await window.api.duplicateProject(duplicateSource.id, name, folderPath ?? undefined)
    // User-picked folder already has a CLAUDE.md — confirm before overwriting.
    if (result && 'conflict' in result) {
      if (!(await confirmDialog(t.duplicateOverwriteConfirm))) return
      result = await window.api.duplicateProject(duplicateSource.id, name, folderPath ?? undefined, true)
    }
    if (!result || 'conflict' in result) return
    const newProject = { ...result, groupId: result.groupId ?? null, pinned: result.pinned ?? false }
    addProject(newProject)
    setActiveProject(newProject.id)
  }, [duplicateSource])

  const handleMoveProjectToGroup = useCallback(async (id: string, groupId: string | null) => {
    await window.api.updateProject(id, { groupId })
    updateProject(id, { groupId })
  }, [])

  const handleCreateGroup = useCallback(async (name: string) => {
    const created = await (window.api as any).addGroup?.(name)
    if (created) addGroup(created)
  }, [])

  const handleRenameGroup = useCallback(async (id: string, name: string) => {
    await (window.api as any).updateGroup?.(id, { name })
    updateGroup(id, { name })
  }, [])

  const handleTogglePinGroup = useCallback(async (id: string) => {
    const g = groups.find((x) => x.id === id)
    if (!g) return
    const next = !g.pinned
    await (window.api as any).updateGroup?.(id, { pinned: next })
    updateGroup(id, { pinned: next })
  }, [groups])

  const handleDeleteGroup = useCallback(async (id: string) => {
    await (window.api as any).removeGroup?.(id)
    // Reflect locally: group's projects get migrated to groupId=null (matches main process).
    removeGroup(id)
  }, [])

  const handleStartProject = useCallback(async () => {
    // Use ref to always get latest activeProjectId, avoiding stale closure issues
    const id = activeProjectIdRef.current
    if (!id) return
    const proj = projects.find((p) => p.id === id)
    if (!proj) return
    // Clear any previous CLI error for this project
    setCliErrors((prev) => { const n = new Map(prev); n.delete(id); return n })
    // Record start time for notification suppression during startup
    projectStartTimesRef.current.set(id, Date.now())
    // Optimistically mark running so overlay disappears immediately
    setRunningProjects((prev) => new Set([...prev, id]))
    updateProject(id, { status: 'working', lastUsed: new Date().toISOString() })
    const started = await window.api.startPty(id, proj.path)
    if (!started) {
      // CLI not found — undo optimistic updates, error overlay shown via onCliNotFound event
      setRunningProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    await window.api.updateProject(id, { status: 'working', lastUsed: new Date().toISOString() })
  }, [projects])

  const handleStopProject = useCallback(async () => {
    if (!activeProject) return
    const hasInteracted = userInteractedRef.current.has(activeProject.id)
    explicitlyStoppedRef.current.add(activeProject.id)
    setSavingProjects((prev) => new Set([...prev, activeProject.id]))
    await window.api.stopPty(activeProject.id, hasInteracted)
    setSavingProjects((prev) => { const n = new Set(prev); n.delete(activeProject.id); return n })
    setRunningProjects((prev) => { const n = new Set(prev); n.delete(activeProject.id); return n })
    userInteractedRef.current.delete(activeProject.id)
    updateProject(activeProject.id, { status: 'paused' })
  }, [activeProject])

  const isActiveRunning = activeProjectId ? runningProjects.has(activeProjectId) : false
  const isActiveSaving = activeProjectId ? savingProjects.has(activeProjectId) : false
  const isActiveAutoSaving = activeProjectId ? autoSavingProjects.has(activeProjectId) : false
  const isActiveManualSaving = activeProjectId ? manualSavingProjects.has(activeProjectId) : false

  const handleManualSave = useCallback(async () => {
    if (!activeProject || !isActiveRunning) return
    setManualSavingProjects((prev) => new Set([...prev, activeProject.id]))
    await (window.api as any).savePty?.(activeProject.id)
    setManualSavingProjects((prev) => { const n = new Set(prev); n.delete(activeProject.id); return n })
  }, [activeProject, isActiveRunning])

  // Compute memory file name for active project based on its CLI
  const activeCliCmd = (activeProject?.cliCommand || globalCliDefault || 'claude').trim().split(/\s+/)[0].toLowerCase()
  const activeMemoryFile: string | null = cliRegistry[activeCliCmd]?.memoryFile ?? 'CLAUDE.md'

  const handleSaveRole = useCallback(async (role: string) => {
    if (!activeProject) return
    await window.api.updateProject(activeProject.id, { role })
    updateProject(activeProject.id, { role })
    // Also update CLAUDE.md role section
    await window.api.updateProjectRole(activeProject.id, role)
    setShowRolePanel(false)
  }, [activeProject])

  const handleSaveCli = useCallback(async (command: string | undefined) => {
    if (!activeProject) return
    await window.api.updateProject(activeProject.id, { cliCommand: command ?? null })
    updateProject(activeProject.id, { cliCommand: command })
  }, [activeProject])

  const handleSwitchCli = useCallback(async (command: string) => {
    if (!activeProject) return
    const wasRunning = isActiveRunning

    // Stop if running (saves memory canonically in main process)
    if (wasRunning) {
      const hasInteracted = userInteractedRef.current.has(activeProject.id)
      explicitlyStoppedRef.current.add(activeProject.id)
      setSavingProjects((prev) => new Set([...prev, activeProject.id]))
      await window.api.stopPty(activeProject.id, hasInteracted)
      setSavingProjects((prev) => { const n = new Set(prev); n.delete(activeProject.id); return n })
      setRunningProjects((prev) => { const n = new Set(prev); n.delete(activeProject.id); return n })
      userInteractedRef.current.delete(activeProject.id)
    }

    // Update CLI command
    await window.api.updateProject(activeProject.id, { cliCommand: command })
    updateProject(activeProject.id, { cliCommand: command })

    // Restart if it was running
    if (wasRunning) {
      setRunningProjects((prev) => new Set([...prev, activeProject.id]))
      updateProject(activeProject.id, { status: 'working', lastUsed: new Date().toISOString() })
      await window.api.startPty(activeProject.id, activeProject.path)
      await window.api.updateProject(activeProject.id, { status: 'working', lastUsed: new Date().toISOString() })
    }
  }, [activeProject, isActiveRunning])

  const handleSettingsSaved = useCallback(() => {
    // Refresh global settings after save
    ;(window.api as any).getSettings?.().then((s: {
      defaultCliCommand?: string
      notificationSoundEnabled?: boolean
      notificationVolume?: number
      notificationDoneSound?: string
      notificationConfirmSound?: string
      notificationOsToastEnabled?: boolean
      notificationCustomSoundDir?: string | null
    }) => {
      if (s?.defaultCliCommand) setGlobalCliDefault(s.defaultCliCommand)
      setNotificationPrefs({
        notificationSoundEnabled: s?.notificationSoundEnabled ?? true,
        notificationVolume: typeof s?.notificationVolume === 'number' ? s.notificationVolume : 0.7,
        notificationDoneSound: s?.notificationDoneSound ?? 'bundled:quiet',
        notificationConfirmSound: s?.notificationConfirmSound ?? 'bundled:clever-touch',
        notificationOsToastEnabled: s?.notificationOsToastEnabled ?? false,
        notificationCustomSoundDir: s?.notificationCustomSoundDir ?? null,
      })
    })
    setShowSettings(false)
  }, [])

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--bg-base)', paddingTop: 38 }}>
      {/* Draggable titlebar region — allows moving the window */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 38, WebkitAppRegion: 'drag', zIndex: 9999 } as React.CSSProperties} />
      <Sidebar
        projects={projects}
        groups={groups}
        activeProjectId={activeProjectId}
        notifications={notifications}
        onSelectProject={handleSelectProject}
        onDeleteProject={handleDeleteProject}
        onArchiveProject={handleArchiveProject}
        onUnarchiveProject={handleUnarchiveProject}
        onRenameProject={handleRenameProject}
        onTogglePinProject={handleTogglePinProject}
        onMoveProjectToGroup={handleMoveProjectToGroup}
        onDuplicateProject={handleDuplicateProject}
        onNewProject={handleNewProject}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onTogglePinGroup={handleTogglePinGroup}
        onDeleteGroup={handleDeleteGroup}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        <TerminalPane
          project={activeProject}
          isRunning={isActiveRunning}
          isSaving={isActiveSaving}
          isAutoSaving={isActiveAutoSaving}
          isManualSaving={isActiveManualSaving}
          onSaveMemory={handleManualSave}
          cliError={activeProjectId ? (cliErrors.get(activeProjectId) ?? null) : null}
          globalCliDefault={globalCliDefault}
          memoryFile={activeMemoryFile}
          onStart={handleStartProject}
          onStop={handleStopProject}
          onOpenRole={() => setShowRolePanel(true)}
          onChangeCli={() => setShowCliSwitcher(true)}
          onMigrateWorkspace={() => setShowMigrateModal(true)}
          onUserInput={(id) => { userInteractedRef.current.add(id) }}
          onToggleMonitor={() => setMainView((v) => v === 'monitor' ? 'terminal' : 'monitor')}
          isMonitorView={mainView === 'monitor'}
          monitorContent={mainView === 'monitor' ? (
            <MonitorGrid
              projects={projects}
              groups={groups}
              runningProjects={runningProjects}
              initialBuffers={new Map(monitorBuffers.current)}
              onSelectProject={(id) => {
                handleSelectProject(id)
                setMainView('terminal')
              }}
            />
          ) : undefined}
          notify={terminalNotify}
        />
      </div>

      {showRolePanel && activeProject && (
        <RolePanel
          project={activeProject}
          memoryFile={activeMemoryFile}
          onClose={() => setShowRolePanel(false)}
          onSave={handleSaveRole}
        />
      )}

      {showMigrateModal && activeProject && (
        <MigrateWorkspaceModal
          projectId={activeProject.id}
          currentPath={activeProject.path}
          isRunning={isActiveRunning}
          onClose={() => setShowMigrateModal(false)}
          onMigrated={(newPath) => { updateProject(activeProject.id, { path: newPath }) }}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={handleSettingsSaved}
          onOpenMcp={() => setShowMcpManager(true)}
          onOpenSkills={() => setShowSkillManager(true)}
        />
      )}

      {showMcpManager && (
        <McpManagerModal
          onBack={() => setShowMcpManager(false)}
          onClose={() => { setShowMcpManager(false); handleSettingsSaved() }}
        />
      )}

      {showSkillManager && (
        <SkillManagerModal
          onBack={() => setShowSkillManager(false)}
          onClose={() => { setShowSkillManager(false); handleSettingsSaved() }}
        />
      )}

      {showCliModal && activeProject && (
        <CliModal
          projectId={activeProject.id}
          projectName={activeProject.name}
          currentCommand={activeProject.cliCommand}
          globalDefault={globalCliDefault}
          onClose={() => setShowCliModal(false)}
          onSave={handleSaveCli}
        />
      )}

      {showCliSwitcher && activeProject && (
        <CliSwitcher
          projectName={activeProject.name}
          currentCommand={activeProject.cliCommand || globalCliDefault || 'claude'}
          isRunning={isActiveRunning}
          onClose={() => setShowCliSwitcher(false)}
          onSwitch={handleSwitchCli}
        />
      )}

      {showNewProjectModal && (
        <NewProjectModal
          globalCliDefault={globalCliDefault}
          cliOptions={Object.entries(cliRegistry).map(([key, val]) => ({
            key,
            name: val.name || key,
            installHint: val.installHint,
          }))}
          onClose={() => { setShowNewProjectModal(false); setNewProjectTargetGroup(null) }}
          onCreate={async (name, role, cliCommand, folderPath) => {
            await handleCreateProject(name, role, cliCommand, folderPath, newProjectTargetGroup)
            setShowNewProjectModal(false)
            setNewProjectTargetGroup(null)
          }}
        />
      )}

      {duplicateSource && (
        <DuplicateAgentModal
          sourceName={duplicateSource.name}
          initialName={duplicateSource.initialName}
          onClose={() => setDuplicateSource(null)}
          onConfirm={handleConfirmDuplicate}
        />
      )}

      {quitPrompt && (
        <QuitConfirmModal
          runningCount={quitPrompt.runningCount}
          onCancel={() => setQuitPrompt(null)}
        />
      )}

      {switcher.open && (
        <SessionSwitcher
          items={switcher.items}
          index={switcher.index}
          onHover={(i) => setSwitcher((s) => (s.open ? { ...s, index: i } : s))}
          onPick={(i) => {
            const target = switcher.items[i]
            setSwitcher({ open: false, items: [], index: 0 })
            if (target) { setActiveProject(target.id); clearNotification(target.id) }
          }}
        />
      )}
    </div>
  )
}
