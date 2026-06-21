/// <reference types="vite/client" />

// Note: the runtime `window.api` shape lives in src/preload/index.ts and is
// far richer than this type file — most of the code uses `(window.api as any).xxx`
// to reach the newer surface. This declaration intentionally stays minimal so
// that the old ElectronAPI-typed call sites keep compiling; it is not a full
// mirror of preload.
interface Project {
  id: string
  name: string
  path: string
  role: string
  cliCommand?: string
  memoryContent?: string
  status: 'working' | 'waiting' | 'needs_confirmation' | 'paused'
  archived?: boolean
  groupId?: string | null
  pinned?: boolean
  createdAt: string
  lastUsed: string
}

interface ElectronAPI {
  listProjects: () => Promise<Project[]>
  createProject: (data: {
    name: string
    role: string
    folderPath?: string
    cliCommand?: string
    groupId?: string | null
  }) => Promise<Project>
  duplicateProject: (
    id: string,
    name?: string,
    folderPath?: string,
    overwrite?: boolean
  ) => Promise<Project | { conflict: true } | null>
  deleteProject: (id: string) => Promise<boolean>
  updateProject: (id: string, fields: Record<string, unknown>) => Promise<Project | null>
  updateProjectRole: (id: string, role: string) => Promise<boolean>
  openFolder: () => Promise<string | null>
  startPty: (id: string, path: string) => Promise<boolean>
  stopPty: (id: string, hasInteracted?: boolean) => Promise<boolean>
  writePty: (id: string, data: string) => Promise<boolean>
  resizePty: (id: string, cols: number, rows: number) => Promise<boolean>
  onPtyData: (callback: (id: string, data: string) => void) => () => void
  onPtyStatus: (callback: (id: string, status: string) => void) => () => void
  onPtyExit: (callback: (id: string) => void) => () => void
}

declare interface Window {
  api: ElectronAPI
}
