// Claude skill manager.
// Skills live as folders under:
//   - global: ~/.claude/skills/<name>/SKILL.md
//   - project: <projectPath>/.claude/skills/<name>/SKILL.md
// Each SKILL.md starts with YAML frontmatter (name, description).

import fs from 'fs'
import path from 'path'
import os from 'os'

export type SkillScope = 'global' | 'project'

export interface SkillScopeRef {
  scope: SkillScope
  projectPath?: string
}

export interface SkillInfo {
  id: string           // folder name
  name: string         // from frontmatter (falls back to id)
  description: string  // from frontmatter
  folder: string       // absolute path
  valid: boolean       // SKILL.md exists and parses
}

function skillsDirFor(ref: SkillScopeRef): string {
  if (ref.scope === 'global') return path.join(os.homedir(), '.claude', 'skills')
  if (!ref.projectPath) throw new Error('projectPath required for project scope')
  return path.join(ref.projectPath, '.claude', 'skills')
}

export function getSkillsDir(ref: SkillScopeRef): string {
  return skillsDirFor(ref)
}

function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

function toFolderId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'skill'
}

export function listInstalledSkills(ref: SkillScopeRef): SkillInfo[] {
  const dir = skillsDirFor(ref)
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const out: SkillInfo[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const folder = path.join(dir, ent.name)
    const skillPath = path.join(folder, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      out.push({ id: ent.name, name: ent.name, description: '', folder, valid: false })
      continue
    }
    try {
      const md = fs.readFileSync(skillPath, 'utf-8')
      const fm = parseFrontmatter(md)
      out.push({
        id: ent.name,
        name: fm.name ?? ent.name,
        description: fm.description ?? '',
        folder,
        valid: true,
      })
    } catch {
      out.push({ id: ent.name, name: ent.name, description: '', folder, valid: false })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function installSkill(ref: SkillScopeRef, params: {
  id?: string
  name: string
  description: string
  body: string
}): { ok: boolean; id: string; error?: string } {
  const dir = skillsDirFor(ref)
  const rawId = params.id?.trim() || toFolderId(params.name)
  const id = toFolderId(rawId)
  if (!id) return { ok: false, id: '', error: 'invalid id' }
  const folder = path.join(dir, id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(folder)) return { ok: false, id, error: 'skill already exists' }
  fs.mkdirSync(folder, { recursive: true })
  const fm = `---\nname: ${params.name}\ndescription: ${escapeYaml(params.description)}\n---\n`
  const body = params.body.trim() ? `\n${params.body.trim()}\n` : ''
  fs.writeFileSync(path.join(folder, 'SKILL.md'), fm + body, 'utf-8')
  return { ok: true, id }
}

function escapeYaml(v: string): string {
  const flat = v.replace(/\r?\n/g, ' ').trim()
  if (/[:#]/.test(flat)) return JSON.stringify(flat)
  return flat
}

export function uninstallSkill(ref: SkillScopeRef, id: string): boolean {
  const dir = skillsDirFor(ref)
  const safeId = toFolderId(id)
  if (!safeId) return false
  const folder = path.join(dir, safeId)
  if (!fs.existsSync(folder)) return false
  const rel = path.relative(dir, folder)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false
  fs.rmSync(folder, { recursive: true, force: true })
  return true
}

export function readSkillBody(ref: SkillScopeRef, id: string):
  { name: string; description: string; body: string } | null {
  const dir = skillsDirFor(ref)
  const folder = path.join(dir, toFolderId(id))
  const skillPath = path.join(folder, 'SKILL.md')
  if (!fs.existsSync(skillPath)) return null
  const md = fs.readFileSync(skillPath, 'utf-8')
  const fm = parseFrontmatter(md)
  const bodyMatch = md.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
  return {
    name: fm.name ?? id,
    description: fm.description ?? '',
    body: bodyMatch ? bodyMatch[1].trim() : '',
  }
}
