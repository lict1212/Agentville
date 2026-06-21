<div align="center">

<img src="docs/screenshots/logo.png" width="120" alt="Agentville logo" />

# Agentville

**一个图形化管理 Claude Code、Codex、Gemini 等 AI CLI Agent 的桌面面板**

<sub>Electron · React · TypeScript · 中文 / English 双语</sub>

<sub><a href="README.md">English</a> · <b>简体中文</b></sub>

<!-- 封面：默认主题主界面 -->
<img src="docs/screenshots/theme-default.png" width="860" alt="Agentville 主界面" />

</div>

---

## 下载安装

**只想用、不想折腾？** 直接下安装包，无需 Node.js、无需编译：

### [⬇ 下载最新 Windows 安装包](https://github.com/lict1212/agentville/releases/latest)

打开[最新发布页](https://github.com/lict1212/agentville/releases/latest)，下载 `Agentville-Setup-x.x.x.exe`，双击安装即可。安装包暂未做代码签名，Windows 可能弹 SmartScreen「未知发布者」提示 —— 点**更多信息 → 仍要运行**即可。

> macOS 版暂未发布，目前请用源码运行（见[快速开始](#快速开始)）。

---

## 为什么做这个

AI CLI 工具（Claude Code、Codex、Gemini、Aider）体验已经很好，但一旦同时做 2~3 个项目就很痛：

- 每个项目一个终端窗口，切换靠 alt-tab，容易迷路
- 每次启动要手动 `cd`、复述项目背景、粘贴最近进展
- 想对比不同模型干同一件事？得开三个终端自己对照
- 完成状态只能盯着屏幕看

Agentville 把这些痛点收到一个窗口里：像管理聊天一样管理多个 Agent 会话，记忆自动加载、状态实时提示、MCP / Skill / Rules 可视化配置。

---

## 核心功能

### 多会话管理

<img src="docs/screenshots/chat-function.png" width="320" alt="会话列表与右键菜单" />

- 左侧会话列表，实时状态点（工作中 / 等待 / 需确认 / 暂停）
- 会话三点菜单：置顶 / 复制 Agent / 归档 / 删除 / 移入群组
- CLI 头像（Claude / Codex / Gemini / Aider 颜色区分）
- 搜索、归档、重命名、删除
- 后台会话完成 / 需确认时声音 + 红色徽标提醒
- Agent 群组：把相关会话归到一组，折叠 / 展开管理

### 监控网格

<img src="docs/screenshots/monitor.png" width="760" alt="监控网格视图" />

工具栏一键切到网格视图，所有运行中会话并排预览（终端最后几行 + 状态 + CLI 标签），点卡片跳转。群组会打包成一张卡，展开看组内成员。

会话卡片和侧边栏右上角的状态灯一眼区分每个 Agent 的状态：

- 🟢 **绿灯** —— 工作中（Agent 正在跑）
- 🔵 **蓝灯** —— 等待中（空闲，等你输入）
- 🔴 **红灯** —— 需确认（在等你点确认，会闪烁提醒）
- ⚪ **灰灯** —— 已暂停

### 会话快速切换（Ctrl+Tab）

<img src="docs/screenshots/switch.gif" width="760" alt="会话快速切换 HUD" />

VSCode 式的浮层切换器：按住 `Ctrl` 唤出，`Tab` / `Shift+Tab`、`Ctrl+滚轮` 或鼠标悬停点选，松开 `Ctrl` 确认、`Esc` 取消。列表只含运行中的会话，按最近使用（MRU）排序。

### 角色 / 记忆 / 规则（每个会话独立）

<img src="docs/screenshots/role.gif" width="760" alt="会话设置：角色 / 技能 / MCP" />

- **角色 Tab**：结构化编辑 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`，工位状态 / 角色设定 / 关键决策 / 规则分 section
- **技能 Tab**：当前会话可用的 Claude Skills（`<project>/.claude/skills/`），一键安装预设模板
- **MCP Tab**：当前会话专属 MCP 服务器（`<project>/.mcp.json`）

**Rules chip**：规则改为点击式标签——预设规则 + 全局自定义库 + 文件中已存在的孤儿规则，一眼看清当前启用了哪些。

### 记忆系统

<img src="docs/screenshots/cli-function.png" width="480" alt="会话右上角工具栏" />

每个会话右上角工具栏：刷新 / 停止 / 保存记忆，以及 Role（角色设置）/ 切换 CLI / 迁移工作目录。

每个会话两个记忆文件：

- `CLAUDE.md`（或 `AGENTS.md` / `GEMINI.md`）—— 当前状态、角色、关键决策
- `memory.md` —— 会话历史日志，每次停止追加一行摘要

手动点「保存记忆」或自动保存（每 5 分钟空闲时）触发 `AGENTVILLE_SAVE MM-DD`，CLI 自己读说明完成保存并回复 `SAVED`。Claude Code 额外用 Stop hook 精准识别完成。

### 复制 Agent

会话三点菜单「复制 Agent」一键克隆角色配置：复制 `CLAUDE.md`（角色 / 规则 / skill）+ `.mcp.json` 到新工作目录，记忆重置为空、副本暂停不自动启动。适合在同一套角色设定上开多个并行实例。

### 全局默认设置

- **默认规则库**：新会话自动把勾选的规则写进 CLAUDE.md
- **全局 Skills**：`~/.claude/skills/` 下的用户级技能
- **全局 MCP**：`~/.claude.json` 下的用户级 MCP 服务器
- **通知**：完成音 / 确认音 picker + 音量 + OS 系统 toast 开关
- **语言**：中文 / English 即时切换

### 5 套主题

CSS 变量驱动，切换即时生效，Windows 标题栏颜色同步：

| 默认 | 石板 | 浅色 |
|:-:|:-:|:-:|
| <img src="docs/screenshots/theme-default.png" width="260" alt="默认主题" /> | <img src="docs/screenshots/theme-slate.png" width="260" alt="石板" /> | <img src="docs/screenshots/theme-light.png" width="260" alt="浅色" /> |

| 暖沙 | 草莓牛奶 |
|:-:|:-:|
| <img src="docs/screenshots/theme-warm.png" width="260" alt="暖沙" /> | <img src="docs/screenshots/theme-strawberry.png" width="260" alt="草莓牛奶" /> |

### MCP 服务器预设

内置 8 个常用 MCP 预设，开关式启用 / 禁用：

Filesystem · Brave Search · Fetch · Playwright · Memory · SQLite · GitHub · Puppeteer

需要 API Key 或路径的会自动展开表单，密码字段带眼睛切换。Windows 下 `npx` / `uvx` 自动通过 `cmd.exe` 包装。还可手动添加自定义 MCP 服务器。

---

## 快速开始

### 运行开发版

```bash
git clone https://github.com/lict1212/agentville.git
cd agentville
npm install
npm run dev
```

### 打包

```bash
npm run build
```

### 已安装的 CLI 要求

至少装一个即可：

- **Claude Code**：<https://docs.anthropic.com/en/docs/claude-code>
- **Codex**：`npm i -g @openai/codex`
- **Gemini CLI**：`npm i -g @google/gemini-cli`
- **Aider**：`pipx install aider-chat`

Agentville 启动时会用 `where` / `which` 检测，未装的 CLI 会弹出 friendly overlay 带安装命令。

---

## 技术栈

- **Electron 35** + **electron-vite** —— 主进程 / 渲染进程分离
- **React + TypeScript** —— 渲染层
- **Tailwind CSS** + CSS 变量 —— 主题通过 `data-theme` 切换
- **xterm.js** —— 终端渲染，多项目缓冲切换回放
- **node-pty** —— PTY 进程管理
- **Zustand** —— 状态
- **electron-store** —— 本地持久化

---

## Roadmap

- [ ] 每会话独立 xterm 实例 + WebGL 渲染（彻底解决长时间运行的渲染错乱）
- [ ] 群内 Agent 协作（共享上下文 / 产出流转）
- [ ] 监控群组卡展开动画 + 群组配色 / 图标
- [ ] 会话自动命名
- [ ] 自动更新检测（GitHub 新版本提示）

---

## License

[MIT](LICENSE) © 2026 lict1212
