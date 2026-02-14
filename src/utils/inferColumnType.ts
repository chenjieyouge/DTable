import type { ColumnDataType, IColumn } from "@/types";


/**
 * 从实际数据中采样数据, 推断列的数据类型 (string, number, date, boolean)
 * 
 * 策略: 采样前 100行, 按占比多数决定类型
 * - 全是数字 => 'number'
 * - 包含日期 => 'date
 * - 其他任何 => 'string'
 */
export function inferColumnTypes(columns: IColumn[], data: Record<string, any>[]): IColumn[] {
  if (data.length === 0) return columns

  // 采样前 100 行即可, 不足 100 行也行
  const sampleSize =  Math.min(100, data.length)
  const sample = data.slice(0, sampleSize)

  return columns.map(col => {
    // 若用户已手动指定, 则保留不覆盖
    if (col.dataType) return col 

    const inferred = inferSingleColumn(col.key, sample)
    return { ...col, dataType: inferred}
  })
}


/** 辅助: 根据采样出来的数据, 判断某列字段, 到底是什么类型, 按少数服从多数原则 */
function inferSingleColumn(key: string, sample: Record<string, any>[]): ColumnDataType {
  let numberCount = 0
  let dateCount = 0
  let totalValid = 0

  for (const row of sample) {
    const val = row[key]
    if (val === null || val === '') continue 
    totalValid++

    // 检查是否为数字, 123, '123'
    if (
      (typeof val === 'number' && isFinite(val)) || 
      (typeof val === 'string' && val.trim() !== '' && isFinite(Number(val)))
    ) {
      numberCount++
      continue
    }

    // 检查是否为日期类型
    if (isDateString(val)) {
      dateCount++
      continue
    }

    // 布尔值 归属为 离散型
    if (typeof val === 'boolean') {
      continue
    }
  }

  if (totalValid === 0) return 'string'
  // 超过 80% 是数字就判定为 number
  if (numberCount / totalValid > 0.8) return 'number'
  // 超过 80% 是日期就判定为 date
  if (dateCount / totalValid > 0.8) return 'date'

  // 其他都用 string 兜底
  return 'string'
}


/** 辅助函数: 判断是否为 "日期类型" 
 * 
 * - 业务约定只能用 "/" 或者 '-' 分割, 不允许混
 * - 月, 日可以 1 或者 2 位
*/
function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  // 正则: 统一分割数 (- 或 /), 年 4 位, 月 / 日 支持 1~2 位
  const dateRegex = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/
  const match = value.match(dateRegex)

  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[3])
  const day = Number(match[4])

  // 用 Date 构造器校验日期有效性
  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year && 
    date.getMonth() === month -1 &&
    date.getDate() === day
  )
}

