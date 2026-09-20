#!/usr/bin/env node
/**
 * 一次性脚本: 把 style.css 里散落的色值收敛到设计令牌
 *
 * 背景: 2500 行 CSS 迭代出 55 个不同色值, 其中 6 套蓝、9 套灰互相打架。
 * 表格"看起来不够专业"的根因不是缺某个视觉技巧, 而是内部不一致。
 *
 * 重要: 令牌定义块(文件开头 .vt-instance 那段)必须原封不动地换掉 ——
 * 第一版脚本把定义里的字面色值也替换了, 造出 `--vt-primary: var(--vt-primary)`
 * 这种自引用, 全站主色直接失效。所以这里先把文件切成 前/令牌块/后 三段,
 * 只对"后"做替换。
 */
import fs from 'node:fs'

const FILE = 'src/style.css'

// 新的令牌定义 —— 值本身也要收敛: 原本这 17 个令牌自身就是混搭的
// (AntD v4 蓝 + Tailwind 灰 + 朴素灰), 统一到一套中性色阶。
const TOKEN_BLOCK = `.vt-instance {
  /* 主色: 全站唯一的一个蓝, 收敛掉原本散落的 6 套蓝 */
  --vt-primary: #1677ff;
  --vt-primary-hover: #4096ff;
  --vt-primary-bg: rgba(22, 119, 255, 0.1);

  /* 文字三级 */
  --vt-text-primary: #1d2129;
  --vt-text-secondary: #4e5969;
  --vt-text-muted: #86909c;
  /* 旧命名, 保留以免外部覆盖样式失效 */
  --vt-text-dark: #1d2129;
  --vt-text-darker: #1d2129;

  /* 边框 */
  --vt-border: #e5e6eb;
  --vt-border-light: #f2f3f5;
  --vt-border-medium: #c9cdd4;
  --vt-border-panel: #e5e6eb;

  /* 背景 */
  --vt-bg: #ffffff;
  --vt-bg-subtle: #f7f8fa;
  --vt-bg-hover: rgba(22, 119, 255, 0.06);
  --vt-bg-header: #f7f8fa;
  --vt-bg-frozen: #f7f8fa;

  --vt-shadow-popup: 0 2px 8px rgba(0, 0, 0, 0.15);
  --vt-shadow-panel: -2px 0 8px rgba(0, 0, 0, 0.15);
}`

// 顺序有讲究: 6 位色值必须先于 3 位, 否则 #fff 会先吃掉 #ffffff 的前缀
const MAP = [
  // ---- 蓝: 全部收敛到唯一主色 ----
  ['#6366f1', 'var(--vt-primary)'],
  ['#1890ff', 'var(--vt-primary)'],
  ['#4f46e5', 'var(--vt-primary)'],
  ['#3b82f6', 'var(--vt-primary)'],
  ['#165dff', 'var(--vt-primary)'],
  ['#2563eb', 'var(--vt-primary)'],
  ['#38b2f6', 'var(--vt-primary)'],
  ['#5a6fd8', 'var(--vt-primary)'],
  ['#6a4190', 'var(--vt-primary)'],
  ['#667eea', 'var(--vt-primary)'],
  ['#764ba2', 'var(--vt-primary)'],
  ['#40a9ff', 'var(--vt-primary-hover)'],
  ['#93c5fd', 'var(--vt-primary-hover)'],

  // 蓝的浅色底 (选中行 / 激活态)
  ['#eef2ff', 'var(--vt-primary-bg)'],
  ['#e6f7ff', 'var(--vt-bg-hover)'],
  ['#f0f7ff', 'var(--vt-primary-bg)'],
  ['#eff6ff', 'var(--vt-primary-bg)'],
  ['#e8f3ff', 'var(--vt-primary-bg)'],
  ['#e3f2fd', 'var(--vt-primary-bg)'],
  ['#e0f2fe', 'var(--vt-primary-bg)'],
  ['#e0e7ff', 'var(--vt-primary-bg)'],
  ['#dbeafe', 'var(--vt-primary-bg)'],
  ['#f2f6ff', 'var(--vt-primary-bg)'],
  ['rgba(24, 144, 255, 0.1)', 'var(--vt-primary-bg)'],
  ['rgba(24, 144, 255, 0.12)', 'var(--vt-primary-bg)'],
  ['rgba(24, 144, 255, 0.2)', 'var(--vt-primary-bg)'],
  ['rgba(24, 144, 255, 0.3)', 'var(--vt-primary-bg)'],
  ['rgba(99,102,241,0.15)', 'var(--vt-primary-bg)'],
  ['rgba(99, 102, 241, 0.12)', 'var(--vt-primary-bg)'],
  ['rgba(99, 102, 241, 0.1)', 'var(--vt-primary-bg)'],

  // ---- 文字三级 ----
  ['#1f2937', 'var(--vt-text-darker)'],
  ['#374151', 'var(--vt-text-dark)'],
  ['#333333', 'var(--vt-text-primary)'],
  ['#333', 'var(--vt-text-primary)'],
  ['#4e5969', 'var(--vt-text-secondary)'],
  ['#6b7280', 'var(--vt-text-secondary)'],
  ['#4b5563', 'var(--vt-text-secondary)'],
  ['#666666', 'var(--vt-text-secondary)'],
  ['#666', 'var(--vt-text-secondary)'],
  ['#86909c', 'var(--vt-text-muted)'],
  ['#9ca3af', 'var(--vt-text-muted)'],
  ['#a8a8a8', 'var(--vt-text-muted)'],
  ['#999999', 'var(--vt-text-muted)'],
  ['#999', 'var(--vt-text-muted)'],
  ['#bbb', 'var(--vt-text-muted)'],

  // ---- 边框 ----
  ['#e5e7eb', 'var(--vt-border-light)'],
  ['#e0e0e0', 'var(--vt-border-light)'],
  ['#e8e8e8', 'var(--vt-border-light)'],
  ['#e5e6eb', 'var(--vt-border-light)'],
  ['#d3d3d5', 'var(--vt-border)'],
  ['#d9d9d9', 'var(--vt-border-panel)'],
  ['#d1d5db', 'var(--vt-border-medium)'],
  ['#d3d3d5 ', 'var(--vt-border)'],
  ['#c9cdd4', 'var(--vt-border-medium)'],
  ['#c1c1c1', 'var(--vt-border-medium)'],
  ['#bfdbfe', 'var(--vt-border-medium)'],
  ['#dddddd', 'var(--vt-border-medium)'],
  ['#ddd', 'var(--vt-border-medium)'],
  ['#cccccc', 'var(--vt-border-medium)'],
  ['#ccc', 'var(--vt-border-medium)'],

  // ---- 背景 ----
  ['#ffffff', 'var(--vt-bg)'],
  ['#fff', 'var(--vt-bg)'],
  ['#f9f9fa', 'var(--vt-bg-header)'],
  ['#f8f8f9', 'var(--vt-bg-frozen)'],
  ['#f3f4f6', 'var(--vt-bg-subtle)'],
  ['#f9fafb', 'var(--vt-bg-subtle)'],
  ['#fafafa', 'var(--vt-bg-subtle)'],
  ['#f5f5f5', 'var(--vt-bg-subtle)'],
  ['#f0f0f0', 'var(--vt-bg-subtle)'],
  ['#f1f1f1', 'var(--vt-bg-subtle)'],
  ['#f8fafc', 'var(--vt-bg-subtle)'],
]

const original = fs.readFileSync(FILE, 'utf8')

// ---- 1. 切出令牌块, 只对后面的内容做替换 ----
const marker = '/* ========== 1. CSS 变量 ========== */'
const mIdx = original.indexOf(marker)
if (mIdx === -1) throw new Error('找不到令牌块标记, 脚本可能已跑过, 请先 git checkout 恢复')

const openIdx = original.indexOf('.vt-instance {', mIdx)
const closeIdx = original.indexOf('\n}', openIdx)
if (openIdx === -1 || closeIdx === -1) throw new Error('令牌块结构不符合预期')

const before = original.slice(0, mIdx)
let after = original.slice(closeIdx + 2)

// ---- 2. 替换 ----
const report = []
for (const [from, to] of MAP) {
  const parts = after.split(from)
  const n = parts.length - 1
  if (n > 0) {
    after = parts.join(to)
    report.push({ from, to, n })
  }
}

const rebuilt = `${before}${marker}\n${TOKEN_BLOCK}\n${after}`
fs.writeFileSync(FILE, rebuilt)

const total = report.reduce((s, r) => s + r.n, 0)
console.log(`令牌块已重写; 正文替换 ${total} 处\n`)
for (const r of report.sort((a, b) => b.n - a.n)) {
  console.log(`  ${String(r.n).padStart(3)} × ${r.from.padEnd(26)} → ${r.to}`)
}

// ---- 3. 自检 ----
const rest = (rebuilt.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []).map((c) => c.toLowerCase())
const uniq = [...new Set(rest)].sort()
console.log(`\n剩余硬编码 hex: ${uniq.length} 个  ${uniq.join(' ')}`)

// 自引用检查 —— 上一版就是这么炸的
const selfRef = rebuilt.match(/--vt-([a-z-]+):\s*var\(--vt-\1\)/g)
console.log(selfRef ? `\n!! 自引用: ${selfRef.join(', ')}` : '\n✓ 无令牌自引用')
