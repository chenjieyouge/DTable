/**
 * DTable 性能基准
 *
 * 用法: pnpm dev 后打开 http://localhost:5173/bench.html?rows=500000&cols=8
 *
 * 设计原则:
 * 1. 场景固定、可重复 —— 同样的参数必须得到可比的数字
 * 2. 每个指标都要有"渲染已稳定"的判定, 不能只测同步返回耗时
 * 3. 结果可导出 JSON, 方便前后对比
 *
 * 注意: 浏览器需独占, 后台标签页会被降频导致帧率指标失真。
 */
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import type { IUserConfig, IColumn } from '@/types'

// ============ 指标收集 ============

interface Metric {
  name: string
  value: number
  unit: string
  note?: string
}

interface Env {
  rows: number
  cols: number
  ua: string
  ranAt: string
}

const metrics: Metric[] = []
let env: Env | null = null

function record(name: string, value: number, unit = 'ms', note?: string) {
  metrics.push({ name, value, unit, note })
  render()
}

// ============ 工具 ============

function getParam(key: string, fallback: number): number {
  const raw = new URLSearchParams(location.search).get(key)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 等待渲染稳定: 连续 quietFrames 帧内没有任何 DOM 变更
 *
 * 关键点: 很多操作是异步渲染的(骨架屏 -> 异步填数据 -> rAF),
 * 只测同步返回耗时会把指标测得严重偏小。
 */
function waitForIdle(target: HTMLElement, quietFrames = 3, timeout = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    let quiet = 0
    let done = false

    const observer = new MutationObserver(() => {
      quiet = 0 // 有变更就重新计数
    })
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    const finish = (err?: Error) => {
      if (done) return
      done = true
      observer.disconnect()
      err ? reject(err) : resolve()
    }

    const tick = () => {
      if (performance.now() - start > timeout) {
        finish(new Error(`waitForIdle 超时 (${timeout}ms)`))
        return
      }
      if (quiet >= quietFrames) {
        finish()
        return
      }
      quiet++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** 生成测试数据 */
function genData(rows: number, colCount: number): Record<string, any>[] {
  const regions = ['华东', '华南', '华北', '西南', '东北']
  const depts = ['技术部', '销售部', '市场部', '人力资源部']
  const statuses = ['在职', '离职', '试用期']

  const data = new Array(rows)
  for (let i = 0; i < rows; i++) {
    const row: Record<string, any> = {
      id: i + 1,
      name: `员工${i + 1}`,
      age: 20 + (i % 40),
      region: regions[i % regions.length],
      department: depts[i % depts.length],
      salary: 5000 + ((i * 37) % 20000),
      status: statuses[i % statuses.length],
      joinDate: `20${20 + (i % 5)}-0${(i % 9) + 1}-1${i % 9}`,
    }
    // 补足到指定列数, 用数值列填充
    for (let c = Object.keys(row).length; c < colCount; c++) {
      row[`metric_${c}`] = (i * (c + 7)) % 1000
    }
    data[i] = row
  }
  return data
}

function makeConfig(data: Record<string, any>[], colCount: number): IUserConfig {
  const base: IColumn[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'name', title: '姓名', width: 140, filter: { type: 'text' } },
    { key: 'age', title: '年龄', width: 80, sortable: true },
    { key: 'region', title: '区域', width: 100, filter: { type: 'set' }, sortable: true },
    { key: 'department', title: '部门', width: 120, filter: { type: 'set' } },
    { key: 'salary', title: '薪资', width: 120, sortable: true, summaryType: 'sum' },
    { key: 'status', title: '状态', width: 100, filter: { type: 'set' } },
    { key: 'joinDate', title: '入职日期', width: 120 },
  ]
  const columns: IColumn[] = [...base]
  for (let c = base.length; c < colCount; c++) {
    columns.push({ key: `metric_${c}`, title: `指标${c}`, width: 110, sortable: true })
  }

  return {
    container: '#bench-table',
    tableHeight: 520,
    initialData: data,
    columns,
    sidePanel: { enabled: false, panels: [] },
    showStatusBar: true,
  }
}

// ============ 场景 ============

/** 滚动 N 步, 返回每帧耗时 */
async function benchScroll(root: HTMLElement, steps: number): Promise<number[]> {
  const scroller = root.querySelector<HTMLElement>('.vt-table-container')
  if (!scroller) throw new Error('找不到滚动容器 .vt-table-container')

  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const stepSize = maxScroll / steps
  const frames: number[] = []

  await new Promise<void>((resolve) => {
    let i = 0
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      if (i > 0) frames.push(now - last) // 首帧不计, 它包含上一轮的布局
      last = now

      scroller.scrollTop = i * stepSize
      i++
      if (i <= steps) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })

  return frames
}

function summarize(frames: number[]): { p50: number; p95: number; max: number; janky: number } {
  const sorted = [...frames].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
  return {
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
    // 超过 16.7ms 即掉帧 (60Hz 预算)
    janky: frames.filter((f) => f > 16.7).length,
  }
}

async function recordFrameStats(label: string, frames: number[]) {
  const s = summarize(frames)
  record(`${label} · p50`, s.p50, 'ms')
  record(`${label} · p95`, s.p95, 'ms')
  record(`${label} · 掉帧`, s.janky, '帧', `共 ${frames.length} 帧, 单帧 >16.7ms 计为掉帧`)
}

function readMemory(): string | null {
  const mem = (performance as any).memory
  if (!mem) return null
  return `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`
}

// ============ 主流程 ============

let running = false

async function run() {
  if (running) return
  running = true
  metrics.length = 0
  render()

  const rows = getParam('rows', 500_000)
  const cols = getParam('cols', 8)
  const root = document.getElementById('bench-table') as HTMLElement

  env = {
    rows,
    cols,
    ua: navigator.userAgent,
    ranAt: new Date().toLocaleString('zh-CN'),
  }

  let table: VirtualTable | null = null

  try {
    // 1. 数据生成 (排除在表格指标之外, 仅作参考)
    const tGen = performance.now()
    const data = genData(rows, cols)
    record('数据生成', performance.now() - tGen, 'ms', '不参与表格性能判定')

    // 2. 初始化 -> ready
    root.innerHTML = ''
    const tInit = performance.now()
    table = new VirtualTable(makeConfig(data, cols))
    await table.ready
    record('初始化 ready', performance.now() - tInit, 'ms')

    // 3. 首屏可见行填充 (骨架屏 -> 真实数据)
    const tFirst = performance.now()
    await waitForIdle(root)
    record('首屏可见行填充', performance.now() - tFirst, 'ms')

    // 4. 滚动
    await recordFrameStats('滚动 300 帧', await benchScroll(root, 300))

    // 5. 排序 (50w 行)
    const tSort = performance.now()
    table.sort('salary', 'desc')
    await waitForIdle(root)
    record('排序', performance.now() - tSort, 'ms')

    // 6. 列筛选 (set: 区域=华东)
    const tFilter = performance.now()
    table.dispatch({ type: 'COLUMN_FILTER_SET', payload: { key: 'region', filter: { kind: 'set', values: ['华东'] } } })
    await waitForIdle(root)
    record('列筛选 set', performance.now() - tFilter, 'ms')

    // 7. 清空筛选
    const tClear = performance.now()
    table.dispatch({ type: 'COLUMN_FILTER_CLEAR', payload: { key: 'region' } })
    await waitForIdle(root)
    record('清空筛选', performance.now() - tClear, 'ms')

    // 8. 透视表构建 (全量同步重建, 这是已知的主线程阻塞点)
    const tPivot = performance.now()
    table.togglePivotMode(true)
    record('透视构建(同步阻塞)', performance.now() - tPivot, 'ms', '已知瓶颈: 配置变更全量重建')
    await waitForIdle(root)

    // 9. 滚动透视表
    await recordFrameStats('透视滚动 300 帧', await benchScroll(root, 300))

    // 10. 内存
    const mem = readMemory()
    if (mem) record('堆内存', Number.parseFloat(mem), 'MB')
  } catch (err) {
    record('❌ 基准中断', 0, '', String(err))
  } finally {
    table?.destroy()
    running = false
    render()
  }
}

// ============ 渲染 ============

function render() {
  const root = document.getElementById('bench-root')
  if (!root) return

  const envLine = env
    ? `<div class="bench-env">
         <div><strong>行数</strong> ${env.rows.toLocaleString()} &nbsp;·&nbsp; <strong>列数</strong> ${env.cols}</div>
         <div><strong>时间</strong> ${env.ranAt}</div>
         <div class="bench-ua">${env.ua}</div>
       </div>`
    : ''

  const rowsHtml = metrics
    .map((m) => {
      const val = m.unit === 'ms' ? m.value.toFixed(2) : String(m.value)
      return `<tr>
        <td>${m.name}</td>
        <td class="bench-num">${val}</td>
        <td class="bench-unit">${m.unit}</td>
        <td class="bench-note">${m.note ?? ''}</td>
      </tr>`
    })
    .join('')

  root.innerHTML = `
    <div class="bench-panel">
      <h1>DTable 性能基准</h1>
      ${envLine}
      <div class="bench-actions">
        <button id="bench-run" ${running ? 'disabled' : ''}>${running ? '运行中…' : '开始基准'}</button>
        <button id="bench-copy" ${metrics.length ? '' : 'disabled'}>复制 JSON</button>
        <span class="bench-hint">行数/列数可用 URL 参数调整，如 <code>?rows=100000&cols=20</code></span>
      </div>
      <table class="bench-table">
        <thead><tr><th>指标</th><th>数值</th><th>单位</th><th>说明</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4" class="bench-empty">尚未运行</td></tr>'}</tbody>
      </table>
    </div>
    <div id="bench-table"></div>
  `

  document.getElementById('bench-run')?.addEventListener('click', run)
  document.getElementById('bench-copy')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify({ env, metrics }, null, 2))
  })
}

render()
