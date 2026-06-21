// Starter skill templates. User can one-click to pre-fill the "add skill"
// form; nothing is written until they confirm.

export interface SkillPreset {
  id: string
  name: string           // display name (zh)
  nameEn: string
  description: string    // frontmatter description (will be written verbatim)
  descriptionEn: string
  emoji: string
  body: string           // SKILL.md body (everything after frontmatter)
}

export const SKILL_PRESETS: SkillPreset[] = [
  {
    id: 'reply-chinese',
    name: '中文回复',
    nameEn: 'Reply in Chinese',
    description: '始终使用简体中文回答用户',
    descriptionEn: 'Always reply to the user in simplified Chinese',
    emoji: '🇨🇳',
    body: `# Reply in Chinese

Whenever responding to the user, write in simplified Chinese.
Keep code, identifiers, and file paths in their original language.`,
  },
  {
    id: 'code-review',
    name: '代码审阅',
    nameEn: 'Code Review',
    description: '审阅改动，指出 bug、可读性问题和更简洁的写法',
    descriptionEn: 'Review code changes — flag bugs, readability issues, and simpler alternatives',
    emoji: '🔍',
    body: `# Code Review Checklist

When reviewing changes, walk through this checklist:

1. **Correctness** — does the code do what the author claims? Any edge cases missed?
2. **Simpler alternative** — could the same result be achieved with less code or fewer abstractions?
3. **Naming** — are identifiers accurate and searchable?
4. **Error handling** — are failures surfaced, or silently swallowed?
5. **Tests** — is there coverage for the new behavior? Are existing tests still meaningful?
6. **Side effects** — any writes to disk, network, or shared state that aren't obvious?

Be concrete. Reference file:line for each finding. End with a one-line verdict (ship / revise / reject).`,
  },
  {
    id: 'conventional-commit',
    name: 'Commit 规范',
    nameEn: 'Conventional Commit',
    description: '写符合 Conventional Commits 规范的 git 提交信息',
    descriptionEn: 'Write git commit messages following the Conventional Commits spec',
    emoji: '📝',
    body: `# Conventional Commit Messages

Format commit messages as:

\`\`\`
<type>(<scope>): <short summary>

<optional body — explain the "why", not the "what">
\`\`\`

Types: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`, \`perf\`, \`build\`, \`ci\`.

- Keep the summary under 72 chars, imperative mood ("add", "fix", "rename").
- Scope is optional — use it when the change is localized to a module.
- Body wraps at 72 chars. Focus on motivation and context, not a diff restatement.
- Reference issues in a footer: \`Closes #123\`.`,
  },
]
