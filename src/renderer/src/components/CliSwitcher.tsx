import React, { useState, useEffect } from 'react'
import { X, Check, Terminal, AlertCircle } from 'lucide-react'

interface CliEntry {
  key: string
  name: string
  memoryFile: string | null
}

interface CliSwitcherProps {
  projectName: string
  currentCommand: string   // effective command (already resolved with global default)
  isRunning: boolean
  onClose: () => void
  onSwitch: (command: string) => void  // undefined = use global default
}

const CLI_ICONS: Record<string, string> = {
  claude: '🤖',
  gemini: '♊',
  codex:  '🔷',
  aider:  '⚡',
}

export function CliSwitcher({ projectName, currentCommand, isRunning, onClose, onSwitch }: CliSwitcherProps) {
  const [cliList, setCliList] = useState<CliEntry[]>([])
  const [customCmd, setCustomCmd] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  useEffect(() => {
    ;(window.api as any).getCliRegistry?.().then((res: { registry: Record<string, any>; order: string[] }) => {
      if (!res) return
      const entries: CliEntry[] = res.order.map((key: string) => ({
        key,
        name: res.registry[key]?.name ?? key,
        memoryFile: res.registry[key]?.memoryFile ?? null,
      }))
      setCliList(entries)
    })
  }, [])

  const currentKey = currentCommand.trim().split(/\s+/)[0].toLowerCase()

  const handleSelect = (key: string) => {
    if (key === currentKey) { onClose(); return }
    onSwitch(key)
    onClose()
  }

  const handleCustom = () => {
    const cmd = customCmd.trim()
    if (!cmd) return
    onSwitch(cmd)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 4, 9, 0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)', width: 380, maxWidth: 'calc(100vw - 48px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Terminal size={15} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>切换 CLI — {projectName}</span>
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

        {/* Warning if running */}
        {isRunning && (
          <div className="mx-5 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#2d1b00', border: '1px solid #4d2d00', color: 'var(--status-warn)' }}>
            <AlertCircle size={13} />
            切换将自动保存并重启当前会话
          </div>
        )}

        {/* CLI list */}
        <div className="p-4 space-y-2">
          {cliList.map((cli) => {
            const isActive = currentKey === cli.key
            return (
              <button
                key={cli.key}
                onClick={() => handleSelect(cli.key)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all"
                style={{
                  backgroundColor: isActive ? '#1c2840' : 'var(--bg-card)',
                  borderColor: isActive ? 'var(--accent-blue)' : 'var(--border)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)'
                    ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-card)'
                  }
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{CLI_ICONS[cli.key] ?? '💻'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cli.name}</span>
                    {isActive && <Check size={13} style={{ color: 'var(--accent-blue)' }} />}
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {cli.key}{cli.memoryFile ? ` · ${cli.memoryFile}` : ' · 无记忆文件'}
                  </span>
                </div>
              </button>
            )
          })}

          {/* Custom */}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: showCustom ? 'var(--text-muted)' : 'var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)' }}
            onMouseLeave={(e) => { if (!showCustom) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>💻</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>自定义命令...</span>
          </button>

          {showCustom && (
            <div className="flex gap-2 px-1">
              <input
                type="text"
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder="如：aider --model gpt-4o"
                autoFocus
                className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-blue)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCustom() }}
              />
              <button
                onClick={handleCustom}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#ffffff' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-blue)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-blue)' }}
              >
                确认
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
