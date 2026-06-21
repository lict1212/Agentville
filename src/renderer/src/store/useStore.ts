import { create } from 'zustand'
import type { Lang } from '../i18n'

interface Project {
  id: string
  name: string
  path: string       // 启动目录（含 CLAUDE.md）
  role: string       // 角色设定
  cliCommand?: string    // 启动命令（空 = 使用全局默认）
  memoryContent?: string // 规范化记忆（Agentville 管理，CLI 无关）
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  archived?: boolean
  groupId: string | null   // null = 未分组
  pinned: boolean          // 会话置顶
  createdAt: string
  lastUsed: string
}

export interface Group {
  id: string
  name: string
  pinned: boolean
  createdAt: string
}

export interface NotificationPrefs {
  notificationSoundEnabled: boolean
  notificationVolume: number // 0..1
  notificationDoneSound: string // preset id or `custom:filename`
  notificationConfirmSound: string
  notificationOsToastEnabled: boolean
  notificationCustomSoundDir: string | null // absolute path to userData/sounds (resolved on startup)
}

interface AppState extends NotificationPrefs {
  projects: Project[]
  groups: Group[]
  activeProjectId: string | null
  notifications: Set<string>
  lang: Lang
  // actions
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  setGroups: (groups: Group[]) => void
  addGroup: (group: Group) => void
  updateGroup: (id: string, updates: Partial<Group>) => void
  removeGroup: (id: string) => void
  addNotification: (id: string) => void
  clearNotification: (id: string) => void
  setLang: (lang: Lang) => void
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void
}

export const useStore = create<AppState>((set) => ({
  projects: [],
  groups: [],
  activeProjectId: null,
  notifications: new Set(),
  lang: (localStorage.getItem('app-lang') as Lang) ?? 'zh',

  // Notification defaults — overridden on startup from electron-store.
  notificationSoundEnabled: true,
  notificationVolume: 0.7,
  notificationDoneSound: 'bundled:quiet',
  notificationConfirmSound: 'bundled:clever-touch',
  notificationOsToastEnabled: false,
  notificationCustomSoundDir: null,

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p))
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
    })),

  setActiveProject: (id) => set({ activeProjectId: id }),

  setGroups: (groups) => set({ groups }),

  addGroup: (group) => set((state) => ({ groups: [group, ...state.groups] })),

  updateGroup: (id, updates) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g))
    })),

  removeGroup: (id) =>
    set((state) => ({
      // Remove group; migrate group's projects to ungrouped (groupId = null).
      groups: state.groups.filter((g) => g.id !== id),
      projects: state.projects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p))
    })),

  addNotification: (id) =>
    set((state) => ({ notifications: new Set([...state.notifications, id]) })),

  clearNotification: (id) =>
    set((state) => {
      const n = new Set(state.notifications)
      n.delete(id)
      return { notifications: n }
    }),

  setLang: (lang) => {
    localStorage.setItem('app-lang', lang)
    set({ lang })
  },

  setNotificationPrefs: (prefs) => set((state) => ({ ...state, ...prefs })),
}))
