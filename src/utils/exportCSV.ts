import type { IColumn } from '@/types'

export interface ExportCSVOptions {
  filename?: string       // 文件名（不含 .csv 后缀）
  onlySelected?: boolean  // 仅导出选中行
}

/**
 * 将数据导出为 CSV 文件
 * - 加 UTF-8 BOM，确保 Excel 打开中文不乱码
 * - 值中含逗号/引号/换行时自动加双引号转义
 */
export function exportCSV(
  rows: Record<string, any>[],
  columns: IColumn[],
  options: ExportCSVOptions = {}
): void {
  const { filename = 'export', onlySelected = false } = options

  const visibleCols = columns.filter(col => col.width !== 0) // 隐藏列 width=0 时跳过，或全量
  const headers = visibleCols.map(col => escapeCell(col.title))
  const lines: string[] = [headers.join(',')]

  for (const row of rows) {
    const cells = visibleCols.map(col => {
      const val = row[col.key]
      return escapeCell(val !== undefined && val !== null ? String(val) : '')
    })
    lines.push(cells.join(','))
  }

  const BOM = '\uFEFF'
  const csvContent = BOM + lines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${filename}.csv`)
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
