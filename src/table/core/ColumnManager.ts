import type { IColumn, IConfig } from "@/types";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { DataStrategy } from "@/table/data/DataStrategy";

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
  private dataStratety: DataStrategy


  constructor(config: IConfig, renderer: DOMRenderer, dataStrategy: DataStrategy) {
    this.config = config 
    this.renderer = renderer
    this.dataStratety = dataStrategy
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
    const { headerRow, summaryRow, dataRows } = targets
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

    // 性能优化: 只移除不需要的节点, 而非暴力全清空
    // row.innerHTML = ''
    const neededKeys = new Set(columns.map(col => col.key))
    existingCells.forEach(cell => {
      const key = cell.dataset.columnKey
      if (key && !neededKeys.has(key)) {
        cell.remove() // 只移除不需要的
      }
    })

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

    // 移除不需要的节点, 也用 DocumentFragment 容器先装, 后批量插入
    const neededKeys = new Set(columns.map(col => col.key))
    existingCells.forEach(cell => {
      const key = cell.dataset.columnKey
      if (key && !neededKeys.has(key)) {
        cell.remove()
      }
    })

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
    row.innerHTML = ''
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
      const rowData = this.dataStratety.getRow(rowIndex)

      // 移除不需要的节点, 也用 DocumentFragment 容器先装, 后批量插入
      const neededKeys = new Set(columns.map(col => col.key))
      existingCells.forEach(cell => {
        const key = cell.dataset.columnKey
        if (key && !neededKeys.has(key)) {
          cell.remove()
        }
      })

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
      row.innerHTML = ''  // 先清空行在重新插入, 保证顺序
      row.appendChild(fragment)
      this.renderer.applyFrozenStyles(row) // 应用冻结列样式
    })
  }

}