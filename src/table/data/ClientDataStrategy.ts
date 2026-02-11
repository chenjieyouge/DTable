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

  /**
   * 获取总结行数据 (同步)
   * Client 模式下实时计算总结行
   */
  public getSummary(): Record<string, any> | null {
    if (!this.columns || this.columns.length === 0) {
      return null 
    }
   
    const summary: Record<string, any> = {}
    let hasSummary = false 

    for (const col of this.columns) {
      if (col.summaryType && col.summaryType !== 'none') {
        // 单列的汇总值
        const value = this.calculateColumnSummary(col, this.filteredData)
        summary[col.key] = value 
        hasSummary = true 
      }
    }

    return hasSummary ? summary : null 
  }

  /**  
   * 计算单列的汇总值
   */
  private calculateColumnSummary(col: IColumn, data: Record<string, any>[]): any {
    if (!col.summaryType || col.summaryType === 'none' || data.length === 0) {
      return null 
    }
    // 获取一列的值的数组, 将 null 排除了, map + filter 复杂度O(n) 但准确稳定
    const values = data.map(row => row[col.key]).filter(v => v != null)

    switch(col.summaryType) {
      case 'sum': {
        const numValues = values.map(v => Number(v)).filter(v => !isNaN(v))
        return numValues.reduce((acc, val) => acc + val, 0)
      }

      case 'avg': {
        const numValues = values.map(v => Number(v)).filter(v => !isNaN(v))
        if (numValues.length === 0) return 0
        const sum = numValues.reduce((acc, val) => acc + val, 0)
        return sum / numValues.length
      }

      case 'count': {
        return values.length
      }

      // case ... 更多单列计算值

      default: 
        return null 
    }
  }

  public getTotalRows(): number {
    return this.filteredData.length
  }

  /** 获取列的筛选选项 */
  public getFilterOptions(columnKey: string): string[] {
    const valSet = new Set<string>()
    const limit = 1000 // 最多取前 1000 个不同值
    
    // 从全量数据中提取
    for (const row of this.fullData) {
      if (valSet.size >= limit) break 
      const val = String(row[columnKey] ?? '')
      if (val) valSet.add(val)
    }
    return Array.from(valSet).sort()
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
        if (filter.max !== undefined && num > filter.max) return false 

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

  /** 获取全量数据, 透视表等场景需要 */
  public getAllData(): Record<string, any>[] {
    return this.filteredData
  }

}