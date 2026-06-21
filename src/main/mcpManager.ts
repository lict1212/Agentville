// MCP config manager.
// - global scope: ~/.claude.json under key `mcpServers` (merged with existing keys)
// - project scope: <projectPath>/.mcp.json with `mcpServers` at top level
// On Windows, `npx`/`uvx` must be invoked through cmd.exe; we adapt on write
// and unwrap on read so the UI always sees the logical form.

import fs from 'fs'
import path from 'path'
import os from 'os'

export interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpScope = 'global' | 'project'

export interface McpScopeRef {
  scope: McpScope
  projectPath?: string
}

const CLAUDE_GLOBAL_CONFIG = path.join(os.homedir(), '.claude.json')
const WINDOWS_CMD_WRAPPED = new Set(['npx', 'uvx', 'npm', 'yarn', 'pnpm'])

function adaptForPlatform(entry: McpServerEntry): McpServerEntry {
  if (process.platform !== 'win32') return entry
  if (entry.command === 'cmd') return entry
  if (!WINDOWS_CMD_WRAPPED.has(entry.command)) return entry
  return {
    ...entry,
    command: 'cmd',
    args: ['/c', entry.command, ...(entry.args ?? [])],
  }
}

function unwrapForRead(entry: McpServerEntry): McpServerEntry {
  if (entry.command !== 'cmd') return entry
  const args = entry.args ?? []
  if (args.length < 2) return entry
  const [flag, inner, ...rest] = args
  if (flag !== '/c' || !WINDOWS_CMD_WRAPPED.has(inner)) return entry
  return { ...entry, command: inner, args: rest }
}

function configPathFor(ref: McpScopeRef): string {
  if (ref.scope === 'global') return CLAUDE_GLOBAL_CONFIG
  if (!ref.projectPath) throw new Error('projectPath required for project scope')
  return path.join(ref.projectPath, '.mcp.json')
}

function readConfig(ref: McpScopeRef): Record<string, unknown> {
  const p = configPathFor(ref)
  try {
    if (!fs.existsSync(p)) return {}
    const raw = fs.readFileSync(p, 'utf-8')
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  } catch (err) {
    console.error('[mcp] failed to read config', p, err)
    return {}
  }
}

function writeConfig(ref: McpScopeRef, config: Record<string, unknown>): void {
  const p = configPathFor(ref)
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
}

export function getMcpServers(ref: McpScopeRef): Record<string, McpServerEntry> {
  const cfg = readConfig(ref)
  const servers = (cfg.mcpServers as Record<string, McpServerEntry>) ?? {}
  const out: Record<string, McpServerEntry> = {}
  for (const [name, entry] of Object.entries(servers)) {
    out[name] = unwrapForRead(entry)
  }
  return out
}

export function setMcpServer(ref: McpScopeRef, name: string, entry: McpServerEntry): void {
  const cfg = readConfig(ref)
  const servers = (cfg.mcpServers as Record<string, McpServerEntry>) ?? {}
  servers[name] = adaptForPlatform(entry)
  cfg.mcpServers = servers
  writeConfig(ref, cfg)
}

export function removeMcpServer(ref: McpScopeRef, name: string): void {
  const cfg = readConfig(ref)
  const servers = cfg.mcpServers as Record<string, McpServerEntry> | undefined
  if (servers && servers[name]) {
    delete servers[name]
    cfg.mcpServers = servers
    writeConfig(ref, cfg)
  }
}

export function getConfigPath(ref: McpScopeRef): string {
  return configPathFor(ref)
}
