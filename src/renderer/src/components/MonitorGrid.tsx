import React, { useEffect, useState } from 'react'
import { ArrowLeft, Folder as FolderIcon } from 'lucide-react'
import { T } from '../i18n'
import { useStore, type Group } from '../store/useStore'

interface Project {
  id: string
  name: string
  path: string
  cliCommand?: string
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  archived?: boolean
  groupId: string | null
  pinned: boolean
  createdAt: string
  lastUsed: string
}

interface MonitorGridProps {
  projects: Project[]
  groups: Group[]
  runningProjects: Set<string>
  initialBuffers: Map<string, string>
  onSelectProject: (id: string) => void
}

const CLI_INFO: Record<string, { bg: string; letter: string }> = {
  claude: { bg: 'var(--accent-blue)', letter: 'C' },
  gemini: { bg: '#8b5cf6', letter: 'G' },
  codex:  { bg: '#22c55e', letter: 'X' },
  aider:  { bg: '#f97316', letter: 'A' },
}

const STATUS_COLOR: Record<string, string> = {
  working: 'var(--status-working)',
  waiting: 'var(--accent-blue)',
  needs_confirmation: 'var(--status-confirm)',
  paused: 'var(--text-muted)',
}

function getCliInfo(cmd?: string) {
  const key = (cmd || 'claude').trim().split(/\s+/)[0].toLowerCase()
  return CLI_INFO[key] ?? { bg: 'var(--text-muted)', letter: key[0]?.toUpperCase() ?? '?' }
}

// Strip common ANSI escape sequences for plain-text preview
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*[\x07\x1b\\])/g
function stripAnsi(s: string) {
  return s.replace(ANSI_RE, '').replace(/\r/g, '')
}

function SessionCard({
  project,
  bufText,
  isRunning,
  onSelect,
}: {
  project: Project
  bufText: string
  isRunning: boolean
  onSelect: () => void
}) {
  const cli = getCliInfo(project.cliCommand)
  const statusColor = STATUS_COLOR[project.status] ?? 'var(--text-muted)'
  const lines = bufText.split('\n').filter((l) => l.trim()).slice(-10)
  const shortPath = project.path.split(/[/\\]/).slice(-2).join('/')
  const cliCmd = (project.cliCommand || 'claude').trim().split(/\s+/)[0]

  return (
    <div
      onClick={onSelect}
      className="flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        backgroundColor: 'var(--bg-base)',
        border: '1px solid #21262d',
        height: 216,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#21262d' }}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid #21262d' }}
      >
        <div
          className="flex items-center justify-center rounded-md flex-shrink-0 text-xs font-bold"
          style={{ width: 22, height: 22, backgroundColor: cli.bg, color: '#fff' }}
        >
          {cli.letter}
        </div>
        <span className="flex-1 text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {project.name}
        </span>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            project.status === 'needs_confirmation' ? 'animate-pulse-confirm' : ''
          }`}
          style={{ backgroundColor: statusColor }}
        />
      </div>
      <div
        className="flex items-center gap-1.5 px-3 py-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--bg-sidebar)' }}
      >
        <span
          className="text-xs truncate flex-1"
          style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}
        >
          {shortPath}
        </span>
        <span
          className="text-xs px-1 rounded flex-shrink-0"
          style={{
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-muted)',
            border: '1px solid #21262d',
            fontFamily: 'monospace',
          }}
        >
          {cliCmd}
        </span>
      </div>
      <div
        className="flex-1 overflow-hidden px-3 py-2"
        style={{
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
          fontSize: 10.5,
          lineHeight: 1.55,
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: 'var(--border)' }}>{isRunning ? '…' : '—'}</span>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              style={{
                color: '#6e7681',
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function GroupCard({
  group,
  members,
  onOpen,
}: {
  group: Group
  members: Project[]
  onOpen: () => void
}) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  const working = members.filter((p) => p.status === 'working').length
  const waiting = members.filter((p) => p.status === 'waiting').length
  const confirm = members.filter((p) => p.status === 'needs_confirmation').length
  const paused = members.filter((p) => p.status === 'paused').length

  // Up to 4 member avatars shown stacked.
  const avatars = members.slice(0, 4).map((p) => getCliInfo(p.cliCommand))

  return (
    <div
      onClick={onOpen}
      className="flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        backgroundColor: 'var(--bg-base)',
        border: '1px solid var(--border)',
        height: 216,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid #21262d' }}
      >
        <div
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{ width: 22, height: 22, backgroundColor: '#1f3f6e', color: 'var(--accent-blue)' }}
        >
          <FolderIcon size={13} />
        </div>
        <span className="flex-1 text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {group.name}
        </span>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {t.groupCount(members.length)}
        </span>
      </div>
      {/* Member avatar row */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--bg-sidebar)' }}
      >
        {avatars.length === 0 ? (
          <span className="text-xs" style={{ color: 'var(--border)' }}>—</span>
        ) : (
          <>
            {avatars.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-md text-xs font-bold"
                style={{ width: 20, height: 20, backgroundColor: a.bg, color: '#fff', fontSize: 10 }}
              >
                {a.letter}
              </div>
            ))}
            {members.length > avatars.length && (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                +{members.length - avatars.length}
              </span>
            )}
          </>
        )}
      </div>
      {/* Status breakdown */}
      <div className="flex-1 overflow-hidden px-3 py-2 space-y-1">
        {working > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR.working }} />
            <span style={{ color: 'var(--text-primary)' }}>{t.groupOverviewWorking(working)}</span>
          </div>
        )}
        {confirm > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-confirm"
              style={{ backgroundColor: STATUS_COLOR.needs_confirmation }}
            />
            <span style={{ color: 'var(--status-confirm)' }}>{t.groupOverviewConfirm(confirm)}</span>
          </div>
        )}
        {waiting > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR.waiting }} />
            <span style={{ color: 'var(--text-primary)' }}>{t.groupOverviewWaiting(waiting)}</span>
          </div>
        )}
        {paused > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full border" style={{ borderColor: STATUS_COLOR.paused }} />
            <span style={{ color: 'var(--text-secondary)' }}>{t.groupOverviewPaused(paused)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MonitorGrid({
  projects,
  groups,
  runningProjects,
  initialBuffers,
  onSelectProject,
}: MonitorGridProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [buffers, setBuffers] = useState<Map<string, string>>(() => new Map(initialBuffers))
  // Internal view: null = main grid; groupId = expanded group view
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  // Track previous view for a simple fade animation on switch
  const [fadeKey, setFadeKey] = useState(0)

  // Subscribe to live PTY output for real-time mini previews
  useEffect(() => {
    const cleanup = window.api.onPtyData((id: string, data: string) => {
      const stripped = stripAnsi(data)
      if (!stripped) return
      setBuffers((prev) => {
        const next = new Map(prev)
        const cur = next.get(id) ?? ''
        const combined = cur + stripped
        const lines = combined.split('\n')
        next.set(id, lines.slice(-80).join('\n'))
        return next
      })
    })
    return cleanup
  }, [])

  // If the expanded group gets deleted while we're viewing it, fall back.
  useEffect(() => {
    if (expandedGroup && !groups.find((g) => g.id === expandedGroup)) {
      setExpandedGroup(null)
    }
  }, [groups, expandedGroup])

  // All running, non-archived projects are candidates for the grid.
  const allRunning = projects
    .filter((p) => !p.archived && runningProjects.has(p.id))
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())

  const switchView = (next: string | null) => {
    setExpandedGroup(next)
    setFadeKey((k) => k + 1)
  }

  // Expanded-group view: just the sessions in that group.
  if (expandedGroup) {
    const group = groups.find((g) => g.id === expandedGroup)
    const members = allRunning.filter((p) => p.groupId === expandedGroup)
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div
          className="flex items-center gap-2 px-4 py-2 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)', height: 44 }}
        >
          <button
            onClick={() => switchView(null)}
            className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs transition-all"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
          >
            <ArrowLeft size={12} />
            {t.backToRoot}
          </button>
          <FolderIcon size={14} style={{ color: 'var(--accent-blue)' }} />
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {group?.name ?? ''}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t.groupCount(members.length)}
          </span>
        </div>

        <div key={fadeKey} className="flex-1 overflow-y-auto p-4 monitor-fade">
          {members.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.groupEmpty}</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}
            >
              {members.map((project) => (
                <SessionCard
                  key={project.id}
                  project={project}
                  bufText={buffers.get(project.id) ?? ''}
                  isRunning={runningProjects.has(project.id)}
                  onSelect={() => onSelectProject(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main grid: groupless sessions as individual cards; grouped sessions collapsed into group cards.
  const loose = allRunning.filter((p) => p.groupId === null)

  // Group cards: one per group that has at least one running, non-archived member.
  // (Spec: "无论群里有多少个会话，只要 groupId 非 null 就聚合")
  // Note: we only aggregate running projects in the monitor — non-running ones aren't
  // on the grid anyway.
  const groupCards = groups
    .map((g) => ({ group: g, members: allRunning.filter((p) => p.groupId === g.id) }))
    .filter(({ members }) => members.length > 0)

  const isEmpty = loose.length === 0 && groupCards.length === 0

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div key={fadeKey} className="flex-1 overflow-y-auto p-4 monitor-fade">
        {isEmpty ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.noSessions}</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 12,
            }}
          >
            {groupCards.map(({ group, members }) => (
              <GroupCard
                key={`group-${group.id}`}
                group={group}
                members={members}
                onOpen={() => switchView(group.id)}
              />
            ))}
            {loose.map((project) => (
              <SessionCard
                key={project.id}
                project={project}
                bufText={buffers.get(project.id) ?? ''}
                isRunning={runningProjects.has(project.id)}
                onSelect={() => onSelectProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
