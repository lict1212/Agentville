import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Download, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { T } from '../i18n'
import { useStore } from '../store/useStore'

type Status = 'confirm' | 'installing' | 'success' | 'failed' | 'prereq'

const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g
const stripAnsi = (s: string) => s.replace(ANSI_RE, '')

// Heuristic colour for lines that carry NO ANSI colour (e.g. older pip).
const isWarnLine = (l: string) => /^npm warn|^warning:|deprecat|^npm notice/i.test(l)
const isErrorLine = (l: string) =>
  !isWarnLine(l) &&
  /(^|\s)(error|err!|fatal|cannot|unable|denied|backendunavailable|no matching|did not run successfully|failed|✖|×)\b/i.test(l)
const heuristicColor = (l: string) =>
  isErrorLine(l) ? '#ff7b72' : isWarnLine(l) ? '#d29922' : 'var(--text-secondary)'

// ANSI SGR foreground palette (matches the xterm theme used in the terminal).
const ANSI_FG: Record<number, string> = {
  30: '#484f58', 31: '#ff7b72', 32: '#3fb950', 33: '#d29922', 34: '#58a6ff', 35: '#bc8cff', 36: '#39c5cf', 37: '#b1bac4',
  90: '#6e7681', 91: '#ffa198', 92: '#56d364', 93: '#e3b341', 94: '#79c0ff', 95: '#d2a8ff', 96: '#56d4dd', 97: '#f0f6fc',
}

type Seg = { text: string; color: string | null }

// Parse ANSI SGR colour codes into lines of coloured segments, tracking colour
// state across the whole stream. Non-colour escape codes are stripped out.
const ansiToLines = (input: string): Seg[][] => {
  const SGR = /\x1B\[([0-9;]*)m/g
  const lines: Seg[][] = [[]]
  let cur: string | null = null
  let last = 0
  let m: RegExpExecArray | null

  const pushText = (raw: string) => {
    const clean = stripAnsi(raw)
    if (!clean) return
    const parts = clean.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ text: part, color: cur })
    })
  }

  while ((m = SGR.exec(input))) {
    pushText(input.slice(last, m.index))
    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number)
    for (const c of codes) {
      if (c === 0 || c === 39) cur = null
      else if (ANSI_FG[c]) cur = ANSI_FG[c]
    }
    last = SGR.lastIndex
  }
  pushText(input.slice(last))
  return lines
}

interface InstallCliModalProps {
  cliKey: string
  cliName: string
  installHint?: string | null
  onClose: () => void
  // Fired once the binary is verified on PATH after a successful install.
  onInstalled?: () => void
}

export function InstallCliModal({ cliKey, cliName, installHint, onClose, onInstalled }: InstallCliModalProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const api = (window as any).api

  const [status, setStatus] = useState<Status>('confirm')
  const [log, setLog] = useState('')
  const [prereq, setPrereq] = useState<{ label: string; url: string } | null>(null)
  const [failReason, setFailReason] = useState<string | null>(null)
  const [errorLine, setErrorLine] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // Subscribe to streamed install output once.
  useEffect(() => {
    const unsub = api.onCliInstallLog?.((key: string, chunk: string) => {
      if (key === cliKey) setLog((prev) => prev + chunk)
    })
    return () => unsub?.()
  }, [cliKey])

  const runInstall = useCallback(() => {
    setStatus('installing')
    setLog('')
    setPrereq(null)
    setFailReason(null)
    setErrorLine('')
    api.installCli(cliKey).then((res: any) => {
      if (res?.prereqMissing) {
        setPrereq({ label: res.runtimeLabel ?? res.prereqMissing, url: res.downloadUrl })
        setStatus('prereq')
      } else if (res?.success) {
        setStatus('success')
        onInstalled?.()
      } else {
        setFailReason(res?.failReason ?? null)
        setErrorLine(res?.errorLine ?? '')
        setStatus('failed')
      }
    }).catch(() => { setFailReason(null); setStatus('failed') })
  }, [cliKey, onInstalled])

  // No auto-run: the user confirms with the "Start install" button first.

  // Keep the log scrolled to the latest line.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const busy = status === 'installing'

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[60]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: '92vw',
          maxHeight: '86vh',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {status === 'confirm' && <Download size={15} style={{ color: 'var(--accent-blue)' }} />}
            {status === 'installing' && <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />}
            {status === 'success' && <CheckCircle2 size={15} style={{ color: 'var(--status-working)' }} />}
            {(status === 'failed' || status === 'prereq') && <AlertTriangle size={15} style={{ color: 'var(--status-confirm)' }} />}
            <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {t.installTitle(cliName)}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded transition-all flex-shrink-0"
            style={{ color: 'var(--text-secondary)', opacity: busy ? 0.4 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
            onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.backgroundColor = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Confirm step — nothing runs until the user clicks Start install */}
          {status === 'confirm' && (
            <div className="flex flex-col gap-2">
              {installHint && (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.installConfirmHint(cliName)}</p>
                  <code
                    className="text-xs px-3 py-2 rounded-lg break-all"
                    style={{ backgroundColor: 'var(--bg-base)', color: 'var(--accent-blue)', border: '1px solid var(--border)', userSelect: 'text', cursor: 'text' }}
                  >
                    {installHint}
                  </code>
                </>
              )}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.installConfirmNote}</p>
            </div>
          )}

          {/* Status line */}
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {status === 'installing' && <span>{t.installRunning}</span>}
            {status === 'success' && <span style={{ color: 'var(--text-primary)' }}>{t.installSuccess} <span style={{ color: 'var(--text-muted)' }}>· {t.installSuccessHint}</span></span>}
            {status === 'failed' && <span style={{ color: 'var(--text-primary)' }}>{t.installFailed} <span style={{ color: 'var(--text-muted)' }}>· {t.installFailedHint}</span></span>}
          </div>

          {/* The actual error the tool reported — always accurate */}
          {status === 'failed' && errorLine && (
            <div
              className="rounded-lg px-3 py-2 flex flex-col gap-1"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--status-confirm)' }}
            >
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--status-confirm)' }}>
                {t.installErrorLabel}
              </span>
              <code className="text-xs whitespace-pre-wrap break-all font-mono" style={{ color: 'var(--text-primary)', userSelect: 'text', cursor: 'text' }}>
                {errorLine}
              </code>
            </div>
          )}

          {/* High-confidence fix suggestion (only when we're sure) */}
          {status === 'failed' && failReason && t.installReason[failReason] && (
            <div
              className="rounded-lg px-3 py-2 flex flex-col gap-0.5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-blue)' }}
            >
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--accent-blue)' }}>
                {t.installReasonLabel}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-primary)', userSelect: 'text', cursor: 'text' }}>{t.installReason[failReason]}</span>
            </div>
          )}

          {/* Prereq missing — guide to download the runtime */}
          {status === 'prereq' && prereq && (
            <div
              className="rounded-lg px-3 py-3 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.installPrereqTitle(prereq.label)}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.installPrereqHint(prereq.label)}</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => window.open(prereq.url, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
                >
                  <Download size={13} /> {t.installDownload(prereq.label)}
                  <ExternalLink size={11} />
                </button>
                <button
                  onClick={runInstall}
                  className="px-3 py-1.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {t.installRecheck}
                </button>
              </div>
            </div>
          )}

          {/* Install log */}
          {status !== 'confirm' && (status !== 'prereq' || log.trim()) && (
            <div
              ref={logRef}
              className="text-[11px] leading-relaxed rounded-lg p-3 overflow-y-auto font-mono"
              style={{
                backgroundColor: 'var(--bg-base)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                maxHeight: 260,
                minHeight: 120,
                userSelect: 'text',
                cursor: 'text',
              }}
            >
              {log
                ? ansiToLines(log.replace(/\r/g, '')).map((segs, i) => {
                    const hasColor = segs.some((s) => s.color)
                    if (!hasColor) {
                      const plain = segs.map((s) => s.text).join('')
                      return (
                        <div key={i} className="whitespace-pre-wrap break-all" style={{ color: heuristicColor(plain) }}>
                          {plain || ' '}
                        </div>
                      )
                    }
                    return (
                      <div key={i} className="whitespace-pre-wrap break-all">
                        {segs.map((s, j) => (
                          <span key={j} style={{ color: s.color ?? 'var(--text-secondary)' }}>{s.text}</span>
                        ))}
                      </div>
                    )
                  })
                : '…'}
            </div>
          )}

          {/* Manual fallback — step-by-step for non-technical users */}
          {installHint && status === 'failed' && (
            <div
              className="rounded-lg px-3 py-3 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t.installManualTitle}</p>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.installManualStep1}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.installManualStep2}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.installManualStep3}</span>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <code className="text-xs flex-1 break-all" style={{ color: 'var(--accent-blue)', userSelect: 'text', cursor: 'text' }}>{installHint}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(installHint)}
                  className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {t.copy}
                </button>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.installNoCleanupNote}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          {status === 'confirm' && (
            <button
              onClick={runInstall}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium"
              style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
            >
              <Download size={13} /> {t.installStart}
            </button>
          )}
          {status === 'failed' && (
            <button
              onClick={runInstall}
              className="px-3 py-1.5 rounded text-xs font-medium"
              style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
            >
              {t.installRetry}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 rounded text-xs font-medium transition-all"
            style={{
              backgroundColor: status === 'success' ? 'var(--accent-blue)' : 'var(--bg-base)',
              color: status === 'success' ? '#ffffff' : 'var(--text-secondary)',
              border: status === 'success' ? 'none' : '1px solid var(--border)',
              opacity: busy ? 0.4 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'success' ? (lang === 'zh' ? '完成' : 'Done') : t.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
