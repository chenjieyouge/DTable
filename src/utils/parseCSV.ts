/**
 * CSV 解析
 *
 * 为什么不 split(',') + split('\n'):
 *   真实数据里门店名/地址会带逗号, 甚至带换行, 简单切分会让整行错位。
 *   这里用单趟状态机扫描, 正确性优先 —— 解析耗时在基准里会单独报出来。
 *
 * 首行固定当作表头, 作为后续每行的 key。
 */

export interface ParseCSVOptions {
  /** 最多解析多少数据行(不含表头), 用于先用小样本试跑 */
  maxRows?: number
}

export function parseCSV(text: string, options: ParseCSVOptions = {}): Record<string, string>[] {
  const maxRows = options.maxRows ?? Infinity
  const out: Record<string, string>[] = []

  let header: string[] | null = null
  let field = ''
  let row: string[] = []
  let inQuotes = false

  // Excel 导出的 CSV 常带 BOM。不剥离的话第一个列名会多一个不可见字符,
  // 前端按列名取值会整列取不到 —— 而且肉眼完全看不出来。
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0

  const endRow = () => {
    row.push(field)
    field = ''

    if (header === null) {
      header = row
    } else if (out.length < maxRows && !(row.length === 1 && row[0] === '')) {
      // 跳过完全空的行(末尾换行造成的), 否则会多出一条空记录
      const obj: Record<string, string> = {}
      for (let c = 0; c < header.length; c++) {
        obj[header[c]] = row[c] ?? ''
      }
      out.push(obj)
    }
    row = []
  }

  for (; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"' // 双写引号还原成一个
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch // 引号内的逗号和换行都属于数据
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      endRow()
      if (out.length >= maxRows) break
    } else if (ch === '\r') {
      // CRLF 的 \r 直接丢弃
    } else {
      field += ch
    }
  }

  // 收尾: 最后一行可能没有换行符
  if (field !== '' || row.length > 0) endRow()

  return out
}
