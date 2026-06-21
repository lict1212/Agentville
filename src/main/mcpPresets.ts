// MCP server presets — curated list of commonly used servers.
// Each preset defines how to build the config entry that goes into
// ~/.claude.json's `mcpServers` key.

export interface McpPreset {
  id: string
  name: string
  description: string
  descriptionEn: string
  emoji: string
  command: string
  args: string[]
  // Extra positional arg supplied by the user (appended after `args`).
  // Example: filesystem server needs a directory path.
  pathArg?: {
    label: string
    labelEn: string
    placeholder?: string
  }
  // Environment variables the user must provide (e.g., API keys).
  envKeys?: Array<{
    key: string
    label: string
    labelEn: string
    secret?: boolean
  }>
  homepage?: string
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '让 AI 读写你指定的目录',
    descriptionEn: 'Let AI read/write files in a directory you specify',
    emoji: '📁',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    pathArg: { label: '目录路径', labelEn: 'Directory path', placeholder: 'C:\\Users\\You\\Documents' },
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: '让 AI 联网搜索（Brave Search API）',
    descriptionEn: 'Web search via Brave Search API',
    emoji: '🔍',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envKeys: [
      { key: 'BRAVE_API_KEY', label: 'Brave Search API Key', labelEn: 'Brave Search API Key', secret: true },
    ],
    homepage: 'https://brave.com/search/api/',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: '抓取网页内容为 markdown（需要 uv/uvx）',
    descriptionEn: 'Fetch a webpage as markdown (requires uv/uvx)',
    emoji: '🌐',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: '浏览器自动化（点击、填表、截图）',
    descriptionEn: 'Browser automation (click, type, screenshot)',
    emoji: '🎭',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    homepage: 'https://github.com/microsoft/playwright-mcp',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'AI 持久化记忆（知识图谱存储）',
    descriptionEn: 'Persistent AI memory (knowledge graph)',
    emoji: '🧠',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: '查询本地 SQLite 数据库（需要 uv/uvx）',
    descriptionEn: 'Query a local SQLite database (requires uv/uvx)',
    emoji: '🗃️',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path'],
    pathArg: { label: '数据库文件路径', labelEn: 'Database file path', placeholder: 'C:\\data\\my.db' },
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '管理 GitHub repo、issue、PR',
    descriptionEn: 'Manage GitHub repos, issues, PRs',
    emoji: '🐙',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Personal Access Token', labelEn: 'GitHub Personal Access Token', secret: true },
    ],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '网页截图与自动化（轻量）',
    descriptionEn: 'Lightweight web screenshot & automation',
    emoji: '📸',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
  },
]
