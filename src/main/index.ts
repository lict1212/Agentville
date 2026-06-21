import { app, BrowserWindow, ipcMain, dialog, shell, Notification, protocol, net, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { execFileSync, spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from '../../resources/icon.png?asset'
import fs from 'fs'
import {
  startProcess,
  stopProcess,
  saveMemory,
  writeToProcess,
  resizeProcess,
  getAllRunningIds
} from './processManager'
import { resolveCliConfig, CLI_REGISTRY, CLI_ORDER } from './cliRegistry'
import { MCP_PRESETS } from './mcpPresets'
import {
  getMcpServers,
  setMcpServer,
  removeMcpServer,
  getConfigPath as getMcpConfigPath,
  type McpServerEntry,
  type McpScopeRef,
} from './mcpManager'
import { SKILL_PRESETS } from './skillPresets'
import {
  listInstalledSkills,
  installSkill,
  uninstallSkill,
  readSkillBody,
  getSkillsDir,
  type SkillScopeRef,
} from './skillManager'

// 默认占位项目名（等 CLI 自动命名）。同时认中英文，兼容历史项目和语言切换。
const PROJECT_PLACEHOLDER_PREFIXES = ['新项目', 'New Project']
function isPlaceholderProjectName(name: string): boolean {
  return PROJECT_PLACEHOLDER_PREFIXES.some((p) => name.startsWith(p))
}

interface Project {
  id: string
  name: string
  path: string        // 启动目录
  role: string        // 角色设定
  cliCommand?: string // 启动命令（空 = 使用全局默认）
  memoryContent?: string // 规范化记忆内容（CLI 无关，Agentville 管理）
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  archived?: boolean
  groupId?: string | null
  pinned?: boolean
  createdAt: string
  lastUsed: string
}

interface Group {
  id: string
  name: string
  pinned: boolean
  createdAt: string
}

// Normalize legacy projects on load: ensure groupId/pinned fields exist.
function normalizeProjects(list: Project[]): Project[] {
  return list.map((p) => ({
    ...p,
    groupId: p.groupId ?? null,
    pinned: p.pinned ?? false,
  }))
}

// Preset snippets duplicated here for the main process (renderer has its own copy).
const RULE_PRESET_SNIPPETS: Record<string, string> = {
  replyChinese: 'Always reply in Chinese.',
  noAutoCommit: "Do not run git commit until I explicitly say 'commit'.",
  preCommitChecks: 'Run lint and typecheck before committing.',
  noExtras: 'Do not add features, refactors, or abstractions that were not explicitly requested.',
  minimalComments: 'Do not add comments unless strictly necessary to explain a non-obvious reason.',
  reviewFirst: 'After changes, wait for my review before proceeding to the next step.',
}

function buildDefaultRulesBody(
  presetIds: string[],
  customRules: Array<{ id: string; text: string }>,
  customIds: string[],
): string {
  const lines: string[] = []
  for (const id of presetIds) {
    const snip = RULE_PRESET_SNIPPETS[id]
    if (snip) lines.push(`- ${snip}`)
  }
  const byId = new Map(customRules.map((c) => [c.id, c.text]))
  for (const id of customIds) {
    const text = byId.get(id)
    if (text) lines.push(`- ${text}`)
  }
  return lines.join('\n')
}

function buildClaudeMd(name: string, role: string, createdAt: string, memoryFile = 'CLAUDE.md', rulesBody = ''): string {
  const roleText = role.trim() || '(defined through conversation)'
  const rulesSection = rulesBody.trim() ? `\n## Rules\n${rulesBody}\n` : ''
  return `# Workspace — ${name}

## Memory System
Two files store your memory across sessions. Read both on startup, update both on save.

- **${memoryFile}** (this file): Live project memory. Current status, role, decisions, and personal user context. Rewrite relevant sections each session.
- **memory.md**: Session history log. Compressed summaries, one entry per session. Append only — never overwrite.

## Save Protocol
When you receive **AGENTVILLE_SAVE [MM-DD]**, do both steps then reply "SAVED":
1. Rewrite **${memoryFile}**: update Workspace Status (task, progress, directory), update User Context (add anything personal the user shared — feelings, names, preferences, anything worth remembering next time), update Key Decisions (append new ones). Keep all other content.
2. Append to **memory.md** without overwriting existing lines: [MM-DD] one-line session summary (max 100 chars); optionally add "  > " lines for key user context or next steps.

## Workspace Status
- Project: ${name}
- Directory: TBD
- Description: TBD
- Current Task: TBD
- Progress: New session
- Created: ${createdAt}

## Role
${roleText}

## User Context
(record personal context, preferences, and anything the user has shared that is worth remembering)
${rulesSection}
## Key Decisions
(record important technical or project decisions here)
`
}

let store: any = null

async function getStore() {
  if (!store) {
    const Store = (await import('electron-store')).default
    store = new Store({
      defaults: {
        projects: [],
        groups: []
      }
    })
  }
  return store
}

function getSavedBounds(): Electron.Rectangle | null {
  try {
    const data = require('fs').readFileSync(
      require('path').join(app.getPath('userData'), 'window-bounds.json'), 'utf-8'
    )
    return JSON.parse(data)
  } catch { return null }
}

// Make sure the saved rect still lives on a connected display. If the user
// unplugged a monitor or switched to mirrored mode, the old x/y can land
// fully off-screen — fall back to centering on the primary display.
function sanitizeBounds(b: Electron.Rectangle | null): Electron.Rectangle | null {
  if (!b) return null
  const displays = screen.getAllDisplays()
  const MIN_VISIBLE = 200 // px of titlebar that must remain reachable
  const fits = displays.some((d) => {
    const wa = d.workArea
    const ix = Math.max(0, Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x))
    const iy = Math.max(0, Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y))
    return ix >= MIN_VISIBLE && iy >= MIN_VISIBLE
  })
  if (fits) return b
  // Keep size, drop position so Electron centers on the primary display.
  return { x: undefined as unknown as number, y: undefined as unknown as number, width: b.width, height: b.height }
}

function saveBounds(bounds: Electron.Rectangle): void {
  try {
    require('fs').writeFileSync(
      require('path').join(app.getPath('userData'), 'window-bounds.json'),
      JSON.stringify(bounds), 'utf-8'
    )
  } catch { /* ignore */ }
}

function createWindow(): void {
  const saved = sanitizeBounds(getSavedBounds())
  const mainWindow = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: appIcon,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#161b22',
      symbolColor: '#8b949e',
      height: 38
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Save position/size whenever window moves or resizes
  const persistBounds = (): void => saveBounds(mainWindow.getBounds())
  mainWindow.on('moved', persistBounds)
  mainWindow.on('resized', persistBounds)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Safety net: first-time Vite dev loads can be slow enough that
  // ready-to-show doesn't fire in time and the app looks hung.
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }, 4000)

  // Save all running agents before closing
  mainWindow.on('close', (e) => {
    const running = getAllRunningIds()
    if (running.length === 0) return

    e.preventDefault()
    getStore().then((s) => {
      const projects: Project[] = s.get('projects', [])
      const defaultCli = s.get('defaultCliCommand', 'claude') as string
      Promise.all(running.map((id) => {
        const project = projects.find((p) => p.id === id)
        const cliCommand = project?.cliCommand || defaultCli || 'claude'
        const cliConfig = resolveCliConfig(cliCommand)
        const saveConfig = cliConfig.saveCommand
          ? { saveCommand: cliConfig.saveCommand, doneKeywords: cliConfig.doneKeywords }
          : undefined
        return stopProcess(id, saveConfig, true)
      })).finally(() => {
        mainWindow.destroy()
      })
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC handlers
async function registerIpcHandlers(): Promise<void> {
  // Project CRUD
  ipcMain.handle('project:list', async () => {
    const s = await getStore()
    const raw = s.get('projects', []) as Project[]
    const normalized = normalizeProjects(raw)
    // Persist migrated shape so future reads are consistent.
    if (raw.some((p, i) => p.groupId !== normalized[i].groupId || p.pinned !== normalized[i].pinned)) {
      s.set('projects', normalized)
    }
    return normalized
  })

  // Group CRUD
  ipcMain.handle('group:list', async () => {
    const s = await getStore()
    return s.get('groups', []) as Group[]
  })
  ipcMain.handle('group:add', async (_, { name }: { name: string }) => {
    const s = await getStore()
    const trimmed = (name ?? '').trim()
    if (!trimmed) return null
    const groups = s.get('groups', []) as Group[]
    const group: Group = {
      id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      pinned: false,
      createdAt: new Date().toISOString(),
    }
    groups.unshift(group)
    s.set('groups', groups)
    return group
  })
  ipcMain.handle('group:update', async (_, { id, ...fields }: { id: string; name?: string; pinned?: boolean }) => {
    const s = await getStore()
    const groups = s.get('groups', []) as Group[]
    const idx = groups.findIndex((g) => g.id === id)
    if (idx === -1) return null
    // Only allow name/pinned to be updated.
    const patch: Partial<Group> = {}
    if (typeof fields.name === 'string') {
      const trimmed = fields.name.trim()
      if (trimmed) patch.name = trimmed
    }
    if (typeof fields.pinned === 'boolean') patch.pinned = fields.pinned
    groups[idx] = { ...groups[idx], ...patch }
    s.set('groups', groups)
    return groups[idx]
  })
  ipcMain.handle('group:remove', async (_, { id }: { id: string }) => {
    const s = await getStore()
    const groups = s.get('groups', []) as Group[]
    s.set('groups', groups.filter((g) => g.id !== id))
    // Detach projects from the deleted group; do NOT delete them.
    const projects = normalizeProjects(s.get('projects', []) as Project[])
    let changed = false
    for (const p of projects) {
      if (p.groupId === id) {
        p.groupId = null
        changed = true
      }
    }
    if (changed) s.set('projects', projects)
    return true
  })

  // CLI Registry
  ipcMain.handle('cli:registry', () => {
    return { registry: CLI_REGISTRY, order: CLI_ORDER }
  })

  // True if `cmd` resolves on PATH (where on Windows, which elsewhere).
  const commandExists = (cmd: string): boolean => {
    try {
      execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  // Which CLIs are installed right now — { claude: true, gemini: false, ... }
  ipcMain.handle('cli:detect', () => {
    const out: Record<string, boolean> = {}
    for (const key of Object.keys(CLI_REGISTRY)) out[key] = commandExists(key)
    return out
  })

  const RUNTIME_INFO = {
    node: { probe: 'npm', label: 'Node.js', url: 'https://nodejs.org/' },
    python: { probe: 'pip', label: 'Python', url: 'https://www.python.org/downloads/' },
  } as const

  // The tools themselves report what went wrong. Rather than guess a category
  // (which can confidently mislead), surface the actual error line(s) from the
  // output. This is always accurate — it's literally what npm/pip printed.
  const extractErrorLines = (output: string): string => {
    const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const hits = lines.filter((l) =>
      /(^|\s)(error|fatal|cannot|unable|denied|backendunavailable|no matching|did not run successfully|failed)\b/i.test(l)
      && !/^npm warn|^warning:|deprecat|^npm notice/i.test(l),
    )
    return [...new Set(hits)].slice(-4).join('\n').slice(-600)
  }

  // Only attach a fix hint for ROOT-cause signatures we're confident about —
  // ambiguous secondary noise (transient timeouts during a build, etc.) is
  // deliberately NOT matched, to avoid the "confidently wrong" problem.
  const knownFix = (output: string): string | null => {
    const o = output.toLowerCase()
    if (/externally-managed-environment|externally managed/.test(o)) return 'pep668'
    if (/setuptools\.build_meta|backendunavailable|getting requirements to build wheel.*did not run|prepare metadata.*did not run/.test(o)) return 'buildbackend'
    if (/eacces|eperm|access is denied|operation not permitted|permission denied/.test(o)) return 'permission'
    if (/enospc|no space left/.test(o)) return 'diskspace'
    if (/ebadengine|unsupported engine|requires node|requires python|python_requires/.test(o)) return 'engine'
    return null
  }

  // One-click install a CLI: verify its runtime (npm / pip) is present, then run
  // the install command, streaming output to the renderer via `cli:install-log`.
  // Resolves with the final result; the renderer drives a progress modal.
  ipcMain.handle('cli:install', async (_, { key }: { key: string }) => {
    const cfg = CLI_REGISTRY[key]
    if (!cfg?.installHint) return { success: false, error: 'no-installer' }

    const runtime = cfg.installRuntime ?? 'node'
    const info = RUNTIME_INFO[runtime]
    const win = BrowserWindow.getAllWindows()[0]
    const emit = (chunk: string) => win?.webContents.send('cli:install-log', { key, chunk })

    // Prereq: the package manager must exist, else guide the user to install it.
    if (!commandExists(info.probe)) {
      return { success: false, prereqMissing: runtime, runtimeLabel: info.label, downloadUrl: info.url }
    }

    emit(`$ ${cfg.installHint}\r\n`)
    let output = ''
    const capture = (d: Buffer) => { const s = d.toString(); output += s; emit(s) }
    return await new Promise((resolve) => {
      // shell:true so Windows resolves npm.cmd / pip.exe and we can pass the
      // hint as one command string. FORCE_COLOR / CLICOLOR_FORCE make npm & pip
      // emit real ANSI colours even though stdout is a pipe (not a TTY), so the
      // renderer can show the same red error blocks you'd see in cmd.
      const child = spawn(cfg.installHint!, {
        shell: true,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '1', CLICOLOR_FORCE: '1', npm_config_color: 'always', PYTHONUNBUFFERED: '1' },
      })
      child.stdout?.on('data', capture)
      child.stderr?.on('data', capture)
      child.on('error', (err) => {
        output += err.message
        emit(`\r\n[error] ${err.message}\r\n`)
        resolve({ success: false, error: err.message, errorLine: extractErrorLines(output), failReason: knownFix(output) })
      })
      child.on('close', (code) => {
        const ok = code === 0
        emit(`\r\n[${ok ? 'done' : `exit ${code}`}]\r\n`)
        // Re-verify the binary actually landed on PATH.
        const onPath = commandExists(key)
        const installed = ok && onPath
        resolve(installed
          ? { success: true, exitCode: code, onPath }
          : { success: false, exitCode: code, onPath, errorLine: extractErrorLines(output), failReason: knownFix(output) })
      })
    })
  })

  // Window controls
  ipcMain.handle('window:setTitleBarOverlay', (_, { color, symbolColor }: { color: string; symbolColor: string }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      try {
        win.setTitleBarOverlay({ color, symbolColor, height: 38 })
      } catch { /* ignore on platforms that don't support it */ }
    }
  })

  // Custom notification sounds: stored under userData/sounds. Users drop their
  // own audio files there; renderer plays them via the `sounds:` protocol
  // (registered below) because Chromium refuses to load file:// URLs from an
  // http:// dev origin.
  const soundsDir = join(app.getPath('userData'), 'sounds')
  try {
    if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true })
  } catch { /* ignore mkdir errors — listCustom will just return [] */ }

  const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a)$/i
  // Clipboard image paste — save the bytes to a temp file and return the
  // path so the renderer can write it into the PTY (Claude Code reads paths
  // referenced in the user's message and attaches the image).
  ipcMain.handle(
    'clipboard:saveImage',
    async (_evt, payload: { base64: string; ext: string }) => {
      const safeExt = (payload.ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png'
      const dir = join(app.getPath('temp'), 'agentville-paste')
      fs.mkdirSync(dir, { recursive: true })
      const fileName = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
      const filePath = join(dir, fileName)
      fs.writeFileSync(filePath, Buffer.from(payload.base64, 'base64'))
      return filePath
    },
  )

  ipcMain.handle('sounds:getDir', () => soundsDir)
  ipcMain.handle('sounds:listCustom', () => {
    try {
      if (!fs.existsSync(soundsDir)) return [] as string[]
      return fs.readdirSync(soundsDir).filter((n) => AUDIO_EXT_RE.test(n))
    } catch {
      return [] as string[]
    }
  })
  ipcMain.handle('sounds:openFolder', async () => {
    try {
      if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true })
    } catch { /* ignore */ }
    await shell.openPath(soundsDir)
    return { ok: true, path: soundsDir }
  })

  // System notification — pops an OS-level toast (shows even when Agentville is in background)
  ipcMain.handle('notify:system', (_, { title, body, projectId }: { title: string; body: string; projectId?: string }) => {
    if (!Notification.isSupported()) return false
    const notif = new Notification({ title, body, silent: false })
    notif.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (projectId) win.webContents.send('project:focus-request', { projectId })
    })
    notif.show()
    return true
  })

  // Settings
  ipcMain.handle('settings:get', async () => {
    const s = await getStore()
    return {
      defaultCliCommand: s.get('defaultCliCommand', 'claude') as string,
      autoSaveEnabled: s.get('autoSaveEnabled', false) as boolean,
      notificationSoundEnabled: s.get('notificationSoundEnabled', true) as boolean,
      notificationVolume: s.get('notificationVolume', 0.7) as number,
      notificationDoneSound: s.get('notificationDoneSound', 'bundled:quiet') as string,
      notificationConfirmSound: s.get('notificationConfirmSound', 'bundled:clever-touch') as string,
      notificationOsToastEnabled: s.get('notificationOsToastEnabled', false) as boolean,
      notificationCustomSoundDir: soundsDir,
    }
  })

  ipcMain.handle('settings:set', async (_, fields: Record<string, unknown>) => {
    const s = await getStore()
    for (const [key, value] of Object.entries(fields)) {
      s.set(key, value)
    }
    return true
  })

  // MCP management (scope-aware: global = ~/.claude.json, project = <path>/.mcp.json)
  const toMcpScope = (s: 'global' | 'project', projectPath?: string): McpScopeRef =>
    s === 'global' ? { scope: 'global' } : { scope: 'project', projectPath }

  // Disabled custom MCP servers are stashed in Agentville's own electron-store
  // (NOT in Claude's config files) so toggling one off preserves its config
  // without leaving it loaded for Claude. Shape:
  //   { global: { [name]: entry }, project: { [projectPath]: { [name]: entry } } }
  const DISABLED_MCP_KEY = 'disabledMcpServers'
  type DisabledStash = {
    global: Record<string, McpServerEntry>
    project: Record<string, Record<string, McpServerEntry>>
  }
  const readDisabledStash = async (): Promise<DisabledStash> => {
    const s = await getStore()
    const raw = s.get(DISABLED_MCP_KEY) as Partial<DisabledStash> | undefined
    return { global: raw?.global ?? {}, project: raw?.project ?? {} }
  }
  const disabledBucket = (stash: DisabledStash, scope: 'global' | 'project', projectPath?: string, create = false) => {
    if (scope === 'global') return stash.global
    if (!projectPath) return {}
    if (!stash.project[projectPath] && create) stash.project[projectPath] = {}
    return stash.project[projectPath] ?? {}
  }

  ipcMain.handle('mcp:listPresets', () => MCP_PRESETS)
  ipcMain.handle('mcp:getServers', (_, args?: { scope?: 'global' | 'project'; projectPath?: string }) => {
    const ref = toMcpScope(args?.scope ?? 'global', args?.projectPath)
    return {
      servers: getMcpServers(ref),
      configPath: getMcpConfigPath(ref),
    }
  })
  ipcMain.handle('mcp:setServer', (_, { name, entry, scope = 'global', projectPath }:
    { name: string; entry: McpServerEntry; scope?: 'global' | 'project'; projectPath?: string }) => {
    setMcpServer(toMcpScope(scope, projectPath), name, entry)
    return { success: true }
  })
  ipcMain.handle('mcp:removeServer', async (_, { name, scope = 'global', projectPath }:
    { name: string; scope?: 'global' | 'project'; projectPath?: string }) => {
    removeMcpServer(toMcpScope(scope, projectPath), name)
    // Also purge any stashed (disabled) copy so delete fully forgets the server.
    const stash = await readDisabledStash()
    const bucket = disabledBucket(stash, scope, projectPath)
    if (bucket[name]) { delete bucket[name]; await (await getStore()).set(DISABLED_MCP_KEY, stash) }
    return { success: true }
  })

  // List custom servers that are currently disabled (stashed) for a scope.
  ipcMain.handle('mcp:getDisabledServers', async (_, args?: { scope?: 'global' | 'project'; projectPath?: string }) => {
    const stash = await readDisabledStash()
    return { servers: disabledBucket(stash, args?.scope ?? 'global', args?.projectPath) }
  })

  // Disable: move the entry out of Claude's config into the stash.
  ipcMain.handle('mcp:disableServer', async (_, { name, scope = 'global', projectPath }:
    { name: string; scope?: 'global' | 'project'; projectPath?: string }) => {
    const ref = toMcpScope(scope, projectPath)
    const entry = getMcpServers(ref)[name]
    if (entry) {
      const stash = await readDisabledStash()
      disabledBucket(stash, scope, projectPath, true)[name] = entry
      await (await getStore()).set(DISABLED_MCP_KEY, stash)
      removeMcpServer(ref, name)
    }
    return { success: true }
  })

  // Enable: move the stashed entry back into Claude's config.
  ipcMain.handle('mcp:enableServer', async (_, { name, scope = 'global', projectPath }:
    { name: string; scope?: 'global' | 'project'; projectPath?: string }) => {
    const stash = await readDisabledStash()
    const bucket = disabledBucket(stash, scope, projectPath)
    const entry = bucket[name]
    if (entry) {
      setMcpServer(toMcpScope(scope, projectPath), name, entry)
      delete bucket[name]
      await (await getStore()).set(DISABLED_MCP_KEY, stash)
    }
    return { success: true }
  })

  // Skill management (scope-aware: global = ~/.claude/skills, project = <path>/.claude/skills)
  const toSkillScope = (s: 'global' | 'project', projectPath?: string): SkillScopeRef =>
    s === 'global' ? { scope: 'global' } : { scope: 'project', projectPath }
  ipcMain.handle('skill:listPresets', () => SKILL_PRESETS)
  ipcMain.handle('skill:list', (_, args?: { scope?: 'global' | 'project'; projectPath?: string }) => {
    const ref = toSkillScope(args?.scope ?? 'global', args?.projectPath)
    return {
      installed: listInstalledSkills(ref),
      skillsDir: getSkillsDir(ref),
    }
  })
  ipcMain.handle('skill:read', (_, { id, scope = 'global', projectPath }:
    { id: string; scope?: 'global' | 'project'; projectPath?: string }) =>
    readSkillBody(toSkillScope(scope, projectPath), id)
  )
  ipcMain.handle('skill:install', (_, params: {
    id?: string; name: string; description: string; body: string
    scope?: 'global' | 'project'; projectPath?: string
  }) => {
    const { scope = 'global', projectPath, ...rest } = params
    return installSkill(toSkillScope(scope, projectPath), rest)
  })
  ipcMain.handle('skill:uninstall', (_, { id, scope = 'global', projectPath }:
    { id: string; scope?: 'global' | 'project'; projectPath?: string }) => ({
    ok: uninstallSkill(toSkillScope(scope, projectPath), id),
  }))
  ipcMain.handle('skill:openFolder', (_, args?: { scope?: 'global' | 'project'; projectPath?: string }) => {
    const ref = toSkillScope(args?.scope ?? 'global', args?.projectPath)
    const dir = getSkillsDir(ref)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
    return { ok: true, path: dir }
  })

  // Custom rules library (global — shared across all projects)
  ipcMain.handle('customRules:list', async () => {
    const s = await getStore()
    return s.get('customRules', []) as Array<{ id: string; text: string }>
  })
  ipcMain.handle('customRules:add', async (_, { text }: { text: string }) => {
    const s = await getStore()
    const trimmed = (text ?? '').trim()
    if (!trimmed) return null
    const list = s.get('customRules', []) as Array<{ id: string; text: string }>
    const existing = list.find((r) => r.text === trimmed)
    if (existing) return existing
    const entry = { id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, text: trimmed }
    list.push(entry)
    s.set('customRules', list)
    return entry
  })
  ipcMain.handle('customRules:remove', async (_, { id }: { id: string }) => {
    const s = await getStore()
    const list = s.get('customRules', []) as Array<{ id: string; text: string }>
    s.set('customRules', list.filter((r) => r.id !== id))
    // Also drop from default selections
    const defaults = s.get('defaultRuleCustomIds', []) as string[]
    s.set('defaultRuleCustomIds', defaults.filter((x) => x !== id))
    return true
  })

  // Default rules selection (written into new projects' CLAUDE.md)
  ipcMain.handle('defaultRules:get', async () => {
    const s = await getStore()
    return {
      presetIds: s.get('defaultRulePresetIds', []) as string[],
      customIds: s.get('defaultRuleCustomIds', []) as string[],
    }
  })
  ipcMain.handle('defaultRules:set', async (_, { presetIds, customIds }: { presetIds: string[]; customIds: string[] }) => {
    const s = await getStore()
    s.set('defaultRulePresetIds', presetIds)
    s.set('defaultRuleCustomIds', customIds)
    return true
  })

  ipcMain.handle('project:create', async (_, { name, role = '', folderPath, cliCommand, groupId = null }: { name: string; role: string; folderPath?: string; cliCommand?: string; groupId?: string | null }) => {
    const s = await getStore()
    const projects: Project[] = normalizeProjects(s.get('projects', []) as Project[])
    const id = Date.now().toString()
    const now = new Date().toISOString()

    // Determine project directory
    let projectPath: string
    if (folderPath && folderPath.trim()) {
      projectPath = folderPath.trim()
    } else {
      // Default: Documents/Agentville/<safe-name>
      const docsDir = app.getPath('documents')
      const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-')
      projectPath = join(docsDir, 'Agentville', `${safeName}-${id}`)
    }

    // Create directory if not exists
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true })
    }

    // Write CLAUDE.md (workstation file) — seed with user's default rule selection
    const defaultPresetIds = s.get('defaultRulePresetIds', []) as string[]
    const defaultCustomIds = s.get('defaultRuleCustomIds', []) as string[]
    const customRules = s.get('customRules', []) as Array<{ id: string; text: string }>
    const rulesBody = buildDefaultRulesBody(defaultPresetIds, customRules, defaultCustomIds)
    const claudeMdPath = join(projectPath, 'CLAUDE.md')
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(claudeMdPath, buildClaudeMd(name, role, now, 'CLAUDE.md', rulesBody), 'utf-8')
    }

    // Create empty memory.md (log lines appended by processManager on session end)
    const memoryPath = join(projectPath, 'memory.md')
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, '', 'utf-8')
    }

    const newProject: Project = {
      id,
      name,
      path: projectPath,
      role,
      cliCommand: cliCommand || undefined,
      status: 'paused',
      groupId: groupId ?? null,
      pinned: false,
      createdAt: now,
      lastUsed: now
    }
    projects.unshift(newProject)
    s.set('projects', projects)
    return newProject
  })

  // Duplicate an agent: clone its persona/config (CLAUDE.md role/rules/skills +
  // .mcp.json project servers) into a target directory. Running history
  // (memory.md) is NOT cloned. cliCommand and groupId are carried over.
  //
  // Target directory:
  //   - folderPath omitted → fresh auto-shell under Documents/Agentville (decoupled
  //     from the source dir; editing one role can't corrupt the other).
  //   - folderPath given → that directory. If it already holds a CLAUDE.md we refuse
  //     to clobber it and return { conflict: true } so the UI can confirm; retry with
  //     overwrite=true to proceed.
  ipcMain.handle('project:duplicate', async (
    _,
    { id, name, folderPath, overwrite = false }:
      { id: string; name?: string; folderPath?: string; overwrite?: boolean }
  ) => {
    const s = await getStore()
    const projects: Project[] = normalizeProjects(s.get('projects', []) as Project[])
    const source = projects.find((p) => p.id === id)
    if (!source) return null

    const newId = Date.now().toString()
    const now = new Date().toISOString()
    const newName = (name && name.trim()) || `${source.name} 副本`

    // Resolve target directory.
    let projectPath: string
    if (folderPath && folderPath.trim()) {
      projectPath = folderPath.trim()
      if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true })
      // Don't silently overwrite a CLAUDE.md the user-picked dir already has.
      if (!overwrite && fs.existsSync(join(projectPath, 'CLAUDE.md'))) {
        return { conflict: true as const }
      }
    } else {
      const docsDir = app.getPath('documents')
      const safeName = newName.replace(/[^a-zA-Z0-9一-龥_-]/g, '-')
      projectPath = join(docsDir, 'Agentville', `${safeName}-${newId}`)
      if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true })
    }

    // Copy CLAUDE.md (role/rules/skills). Fall back to a freshly built one if the
    // source file is missing for any reason.
    const srcClaudeMd = join(source.path, 'CLAUDE.md')
    const dstClaudeMd = join(projectPath, 'CLAUDE.md')
    if (fs.existsSync(srcClaudeMd)) {
      fs.copyFileSync(srcClaudeMd, dstClaudeMd)
    } else {
      fs.writeFileSync(dstClaudeMd, buildClaudeMd(newName, source.role, now, 'CLAUDE.md', ''), 'utf-8')
    }

    // Copy project-scoped MCP servers. Only when source has them and we won't stomp
    // an existing .mcp.json in a user-picked dir (unless overwrite was confirmed).
    const srcMcp = join(source.path, '.mcp.json')
    const dstMcp = join(projectPath, '.mcp.json')
    if (fs.existsSync(srcMcp) && (overwrite || !fs.existsSync(dstMcp))) {
      fs.copyFileSync(srcMcp, dstMcp)
    }

    // Fresh memory.md (clone starts with no running history; keep any existing one).
    const memoryPath = join(projectPath, 'memory.md')
    if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, '', 'utf-8')

    const newProject: Project = {
      id: newId,
      name: newName,
      path: projectPath,
      role: source.role,
      cliCommand: source.cliCommand || undefined,
      status: 'paused',
      groupId: source.groupId ?? null,
      pinned: false,
      createdAt: now,
      lastUsed: now
    }
    projects.unshift(newProject)
    s.set('projects', projects)
    return newProject
  })

  ipcMain.handle('project:delete', async (_, { id }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const filtered = projects.filter((p) => p.id !== id)
    s.set('projects', filtered)
    // Stop process if running
    await stopProcess(id)
    return true
  })

  ipcMain.handle('project:update', async (_, { id, ...fields }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const idx = projects.findIndex((p) => p.id === id)
    if (idx !== -1) {
      projects[idx] = { ...projects[idx], ...fields }
      s.set('projects', projects)
      return projects[idx]
    }
    return null
  })

  // Migrate project to a new working directory.
  //
  // Two modes, auto-detected from the source path:
  //   - "full" (source is an Agentville auto-created shell under Documents/Agentville/):
  //     move the entire directory contents to the target; delete the source
  //     directory afterwards if it's empty. This is the "real move" semantic.
  //   - "memory-only" (source is a user-picked code directory):
  //     only move CLAUDE.md + memory.md; leave every other file (the user's
  //     code, git repo, etc.) in place; also delete the two files from source
  //     so the workstation file no longer shadows the one in the new location.
  //
  // Conflict handling: if the target already contains files with the same
  // name, the first call returns { conflict: [...names] } without touching
  // anything. The UI can then confirm and retry with strategy='replace-target'
  // to overwrite.
  ipcMain.handle(
    'project:migrate',
    async (
      _,
      { id, targetPath, strategy = 'abort-on-conflict', overwriteNames = [] }:
        { id: string; targetPath: string; strategy?: 'abort-on-conflict' | 'selective'; overwriteNames?: string[] }
    ) => {
      if (!targetPath || !targetPath.trim()) return { ok: false, error: 'invalid-path' as const }
      if (getAllRunningIds().includes(id)) return { ok: false, error: 'running' as const }

      const s = await getStore()
      const projects: Project[] = s.get('projects', [])
      const idx = projects.findIndex((p) => p.id === id)
      if (idx === -1) return { ok: false, error: 'not-found' as const }
      const project = projects[idx]
      const sourcePath = project.path
      const cleanTarget = targetPath.trim()

      if (sourcePath === cleanTarget) return { ok: false, error: 'same-path' as const }

      // Detect mode. Agentville auto directories are under <Documents>/Agentville/.
      const agentvilleRoot = join(app.getPath('documents'), 'Agentville')
      const isAutoShell = sourcePath.startsWith(agentvilleRoot + '\\') || sourcePath.startsWith(agentvilleRoot + '/')
      const mode: 'full' | 'memory-only' = isAutoShell ? 'full' : 'memory-only'

      try {
        if (!fs.existsSync(cleanTarget)) fs.mkdirSync(cleanTarget, { recursive: true })
      } catch (e) {
        return { ok: false, error: 'mkdir-failed' as const, detail: String(e) }
      }

      // Figure out which source entries we need to place into the target.
      const entriesToMove: string[] = mode === 'full'
        ? (fs.existsSync(sourcePath) ? fs.readdirSync(sourcePath) : [])
        : ['CLAUDE.md', 'memory.md'].filter((f) => fs.existsSync(join(sourcePath, f)))

      // Detect conflicts at target. memory.md is special-cased: it's always
      // merged (append), never treated as a conflict.
      const conflicts: string[] = []
      for (const name of entriesToMove) {
        if (name === 'memory.md') continue
        if (fs.existsSync(join(cleanTarget, name))) conflicts.push(name)
      }

      if (conflicts.length > 0 && strategy === 'abort-on-conflict') {
        return { ok: false as const, mode, conflict: conflicts }
      }

      // selective mode: only names present in overwriteNames are overwritten;
      // other conflicting names are skipped (target kept, source also left alone).
      const overwriteSet = new Set(overwriteNames)
      const skipped: string[] = []

      // Execute the move. Use cpSync (handles cross-drive) then rmSync.
      try {
        for (const name of entriesToMove) {
          const src = join(sourcePath, name)
          const dst = join(cleanTarget, name)

          if (name === 'memory.md') {
            // Append-merge memory.md so we never lose history (never a conflict)
            const srcContent = fs.readFileSync(src, 'utf-8')
            if (fs.existsSync(dst)) {
              const existing = fs.readFileSync(dst, 'utf-8')
              const joined = existing.endsWith('\n') ? existing + srcContent : existing + '\n' + srcContent
              fs.writeFileSync(dst, joined, 'utf-8')
            } else {
              fs.copyFileSync(src, dst)
            }
            fs.rmSync(src, { force: true })
            continue
          }

          const hasConflict = fs.existsSync(dst)
          if (hasConflict && !overwriteSet.has(name)) {
            // Skip: keep both sides untouched. Source file stays where it is.
            skipped.push(name)
            continue
          }

          if (hasConflict) fs.rmSync(dst, { recursive: true, force: true })
          fs.cpSync(src, dst, { recursive: true })
          fs.rmSync(src, { recursive: true, force: true })
        }

        // Clean up source directory if full-mode and it's now empty (no skips)
        if (mode === 'full' && fs.existsSync(sourcePath)) {
          const leftover = fs.readdirSync(sourcePath)
          if (leftover.length === 0) {
            try { fs.rmdirSync(sourcePath) } catch { /* ignore */ }
          }
        }
      } catch (e) {
        return { ok: false, error: 'move-failed' as const, detail: String(e) }
      }

      projects[idx] = { ...project, path: cleanTarget }
      s.set('projects', projects)
      return { ok: true as const, mode, project: projects[idx], skipped }
    }
  )

  // Update role in all existing CLI memory files
  ipcMain.handle('project:updateRole', async (_, { id, role }: { id: string; role: string }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const project = projects.find((p) => p.id === id)
    if (!project) return false

    const roleText = role.trim() || '(naturally formed through conversation)'
    // Match both English (new) and Chinese (legacy) Role section headers
    const roleSection = /## (?:Role|角色设定)\n[\s\S]*?(?=\n## |$)/
    const newRole = `## Role\n${roleText}`

    // Update all CLI memory files that exist in the project directory
    const memFiles = ['CLAUDE.md', 'GEMINI.md', 'CODEX.md']
    for (const filename of memFiles) {
      const filePath = join(project.path, filename)
      if (!fs.existsSync(filePath)) continue
      let content = fs.readFileSync(filePath, 'utf-8')
      if (roleSection.test(content)) {
        content = content.replace(roleSection, newRole)
      } else {
        content += `\n${newRole}\n`
      }
      fs.writeFileSync(filePath, content, 'utf-8')
    }
    return true
  })

  // Dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // Read/write memory file (filename defaults to CLAUDE.md for backwards compat)
  ipcMain.handle('project:readClaudeMd', async (_, { id, filename = 'CLAUDE.md' }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const project = projects.find((p) => p.id === id)
    if (!project) return null
    const filePath = join(project.path, filename)
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('project:writeClaudeMd', async (_, { id, content, filename = 'CLAUDE.md', syncMemory = true }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const project = projects.find((p) => p.id === id)
    if (!project) return false
    const filePath = join(project.path, filename)
    fs.writeFileSync(filePath, content, 'utf-8')
    // Only sync canonical memory when the caller confirms this is the
    // active CLI's memory file — avoids clobbering memoryContent when
    // editing a different agent's rule file (AGENTS.md / GEMINI.md etc).
    if (syncMemory) {
      const idx = projects.findIndex((p) => p.id === id)
      if (idx !== -1) {
        projects[idx].memoryContent = content
        s.set('projects', projects)
      }
    }
    return true
  })

  // PTY operations
  ipcMain.handle('pty:start', async (_, { id, path: projectPath }) => {
    // Update project lastUsed and status
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const idx = projects.findIndex((p) => p.id === id)
    if (idx !== -1) {
      projects[idx].lastUsed = new Date().toISOString()
      projects[idx].status = 'working'
      s.set('projects', projects)
    }

    const project = projects[idx]
    const needsNaming = !project || isPlaceholderProjectName(project.name)

    // Resolve CLI command: project-level override > global default > 'claude'
    const s2 = await getStore()
    const defaultCli = s2.get('defaultCliCommand', 'claude') as string
    const autoSaveEnabled = s2.get('autoSaveEnabled', false) as boolean
    const cliCommand = project?.cliCommand || defaultCli || 'claude'
    const cliConfig = resolveCliConfig(cliCommand)

    // Check if CLI is installed before starting
    const baseCmd = cliCommand.trim().split(/\s+/)[0]
    try {
      if (process.platform === 'win32') {
        execFileSync('where', [baseCmd], { stdio: 'ignore' })
      } else {
        execFileSync('which', [baseCmd], { stdio: 'ignore' })
      }
    } catch {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('pty:cli-not-found', {
        id,
        cliKey: baseCmd,
        cliName: cliConfig.name || baseCmd,
        installHint: cliConfig.installHint ?? null
      })
      return false
    }

    // Sync canonical memory → target CLI's memory file (Plan C)
    if (cliConfig.memoryFile) {
      const memFilePath = join(projectPath, cliConfig.memoryFile)
      if (project?.memoryContent) {
        let content = project.memoryContent
        // Migrate: ensure AGENTVILLE_SAVE protocol is present (older projects may lack it)
        if (!content.includes('AGENTVILLE_SAVE')) {
          content += `\n## Save Protocol\nWhen you receive **AGENTVILLE_SAVE [MM-DD]**, do both steps then reply "SAVED":\n1. Rewrite **${cliConfig.memoryFile}**: update Workspace Status, User Context, and Key Decisions. Keep all other content.\n2. Append to **memory.md** without overwriting: [MM-DD] one-line session summary; optionally add "  > " lines for key context or next steps.\n`
          projects[idx].memoryContent = content
          s.set('projects', projects)
        }
        fs.writeFileSync(memFilePath, content, 'utf-8')
      } else if (!fs.existsSync(memFilePath)) {
        // First time using this CLI — seed with workspace context
        fs.writeFileSync(
          memFilePath,
          buildClaudeMd(project?.name ?? 'Workspace', project?.role ?? '', project?.createdAt ?? new Date().toISOString(), cliConfig.memoryFile),
          'utf-8'
        )
      } else {
        // File exists but no canonical memory — migrate if AGENTVILLE_SAVE missing
        let content = fs.readFileSync(memFilePath, 'utf-8')
        if (!content.includes('AGENTVILLE_SAVE')) {
          content += `\n## Save Protocol\nWhen you receive **AGENTVILLE_SAVE [MM-DD]**, do both steps then reply "SAVED":\n1. Rewrite **${cliConfig.memoryFile}**: update Workspace Status, User Context, and Key Decisions. Keep all other content.\n2. Append to **memory.md** without overwriting: [MM-DD] one-line session summary; optionally add "  > " lines for key context or next steps.\n`
          fs.writeFileSync(memFilePath, content, 'utf-8')
        }
      }
    }

    await startProcess(id, projectPath, {
      needsNaming,
      cliCommand,
      cliConfig,
      autoSaveEnabled,
      role: project?.role ?? '',
      onNameSuggested: async (name) => {
        const s3 = await getStore()
        const projs: Project[] = s3.get('projects', [])
        const i = projs.findIndex((p) => p.id === id)
        if (i !== -1 && isPlaceholderProjectName(projs[i].name)) {
          projs[i].name = name
          s3.set('projects', projs)
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('project:nameUpdate', { id, name })
          }
        }
      }
    })
    return true
  })

  ipcMain.handle('pty:stop', async (_, { id, hasInteracted = false }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const idx = projects.findIndex((p) => p.id === id)
    const project = projects[idx]

    // Resolve CLI config to know save command and memory file
    const defaultCli = s.get('defaultCliCommand', 'claude') as string
    const cliCommand = project?.cliCommand || defaultCli || 'claude'
    const cliConfig = resolveCliConfig(cliCommand)

    // Stop with save (pass CLI-specific save config)
    const saveConfig = cliConfig.saveCommand
      ? { saveCommand: cliConfig.saveCommand, doneKeywords: cliConfig.doneKeywords, isClaudeLike: cliConfig.isClaudeLike }
      : undefined
    await stopProcess(id, saveConfig, hasInteracted)

    // Read memory file and store canonically (Plan C)
    if (project && cliConfig.memoryFile) {
      const memFilePath = join(project.path, cliConfig.memoryFile)
      if (fs.existsSync(memFilePath)) {
        const memContent = fs.readFileSync(memFilePath, 'utf-8')
        projects[idx].memoryContent = memContent
      }
    }

    if (idx !== -1) {
      projects[idx].status = 'paused'
      s.set('projects', projects)
    }

    return true
  })

  ipcMain.handle('pty:save', async (_, { id }) => {
    const s = await getStore()
    const projects: Project[] = s.get('projects', [])
    const project = projects.find((p) => p.id === id)
    const defaultCli = s.get('defaultCliCommand', 'claude') as string
    const cliCommand = project?.cliCommand || defaultCli || 'claude'
    const cliConfig = resolveCliConfig(cliCommand)
    if (!cliConfig.saveCommand) return false
    const saveConfig = { saveCommand: cliConfig.saveCommand, doneKeywords: cliConfig.doneKeywords, isClaudeLike: cliConfig.isClaudeLike }
    return saveMemory(id, saveConfig)
  })

  ipcMain.handle('pty:write', (_, { id, data }) => {
    writeToProcess(id, data)
    return true
  })

  ipcMain.handle('pty:resize', (_, { id, cols, rows }) => {
    resizeProcess(id, cols, rows)
    return true
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.agentville.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register `sounds:` protocol — serves files from userData/sounds by basename.
  // Needed because Chromium blocks file:// URLs from the dev http:// origin.
  try {
    const soundsRoot = join(app.getPath('userData'), 'sounds')
    protocol.handle('sounds', async (request) => {
      try {
        const url = new URL(request.url)
        // sounds://filename.mp3 → host='filename.mp3', pathname=''
        // Accept either placement; decode either way.
        const raw = decodeURIComponent(url.host || url.pathname.replace(/^\/+/, ''))
        // Strip any path components — only allow a plain filename under soundsRoot.
        const normalized = raw.replace(/\\/g, '/')
        const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
        // Safety: reject traversal / absolute paths / drive letters.
        if (!basename || basename.includes('..') || /^[a-zA-Z]:/.test(basename)) {
          return new Response('bad request', { status: 400 })
        }
        const abs = join(soundsRoot, basename)
        if (!fs.existsSync(abs)) return new Response('not found', { status: 404 })
        return net.fetch(pathToFileURL(abs).toString())
      } catch {
        return new Response('error', { status: 500 })
      }
    })
  } catch (err) {
    console.error('Failed to register sounds: protocol', err)
  }

  await registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
