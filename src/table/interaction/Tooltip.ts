/**
 * 轻量自绘 Tooltip
 *
 * 为什么替换原生 title:
 *   - 原生提示有 1 秒以上延迟, 且无法控制
 *   - 样式不可定制, 与表格观感割裂
 *
 * 设计:
 *   - 单例 + document 级事件委托: 多张表格共用一个, 不随表格销毁重建,
 *     也能覆盖那些被 append 到 document.body 的弹层(它们不在 .vt-instance 内)
 *   - 惰性绑定: 首次 mount 才挂监听, 避免"import 即产生全局副作用"
 *
 * 用法: 元素加 data-vt-tip="提示文字";
 *       同时建议加 aria-label 保持无障碍(自绘 tooltip 不会被读屏软件识别)
 */

const TIP_ATTR = 'data-vt-tip'
const SHOW_DELAY = 300

let tipEl: HTMLDivElement | null = null
let showTimer: number | null = null
let bound = false

function ensureEl(): HTMLDivElement {
  if (tipEl) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'vt-tooltip'
  document.body.appendChild(tipEl)
  return tipEl
}

function clearTimer() {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

function hide() {
  clearTimer()
  if (tipEl) tipEl.style.display = 'none'
}

function show(target: HTMLElement) {
  const text = target.getAttribute(TIP_ATTR)
  if (!text) return

  const el = ensureEl()
  el.textContent = text
  el.style.display = 'block'

  const rect = target.getBoundingClientRect()
  const tipRect = el.getBoundingClientRect()

  // 默认放在目标下方居中
  let top = rect.bottom + 6
  let left = rect.left + rect.width / 2 - tipRect.width / 2

  // 下方放不下就翻到上方
  if (top + tipRect.height > window.innerHeight - 4) {
    top = rect.top - tipRect.height - 6
  }
  // 左右贴边时收进视口
  left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))

  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

function findTarget(e: Event): HTMLElement | null {
  const t = e.target as HTMLElement | null
  if (!t || typeof t.closest !== 'function') return null
  return t.closest<HTMLElement>(`[${TIP_ATTR}]`)
}

/** 挂上全局监听 (幂等, 多次调用只绑一次) */
export function bindTooltip(): void {
  if (bound || typeof document === 'undefined') return
  bound = true

  // 用捕获阶段: 有些弹层会 stopPropagation, 冒泡阶段收不到
  document.addEventListener(
    'mouseover',
    (e) => {
      const target = findTarget(e)
      if (!target) return
      clearTimer()
      showTimer = window.setTimeout(() => show(target), SHOW_DELAY)
    },
    true
  )

  document.addEventListener(
    'mouseout',
    (e) => {
      if (!findTarget(e)) return
      hide()
    },
    true
  )

  // 滚动/拖拽后提示位置就失效了, 直接收起, 不要让它飘在错的地方
  document.addEventListener('scroll', hide, true)
  document.addEventListener('mousedown', hide, true)
}
