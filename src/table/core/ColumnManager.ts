import type { IColumn, IConfig } from "@/types";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { DataManager } from "@/data/DataManager";

/**
 * 列管理器: 统一管理列的增删改查 和 DOM 更新
 * 
 * 职责: 
 * 1. 统一列的 DOM 更新逻辑, 减少重复代码
 * 2. 提供批量更新接口, 提升性能
 * 3. 缓存冻结列偏移量, 减少重复计算
 * 
 * 优势: 
 * - 代码复用: header/summary/data 行共用一套逻辑
 * - 性能优化: 批量更新, 减少 DOM 操作
 * - 易于维护: 修改逻辑只需修改一处
 */

export class ColumnManager {
  private config: IConfig 
  private renderer: DOMRenderer
  private dataManager: DataManager
  private frozenOffsetCache: number[] = [] // 缓存冻结列偏移量

  constructor(config: IConfig, renderer: DOMRenderer, dataManager: DataManager) {
    this.config = config 
    this.renderer = renderer
    this.dataManager = dataManager
  }

  // 清除缓存, 列宽变化时调用
  public clearCache(): void {
    this.frozenOffsetCache = []
  }

  /**
   * 统一的更新入口
   * @param columns: 新的列配置
   * @param targets: 需要更新的目标行
   */
  public updateColumns(
    columns: IColumn[],
    targets: {
      headerRow?: HTMLDivElement
      summaryRow?: HTMLDivElement
      dataRows?: HTMLDivElement[]
    }
  ): void {
    // 性能监控 
    const startTime = performance.now()

    const { headerRow, summaryRow, dataRows } = targets
    // 批量更新前, 先清除缓存
    this.clearCache()

    // 批量更新, 减少重排
    if (headerRow) {
      this.updateHeaderRow(headerRow, columns)
    }

    if (summaryRow) {
      this.updateSummaryRow(summaryRow, columns)
    }

    if (dataRows && dataRows.length > 0) {
      this.updateDataRows(dataRows, columns)
    }

    const endTime = performance.now()
    const timeUsed = (endTime - startTime)
    if (timeUsed > 10) {
      console.warn(`[ColumnManager] 列更新耗时: ${timeUsed.toFixed(2)}ms`)
    }
  }

  private updateHeaderRow(row: HTMLDivElement, columns: IColumn[]): void {
    // 更新表头行
    const existingCells = Array.from(row.querySelectorAll<HTMLDivElement>('.table-cell'))
    const cellMap = new Map<string, HTMLDivElement>()
    // 把将要被更新的表头行的每个单元格组成 map: <key: cell>{}
    existingCells.forEach(cell => {
      const key = cell.dataset.columnKey
      if (key) {
        cellMap.set(key, cell)
      }
    })
    // 清空行, 然后开始重建
    row.innerHTML = ''
    // 性能优化: 使用 DocumentFragment 容器先装好, 然后一次性批量插入
    const fragment = document.createDocumentFragment()
    columns.forEach((col, index) => {
      let cell = cellMap.get(col.key) // 更新值, 没有则重建
      if (!cell) {
        cell = this.renderer.createHeaderCell(col, index)
      }
      fragment.appendChild(cell)
    })
    // 只触发一次 reflow
    row.appendChild(fragment)
    // 应用冻结列样式
    this.renderer.applyFrozenStyles(row)
  }

  private updateSummaryRow(row: HTMLDivElement, columns: IColumn[]): void {
    // 更新汇总行
    const existingCells = Array.from(row.querySelectorAll<HTMLDivElement>('.table-cell'))
    const cellMap = new Map<string, HTMLDivElement>()

    existingCells.forEach(cell => {
      const key = cell.dataset.columnKey
      if (key) cellMap.set(key, cell)
    })
    // 清空再更新, 也用 DocumentFragment 容器先装, 后批量插入
    row.innerHTML = ''
    const fragment = document.createDocumentFragment()
    columns.forEach((col, index) => {
      let cell = cellMap.get(col.key)  // 更新值, 没有则重建
      if (!cell) {
        cell = this.renderer.createSummaryCell(col, index)
      }
      // 每次都先装入 fg 容器里面
      fragment.appendChild(cell)
    })
    // 最后再一次批量插入, reflow 1次就好
    row.appendChild(fragment)
    this.renderer.applyFrozenStyles(row)  // 应用冻结列样式
  }

  private updateDataRows(rows: HTMLDivElement[], columns: IColumn[]): void {
    // 批量更新数据行, 也是循环一行行啦
    rows.forEach(row => {
      const existingCells = Array.from(row.querySelectorAll<HTMLDivElement>('.table-cell'))
      const cellMap = new Map<string, HTMLDivElement>()

      existingCells.forEach(cell => {
        const key = cell.dataset.columnKey
        if (key) cellMap.set(key, cell)
      })
      // 获取将要更新的行索引, 行数据
      const rowIndex = parseInt(row.dataset.rowIndex || '0', 10)
      const rowData = this.dataManager.getRowData(rowIndex)
      // 先清空, 再更新
      row.innerHTML = ''
      const fragment = document.createDocumentFragment()
      columns.forEach((col, index) => {
        let cell = cellMap.get(col.key) // 根据 key 获取新值
        if (!cell && rowData) {
          cell = this.renderer.createDataCell(col, rowData, rowIndex, index)
        }
        if (cell) {
          fragment.appendChild(cell)
        }
      })
      row.appendChild(fragment)
      this.renderer.applyFrozenStyles(row) // 应用冻结列样式
    })
  }

}