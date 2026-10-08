import type { DataStrategy } from "@/table/data/DataStrategy";
import type { ColumnFilterValue, ITableQuery } from "@/types";
import type { IColumn } from "@/types";

/** 分组后展平的行: 组头行是合成对象, 数据行是原行引用 */
type FlatRow = Record<string, any>

/**
 * Client 数据策略
 * 
 * - 管理全量数据 fullData
 * - 前端排序/筛选 (支持多列排序)
 * - 行分组展平 (组头 + 数据行, 折叠/展开)
 * - 同步返回数据 (因为数据都在内存中)
 */
export class ClientDataStrategy implements DataStrategy {
  readonly mode = 'client' as const 

  private fullData: Record<string, any>[] = []  // 原始全量数据
  private filteredData: Record<string, any>[] = []  // 筛选后的数据
  private flattened: FlatRow[] = []  // 分组展平行列表 (未分组时 = filteredData)
  private currentQuery: ITableQuery = {}
  private columns: IColumn[]
  private groupBy: string[] | undefined
  private collapsed: string[] = []

  constructor(initialData: Record<string, any>[], columns: IColumn[]) {
    this.fullData = initialData
    this.filteredData = [...initialData]  // 初始时, 筛选后的数据是全量, 浅拷贝
    this.columns = columns
    this.flattened = this.filteredData
  }

  public async bootstrap(): Promise<{ totalRows: number; }> {
    // client 模式下, 数据已经在构造函数中传入了
    return { totalRows: this.flattened.length }
  }

  public getRow(rowIndex: number): Record<string, any> | undefined {
    return this.flattened[rowIndex]
  }

  public async ensurePageForRow(rowIndex: number): Promise<void> {
    // client 模式下不需要做任何事, 因为数据已在内存中
  }

  public applyQuery(query: ITableQuery): Promise<{ totalRows: number; shouldResetScroll: boolean; }> {
    this.currentQuery = query
    // 1. 先应用筛选
    this.filteredData = this.applyFilters(this.fullData, query)
    // 2. 再应用排序 (多列)
    const sorts = query.sorts ?? (
      query.sortKey && query.sortDirection
        ? [{ key: query.sortKey, direction: query.sortDirection }]
        : []
    )
    if (sorts.length > 0) {
      this.filteredData = this.applySort(this.filteredData, sorts)
    }
    // 3. 分组展平
    this.reflatten()

    // 即便是同步也用 Promise 保持和异步的 server 一致
    return Promise.resolve({
      totalRows: this.flattened.length,
      shouldResetScroll: true  // client 模式总是回到顶部
    })
  }

  /** 行分组: 设置分组字段与折叠集合, 只重展平不重排序筛选 */
  public applyGroup(groupBy: string[] | undefined, collapsed: string[]): number {
    this.groupBy = groupBy && groupBy.length > 0 ? groupBy : undefined
    this.collapsed = collapsed
    this.reflatten()
    return this.flattened.length
  }

  public getGroupKeys(): string[] {
    const keys: string[] = []
    if (!this.groupBy) return keys
    this.collectGroupKeys(this.filteredData, this.groupBy, 0, '', keys)
    return keys
  }

  private collectGroupKeys(
    rows: Record<string, any>[],
    fields: string[],
    level: number,
    prefix: string,
    out: string[]
  ): void {
    if (level >= fields.length) return
    const field = fields[level]
    const groups = new Map<string, Record<string, any>[]>()
    for (const row of rows) {
      const v = String(row[field] ?? '')
      let arr = groups.get(v)
      if (!arr) { arr = []; groups.set(v, arr) }
      arr.push(row)
    }
    for (const [v, children] of groups) {
      const fullKey = prefix ? `${prefix}\u0000${v}` : v
      out.push(fullKey)
      this.collectGroupKeys(children, fields, level + 1, fullKey, out)
    }
  }

  /** 重展平: 依据 groupBy + collapsed */
  private reflatten(): void {
    if (!this.groupBy) {
      this.flattened = this.filteredData
      return
    }
    const collapsedSet = new Set(this.collapsed)
    this.flattened = []
    this.flatten(this.filteredData, this.groupBy, 0, '', collapsedSet)
  }

  private flatten(
    rows: Record<string, any>[],
    fields: string[],
    level: number,
    prefix: string,
    collapsedSet: Set<string>
  ): void {
    if (level >= fields.length) {
      for (const row of rows) this.flattened.push(row)
      return
    }
    const field = fields[level]
    // 保序分组
    const groups = new Map<string, Record<string, any>[]>()
    const order: string[] = []
    for (const row of rows) {
      const v = String(row[field] ?? '')
      let arr = groups.get(v)
      if (!arr) { arr = []; groups.set(v, arr); order.push(v) }
      arr.push(row)
    }
    for (const v of order) {
      const children = groups.get(v)!
      const fullKey = prefix ? `${prefix}\u0000${v}` : v
      const expanded = !collapsedSet.has(fullKey)
      const groupRow: FlatRow = {
        __group: true,
        __level: level,
        __groupField: field,
        __count: children.length,
        __key: fullKey,
        __expanded: expanded,
        [field]: v,
      }
      this.flattened.push(groupRow)
      if (expanded) {
        this.flatten(children, fields, level + 1, fullKey, collapsedSet)
      }
    }
  }

  /** 更新某行数据 (内联编辑) */
  public setRow(rowIndex: number, patch: Record<string, any>): Record<string, any> | null {
    const target = this.flattened[rowIndex]
    if (!target || target.__group === true) return null
    const origRow = target
    // 同步更新原始行 (保持引用一致)
    const origIndex = this.fullData.indexOf(origRow)
    if (origIndex >= 0) {
      Object.assign(this.fullData[origIndex], patch)
    }
    Object.assign(target, patch)
    return target
  }

  /**
   * 获取总结行数据 (同步)
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

      default: 
        return null 
    }
  }

  public getTotalRows(): number {
    return this.flattened.length
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
        const dateStr = String(cellVal ?? '')
        if (filter.start && dateStr < filter.start) return false 
        if (filter.end && dateStr > filter.end) return false

      } else if (filter.kind === 'numberRange') {
        const num = Number(cellVal)
        if (isNaN(num)) return false 
        if (filter.min !== undefined && num < filter.min) return false 
        if (filter.max !== undefined && num > filter.max) return false 
      }
    }
    return true 
  }

  /** 多列排序: 按 sorts 数组优先级依次比较 */
  private applySort(
    data: Record<string, any>[],
    sorts: Array<{ key: string; direction: 'asc' | 'desc' }>
  ): Record<string, any>[] {
    const sorted = [...data]
    sorted.sort((a, b) => {
      for (const s of sorts) {
        const cmp = this.compareValues(a[s.key], b[s.key])
        if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
    return sorted 
  }

  /** 值比较: 数字按数值, 其他按字符串 */
  private compareValues(aVal: any, bVal: any): number {
    const aNum = parseFloat(aVal)
    const bNum = parseFloat(bVal)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }
    return String(aVal).localeCompare(String(bVal))
  }

  /** 获取全量数据, 透视表等场景需要 */
  public getAllData(): Record<string, any>[] {
    return this.filteredData
  }

}
