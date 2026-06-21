import React, { useState, useRef, useEffect } from 'react'
import {
  Terminal, Plus, Settings, Search, X, Archive, ChevronDown, ChevronRight, ArrowLeft,
  FolderOpen, Folder as FolderIcon, Users, Pin, PinOff, Pencil, Trash2, Check,
} from 'lucide-react'
import { ProjectItem } from './ProjectItem'
import { KebabMenu, type KebabMenuItem } from './KebabMenu'
import { confirmDialog } from './ConfirmDialog'
import appIcon from '../assets/icon.png'
import { T } from '../i18n'
import { useStore, type Group } from '../store/useStore'

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

type SidebarView =
  | { type: 'root' }
  | { type: 'group'; groupId: string }
  | { type: 'archived' }

interface SidebarProps {
  projects: Project[]
  groups: Group[]
  activeProjectId: string | null
  notifications: Set<string>
  onSelectProject: (id: string) => void
  onDeleteProject: (id: string) => void
  onArchiveProject: (id: string) => void
  onUnarchiveProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
  onTogglePinProject: (id: string) => void
  onMoveProjectToGroup: (id: string, groupId: string | null) => void
  onDuplicateProject: (id: string) => void
  onNewProject: (groupId: string | null) => void
  onCreateGroup: (name: string) => Promise<void> | void
  onRenameGroup: (id: string, name: string) => void
  onTogglePinGroup: (id: string) => void
  onDeleteGroup: (id: string) => void
  onOpenSettings: () => void
}

// Sort: pinned first, then by lastUsed desc
function sortProjects(list: Project[]): Project[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
  })
}
function sortGroups(list: Group[]): Group[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

// Persistent boolean via localStorage, defaults to true (expanded).
function useLocalBool(key: string, initial = true): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => {
    const raw = localStorage.getItem(key)
    if (raw === '0') return false
    if (raw === '1') return true
    return initial
  })
  useEffect(() => {
    localStorage.setItem(key, val ? '1' : '0')
  }, [key, val])
  return [val, setVal]
}

interface GroupRowProps {
  group: Group
  sessionCount: number
  onOpen: () => void
  onRename: (name: string) => void
  onTogglePin: () => void
  onDelete: () => void
  confirmDeleteText: string
}

function GroupRow({
  group, sessionCount, onOpen, onRename, onTogglePin, onDelete, confirmDeleteText,
}: GroupRowProps) {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    else setName(group.name)
    setEditing(false)
  }

  const items: KebabMenuItem[] = [
    {
      key: 'rename',
      label: t.renameGroup,
      icon: <Pencil size={12} />,
      onSelect: () => setEditing(true),
    },
    {
      key: 'pin',
      label: group.pinned ? t.unpin : t.pin,
      icon: group.pinned ? <PinOff size={12} /> : <Pin size={12} />,
      onSelect: () => onTogglePin(),
    },
    {
      key: 'delete',
      label: t.deleteGroup,
      icon: <Trash2 size={12} />,
      danger: true,
      onSelect: async () => {
        if (!(await confirmDialog({ message: confirmDeleteText, danger: true }))) return
        onDelete()
      },
    },
  ]

  return (
    <div
      className="relative group flex items-center gap-2 px-3 py-2 mx-1.5 rounded-lg cursor-pointer transition-all"
      onClick={editing ? undefined : onOpen}
      onMouseEnter={(e) => { if (!editing) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-card-hover, var(--bg-card-hover))' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
    >
      <div className="flex-shrink-0" style={{ color: 'var(--accent-blue)' }}>
        <FolderIcon size={15} />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {group.pinned && <Pin size={10} style={{ color: 'var(--status-warn)', flexShrink: 0 }} />}
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setName(group.name); setEditing(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm px-1 rounded outline-none"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--accent-blue)' }}
          />
        ) : (
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
          >
            {group.name}
          </span>
        )}
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {sessionCount}
        </span>
      </div>
      <div
        className={
          menuOpen
            ? 'opacity-100 flex-shrink-0 transition-opacity'
            : 'opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity'
        }
      >
        <KebabMenu items={items} label={group.name} onOpenChange={setMenuOpen} align="left" />
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  label: string
  count?: number
  collapsed: boolean
  onToggle: () => void
}

function SectionHeader({ label, count, collapsed, onToggle }: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 w-full px-4 py-1.5 transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
    >
      {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      <span className="text-xs font-semibold uppercase tracking-wider">
        {label}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}
      </span>
    </button>
  )
}

export function Sidebar({
  projects, groups, activeProjectId, notifications,
  onSelectProject, onDeleteProject,
  onArchiveProject, onUnarchiveProject,
  onRenameProject, onTogglePinProject, onMoveProjectToGroup, onDuplicateProject,
  onNewProject, onCreateGroup, onRenameGroup, onTogglePinGroup, onDeleteGroup,
  onOpenSettings,
}: SidebarProps) {
  const [view, setView] = useState<SidebarView>({ type: 'root' })
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const lang = useStore((s) => s.lang)
  const t = T[lang]

  const [groupsCollapsed, setGroupsCollapsed] = useLocalBool('sidebar-group-collapsed', false)
  const [sessionsCollapsed, setSessionsCollapsed] = useLocalBool('sidebar-session-collapsed', false)

  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const newGroupInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (creatingGroup) newGroupInputRef.current?.focus()
  }, [creatingGroup])

  const query = searchQuery.trim().toLowerCase()
  const matchesQuery = (name: string) => !query || name.toLowerCase().includes(query)

  const activeProjects = projects.filter((p) => !p.archived && matchesQuery(p.name))
  const archivedList = sortProjects(projects.filter((p) => p.archived && matchesQuery(p.name)))
  const archivedTotal = projects.filter((p) => p.archived).length

  // If current view points at a group that was deleted, fall back to root.
  useEffect(() => {
    if (view.type === 'group' && !groups.find((g) => g.id === view.groupId)) {
      setView({ type: 'root' })
    }
  }, [view, groups])

  const submitNewGroup = async () => {
    const trimmed = newGroupName.trim()
    if (!trimmed) {
      setCreatingGroup(false)
      setNewGroupName('')
      return
    }
    await onCreateGroup(trimmed)
    setNewGroupName('')
    setCreatingGroup(false)
  }

  const renderHeader = () => (
    <div className="flex items-center gap-2.5 px-4 py-3" style={{ height: 52 }}>
      <img src={appIcon} alt="Agentville" className="block w-7 h-7 shrink-0 rounded-lg object-cover" />
      <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>
        Agentville
      </span>
    </div>
  )

  const renderSearch = () => (
    <div className="px-3 pt-3 pb-2">
      <div
        className="flex items-center gap-1.5 px-2.5 rounded-lg"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', height: 30 }}
      >
        <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="flex-1 bg-transparent text-xs outline-none min-w-0"
          style={{ color: 'var(--text-primary)' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-muted)', flexShrink: 0, lineHeight: 1 }}>
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )

  // Top action buttons — differ per view.
  const renderTopActions = () => {
    if (view.type === 'group') {
      const group = groups.find((g) => g.id === view.groupId)
      return (
        <div className="px-3 pb-3 space-y-2">
          <button
            onClick={() => setView({ type: 'root' })}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-muted)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
          >
            <ArrowLeft size={14} />
            {t.backToRoot}
            {group && <span className="truncate" style={{ color: 'var(--text-secondary)' }}>· {group.name}</span>}
          </button>
          <button
            onClick={() => onNewProject(view.groupId)}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--accent-blue)'; el.style.color = '#ffffff'; el.style.borderColor = 'var(--accent-blue)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
          >
            <Plus size={14} />
            {t.newSession}
          </button>
        </div>
      )
    }
    if (view.type === 'archived') {
      return (
        <div className="px-3 pb-3">
          <button
            onClick={() => setView({ type: 'root' })}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-muted)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
          >
            <ArrowLeft size={14} />
            {t.backToRoot}
          </button>
        </div>
      )
    }
    // root
    return (
      <div className="px-3 pb-3 space-y-2">
        <button
          onClick={() => onNewProject(null)}
          className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--accent-blue)'; el.style.color = '#ffffff'; el.style.borderColor = 'var(--accent-blue)' }}
          onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-card)'; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
        >
          <Plus size={14} />
          {t.newSession}
        </button>
        {creatingGroup ? (
          <div
            className="flex items-center gap-1 rounded-lg px-2 py-1"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-blue)' }}
          >
            <Users size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              ref={newGroupInputRef}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewGroup()
                if (e.key === 'Escape') { setNewGroupName(''); setCreatingGroup(false) }
              }}
              placeholder={t.newGroupPlaceholder}
              className="flex-1 text-sm bg-transparent outline-none min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={submitNewGroup}
              className="p-1 rounded"
              style={{ color: 'var(--status-working)' }}
              title={t.save}
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => { setNewGroupName(''); setCreatingGroup(false) }}
              className="p-1 rounded"
              style={{ color: 'var(--text-secondary)' }}
              title={t.cancel}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingGroup(true)}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-primary)'; el.style.borderColor = 'var(--text-muted)' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = 'var(--text-secondary)'; el.style.borderColor = 'var(--border)' }}
          >
            <Users size={14} />
            {t.newGroup}
          </button>
        )}
      </div>
    )
  }

  const renderRootList = () => {
    const sortedGroups = sortGroups(groups.filter((g) => matchesQuery(g.name)))
    const ungrouped = sortProjects(activeProjects.filter((p) => p.groupId === null))

    return (
      <>
        {/* Block A: Groups */}
        <SectionHeader
          label={t.groupsSectionTitle}
          count={sortedGroups.length}
          collapsed={groupsCollapsed}
          onToggle={() => setGroupsCollapsed(!groupsCollapsed)}
        />
        {!groupsCollapsed && (
          <div className="pb-2">
            {sortedGroups.length === 0 ? (
              <div className="px-4 py-2 text-xs" style={{ color: 'var(--border)' }}>—</div>
            ) : (
              sortedGroups.map((g) => {
                const sessionCount = projects.filter((p) => !p.archived && p.groupId === g.id).length
                return (
                  <GroupRow
                    key={g.id}
                    group={g}
                    sessionCount={sessionCount}
                    onOpen={() => setView({ type: 'group', groupId: g.id })}
                    onRename={(name) => onRenameGroup(g.id, name)}
                    onTogglePin={() => onTogglePinGroup(g.id)}
                    onDelete={() => onDeleteGroup(g.id)}
                    confirmDeleteText={t.deleteGroupConfirm(g.name)}
                  />
                )
              })
            )}
          </div>
        )}

        {/* Block B: Ungrouped sessions */}
        <SectionHeader
          label={t.sessionsSectionTitle}
          count={ungrouped.length}
          collapsed={sessionsCollapsed}
          onToggle={() => setSessionsCollapsed(!sessionsCollapsed)}
        />
        {!sessionsCollapsed && (
          <div>
            {ungrouped.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                hasNotification={notifications.has(project.id)}
                groups={groups}
                onClick={() => onSelectProject(project.id)}
                onDelete={() => onDeleteProject(project.id)}
                onArchive={() => onArchiveProject(project.id)}
                onRename={(name) => onRenameProject(project.id, name)}
                onTogglePin={() => onTogglePinProject(project.id)}
                onMoveToGroup={(gid) => onMoveProjectToGroup(project.id, gid)}
                onDuplicate={() => onDuplicateProject(project.id)}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  const renderGroupList = () => {
    if (view.type !== 'group') return null
    const inGroup = sortProjects(activeProjects.filter((p) => p.groupId === view.groupId))
    if (inGroup.length === 0) {
      return (
        <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.groupEmpty}
        </div>
      )
    }
    return (
      <div className="py-1">
        {inGroup.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            hasNotification={notifications.has(project.id)}
            groups={groups}
            onClick={() => onSelectProject(project.id)}
            onDelete={() => onDeleteProject(project.id)}
            onArchive={() => onArchiveProject(project.id)}
            onRename={(name) => onRenameProject(project.id, name)}
            onTogglePin={() => onTogglePinProject(project.id)}
            onMoveToGroup={(gid) => onMoveProjectToGroup(project.id, gid)}
            onDuplicate={() => onDuplicateProject(project.id)}
          />
        ))}
      </div>
    )
  }

  const renderArchivedList = () => {
    if (view.type !== 'archived') return null
    if (archivedList.length === 0) {
      return (
        <div className="px-4 py-8 text-center">
          <Terminal size={28} style={{ color: 'var(--border)', margin: '0 auto 10px' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {query ? t.noSearchResults : t.noArchivedSessions}
          </p>
        </div>
      )
    }
    return (
      <div className="py-1">
        {archivedList.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            isArchived
            hasNotification={notifications.has(project.id)}
            groups={groups}
            onClick={() => onSelectProject(project.id)}
            onDelete={() => onDeleteProject(project.id)}
            onArchive={() => onUnarchiveProject(project.id)}
            onRename={(name) => onRenameProject(project.id, name)}
            onTogglePin={() => onTogglePinProject(project.id)}
            onMoveToGroup={(gid) => onMoveProjectToGroup(project.id, gid)}
            onDuplicate={() => onDuplicateProject(project.id)}
          />
        ))}
      </div>
    )
  }

  // Title label above the list — only shown in "archived" (retains prior muscle memory)
  // and "group" views. Root handles its own section headers.
  const renderViewLabel = () => {
    if (view.type === 'archived') {
      return (
        <div className="px-4 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {t.archived}{archivedList.length > 0 && ` (${archivedList.length})`}
          </span>
        </div>
      )
    }
    if (view.type === 'group') {
      const g = groups.find((x) => x.id === view.groupId)
      if (!g) return null
      return (
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <FolderOpen size={12} style={{ color: 'var(--accent-blue)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-primary)' }}>
            {g.name}
          </span>
        </div>
      )
    }
    return null
  }

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ width: 260, backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
    >
      {renderHeader()}
      {renderTopActions()}

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--border)' }} />

      {renderSearch()}
      {renderViewLabel()}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {view.type === 'root' && renderRootList()}
        {view.type === 'group' && renderGroupList()}
        {view.type === 'archived' && renderArchivedList()}
      </div>

      {/* Bottom bar: Archive view toggle + Settings */}
      <div className="p-3 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setView((v) => v.type === 'archived' ? { type: 'root' } : { type: 'archived' })}
          className="flex items-center justify-center gap-2 flex-1 py-2.5 px-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: 'var(--bg-card)',
            color: view.type === 'archived' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            border: `1px solid ${view.type === 'archived' ? 'var(--accent-blue)' : 'var(--border)'}`,
          }}
          onMouseEnter={(e) => {
            if (view.type !== 'archived') {
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--text-muted)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = view.type === 'archived' ? 'var(--accent-blue)' : 'var(--text-secondary)'
            e.currentTarget.style.borderColor = view.type === 'archived' ? 'var(--accent-blue)' : 'var(--border)'
          }}
        >
          <Archive size={14} />
          {t.archived}
          {archivedTotal > 0 && (
            <span
              className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: view.type === 'archived' ? 'var(--accent-blue)' : 'var(--bg-base)',
                color: view.type === 'archived' ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              {archivedTotal}
            </span>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)'
            e.currentTarget.style.borderColor = 'var(--text-muted)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <Settings size={14} />
          {t.settings}
        </button>
      </div>
    </div>
  )
}
