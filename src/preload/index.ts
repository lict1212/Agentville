import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Project management
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (data: { name: string; role: string; folderPath?: string; cliCommand?: string; groupId?: string | null }) =>
    ipcRenderer.invoke('project:create', data),
  duplicateProject: (id: string, name?: string, folderPath?: string, overwrite?: boolean) =>
    ipcRenderer.invoke('project:duplicate', { id, name, folderPath, overwrite }),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', { id }),
  updateProject: (id: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke('project:update', { id, ...fields }),
  migrateProject: (
    id: string,
    targetPath: string,
    strategy?: 'abort-on-conflict' | 'selective',
    overwriteNames?: string[]
  ) => ipcRenderer.invoke('project:migrate', { id, targetPath, strategy, overwriteNames }),

  // Group management
  listGroups: () => ipcRenderer.invoke('group:list'),
  addGroup: (name: string) => ipcRenderer.invoke('group:add', { name }),
  updateGroup: (id: string, fields: { name?: string; pinned?: boolean }) =>
    ipcRenderer.invoke('group:update', { id, ...fields }),
  removeGroup: (id: string) => ipcRenderer.invoke('group:remove', { id }),

  updateProjectRole: (id: string, role: string) =>
    ipcRenderer.invoke('project:updateRole', { id, role }),
  readClaudeMd: (id: string, filename?: string) => ipcRenderer.invoke('project:readClaudeMd', { id, filename }),
  writeClaudeMd: (id: string, content: string, filename?: string, syncMemory?: boolean) =>
    ipcRenderer.invoke('project:writeClaudeMd', { id, content, filename, syncMemory }),

  // CLI Registry
  getCliRegistry: () => ipcRenderer.invoke('cli:registry'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (fields: Record<string, unknown>) => ipcRenderer.invoke('settings:set', fields),

  // MCP management (scope-aware)
  listMcpPresets: () => ipcRenderer.invoke('mcp:listPresets'),
  getMcpServers: (scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('mcp:getServers', { scope, projectPath }),
  setMcpServer: (
    name: string,
    entry: { command: string; args?: string[]; env?: Record<string, string> },
    scope?: 'global' | 'project',
    projectPath?: string,
  ) => ipcRenderer.invoke('mcp:setServer', { name, entry, scope, projectPath }),
  removeMcpServer: (name: string, scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('mcp:removeServer', { name, scope, projectPath }),
  getDisabledMcpServers: (scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('mcp:getDisabledServers', { scope, projectPath }),
  disableMcpServer: (name: string, scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('mcp:disableServer', { name, scope, projectPath }),
  enableMcpServer: (name: string, scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('mcp:enableServer', { name, scope, projectPath }),

  // Skill management (scope-aware)
  listSkillPresets: () => ipcRenderer.invoke('skill:listPresets'),
  listSkills: (scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('skill:list', { scope, projectPath }),
  readSkill: (id: string, scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('skill:read', { id, scope, projectPath }),
  installSkill: (
    params: { id?: string; name: string; description: string; body: string },
    scope?: 'global' | 'project',
    projectPath?: string,
  ) => ipcRenderer.invoke('skill:install', { ...params, scope, projectPath }),
  uninstallSkill: (id: string, scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('skill:uninstall', { id, scope, projectPath }),
  openSkillsFolder: (scope?: 'global' | 'project', projectPath?: string) =>
    ipcRenderer.invoke('skill:openFolder', { scope, projectPath }),

  // Custom rules library (global)
  getCustomRules: () => ipcRenderer.invoke('customRules:list'),
  addCustomRule: (text: string) => ipcRenderer.invoke('customRules:add', { text }),
  removeCustomRule: (id: string) => ipcRenderer.invoke('customRules:remove', { id }),

  // Default rules (applied to new projects)
  getDefaultRules: () => ipcRenderer.invoke('defaultRules:get'),
  setDefaultRules: (presetIds: string[], customIds: string[]) =>
    ipcRenderer.invoke('defaultRules:set', { presetIds, customIds }),

  // Window
  setTitleBarOverlay: (color: string, symbolColor: string) =>
    ipcRenderer.invoke('window:setTitleBarOverlay', { color, symbolColor }),

  // Dialog
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  // PTY operations
  startPty: (id: string, path: string) => ipcRenderer.invoke('pty:start', { id, path }),
  stopPty: (id: string, hasInteracted?: boolean) => ipcRenderer.invoke('pty:stop', { id, hasInteracted: hasInteracted ?? false }),
  savePty: (id: string) => ipcRenderer.invoke('pty:save', { id }),
  writePty: (id: string, data: string) => ipcRenderer.invoke('pty:write', { id, data }),
  resizePty: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', { id, cols, rows }),

  // Event listeners
  onPtyData: (callback: (id: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; data: string }) => {
      callback(payload.id, payload.data)
    }
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },

  onPtyStatus: (callback: (id: string, status: string) => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: { id: string; status: string }
    ) => {
      callback(payload.id, payload.status)
    }
    ipcRenderer.on('pty:status', handler)
    return () => ipcRenderer.removeListener('pty:status', handler)
  },

  onPtyExit: (callback: (id: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string }) => {
      callback(payload.id)
    }
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },

  onProjectNameUpdate: (callback: (id: string, name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; name: string }) => {
      callback(payload.id, payload.name)
    }
    ipcRenderer.on('project:nameUpdate', handler)
    return () => ipcRenderer.removeListener('project:nameUpdate', handler)
  },

  onAutoSave: (callback: (id: string, saving: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; saving: boolean }) => {
      callback(payload.id, payload.saving)
    }
    ipcRenderer.on('pty:autosave', handler)
    return () => ipcRenderer.removeListener('pty:autosave', handler)
  },

  onCliNotFound: (callback: (id: string, cliName: string, installHint: string | null, cliKey: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; cliName: string; installHint: string | null; cliKey: string }) => {
      callback(payload.id, payload.cliName, payload.installHint, payload.cliKey)
    }
    ipcRenderer.on('pty:cli-not-found', handler)
    return () => ipcRenderer.removeListener('pty:cli-not-found', handler)
  },

  // One-click CLI install
  detectClis: () => ipcRenderer.invoke('cli:detect') as Promise<Record<string, boolean>>,
  installCli: (key: string) => ipcRenderer.invoke('cli:install', { key }) as Promise<{
    success: boolean
    prereqMissing?: 'node' | 'python'
    runtimeLabel?: string
    downloadUrl?: string
    exitCode?: number | null
    onPath?: boolean
    error?: string
    errorLine?: string
    failReason?: 'permission' | 'engine' | 'diskspace' | 'pep668' | 'buildbackend' | null
  }>,
  onCliInstallLog: (callback: (key: string, chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { key: string; chunk: string }) => {
      callback(payload.key, payload.chunk)
    }
    ipcRenderer.on('cli:install-log', handler)
    return () => ipcRenderer.removeListener('cli:install-log', handler)
  },

  onPtyNotify: (callback: (id: string, message: string, level: 'info' | 'success' | 'error') => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; message: string; level: 'info' | 'success' | 'error' }) => {
      callback(payload.id, payload.message, payload.level)
    }
    ipcRenderer.on('pty:notify', handler)
    return () => ipcRenderer.removeListener('pty:notify', handler)
  },

  // System (OS-level) notifications — fire when window isn't focused
  notifySystem: (payload: { title: string; body: string; projectId?: string }) =>
    ipcRenderer.invoke('notify:system', payload),

  // Clipboard image paste
  saveClipboardImage: (base64: string, ext: string): Promise<string> =>
    ipcRenderer.invoke('clipboard:saveImage', { base64, ext }),

  // Custom notification sound files (stored under userData/sounds)
  getSoundsDir: (): Promise<string> => ipcRenderer.invoke('sounds:getDir'),
  listCustomSounds: (): Promise<string[]> => ipcRenderer.invoke('sounds:listCustom'),
  openSoundsFolder: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('sounds:openFolder'),

  onProjectFocusRequest: (callback: (projectId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { projectId: string }) => {
      callback(payload.projectId)
    }
    ipcRenderer.on('project:focus-request', handler)
    return () => ipcRenderer.removeListener('project:focus-request', handler)
  },

  // App lifecycle / version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  // Language picked during install (null when not installed via the wizard,
  // e.g. dev mode). Only meaningful before the user picks a language in-app.
  getInstallerLanguage: (): Promise<'zh' | 'en' | null> =>
    ipcRenderer.invoke('app:getInstallerLanguage'),
  getConfirmOnClose: (): Promise<boolean> => ipcRenderer.invoke('app:getConfirmOnClose'),
  setConfirmOnClose: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('app:setConfirmOnClose', { value }),
  // Renderer calls this after the user confirms the in-app close dialog.
  confirmQuit: (dontAskAgain?: boolean): Promise<boolean> =>
    ipcRenderer.invoke('app:confirmQuit', { dontAskAgain: !!dontAskAgain }),
  // Main asks the renderer to show the close-confirm modal.
  onCloseRequested: (callback: (runningCount: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { runningCount: number }) => {
      callback(payload?.runningCount ?? 0)
    }
    ipcRenderer.on('app:close-requested', handler)
    return () => ipcRenderer.removeListener('app:close-requested', handler)
  },

  // Auto-update
  checkForUpdates: (): Promise<{ devMode?: boolean; ok?: boolean; version?: string | null; error?: string }> =>
    ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string | null; releaseDate: string | null }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string | null; releaseDate: string | null }) => callback(info)
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.removeListener('update:available', handler)
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('update:not-available', handler)
    return () => ipcRenderer.removeListener('update:not-available', handler)
  },
  onUpdateProgress: (callback: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => callback(p)
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.removeListener('update:progress', handler)
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on('update:downloaded', handler)
    return () => ipcRenderer.removeListener('update:downloaded', handler)
  },
  onUpdateError: (callback: (info: { message: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { message: string }) => callback(info)
    ipcRenderer.on('update:error', handler)
    return () => ipcRenderer.removeListener('update:error', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
