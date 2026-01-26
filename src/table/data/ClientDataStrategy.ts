import type { DataStrategy } from "@/table/data/DataStrategy";
import type { ColumnFilterValue, ITableQuery } from "@/types";
import type { IColumn } from "@/types";

/**
 * Client 数据策略
 * 
 * - 管理全量数据 fullData
 * - 前端排序/筛选
 * - 同步返回数据 (因为数据都在内存中)
 */
export class ClientDataStrategy implements DataStrategy {
  readonly mode = 'client' as const 

  private fullData: Record<string, any>[] = []  // 原始全量数据
  private filteredData: Record<string, any>[] = []  // 筛选后的数据
  private currentQuery: ITableQuery = {}
  private columns: IColumn[]

  constructor(initialData: Record<string, any>[], columns: IColumn[]) {
    this.fullData = initialData
    this.filteredData = [...initialData]  // 初始时, 筛选后的数据是全量, 浅拷贝
    this.columns = columns
  }

  public async bootstrap(): Promise<{ totalRows: number; }> {
    // client 模式下, 数据已经在构造函数中传入了
    return { totalRows: this.filteredData.length }
  }

  public getRow(rowIndex: number): Record<string, any> | undefined {
    return this.filteredData[rowIndex]
  }

  public async ensurePageForRow(rowIndex: number): Promise<void> {
    // client 模式下不需要做任何事, 因为数据已在内存中
  }

  public applyQuery(query: ITableQuery): Promise<{ totalRows: number; shouldResetScroll: boolean; }> {
    this.currentQuery = query
    // 1. 先应用筛选
    this.filteredData = this.applyFilters(this.fullData, query)
    // 2. 再应用排序
    if (query.sortKey && query.sortDirection) {
      this.filteredData = this.applySort(this.filteredData, query.sortKey, query.sortDirection)
    }

    // 即便是同步也用 Promise 保持和异步的 server 一致
    return Promise.resolve({
      totalRows: this.filteredData.length,
      shouldResetScroll: true  // client 模式总是回到顶部
    })
  }

  public async getSummary(query: ITableQuery): Promise<Record<string, any> | null> {
    // 计算 filterData 的总结行
    const summary: Record<string, any> = {}

    for (const col of this.columns) {
      if (col.summaryType) {
        // 获取一列的值数组
        const values = this.filteredData.map(row => row[col.key])
        // 根据配置的汇总类型 (sum/avg/count/max/min) 进行汇总
        if (col.summaryType === 'sum') {
          summary[col.key] = values.reduce((acc, val) => {
            const num = parseFloat(val)
            return acc + (isNaN(num) ? 0 : num)
          }, 0)

        } else if (col.summaryType === 'avg') {
          const sum = values.reduce((acc, val) => {
            const num = parseFloat(val)
            return acc + (isNaN(num) ? 0 : num)
          }, 0)
          summary[col.key] = values.length > 0 ? sum / values.length : 0

        } else if (col.summaryType === 'count') {
          summary[col.key] = values.length

        } // else if ... 其他聚合计算
      }
    }
    return Object.keys(summary).length > 0 ? summary : null 
  }

  public getTotalRows(): number {
    return this.filteredData.length
  }

  /** 应用筛选条件 */
  private applyFilters(data: Record<string, any>[], query: ITableQuery): Record<string, any>[] {
    let result = [...data]
    // 全局筛选
    if (query.filterText) {
      const text = query.filterText.toLowerCase()
      result = result.filter(row => {
        return Object.values(row).some(val => String(val).toLowerCase().includes(text))
      })
    }

    // // 列筛选
    // if (query.columnFilters) {
    //   for (const [key, filterValue] of Object.entries(query.columnFilters)) {
    //     if (!filterValue) continue 

    //     if (Array.isArray(filterValue)) {
    //       // 多选筛选
    //       result = result.filter(row => {
    //         return filterValue.includes(String(row[key]))
    //       })

    //     } else {
    //       // 单值筛选
    //       result = result.filter(row => {
    //         String(row[key]) === String(filterValue)
    //       })
    //     }
    //   }
    // }

    // 列筛选 
    if (query.columnFilters) {
      result = result.filter(row => {
        return this.matchesColumnFilters(row, query.columnFilters!)
      })
    }
    
    return result
  }

  /** 列筛选匹配逻辑, 判断 该行 是否满足筛选条件 */
  private matchesColumnFilters(
    row: Record<string, any>,
    columnFilters: Record<string, ColumnFilterValue>
  ): boolean {

    for (const key in columnFilters) {
      const filter = columnFilters[key]
      const cellVal = row[key]

      // 按字段配置的类型来确定筛选逻辑
      if (filter.kind === 'set') {
        if (filter.values.length === 0) continue
        if (!filter.values.includes(String(cellVal ?? ''))) return false 

      } else if (filter.kind === 'text') {
        if (!filter.value) continue
        if (!String(cellVal ?? '').toLowerCase().includes(filter.value.toLowerCase())) {
          return false 
        }

      } else if (filter.kind === 'dateRange') {
        // 日期转字符比较比较不确定是否会有问题
        const dateStr = String(cellVal ?? '')
        if (filter.start && dateStr < filter.start) return false 
        if (filter.end && dateStr > filter.end) return false

      } else if (filter.kind === 'numberRange') {
        const num = Number(cellVal)
        if (isNaN(num)) return false 
        // 值小于筛选区间的 最小值, 或者 大于 筛选区间的 最大值, 都不行
        if (filter.min !== undefined && num < filter.min) return false 
        if (filter.max !== undefined && num < filter.max) return false 

      } // else if ...其他
    }
    return true 
  }

  /** 应用排序 */
  private applySort(
    data: Record<string, any>[],
    sortKey: string,
    sortDirection: 'asc' | 'desc'
  ): Record<string, any>[] {
    const sorted = [...data]
    // 排序兼容数字和文字
    sorted.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      // 数字比较
      const aNum = parseFloat(aVal)
      const bNum = parseFloat(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? (aNum - bNum) : (bNum - aNum)
      }
      // 字符串比较
      const aStr = String(aVal)
      const bStr = String(bVal)
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr)
      } else {
        return bStr.localeCompare(aStr)
      }
    })
    return sorted 
  }

}