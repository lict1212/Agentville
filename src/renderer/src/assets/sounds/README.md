# 内置提示音 / Bundled notification sounds

把音频文件直接丢进**这个文件夹**，编译时会被自动打包进 app，并出现在
「设置 → 通知 → 完成音 / 确认音」的「内置音效」分组里，无需改任何代码。

Drop audio files into **this folder**. They are bundled into the app at build
time (via Vite `import.meta.glob` in `src/renderer/src/utils/sound.ts`) and show
up under the "Bundled" group in Settings → Notifications → Done / Confirm sound.
No code changes needed.

- 支持格式 / Formats: `.mp3` `.wav` `.ogg` `.m4a`（推荐 mp3，短促 1~2 秒）
- 下拉里显示的名字 = 文件名（去掉扩展名）。选项 id 为 `bundled:<文件名>`。
  The dropdown label is the file name (without extension); option id is `bundled:<name>`.
- 文件名尽量用英文/数字，避免空格（空格能用，但简洁更好）。
