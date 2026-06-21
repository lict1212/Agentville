// Minimal README.md -> HTML preview renderer (no deps).
// Handles: headings, hr, tables, lists, fenced code, inline bold/code/links,
// and passes raw HTML blocks (<img>, <div>, <sub>) straight through.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcName = process.argv[2] || 'README.md'
const md = readFileSync(join(root, srcName), 'utf8')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

const lines = md.split(/\r?\n/)
const out = []
let i = 0
const isHtml = (l) => /^\s*<(div|img|sub|!--|\/div)/.test(l)

while (i < lines.length) {
  let l = lines[i]

  // raw HTML blocks pass through verbatim
  if (isHtml(l)) { out.push(l); i++; continue }

  // fenced code
  if (/^```/.test(l)) {
    i++
    const buf = []
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
    i++
    out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
    continue
  }

  // hr
  if (/^---\s*$/.test(l)) { out.push('<hr/>'); i++; continue }

  // headings
  const h = l.match(/^(#{1,6})\s+(.*)$/)
  if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue }

  // table
  if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    const row = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const head = row(l)
    i += 2
    const body = []
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]))
    let t = '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
    for (const r of body) t += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>'
    out.push(t + '</tbody></table>')
    continue
  }

  // list
  if (/^\s*[-*]\s+/.test(l)) {
    out.push('<ul>')
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      out.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`)
      i++
    }
    out.push('</ul>')
    continue
  }

  // blank
  if (/^\s*$/.test(l)) { out.push(''); i++; continue }

  // paragraph (gather until blank / block)
  const buf = [l]
  i++
  while (i < lines.length && !/^\s*$/.test(lines[i]) && !isHtml(lines[i]) &&
         !/^(#{1,6}\s|```|---\s*$|\s*[-*]\s)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) {
    buf.push(lines[i++])
  }
  out.push(`<p>${inline(buf.join(' '))}</p>`)
}

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>Agentville README 预览</title>
<style>
  body{max-width:900px;margin:40px auto;padding:0 20px;
    font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    line-height:1.6;color:#1f2328;background:#fff}
  h1{font-size:2em;border-bottom:1px solid #d1d9e0;padding-bottom:.3em}
  h2{font-size:1.5em;border-bottom:1px solid #d1d9e0;padding-bottom:.3em;margin-top:2em}
  h3{font-size:1.2em;margin-top:1.6em}
  img{max-width:100%;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  table{border-collapse:collapse;margin:1em 0}
  th,td{border:1px solid #d1d9e0;padding:8px 12px;text-align:center;vertical-align:top}
  th{background:#f6f8fa}
  code{background:#eff1f3;border-radius:4px;padding:.15em .35em;font-size:.9em;
    font-family:"Cascadia Code",Consolas,monospace}
  pre{background:#f6f8fa;border-radius:8px;padding:14px;overflow:auto}
  pre code{background:none;padding:0}
  hr{border:none;border-top:1px solid #d1d9e0;margin:2em 0}
  a{color:#0969da;text-decoration:none} a:hover{text-decoration:underline}
  div[align="center"]{text-align:center}
</style></head><body>
${out.join('\n')}
</body></html>`

const outName = srcName.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9.]+/g, '-')
const dest = join(root, `${outName}-preview.html`)
writeFileSync(dest, html)
console.log(dest)
