/**
 * DTable 实测页 —— 百万级真实门店零售数据
 *
 * 两个模式跑同一份数据、同一套列定义, 唯一变量是"数据在哪":
 *   Client —— 浏览器拉 CSV, 排序/筛选/汇总全在前端内存里算
 *   Server —— MySQL 分页查询, 排序/筛选/汇总都由后端完成
 *
 * 列 key 与数据库列名、CSV 表头完全一致(都是中文), 前后端零映射。
 * 这一条是刻意的: 任何"前端 a 字段 <=> 后端 b 字段"的映射表都是后续
 * 静默错位的来源, 而中文列名在 MySQL 里本就合法(需要加反引号)。
 */
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import { parseCSV } from '@/utils/parseCSV'
import type { IColumn, IPageInfo, IPageResponse, ITableQuery, IUserConfig } from '@/types'

/** 百万行 CSV 由 vite dev server 直接提供(支持 Range, 可提前断流) */
const CSV_URL = '/data/retail.csv'
/** 服务端数据的真实总行数, 用于 Client 模式的进度换算 */
const CSV_TOTAL_BYTES = 143896479
const PAGE_SIZE_DEFAULT = 200

let currentTable: VirtualTable | null = null
let currentMode: 'client' | 'server' = 'client'

// ============================================================
// 列定义
// ============================================================

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * column.render 的字符串返回值是走 innerHTML 落地的, 不是 textContent。
 * 我们往下要喂的是任意 CSV/接口文本(门店名、地址), 不转义就等于开了一个注入口。
 */
function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c)
}

/**
 * 日期只显示到天。
 *
 * 两种模式的原始形态不同: CSV 里是 "2021-11-27", Server 模式的 激活日期
 * 是 Go 的 *time.Time, 序列化成 "2021-11-27T00:00:00+08:00"。
 * 都取日期部分 —— 110px 的列宽放不下带时区的完整 ISO 串。
 */
function formatDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const s = String(v)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return escapeHTML(m ? m[1] : s)
}

/**
 * 列筛选类型按基数选:
 *   省/品牌/品类/渠道类型/市场层级/城市 —— 去重后几十到几百个, 适合 set 勾选
 *   门店/条码/区县/二级            —— 几万个不同值, set 会渲染成没法用的长列表, 用 text
 */
const RETAIL_COLUMNS: IColumn[] = [
  { key: '激活日期', title: '激活日期', width: 110, sortable: true, filter: { type: 'dateRange' }, render: formatDate },
  { key: '品牌', title: '品牌', width: 80, filter: { type: 'set' }, sortable: true },
  { key: '省', title: '省', width: 90, sortable: true, filter: { type: 'set' } },
  { key: '城市', title: '城市', width: 100, sortable: true, filter: { type: 'set' } },
  { key: '区县', title: '区县', width: 100, filter: { type: 'text' } },
  { key: '门店', title: '门店', width: 260, filter: { type: 'text' } },
  { key: '品类', title: '品类', width: 100, sortable: true, filter: { type: 'set' } },
  { key: '渠道类型', title: '渠道类型', width: 110, filter: { type: 'set' } },
  { key: '市场层级', title: '市场层级', width: 110, filter: { type: 'set' } },
  { key: '二级', title: '二级', width: 120, filter: { type: 'text' } },
  { key: '条码', title: '条码', width: 150, filter: { type: 'text' } },
  // 销量 在这份数据里恒为 1(1048575 行全是 1, 等于记录条数)。
  // 不开放排序: 排它在 MySQL 上要白做一次 1.3 秒的 filesort, 排完顺序纹丝不动,
  // 用户的判断只会是"排序坏了"。换成有区分度的数据时把 sortable 加回来即可。
  { key: '销量', title: '销量', width: 90, filter: { type: 'numberRange' } },
  {
    key: '积分额',
    title: '积分额',
    width: 120,
    sortable: true,
    summaryType: 'sum',
    filter: { type: 'numberRange' },
  },
]

// ============================================================
// CSV 流式加载
// ============================================================

interface CsvLoadResult {
  rows: Record<string, unknown>[]
  /** 实际读到的字节数(可能小于文件总长, 因为够行数就断流了) */
  bytes: number
  downloadMs: number
  parseMs: number
  /** 是否提前断流: 只取了前 N 行 */
  partial: boolean
}

/**
 * 流式读取 CSV, 读够 maxRows 行就断流。
 *
 * 为什么不直接 fetch().text(): 143MB 全下完再解析, 哪怕只要前 10 万行也得
 * 等整份文件。这里边收边数, 够了立刻 cancel —— 拿 10 万行只需下 ~14MB。
 *
 * 断流点的选择要留神: 必须停在引号闭合的位置, 否则会切在半个字段中间,
 * 最后一行就是一条残缺记录。所以换行计数用的是和 parseCSV 同口径的扫描
 * (引号内的换行不算断行)。
 *
 * 这份 retail.csv 实测全文 0 个双引号(12,582,912 个逗号 = 1,048,576 行 × 12,
 * 1,048,576 个换行 = 表头 + 1,048,575 数据行), 所以行数计数是精确的。
 * 引号配对的分支留着是为了换一份带引号/带内嵌换行的 CSV 时不至于出错。
 */
async function loadRetailCSV(
  maxRows: number,
  onProgress: (loadedBytes: number) => void
): Promise<CsvLoadResult> {
  const t0 = performance.now()
  const res = await fetch(CSV_URL)

  if (!res.ok) throw new Error(`读取 ${CSV_URL} 失败: HTTP ${res.status}`)
  if (!res.body) throw new Error('当前浏览器不支持流式读取 (response.body 为空)')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const chunks: string[] = []

  let received = 0
  let lineBreaks = 0
  let inQuotes = false
  let partial = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    received += value.byteLength
    const text = decoder.decode(value, { stream: true })
    chunks.push(text)

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === '\n' && !inQuotes) lineBreaks++
    }

    onProgress(received)

    // +1 是表头行。inQuotes 为真说明正停在某个引号字段内部, 不能断。
    if (lineBreaks >= maxRows + 1 && !inQuotes) {
      partial = true
      await reader.cancel()
      break
    }
  }

  let text = chunks.join('')
  chunks.length = 0

  // 提前断流时最后一行可能是半行(比如 chunk 边界刚好切在字段中间), 丢掉它
  if (partial) {
    const cut = text.lastIndexOf('\n')
    if (cut > 0) text = text.slice(0, cut)
  }

  const downloadMs = performance.now() - t0
  const parseStart = performance.now()
  const rows = parseCSV(text, { maxRows }) as unknown as Record<string, unknown>[]
  const parseMs = performance.now() - parseStart

  coerceNumericColumns(rows)

  return { rows, bytes: received, downloadMs, parseMs, partial }
}

/**
 * CSV 解析出来所有值都是字符串, 得把数值列还原成 number。
 *
 * 不做这一步的后果不是"显示难看"而是"排序看起来是坏的":
 * 字符串排序下 "9" > "100", 积分额降序会排在 9 开头的金额前面。
 *
 * 采样判定而非写死列名, 换一份 CSV 也成立。两个必须排除的情况:
 *   1. 前导零 —— 条码 "0123456" 转成数字会变成 123456, 值被改掉了
 *   2. 空值占比高 —— 混了文本的列整体不该当数值列处理
 */
function coerceNumericColumns(rows: Record<string, unknown>[], sampleSize = 200): void {
  if (rows.length === 0) return
  const keys = Object.keys(rows[0])
  const sample = rows.slice(0, Math.min(sampleSize, rows.length))

  for (const key of keys) {
    let nonEmpty = 0
    let numeric = 0
    let hasLeadingZero = false

    for (const row of sample) {
      const v = row[key]
      if (v === '' || v === null || v === undefined) continue
      nonEmpty++
      const s = String(v)
      if (/^-?0\d/.test(s)) hasLeadingZero = true
      if (Number.isFinite(Number(s))) numeric++
    }

    if (hasLeadingZero || nonEmpty === 0 || numeric / nonEmpty < 0.95) continue

    for (const row of rows) {
      const v = row[key]
      if (v !== '' && v !== null && v !== undefined) {
        row[key] = Number(v as string)
      }
    }
  }
}

// ============================================================
// Server 模式的请求
// ============================================================

/**
 * 前端筛选结构 -> 服务端 filters 格式。
 *
 * dateRange 要映射成 min/max: 服务端 ApplyFilters 只认 min/max 的区间语义,
 * 传 start/end 会被静默忽略 —— 不报错但也不生效, 属于最难查的那类问题。
 *
 * 注意这里的 key 是中文列名。服务端有一张列名白名单, 不在表里的 key 会被拒;
 * 后端返回 400 时前端只会看到"没有数据", 不会看到"字段名不合法"。
 */
function buildServerFilters(query?: ITableQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const columnFilters = query?.columnFilters
  if (!columnFilters) return out

  for (const [key, f] of Object.entries(columnFilters)) {
    switch (f.kind) {
      case 'set':
        if (f.values.length > 0) out[key] = f.values
        break

      case 'text':
        if (f.value.trim() !== '') out[key] = f.value
        break

      case 'numberRange': {
        const range: Record<string, number> = {}
        if (f.min !== undefined) range.min = f.min
        if (f.max !== undefined) range.max = f.max
        if (Object.keys(range).length > 0) out[key] = range
        break
      }

      case 'dateRange': {
        const range: Record<string, string> = {}
        if (f.start) range.min = f.start
        if (f.end) range.max = f.end
        if (Object.keys(range).length > 0) out[key] = range
        break
      }
    }
  }

  return out
}

// ============================================================
// 配置构造
// ============================================================

function baseConfig(): Pick<IUserConfig, 'container' | 'columns' | 'sidePanel'> {
  return {
    container: '#table-container',
    columns: RETAIL_COLUMNS,
    sidePanel: { enabled: true, defaultOpen: false, defaultPanel: 'columns', panels: [] },
  }
}

function buildClientConfig(rows: Record<string, unknown>[]): IUserConfig {
  return {
    ...baseConfig(),
    tableHeight: 560,
    initialData: rows,
  }
}

function buildServerConfig(
  pageSize: number,
  onPageChange: (info: IPageInfo) => void,
  onTotalRows: (total: number) => void
): IUserConfig {
  return {
    ...baseConfig(),
    tableHeight: 560,
    pageSize,
    onPageChange,

    fetchPageData: async (pageIndex: number, query?: ITableQuery): Promise<IPageResponse> => {
      const res = await fetch('/api/table/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageIndex,
          pageSize,
          sort: query?.sortKey && query?.sortDirection ? `${query.sortKey}:${query.sortDirection}` : '',
          filters: buildServerFilters(query),
        }),
      })

      if (!res.ok) {
        // 把后端的原因带出来。只说 "加载失败" 会把 400(字段名被白名单拒掉)
        // 和 500(数据库炸了) 混成同一句话, 排查时只能靠猜。
        const detail = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
      }

      const data = await res.json()
      // 总行数是筛选后的结果数, 每次翻页/改条件都会变, 所以报给外部刷新指标
      onTotalRows(data.totalRows)
      return { list: data.list, totalRows: data.totalRows, summary: data.summary }
    },

    fetchFilterOptions: async ({ key }) => {
      // 该接口是 GET + query string。中文列名走 URLSearchParams 编码,
      // 否则请求行里出现非 ASCII 字符会被中间层掐掉。
      const params = new URLSearchParams({ columnKey: key })
      const res = await fetch(`/api/table/filter-options?${params}`)

      if (!res.ok) {
        // 返回空数组会让下拉看起来是"这一列没有可选值", 而不是"接口挂了"。
        // 至少把原因留在控制台。
        console.error(`[filter-options] ${key} 请求失败: HTTP ${res.status}`)
        return []
      }

      // 注意: 服务端 GetFilterOptions 返回的是该列的**全量去重值**, 不随当前
      // 已生效的筛选收窄(它压根没读 filters 参数)。所以这里传 query 也没用 ——
      // 不要按"级联筛选"的预期去理解这个下拉。
      const options = await res.json()
      return Array.isArray(options) ? options.map(String) : []
    },
  }
}

// ============================================================
// 页面 UI
// ============================================================

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null

function setStat(id: string, value: string): void {
  const el = $(id)
  if (el) el.textContent = value
}

function note(message: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  const el = $('note')
  if (!el) return
  el.textContent = message
  el.className = `note on${kind === 'info' ? '' : ` ${kind}`}`
}

function clearNote(): void {
  const el = $('note')
  if (el) el.className = 'note'
}

function setProgress(ratio: number | null): void {
  const wrap = $('progress')
  const fill = $('progress-fill')
  if (!wrap || !fill) return

  if (ratio === null) {
    wrap.classList.remove('on')
    fill.style.width = '0'
    return
  }
  wrap.classList.add('on')
  fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
}

function fmtInt(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** Chrome 专有 API, 其他浏览器返回 null —— 不编造数字 */
function heapMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? m.usedJSHeapSize / 1048576 : null
}

function refreshMemory(): void {
  const mb = heapMB()
  setStat('stat-mem', mb === null ? '需 Chrome' : `${Math.round(mb)} MB`)
}

function destroyTable(): void {
  if (currentTable) {
    currentTable.destroy()
    currentTable = null
  }
  const container = $('table-container')
  if (container) container.innerHTML = ''
}

// ============================================================
// 两种模式的启动
// ============================================================

/** CSV 里实际有多少行, 只用来算进度和显示 "已读 N / 总数" */
const CSV_TOTAL_ROWS = 1048575

/**
 * 进度估算。
 *
 * 不能直接用 "已读字节 / 文件总字节": 要 20 万行时只读 14% 的字节就断流了,
 * 进度条会卡在 14% 然后突然跳满。改成按"预计的断流字节数"归一化。
 */
function estimateProgress(loadedBytes: number, maxRows: number): number {
  const estimatedStopBytes = (CSV_TOTAL_BYTES * maxRows) / CSV_TOTAL_ROWS
  const target = Math.min(estimatedStopBytes, CSV_TOTAL_BYTES)
  // 留 1% 余量: 断流判定在字节读取之后, 实际会略微超出预估
  return target > 0 ? Math.min(loadedBytes / target, 0.99) : 0
}

async function startClientMode(): Promise<void> {
  const maxRows = Number(($('client-rows') as HTMLSelectElement | null)?.value ?? 200000)

  destroyTable()
  setStat('stat-mode', 'Client')
  setStat('stat-total', '—')
  setStat('stat-parse', '—')
  setStat('stat-render', '—')
  setProgress(0)
  note(`正在流式读取 ${fmtInt(maxRows)} 行…`)

  let lastPaint = 0

  try {
    const result = await loadRetailCSV(maxRows, (loaded) => {
      const now = performance.now()
      if (now - lastPaint > 80) {
        lastPaint = now
        setProgress(estimateProgress(loaded, maxRows))
      }
    })

    setProgress(null)

    const loadedMB = (result.bytes / 1048576).toFixed(0)
    setStat(
      'stat-total',
      result.partial
        ? `${fmtInt(result.rows.length)} / ${fmtInt(CSV_TOTAL_ROWS)}`
        : fmtInt(result.rows.length)
    )
    setStat('stat-load', fmtMs(result.downloadMs))
    setStat('stat-parse', fmtMs(result.parseMs))

    note(
      result.partial
        ? `已读取 ${fmtInt(result.rows.length)} 行（${loadedMB} MB，读够即断流）。构建表格中…`
        : `已读取全部 ${fmtInt(result.rows.length)} 行（${loadedMB} MB）。构建表格中…`
    )

    const renderStart = performance.now()
    currentTable = new VirtualTable(buildClientConfig(result.rows))
    await currentTable.ready
    setStat('stat-render', fmtMs(performance.now() - renderStart))

    refreshMemory()
    note(
      `Client 模式就绪：${fmtInt(result.rows.length)} 行全在浏览器内存里。` +
        `点列头排序、用漏斗筛选，全部是前端计算 —— 行数越大差距越明显。`,
      'ok'
    )
  } catch (e) {
    setProgress(null)
    setStat('stat-load', '—')
    note(`加载失败：${e instanceof Error ? e.message : String(e)}`, 'err')
  }
}

async function startServerMode(): Promise<void> {
  const pageSize = Number(($('server-page-size') as HTMLSelectElement | null)?.value ?? PAGE_SIZE_DEFAULT)

  destroyTable()
  setProgress(null)
  setStat('stat-mode', 'Server')
  setStat('stat-parse', '—')
  setStat('stat-total', '—')
  setStat('stat-render', '—')
  note('正在请求后端 /api/table/page …')

  const renderStart = performance.now()
  let totalRows: number | null = null

  try {
    currentTable = new VirtualTable(
      buildServerConfig(
        pageSize,
        // 翻页信息放进提示条, 不要占用"数据总量"那一格
        (info) => {
          note(
            `第 ${fmtInt(info.startPage)}–${fmtInt(info.endPage)} 页 / 共 ${fmtInt(info.totalPages)} 页` +
              `${totalRows === null ? '' : `，${fmtInt(totalRows)} 行`}`
          )
        },
        (total) => {
          totalRows = total
          setStat('stat-total', fmtInt(total))
        }
      )
    )
    await currentTable.ready
    setStat('stat-render', fmtMs(performance.now() - renderStart))
    refreshMemory()
    note(
      `Server 模式就绪：每页 ${fmtInt(pageSize)} 行，数据在 MySQL 里，` +
        `浏览器只持有当前页。排序、筛选、汇总都由后端算。`,
      'ok'
    )
  } catch (e) {
    setStat('stat-render', '—')
    note(
      `后端没起来或接口报错：${e instanceof Error ? e.message : String(e)}。` +
        `先在 server/ 目录执行 go run .`,
      'err'
    )
  }
}

// ============================================================
// 事件绑定
// ============================================================

function switchMode(mode: 'client' | 'server'): void {
  currentMode = mode

  document.querySelectorAll<HTMLButtonElement>('.mode').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
  })

  const barClient = $('bar-client')
  const barServer = $('bar-server')
  if (barClient) barClient.style.display = mode === 'client' ? 'flex' : 'none'
  if (barServer) barServer.style.display = mode === 'server' ? 'flex' : 'none'

  ;(mode === 'client' ? startClientMode() : startServerMode()).catch((e) => {
    note(`初始化失败：${e instanceof Error ? e.message : String(e)}`, 'err')
  })
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as 'client' | 'server' | undefined
      if (mode && mode !== currentMode) switchMode(mode)
    })
  })

  $('btn-client-load')?.addEventListener('click', () => {
    startClientMode().catch((e) => note(String(e), 'err'))
  })

  $('btn-server-load')?.addEventListener('click', () => {
    startServerMode().catch((e) => note(String(e), 'err'))
  })

  $('btn-server-reset')?.addEventListener('click', () => {
    if (!currentTable) return
    // 全局搜索 + 所有列筛选一起清, 并且回到第一页 —— 只清筛选不重置页码的话,
    // 清完可能停在超出新结果集的页码上, 表面看就是"清空后列表是空的"
    currentTable.dispatch({ type: 'CLEAR_ALL_FILTERS' })
    currentTable.dispatch({ type: 'SET_CURRENT_PAGE', payload: { page: 0 } })
    clearNote()
  })

  // 堆内存在持续变化, 定时刷新才看得出 Client 模式的真实开销
  setInterval(refreshMemory, 2000)
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents()
  switchMode('client')
})
