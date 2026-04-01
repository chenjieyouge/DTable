import type { IColumn } from '@/types'

export interface ExportCSVOptions {
  filename?: string       // 文件名（不含 .csv 后缀）
  onlySelected?: boolean  // 仅导出选中行
  maxRowsPerFile?: number // 每个文件最大行数，默认 1_000_000
}

/** Excel / WPS 单文件行数上限（含表头实际可用 1,048,576 行，保守取 100w） */
const DEFAULT_MAX_ROWS = 1_000_000

/**
 * 将数据导出为 CSV 文件
 * - 加 UTF-8 BOM，确保 Excel 打开中文不乱码
 * - 超过 maxRowsPerFile 时弹确认框，选择分片下载多个文件
 */
export function exportCSV(
  rows: Record<string, any>[],
  columns: IColumn[],
  options: ExportCSVOptions = {}
): void {
  const { filename = 'export', maxRowsPerFile = DEFAULT_MAX_ROWS } = options
  const visibleCols = columns.filter(col => col.width !== 0)

  if (rows.length > maxRowsPerFile) {
    const parts = Math.ceil(rows.length / maxRowsPerFile)
    const confirmed = window.confirm(
      `数据共 ${rows.length.toLocaleString()} 行，超过 Excel/WPS 单文件限制（${maxRowsPerFile.toLocaleString()} 行）。\n\n` +
      `是否自动分割为 ${parts} 个文件分别下载？\n（点"取消"放弃导出）`
    )
    if (!confirmed) return

    for (let i = 0; i < parts; i++) {
      const chunk = rows.slice(i * maxRowsPerFile, (i + 1) * maxRowsPerFile)
      const blob = buildCSVBlob(chunk, visibleCols)
      triggerDownload(blob, `${filename}-part${i + 1}.csv`)
    }
    return
  }

  const blob = buildCSVBlob(rows, visibleCols)
  triggerDownload(blob, `${filename}.csv`)
}

/** 将行数据 + 列定义构建为含 UTF-8 BOM 的 CSV Blob */
function buildCSVBlob(rows: Record<string, any>[], cols: IColumn[]): Blob {
  const headers = cols.map(col => escapeCell(col.title))
  const lines: string[] = [headers.join(',')]
  for (const row of rows) {
    const cells = cols.map(col => {
      const val = row[col.key]
      return escapeCell(val !== undefined && val !== null ? String(val) : '')
    })
    lines.push(cells.join(','))
  }
  const BOM = '\uFEFF'
  return new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
}

/** 单元格转义：含特殊字符时用双引号包裹，内部双引号变两个 */
function escapeCell(value: string): string {
  if (/[,"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
