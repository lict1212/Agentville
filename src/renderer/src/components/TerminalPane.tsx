import React, { useEffect, useRef, useCallback, useState } from 'react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Play, Square, Settings, Bot, Terminal as TerminalIcon, Save, LayoutGrid, Info, FolderInput, ArrowDown, RotateCw, Download } from 'lucide-react'
import { InstallCliModal } from './InstallCliModal'
import { confirmDialog } from './ConfirmDialog'
import 'xterm/css/xterm.css'

interface Project {
  id: string
  name: string
  path: string
  cliCommand?: string
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  createdAt: string
  lastUsed: string
}

interface TerminalPaneProps {
  project: Project | null
  isRunning: boolean
  globalCliDefault: string
  onStart: () => void
  onStop: () => void
  onUserInput?: (id: string) => void
  onChangeCli?: () => void
}

// xterm's theme accepts hex literals only (no CSS variables / no var()),
// so this stays hard-coded regardless of the app's theme system.
const xtermTheme = {
  background: '#0d1117',
  foreground: '#e6edf3',
  // Visible input caret. xterm renders the single real terminal cursor at the
  // PTY-reported position — this IS the cursor that line-mode CLIs (shells,
  // Claude Code's input box) rely on, so it must be visible or you can't see
  // where you're typing. Full-screen TUIs that paint their own cursor hide the
  // real one via DECTCEM (?25l), which xterm honours automatically, so there's
  // no double cursor. cursorInactiveStyle:'none' (set on the Terminal below)
  // hides it when the pane isn't focused to cut clutter.
  cursor: '#e6edf3',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  black: '#484f58',
  brightBlack: '#6e7681',
  red: '#ff7b72',
  brightRed: '#ffa198',
  green: '#3fb950',
  brightGreen: '#56d364',
  yellow: '#d29922',
  brightYellow: '#e3b341',
  blue: '#58a6ff',
  brightBlue: '#79c0ff',
  magenta: '#bc8cff',
  brightMagenta: '#d2a8ff',
  cyan: '#39c5cf',
  brightCyan: '#56d4dd',
  white: '#b1bac4',
  brightWhite: '#f0f6fc'
}

export function TerminalPane({ project, isRunning, globalCliDefault, memoryFile, onStart, onStop, isSaving, isAutoSaving, isManualSaving, cliError, onOpenRole, onUserInput, onChangeCli, onSaveMemory, onToggleMonitor, isMonitorView, monitorContent, notify, onMigrateWorkspace }: TerminalPaneProps & { isSaving?: boolean; isAutoSaving?: boolean; isManualSaving?: boolean; cliError?: { cliName: string; installHint: string | null; cliKey: string } | null; onOpenRole?: () => void; memoryFile?: string | null; onSaveMemory?: () => void; onToggleMonitor?: () => void; isMonitorView?: boolean; monitorContent?: React.ReactNode; notify?: { message: string; level: 'info' | 'success' | 'error' } | null; onMigrateWorkspace?: () => void }) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const currentProjectIdRef = useRef<string | null>(null)
  // Per-project output buffer for replay on switch (capped at 200KB each)
  const outputBuffers = useRef<Map<string, string>>(new Map())
  // Per-project scroll offset from the bottom (baseY - viewportY) so each
  // session restores to where it was when the user switched away.
  const scrollOffsets = useRef<Map<string, number>>(new Map())
  const prevProjectIdRef = useRef<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showCodexHint, setShowCodexHint] = useState(false)
  const [showCodexTip, setShowCodexTip] = useState(false)
  const codexTipRef = useRef<HTMLDivElement>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [saveCooldown, setSaveCooldown] = useState(false)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  useEffect(() => {
    return () => { if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current) }
  }, [])

  // Close the Codex info popover on any outside click.
  useEffect(() => {
    if (!showCodexTip) return
    const onDown = (e: MouseEvent) => {
      if (!codexTipRef.current?.contains(e.target as Node)) setShowCodexTip(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showCodexTip])

  const activeCliName = (project?.cliCommand || globalCliDefault || '').trim().split(/\s+/)[0].toLowerCase()
  const isCodex = activeCliName === 'codex'

  const triggerSave = useCallback(() => {
    onSaveMemory?.()
    setSaveCooldown(true)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    cooldownTimerRef.current = setTimeout(() => setSaveCooldown(false), 5000)
    setTimeout(() => terminalRef.current?.focus(), 0)
  }, [onSaveMemory])

  const handleRedraw = useCallback(() => {
    const term = terminalRef.current
    if (!term || !project) return
    term.reset()
    // Defer the replay one frame so xterm fully settles the reset before we
    // start streaming bytes back in. Without this, glitched canvas state
    // can survive into the new buffer write — exactly the case where the
    // synchronous Redraw path felt like it "did nothing."
    requestAnimationFrame(() => {
      const t = terminalRef.current
      if (!t) return
      const buffer = outputBuffers.current.get(project.id)
      if (buffer) t.write(buffer)
      t.focus()
    })
  }, [project?.id])

  const handleSaveClick = useCallback(() => {
    if (saveCooldown) return
    if (isCodex && localStorage.getItem('codex-save-hint-dismissed') !== '1') {
      setShowCodexHint(true)
      return
    }
    triggerSave()
  }, [isCodex, triggerSave, saveCooldown])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const term = new Terminal({
      theme: xtermTheme,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      scrollback: 5000,
      allowTransparency: true,
      convertEol: true,
      copyOnSelection: true,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    // Ctrl+C: copy if text selected, otherwise let xterm send interrupt.
    // Ctrl+V: must return false to stop xterm from treating it as a keystroke
    // (which would emit \x16). The browser's native paste event still fires on
    // the helper-textarea and xterm's paste handler routes it to onData.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (e.ctrlKey && e.key === 'v') return false
      return true
    })

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Maintain isAtBottom: viewportY === baseY means viewport is at the bottom.
    // We hook multiple sources because xterm.onScroll alone misses some cases
    // (e.g. when buffer grows but viewport doesn't move because user scrolled up).
    const updateAtBottom = () => {
      const buf = term.buffer.active
      setIsAtBottom(buf.viewportY >= buf.baseY)
    }
    const scrollDisposable = term.onScroll(updateAtBottom)
    const lineFeedDisposable = term.onLineFeed(updateAtBottom)
    const onWheel = () => {
      // After the wheel event lets xterm update its viewport, sample state.
      requestAnimationFrame(updateAtBottom)
    }
    container.addEventListener('wheel', onWheel, { passive: true })

    // Periodic soft refresh to recover from rare xterm dirty-rect glitches
    // (characters overlapping / duplicating during heavy PTY output). This
    // does NOT clear the buffer or flicker — it just asks xterm to redraw
    // the visible viewport from its current internal state.
    const refreshInterval = setInterval(() => {
      try {
        if (term.rows > 0) term.refresh(0, term.rows - 1)
      } catch { /* ignore */ }
    }, 5000)

    // Fit after opening
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    }, 50)

    // Aggressive IME fix: xterm updates the helper-textarea position only
    // during its render loop, so after idle/focus swaps the IME candidate
    // popup drifts (often to the top-left) and composition input is lost.
    // We force-align the textarea to the cursor at the exact moments the
    // IME needs it — compositionstart and focus — using the rendered
    // .xterm-screen element to derive cell size (no private API).
    const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    const relocateTextarea = () => {
      if (!textarea) return
      const screen = container.querySelector('.xterm-screen') as HTMLElement | null
      if (!screen || term.cols === 0 || term.rows === 0) return
      try {
        const cellW = screen.offsetWidth / term.cols
        const cellH = screen.offsetHeight / term.rows
        const buf = term.buffer.active
        textarea.style.left = `${buf.cursorX * cellW}px`
        textarea.style.top = `${buf.cursorY * cellH}px`
      } catch { /* ignore */ }
    }
    // Pin the textarea to wherever it sat at compositionstart. xterm keeps
    // re-positioning the textarea on every render (which drags the IME
    // candidate popup along during a CLI thinking spinner); a MutationObserver
    // reverts those style changes for the duration of the composition so the
    // popup stays put at the user's typing position.
    let lockedPos: { left: string; top: string } | null = null
    let writingLock = false
    const enforceLock = () => {
      if (!lockedPos || !textarea || writingLock) return
      if (textarea.style.left !== lockedPos.left || textarea.style.top !== lockedPos.top) {
        writingLock = true
        textarea.style.left = lockedPos.left
        textarea.style.top = lockedPos.top
        writingLock = false
      }
    }
    const styleObserver = new MutationObserver(enforceLock)
    const onCompositionStart = () => {
      relocateTextarea()
      if (textarea) {
        lockedPos = { left: textarea.style.left, top: textarea.style.top }
        styleObserver.observe(textarea, { attributes: true, attributeFilter: ['style'] })
      }
    }
    const onCompositionEnd = () => {
      lockedPos = null
      styleObserver.disconnect()
    }
    // Image paste: when the clipboard holds a bitmap (a screenshot, a Snipping
    // Tool capture, etc.) we save it to a temp file and write the path into
    // the PTY. Claude Code picks up image paths referenced in the user's
    // message and attaches them to the next turn.
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        e.preventDefault()
        e.stopPropagation()
        const ext = item.type.split('/')[1] || 'png'
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const base64 = btoa(bin)
        try {
          const filePath = await (window.api as unknown as {
            saveClipboardImage: (b64: string, ext: string) => Promise<string>
          }).saveClipboardImage(base64, ext)
          if (currentProjectIdRef.current && isRunningRef.current) {
            window.api.writePty(currentProjectIdRef.current, filePath)
          }
        } catch (err) {
          console.error('saveClipboardImage failed', err)
        }
        return
      }
    }

    if (textarea) {
      textarea.addEventListener('compositionstart', onCompositionStart)
      textarea.addEventListener('compositionend', onCompositionEnd)
      textarea.addEventListener('focus', relocateTextarea)
      textarea.addEventListener('paste', onPaste)
    }

    return () => {
      if (textarea) {
        textarea.removeEventListener('compositionstart', onCompositionStart)
        textarea.removeEventListener('compositionend', onCompositionEnd)
        textarea.removeEventListener('focus', relocateTextarea)
        textarea.removeEventListener('paste', onPaste)
      }
      styleObserver.disconnect()
      container.removeEventListener('wheel', onWheel)
      clearInterval(refreshInterval)
      scrollDisposable.dispose()
      lineFeedDisposable.dispose()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Keep isRunning in a ref so the onData handler always sees the latest value
  const isRunningRef = useRef(isRunning)
  isRunningRef.current = isRunning

  // Register keyboard input handler once per project
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return

    const disposable = term.onData((data) => {
      if (currentProjectIdRef.current && isRunningRef.current) {
        window.api.writePty(currentProjectIdRef.current, data)
        // Mark that the user has sent a message to this project (Enter key = '\r')
        if (data.includes('\r') && onUserInput) {
          onUserInput(currentProjectIdRef.current)
        }
      }
    })

    return () => disposable.dispose()
  }, [project?.id])

  // Global PTY data listener — buffers all projects, writes active one to terminal
  useEffect(() => {
    const cleanup = window.api.onPtyData((id, data) => {
      // Buffer output per project (cap at 200KB)
      const MAX = 200 * 1024
      const prev = outputBuffers.current.get(id) ?? ''
      const next = prev.length + data.length > MAX
        ? (prev + data).slice(-(MAX))
        : prev + data
      outputBuffers.current.set(id, next)

      // Write to terminal only if this is the active project
      if (id === currentProjectIdRef.current && terminalRef.current) {
        terminalRef.current.write(data)
      }
    })
    return cleanup
  }, [])

  // On project switch: save outgoing scroll position, replay incoming buffer,
  // then restore the previously saved scroll offset for that project.
  useEffect(() => {
    const term = terminalRef.current
    const prevId = prevProjectIdRef.current
    if (term && prevId) {
      const buf = term.buffer.active
      scrollOffsets.current.set(prevId, Math.max(0, buf.baseY - buf.viewportY))
    }
    prevProjectIdRef.current = project?.id ?? null
    currentProjectIdRef.current = project?.id ?? null
    if (!term || !project) return

    term.reset()

    const restore = () => {
      const offset = scrollOffsets.current.get(project.id) ?? 0
      if (offset > 0) term.scrollLines(-offset)
    }

    const buffer = outputBuffers.current.get(project.id)
    if (buffer) {
      term.write(buffer, restore)
    } else {
      restore()
    }

    term.focus()
  }, [project?.id])

  // Sync PTY size whenever isRunning turns true
  const prevIsRunningRef = useRef(false)
  useEffect(() => {
    if (isRunning && !prevIsRunningRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
          const term = terminalRef.current
          if (term && currentProjectIdRef.current) {
            window.api.resizePty(currentProjectIdRef.current, term.cols, term.rows)
            term.focus()
          }
        } catch { /* ignore */ }
      }, 100)
    }
    prevIsRunningRef.current = isRunning
  }, [isRunning])

  // IME fix: when window gains focus or tab becomes visible, force xterm to
  // re-focus so its hidden helper-textarea (which anchors the IME candidate
  // window) is repositioned to the current cursor. Without this, the IME popup
  // can drift to the top-left of the terminal and composition input gets dropped.
  useEffect(() => {
    const sync = () => {
      const term = terminalRef.current
      if (!term) return
      try {
        term.focus()
        term.refresh(0, term.rows - 1)
      } catch { /* ignore */ }
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  // Handle resize. On Windows, the maximize/unmaximize animation (~200ms)
  // fires ResizeObserver with mid-animation sizes, so fit() can lock into a
  // wrong cols/rows. Measure on the next frame, then a delayed pass to catch
  // the final size when the animation settles. Refresh after each so the
  // IME helper-textarea realigns with the new cursor position.
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleResize = useCallback(() => {
    const apply = () => {
      const fit = fitAddonRef.current
      const term = terminalRef.current
      if (!fit || !term) return
      try {
        fit.fit()
        if (currentProjectIdRef.current && isRunningRef.current) {
          window.api.resizePty(currentProjectIdRef.current, term.cols, term.rows)
        }
        term.refresh(0, term.rows - 1)
      } catch { /* ignore */ }
    }
    requestAnimationFrame(apply)
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(apply, 180)
  }, [])

  useEffect(() => {
    return () => { if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current) }
  }, [])

  useEffect(() => {
    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    return () => observer.disconnect()
  }, [handleResize])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-base)', minWidth: 0 }}>
      {/* Toolbar — always visible, 3-column layout */}
      <div
        className="flex items-center px-4 py-2 border-b flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
          height: 48,
        }}
      >
        {/* Left: project info (only when a project is open) */}
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
          {project && (
            <>
              <div className="flex items-center gap-2 flex-shrink-0">
                {project.status === 'working' && (
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--status-working)' }} />
                )}
                {project.status === 'needs_confirmation' && (
                  <span
                    className="inline-block w-2 h-2 rounded-full animate-pulse-confirm"
                    style={{ backgroundColor: 'var(--status-confirm)' }}
                  />
                )}
                {project.status === 'waiting' && (
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-blue)' }} />
                )}
                {project.status === 'paused' && (
                  <span
                    className="inline-block w-2 h-2 rounded-full border"
                    style={{ borderColor: 'var(--text-muted)' }}
                  />
                )}
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {project.name}
                </span>
              </div>
              <span className="text-xs truncate min-w-0" style={{ color: 'var(--text-muted)' }}>
                {project.path}
              </span>
              {/* CLI badge */}
              <span
                className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                title="CLI 命令"
              >
                {project.cliCommand || globalCliDefault || 'claude'}
              </span>
              {/* Saving indicator */}
              {isSaving && (
                <span
                  className="flex-shrink-0 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--status-warn)', border: '1px solid #4a3800' }}
                >
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {t.savingIndicator}
                </span>
              )}
              {/* Auto-save indicator */}
              {isAutoSaving && !isSaving && (
                <span
                  className="flex-shrink-0 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--accent-blue)', border: '1px solid #1f3f6e' }}
                >
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {t.autoSaving}
                </span>
              )}
            </>
          )}
        </div>

        {/* Center: monitor toggle — active state when monitor is open */}
        <div className="flex items-center justify-center flex-shrink-0 px-3">
          <button
            onClick={onToggleMonitor}
            className="btn-tool btn-tool--accent-blue"
            data-on={isMonitorView || undefined}
            title={t.monitorTitle}
          >
            <LayoutGrid size={14} />
            {t.monitor}
          </button>
        </div>

        {/* Right: project controls */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-1 justify-end">
          {/* Redraw — recover from rare xterm rendering glitches without
              clearing PTY state. Sits next to Stop for one-glance recovery. */}
          {project && isRunning && !isMonitorView && (
            <button
              onClick={handleRedraw}
              className="btn-tool btn-tool--accent-blue"
              title={t.redraw}
            >
              <RotateCw size={13} />
              {t.redraw}
            </button>
          )}

          {/* Stop — only when running AND not viewing the monitor grid.
              In the monitor view these buttons refer to whichever session happened
              to be active last, which is confusing; hide them. */}
          {project && isRunning && !isMonitorView && (
            <button
              onClick={async () => { if (!(await confirmDialog({ message: t.confirmStop }))) return; onStop() }}
              disabled={isSaving}
              className="btn-tool btn-tool--danger"
            >
              {isSaving ? <span className="spinner-arc" /> : <Square size={13} />}
              {isSaving ? t.savingMemory : t.stop}
            </button>
          )}

          {/* Save Memory — only when running AND not in monitor view (same reasoning as Stop) */}
          {project && isRunning && !isMonitorView && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveClick}
                disabled={isManualSaving || isSaving || saveCooldown}
                className="btn-tool btn-tool--warn"
              >
                {isManualSaving ? <span className="spinner-arc" /> : <Save size={13} />}
                {isManualSaving ? t.savingMemory : t.saveMemory}
              </button>
              {isCodex && (
                <div className="relative" ref={codexTipRef}>
                  <button
                    type="button"
                    onClick={() => setShowCodexTip((v) => !v)}
                    aria-label={t.codexSaveHintTooltip}
                    className="flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-opacity"
                    style={{ color: 'var(--status-warn)', opacity: showCodexTip ? 1 : 0.75 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = showCodexTip ? '1' : '0.75' }}
                  >
                    <Info size={13} />
                  </button>
                  {showCodexTip && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 rounded-xl p-3 text-xs leading-relaxed shadow-2xl z-50"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {t.codexSaveHintBody}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Agent menu — only when a project is open AND not in monitor view */}
          {project && !isMonitorView && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="btn-tool btn-tool--icon btn-tool--accent-blue"
                data-on={showMenu || undefined}
              >
                <Bot size={16} />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-36 rounded-xl border shadow-2xl z-50 overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
                >
                  {!isRunning && (
                    <button
                      onClick={() => { setShowMenu(false); onStart() }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs transition-colors"
                      style={{ color: 'var(--status-working)' }}
                      onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.backgroundColor = '#1a2d1e' }}
                      onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                    >
                      <Play size={12} />
                      {project.status === 'paused' ? t.resume : t.start}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMenu(false); onOpenRole?.() }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
                  >
                    <Settings size={12} />
                    {t.role}
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); onChangeCli?.() }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
                  >
                    <TerminalIcon size={12} />
                    {t.switchCli}
                  </button>
                  {onMigrateWorkspace && (
                    <button
                      onClick={() => { setShowMenu(false); onMigrateWorkspace() }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-primary)' }}
                      onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.color = 'var(--text-secondary)' }}
                    >
                      <FolderInput size={12} />
                      {t.migrateMenuLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Monitor overlay — shown instead of terminal when monitor is active */}
      {monitorContent && (
        <div className="flex-1 overflow-hidden">
          {monitorContent}
        </div>
      )}

      {/* Terminal container - always in DOM so xterm initializes on mount */}
      <div className={`flex-1 relative overflow-hidden ${monitorContent ? 'hidden' : ''}`}>
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ padding: '8px' }}
        />

        {/* Jump-to-latest button — visible only when scrolled back through history */}
        {project && isRunning && !cliError && !isAtBottom && (
          <button
            onClick={() => {
              terminalRef.current?.scrollToBottom()
              terminalRef.current?.focus()
            }}
            className="btn-primary absolute bottom-4 right-6 flex items-center justify-center w-9 h-9 rounded-full z-40"
            title={t.scrollToBottom}
          >
            <ArrowDown size={16} />
          </button>
        )}

        {/* Save notify toast */}
        {notify && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-xs font-medium shadow-lg z-50 pointer-events-none"
            style={{
              backgroundColor: notify.level === 'success' ? '#1a3a22' : notify.level === 'error' ? '#3a1a1a' : 'var(--bg-card)',
              border: `1px solid ${notify.level === 'success' ? 'var(--status-working)' : notify.level === 'error' ? 'var(--status-confirm)' : 'var(--accent-blue)'}`,
              color: notify.level === 'success' ? 'var(--status-working)' : notify.level === 'error' ? 'var(--status-confirm)' : 'var(--accent-blue)',
              whiteSpace: 'nowrap',
            }}
          >
            {notify.message}
          </div>
        )}

        {/* No project overlay */}
        {!project && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ backgroundColor: 'var(--bg-base)' }}
          >
            <div className="text-center space-y-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ backgroundColor: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: 32 }}>⚡</span>
              </div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Agentville
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t.noProjectHint}
              </p>
            </div>
          </div>
        )}

        {/* CLI not found overlay */}
        {project && cliError && !isRunning && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ backgroundColor: 'var(--bg-base)', zIndex: 1 }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: '#2d1e1e', border: '1px solid #6e2d2d' }}
            >
              <span style={{ fontSize: 28 }}>⚠️</span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t.cliNotInstalled(cliError.cliName)}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.cliNotFoundHint}</p>
            </div>
            {cliError.installHint && (
              <button
                onClick={() => setShowInstall(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                <Download size={14} /> {t.installOneClick}
              </button>
            )}
            {cliError.installHint && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
              >
                <code className="text-xs" style={{ color: 'var(--accent-blue)' }}>{cliError.installHint}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(cliError.installHint!)}
                  className="text-xs px-2 py-0.5 rounded transition-colors flex-shrink-0"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-base)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
                  title={t.copy}
                >
                  {t.copy}
                </button>
              </div>
            )}
            <button
              onClick={onStart}
              className="text-xs px-4 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
            >
              {t.retry}
            </button>

            {showInstall && (
              <InstallCliModal
                cliKey={cliError.cliKey}
                cliName={cliError.cliName}
                installHint={cliError.installHint}
                onInstalled={() => { setShowInstall(false); onStart() }}
                onClose={() => setShowInstall(false)}
              />
            )}
          </div>
        )}

        {/* Codex save hint modal */}
        {showCodexHint && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 50 }}
            onClick={() => setShowCodexHint(false)}
          >
            <div
              className="w-[420px] rounded-2xl p-6 space-y-4"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Info size={18} style={{ color: 'var(--status-warn)' }} />
                <h3 className="text-base font-semibold">{t.codexSaveHintTitle}</h3>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {t.codexSaveHintBody}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    localStorage.setItem('codex-save-hint-dismissed', '1')
                    setShowCodexHint(false)
                    triggerSave()
                  }}
                  className="px-3 h-8 rounded-lg text-xs transition-all"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {t.codexSaveHintDismiss}
                </button>
                <button
                  onClick={() => { setShowCodexHint(false); triggerSave() }}
                  className="btn-primary px-4 h-8 rounded-lg text-xs font-medium"
                >
                  {t.codexSaveHintOk}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Session ended overlay — centered with black background */}
        {project && !isRunning && !isSaving && !cliError && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ backgroundColor: 'var(--bg-base)', zIndex: 1 }}
          >
            <div className="text-center space-y-1">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.sessionEnded}</p>
            </div>
            <button
              onClick={onStart}
              className="btn-primary btn-primary--soft flex items-center gap-2 px-8 py-3 rounded-xl text-base font-semibold"
            >
              <Play size={18} />
              {project.status === 'paused' ? t.resume : t.start} {(project.cliCommand || globalCliDefault || 'claude').trim().split(/\s+/)[0]}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
