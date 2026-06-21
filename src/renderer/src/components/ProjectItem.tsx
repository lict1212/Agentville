import React, { useState, useRef, useEffect } from 'react'
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, FolderInput, FolderMinus, Copy } from 'lucide-react'
import { clsx } from 'clsx'
import { T, type Translations } from '../i18n'
import { useStore } from '../store/useStore'
import { KebabMenu, type KebabMenuItem } from './KebabMenu'
import { confirmDialog } from './ConfirmDialog'

interface Project {
  id: string
  name: string
  path: string
  role: string
  cliCommand?: string
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  archived?: boolean
  groupId: string | null
  pinned: boolean
  createdAt: string
  lastUsed: string
}

interface Group {
  id: string
  name: string
  pinned: boolean
  createdAt: string
}

interface ProjectItemProps {
  project: Project
  isActive: boolean
  isArchived?: boolean
  hasNotification?: boolean
  groups?: Group[]
  onClick: () => void
  onDelete: () => void
  onArchive: () => void
  onRename: (name: string) => void
  onTogglePin?: () => void
  onMoveToGroup?: (groupId: string | null) => void
  onDuplicate?: () => void
}

function formatLastUsed(dateStr: string, t: Translations): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const days = Math.floor(diff / 86400000)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (dateDay.getTime() === today.getTime()) {
    if (minutes < 1) return t.timeJustNow
    if (minutes < 60) return t.timeMinutesAgo(minutes)
    return t.timeToday(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`)
  }
  if (days === 1) return t.timeYesterday
  if (days < 7) return t.timeDaysAgo(days)
  return date.toLocaleDateString(t.dateLocale, { month: 'short', day: 'numeric' })
}

const CLI_AVATAR: Record<string, { letter: string; color: string; bg: string }> = {
  claude:  { letter: 'C', color: 'var(--accent-blue)', bg: '#1f3f6e' },
  gemini:  { letter: 'G', color: '#d2a8ff', bg: '#3d1f6e' },
  codex:   { letter: 'X', color: 'var(--status-working)', bg: '#1a3a1f' },
  aider:   { letter: 'A', color: 'var(--status-warn)', bg: '#3a2a0e' },
}

function CliAvatar({ cliCommand, status }: { cliCommand?: string; status: Project['status'] }) {
  const key = (cliCommand ?? 'claude').trim().split(/\s+/)[0].toLowerCase()
  const avatar = CLI_AVATAR[key] ?? { letter: key[0]?.toUpperCase() ?? '?', color: 'var(--text-secondary)', bg: 'var(--bg-card-hover)' }

  const dotColor =
    status === 'working' ? 'var(--status-working)' :
    status === 'needs_confirmation' ? 'var(--status-confirm)' :
    status === 'waiting' ? 'var(--accent-blue)' : 'var(--text-muted)'

  return (
    <div className="relative flex-shrink-0" style={{ width: 28, height: 28 }}>
      <div
        className="w-full h-full rounded-lg flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: avatar.bg, color: avatar.color, fontSize: 11 }}
      >
        {avatar.letter}
      </div>
      <span
        className={clsx('absolute w-2 h-2 rounded-full border', status === 'needs_confirmation' && 'animate-pulse-confirm')}
        style={{ backgroundColor: dotColor, borderColor: 'var(--bg-sidebar)', bottom: -1, right: -1 }}
      />
    </div>
  )
}

function useStatusLabel(status: Project['status']): string {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  switch (status) {
    case 'working': return t.statusWorking
    case 'needs_confirmation': return t.statusNeedsConfirmation
    case 'waiting': return t.statusWaiting
    case 'paused': return t.statusPaused
  }
}

export function ProjectItem({
  project, isActive, isArchived, hasNotification,
  groups = [],
  onClick, onDelete, onArchive, onRename, onTogglePin, onMoveToGroup, onDuplicate,
}: ProjectItemProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Slow-double-click window for entering rename mode (2s). The browser's native
  // dblclick fires only ~500ms — users with slower taps got two single clicks
  // instead. Track the last click on the name to accept anything within 2s.
  const lastNameClickRef = useRef<number>(0)
  const needsConfirmation = project.status === 'needs_confirmation'
  const statusText = useStatusLabel(project.status)
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    else setEditName(project.name)
    setEditing(false)
  }

  // Build menu items. Pin/archive/delete are always shown; Move-to-group only when onMoveToGroup is wired.
  const menuItems: KebabMenuItem[] = []
  if (onTogglePin) {
    menuItems.push({
      key: 'pin',
      label: project.pinned ? t.unpin : t.pin,
      icon: project.pinned ? <PinOff size={12} /> : <Pin size={12} />,
      onSelect: () => onTogglePin(),
    })
  }
  if (onDuplicate) {
    menuItems.push({
      key: 'duplicate',
      label: t.duplicateAgent,
      icon: <Copy size={12} />,
      onSelect: () => onDuplicate(),
    })
  }
  menuItems.push({
    key: 'archive',
    label: isArchived ? t.unarchiveLabel : t.archiveLabel,
    icon: isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />,
    onSelect: () => onArchive(),
  })
  menuItems.push({
    key: 'delete',
    label: t.confirmDelete,
    icon: <Trash2 size={12} />,
    danger: true,
    onSelect: async () => {
      if (!(await confirmDialog({ message: `${t.confirmDelete}「${project.name}」？`, danger: true }))) return
      onDelete()
    },
  })
  if (onMoveToGroup) {
    const moveSub: KebabMenuItem[] = []
    // "Remove from group" — only meaningful when currently in a group
    if (project.groupId !== null) {
      moveSub.push({
        key: 'remove-from-group',
        label: t.removeFromGroup,
        icon: <FolderMinus size={12} />,
        onSelect: () => onMoveToGroup(null),
      })
    }
    for (const g of groups) {
      // Skip current group — would be a no-op.
      if (project.groupId === g.id) continue
      moveSub.push({
        key: `move-${g.id}`,
        label: g.name,
        onSelect: () => onMoveToGroup(g.id),
      })
    }
    if (moveSub.length > 0) {
      menuItems.push({
        key: 'move',
        label: t.moveToGroup,
        icon: <FolderInput size={12} />,
        onSelect: () => { /* submenu handles */ },
        submenu: moveSub,
      })
    }
  }

  return (
    <div
      className={clsx(
        'relative group flex items-start gap-2.5 px-3 py-3 mx-1.5 rounded-lg cursor-pointer transition-all duration-150',
        isActive ? 'bg-bg-card-active' : 'hover:bg-bg-card-hover',
        needsConfirmation && 'border-l-2 border-status-confirm rounded-l-none',
        isArchived && 'opacity-50'
      )}
      onClick={onClick}
    >
      {/* CLI avatar with status dot */}
      <div className="mt-0.5">
        <CliAvatar cliCommand={project.cliCommand} status={project.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setEditName(project.name); setEditing(false) }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm font-medium px-1 rounded outline-none"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--accent-blue)' }}
            />
          ) : (
            <span className="flex items-center gap-1.5 min-w-0 flex-1">
              {project.pinned && (
                <Pin size={10} style={{ color: 'var(--status-warn)', flexShrink: 0 }} />
              )}
              <span
                className="text-sm font-medium truncate text-text-primary"
                onClick={(e) => {
                  const now = Date.now()
                  const elapsed = now - lastNameClickRef.current
                  if (lastNameClickRef.current && elapsed < 2000) {
                    e.stopPropagation()
                    setEditing(true)
                    lastNameClickRef.current = 0
                  } else {
                    lastNameClickRef.current = now
                  }
                }}
              >
                {project.name}
              </span>
              {hasNotification && (
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-white animate-pulse-confirm"
                  style={{ backgroundColor: 'var(--status-confirm)', fontSize: 10, fontWeight: 700, lineHeight: 1 }}
                >
                  !
                </span>
              )}
            </span>
          )}

          <div
            className={clsx(
              'flex items-center gap-0.5 transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <KebabMenu items={menuItems} label={project.name} onOpenChange={setMenuOpen} align="left" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-1">
          <span className={clsx('text-xs', needsConfirmation ? 'text-status-confirm' : 'text-text-muted')}>
            {statusText}
          </span>
          <span className="text-xs text-text-muted">{formatLastUsed(project.lastUsed, t)}</span>
        </div>
      </div>
    </div>
  )
}
