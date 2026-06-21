export interface CliConfig {
  name: string
  memoryFile: string | null   // null = 该 CLI 不支持记忆文件
  saveCommand: string | null  // null = 不发保存指令
  doneKeywords: string[]      // 检测保存完成的关键词
  isClaudeLike: boolean       // 是否发送初始 CLAUDE.md 读取提示
  installHint?: string        // 安装命令（也用于一键安装）
  installRuntime?: 'node' | 'python'  // 一键安装所需的运行时（决定前置检查 npm / pip）
  detectAuthMenu?: boolean      // 已废弃，保留兼容
  startupDelay?: number         // ms to wait after silence before injecting memory read (default 1000)
  startupConfirmPattern?: string // auto-send Enter when this text appears in startup output
}

// Short trigger keyword — instructions are in the memory file (CLAUDE.md / CODEX.md etc.)
// {DATE} is replaced at runtime with MM-DD format
const SAVE_PROMPT = `AGENTVILLE_SAVE {DATE}`

export const CLI_REGISTRY: Record<string, CliConfig> = {
  claude: {
    name: 'Claude Code',
    memoryFile: 'CLAUDE.md',
    saveCommand: SAVE_PROMPT.replace('{MEMORY_FILE}', 'CLAUDE.md'),
    doneKeywords: [],
    isClaudeLike: true,
    installHint: 'npm install -g @anthropic-ai/claude-code',
    installRuntime: 'node',
  },
  gemini: {
    name: 'Gemini CLI',
    memoryFile: 'GEMINI.md',
    saveCommand: SAVE_PROMPT.replace('{MEMORY_FILE}', 'GEMINI.md'),
    doneKeywords: [],
    isClaudeLike: false,
    installHint: 'npm install -g @google/gemini-cli',
    installRuntime: 'node',
  },
  codex: {
    name: 'Codex CLI',
    memoryFile: null,
    saveCommand: SAVE_PROMPT.replace('{MEMORY_FILE}', 'CODEX.md'),
    doneKeywords: [],
    isClaudeLike: false,
    installHint: 'npm install -g @openai/codex',
    installRuntime: 'node',
  },
  aider: {
    name: 'Aider',
    memoryFile: null,
    saveCommand: null,
    doneKeywords: [],
    isClaudeLike: false,
    installHint: 'pip install aider-chat',
    installRuntime: 'python',
  },
}

export const CLI_ORDER = ['claude', 'gemini', 'codex', 'aider']

/** 从命令字符串解析 CLI 配置，未知命令返回 null */
export function getCliConfig(cliCommand: string): CliConfig | null {
  const cmd = cliCommand.trim().split(/\s+/)[0].toLowerCase()
  return CLI_REGISTRY[cmd] ?? null
}

/** 从命令字符串解析 CLI 配置，未知命令返回通用 fallback */
export function resolveCliConfig(cliCommand: string): CliConfig {
  return getCliConfig(cliCommand) ?? {
    name: cliCommand,
    memoryFile: null,
    saveCommand: null,
    doneKeywords: [],
    isClaudeLike: false,
  }
}
