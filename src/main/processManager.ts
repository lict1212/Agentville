import { BrowserWindow } from 'electron'
import { IPty } from 'node-pty'
import fs from 'fs'
import { join } from 'path'
import { CliConfig } from './cliRegistry'

interface ProcessEntry {
  pty: IPty
  projectPath: string
  cliConfig: CliConfig
  currentStatus: string
  autoSaveTimer: NodeJS.Timeout | null
  isSaving: boolean
  sentinelBuf: string   // rolling buffer for cross-chunk sentinel detection
  userHasTyped: boolean // true once user sends any input — used to shorten post-auth injection delay
}

const processes = new Map<string, ProcessEntry>()
const statusTimers = new Map<string, NodeJS.Timeout>()

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function sendStatus(id: string, status: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('pty:status', { id, status })
  const entry = processes.get(id)
  if (entry) entry.currentStatus = status
}

function sendAutoSave(id: string, saving: boolean): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('pty:autosave', { id, saving })
}

const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function runAutoSave(id: string): Promise<void> {
  const entry = processes.get(id)
  if (!entry) return
  if (entry.currentStatus !== 'waiting') return
  const { pty: proc, cliConfig } = entry
  if (!cliConfig.saveCommand || !cliConfig.doneKeywords.length) return

  sendAutoSave(id, true)
  try {
    const now = new Date()
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const cmd = cliConfig.saveCommand.replace('{DATE}', dateStr)
    proc.write(cmd + '\r')
    await new Promise<void>((resolve) => {
      const keywords = cliConfig.doneKeywords
      let onData: { dispose: () => void }
      const timeout = setTimeout(() => {
        onData.dispose()
        resolve()
      }, 15000)
      onData = proc.onData((data: string) => {
        if (keywords.some((kw) => data.includes(kw))) {
          clearTimeout(timeout)
          onData.dispose()
          resolve()
        }
      })
    })
  } catch { /* proceed */ }
  sendAutoSave(id, false)
}

function sendData(id: string, data: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('pty:data', { id, data })
}

function sendNotify(id: string, message: string, level: 'info' | 'success' | 'error' = 'info'): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('pty:notify', { id, message, level })
}

/** Write text to PTY then send Enter.
 *  Short strings (≤60 chars) are sent in one write — avoids TUI re-render artifacts.
 *  Longer strings are chunked to avoid ConPTY bulk-write drop on Windows. */
async function typeAndSubmit(proc: IPty, text: string): Promise<void> {
  if (text.length <= 60) {
    proc.write(text)
    await new Promise(r => setTimeout(r, 50))
    proc.write('\r')
    return
  }
  const CHUNK = 20
  for (let i = 0; i < text.length; i += CHUNK) {
    proc.write(text.slice(i, Math.min(i + CHUNK, text.length)))
    await new Promise(r => setTimeout(r, 20))
  }
  await new Promise(r => setTimeout(r, 200))
  proc.write('\r')
}

function sendExit(id: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('pty:exit', { id })
}

// ── memory.md helpers ─────────────────────────────────────────────────────────

const MAX_MEMORY_LINES = 25

const MEMORY_ENTRY_RE = /^\[\d{2}-\d{2}\] .+/
const MEMORY_DETAIL_RE = /^\s+> .+/

function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .trim()
}

/** Read session history — supports multi-line entries ([MM-DD] header + optional > detail lines) */
function readMemory(projectPath: string): string {
  const memPath = join(projectPath, 'memory.md')
  if (!fs.existsSync(memPath)) return ''
  const lines = fs.readFileSync(memPath, 'utf-8').split('\n')
  const result: string[] = []
  for (const line of lines) {
    if (MEMORY_ENTRY_RE.test(line.trim())) {
      result.push(line)
    } else if (result.length > 0 && MEMORY_DETAIL_RE.test(line)) {
      result.push(line) // detail line belonging to previous entry
    }
  }
  return result.join('\n')
}

function appendMemory(projectPath: string, summary: string): void {
  const memPath = join(projectPath, 'memory.md')
  const now = new Date()
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const clean = stripAnsi(summary)
  if (!clean) return
  const newLine = `[${date}] ${clean}`

  // Read only valid log lines (skip any legacy headers)
  let lines: string[] = []
  if (fs.existsSync(memPath)) {
    lines = fs.readFileSync(memPath, 'utf-8')
      .split('\n')
      .filter((l) => MEMORY_ENTRY_RE.test(l.trim()) || MEMORY_DETAIL_RE.test(l))
  }

  lines.push(newLine)

  if (lines.length > MAX_MEMORY_LINES) {
    lines = lines.slice(lines.length - MAX_MEMORY_LINES)
  }

  fs.writeFileSync(memPath, lines.join('\n') + '\n', 'utf-8')
}

// ── Hook management ───────────────────────────────────────────────────────────

const DONE_SENTINEL = '__AGENTVILLE_DONE__'

/** Ensure .claude/settings.json has our Stop hook configured */
function ensureStopHook(projectPath: string): void {
  const claudeDir = join(projectPath, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  let settings: Record<string, any> = {}
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch { settings = {} }
  }

  if (!settings.hooks) settings.hooks = {}
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = []

  let needsWrite = false

  // Migrate existing groups that have the sentinel command but are missing `matcher`
  for (const group of settings.hooks.Stop) {
    if (
      Array.isArray(group.hooks) &&
      group.hooks.some((h: any) => typeof h.command === 'string' && h.command.includes(DONE_SENTINEL)) &&
      !('matcher' in group)
    ) {
      group.matcher = ''
      needsWrite = true
    }
  }

  const alreadySet = settings.hooks.Stop.some((group: any) =>
    Array.isArray(group.hooks) && group.hooks.some((h: any) =>
      typeof h.command === 'string' && h.command.includes(DONE_SENTINEL)
    )
  )

  if (!alreadySet) {
    settings.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: `echo ${DONE_SENTINEL}` }] })
    needsWrite = true
  }

  if (needsWrite) {
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }
}

// ── Process management ────────────────────────────────────────────────────────

export interface StartOptions {
  needsNaming?: boolean
  onNameSuggested?: (name: string) => void
  cliCommand?: string
  cliConfig?: CliConfig
  autoSaveEnabled?: boolean
  role?: string
}

export async function startProcess(
  id: string,
  projectPath: string,
  options: StartOptions = {}
): Promise<void> {
  if (processes.has(id)) {
    await stopProcess(id)
  }

  const pty = await import('node-pty')

  const isWindows = process.platform === 'win32'
  const cliCmd = options.cliCommand ?? 'claude'
  const shell = isWindows ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
  const args = isWindows ? ['/K', cliCmd] : ['-c', cliCmd]
  const config = options.cliConfig

  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: projectPath,
    env: process.env as { [key: string]: string },
  })

  const autoSaveTimer = options.autoSaveEnabled
    ? setInterval(() => runAutoSave(id), AUTO_SAVE_INTERVAL_MS)
    : null

  processes.set(id, { pty: ptyProcess, projectPath, cliConfig: config ?? {
    name: cliCmd,
    memoryFile: null,
    saveCommand: null,
    doneKeywords: [],
    isClaudeLike: false,
  }, currentStatus: 'working', autoSaveTimer, isSaving: false, sentinelBuf: '', userHasTyped: false })

  sendStatus(id, 'working')

  const isClaudeLike = config?.isClaudeLike ?? cliCmd.trim().startsWith('claude')
  const hasMemoryFile = !!(config?.memoryFile)

  if (isClaudeLike) ensureStopHook(projectPath)

  // Non-Claude CLIs: inject startup read prompt once CLI is ready.
  //
  // Strategy:
  //   • Use a long base delay (startupDelay, default 1s, Codex = 8s) so CLIs with
  //     interactive auth flows (arrow-key menus, browser login) have time before we
  //     inject anything.
  //   • Once the user sends ANY input to the PTY (writeToProcess sets userHasTyped),
  //     switch to a shorter post-interaction delay (1.5s).  This means: after the
  //     user finishes auth and the main UI goes quiet, we inject quickly.
  let startupInjected = false
  let _cancelStartup: (() => void) | null = null  // set by startup injection; called when CMD prompt detected
  let cliHasProducedOutput = false  // true once CLI emits non-CMD-prompt output; gates _cancelStartup

  if (!isClaudeLike && hasMemoryFile) {
    const memFile = config?.memoryFile ?? 'CLAUDE.md'
    const baseDelay = config?.startupDelay ?? 1000
    const confirmPattern = config?.startupConfirmPattern ?? null
    const postInteractionDelay = 1500

    const doInject = async () => {
      if (startupInjected) return
      startupInjected = true
      const entry = processes.get(id)
      if (!entry || entry.isSaving) return
      await typeAndSubmit(entry.pty, `Read ${memFile}, no reply needed.`)
    }

    let silenceTimer: NodeJS.Timeout | null = null
    let postInteractionMode = false
    // preEnterSent: true once any startup confirmation has been sent (or not needed)
    let preEnterSent = confirmPattern === null

    // Confirm-pattern listener: watches startup output for a CLI-specific string
    // (e.g. Codex's trust prompt "Yes, continue") and auto-sends Enter to confirm it.
    // Content-based detection is more reliable than an absolute timer because it
    // fires exactly when the prompt is visible, regardless of startup speed.
    if (confirmPattern) {
      let confirmBuf = ''
      const disposeConfirm = ptyProcess.onData((data: string) => {
        if (startupInjected || preEnterSent) { disposeConfirm.dispose(); return }
        confirmBuf = (confirmBuf + stripAnsi(data)).slice(-300)
        if (confirmBuf.includes(confirmPattern)) {
          preEnterSent = true
          ptyProcess.write('\r')
          disposeConfirm.dispose()
        }
      })
    }

    const disposePromptDetect = ptyProcess.onData(() => {
      if (startupInjected) { disposePromptDetect.dispose(); if (silenceTimer) clearTimeout(silenceTimer); return }

      // If user typed anything, skip any pending confirmation and use a short delay
      const entry = processes.get(id)
      if (entry?.userHasTyped && !postInteractionMode) {
        postInteractionMode = true
        preEnterSent = true
      }

      // Don't start the injection countdown until confirmation has been sent
      if (!preEnterSent) return

      if (silenceTimer) clearTimeout(silenceTimer)
      const delay = postInteractionMode ? postInteractionDelay : baseDelay
      silenceTimer = setTimeout(() => {
        disposePromptDetect.dispose()
        doInject()
      }, delay)
    })

    // Expose cancellation so CMD prompt detection (below) can abort injection
    // when the CLI exits and cmd.exe takes over.
    _cancelStartup = () => {
      startupInjected = true
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
      disposePromptDetect.dispose()
    }
  }

  let nameBuffer = ''
  let nameCaptured = false

  // Windows /K keeps CMD alive after CLI exits — detect CMD prompt and auto-exit
  // Use a debounce so CLI restarts (e.g. Codex auth flow) don't trigger premature exit
  let cmdPromptTimer: NodeJS.Timeout | null = null
  const CMD_PROMPT_RE = /[A-Z]:\\[^\r\n>]*>\s*$/

  ptyProcess.onData((data: string) => {
    // Strip sentinel from display output
    const displayData = isClaudeLike ? data.replace(new RegExp(`[^\r\n]*${DONE_SENTINEL}[^\r\n]*\r?\n?`, 'g'), '') : data
    if (displayData) sendData(id, displayData)

    // Windows: detect CMD prompt appearing (CLI has exited), then send "exit" after debounce
    if (isWindows && !isClaudeLike) {
      const clean = stripAnsi(data)
      if (CMD_PROMPT_RE.test(clean)) {
        // CLI has exited — abort startup injection, but only if the CLI had already
        // produced output (otherwise this is the initial cmd.exe prompt before the
        // CLI even starts, and we must not cancel the injection prematurely).
        if (cliHasProducedOutput) _cancelStartup?.()
        if (!cmdPromptTimer) {
          cmdPromptTimer = setTimeout(() => {
            cmdPromptTimer = null
            if (processes.has(id)) ptyProcess.write('exit\r')
          }, 3000)
        }
      } else if (clean.trim().length > 0) {
        cliHasProducedOutput = true
        // CLI is producing output — cancel any pending exit (CLI may be restarting)
        if (cmdPromptTimer) { clearTimeout(cmdPromptTimer); cmdPromptTimer = null }
      }
    }

    if (options.needsNaming && !nameCaptured) {
      nameBuffer += data
      const match = nameBuffer.match(/NAME:([^\n\r\x1b]+)/)
      if (match) {
        nameCaptured = true
        const raw = match[1].replace(/\s+/g, '').slice(0, 12)
        if (raw && options.onNameSuggested) options.onNameSuggested(raw)
      }
    }

    // Hook-based done detection (Claude only) — use a rolling buffer to handle
    // cross-chunk splits (Windows ConPTY can fragment data across multiple onData calls)
    let sentinelDetected = false
    if (isClaudeLike) {
      const entry = processes.get(id)
      if (entry) {
        entry.sentinelBuf = (entry.sentinelBuf + data).slice(-(DONE_SENTINEL.length * 2))
        if (entry.sentinelBuf.includes(DONE_SENTINEL)) {
          entry.sentinelBuf = ''
          sentinelDetected = true
        }
      }
    }

    if (sentinelDetected) {
      // Sentinel received — cancel any pending timer and mark done immediately
      const t = statusTimers.get(id)
      if (t) { clearTimeout(t); statusTimers.delete(id) }
      sendStatus(id, 'waiting')
    } else if (
      data.includes('? ') || data.includes('Do you want') ||
      data.includes('Allow') || data.includes('(y/n)') ||
      data.includes('(Y/n)') || data.includes('yes/no')
    ) {
      sendStatus(id, 'needs_confirmation')
    } else if (stripAnsi(data).length > 0) {
      // Visible text content — reset the idle timer.
      // Use stripAnsi so pure ANSI escape sequences (cursor moves, color resets)
      // don't keep resetting the countdown when Claude is actually idle.
      const existingTimer = statusTimers.get(id)
      if (existingTimer) clearTimeout(existingTimer)
      sendStatus(id, 'working')
      const silenceMs = isClaudeLike ? 3000 : 2000
      const timer = setTimeout(() => {
        sendStatus(id, 'waiting')
        statusTimers.delete(id)
      }, silenceMs)
      statusTimers.set(id, timer)
    }
    // ANSI-only or empty data: do nothing — let any running timer expire naturally
  })

  ptyProcess.onExit(() => {
    if (cmdPromptTimer) { clearTimeout(cmdPromptTimer); cmdPromptTimer = null }
    processes.delete(id)
    statusTimers.delete(id)
    sendExit(id)
    sendStatus(id, 'paused')
  })
}

export interface StopConfig {
  saveCommand: string
  doneKeywords: string[]
  isClaudeLike: boolean
}

/** Send save command without killing the process — for manual save button */
export async function saveMemory(id: string, saveConfig: StopConfig): Promise<boolean> {
  const entry = processes.get(id)
  if (!entry) return false
  const { pty: proc } = entry

  try {
    entry.isSaving = true
    const now = new Date()
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const cmd = saveConfig.saveCommand.replace('{DATE}', dateStr)
    console.log(`[agentville] manual save for ${id}`)
    sendNotify(id, 'Saving memory…', 'info')
    await typeAndSubmit(proc, cmd)
    // No completion detection — user watches terminal for progress. Button uses a short client-side cooldown to prevent spam.
    entry.isSaving = false
    return true
  } catch { entry.isSaving = false; return false }
}

export async function stopProcess(
  id: string,
  saveConfig?: StopConfig,
  hasInteracted = false
): Promise<void> {
  const entry = processes.get(id)
  if (!entry) return

  const { pty: proc } = entry

  const timer = statusTimers.get(id)
  if (timer) { clearTimeout(timer); statusTimers.delete(id) }

  // Clear auto-save interval
  if (entry.autoSaveTimer) clearInterval(entry.autoSaveTimer)

  // Clear any status timer
  const timerEnd = statusTimers.get(id)
  if (timerEnd) { clearTimeout(timerEnd); statusTimers.delete(id) }

  // Kill
  try { proc.kill() } catch { /* already dead */ }
  processes.delete(id)
}

export function writeToProcess(id: string, data: string): void {
  const entry = processes.get(id)
  if (entry) {
    entry.userHasTyped = true
    entry.pty.write(data)
  }
}

export function resizeProcess(id: string, cols: number, rows: number): void {
  const entry = processes.get(id)
  if (entry) {
    try { entry.pty.resize(cols, rows) } catch { /* ignore */ }
  }
}

export function isProcessRunning(id: string): boolean {
  return processes.has(id)
}

export function getAllRunningIds(): string[] {
  return Array.from(processes.keys())
}
