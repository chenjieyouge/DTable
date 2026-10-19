/**
 * 单元格范围选择模型 (普通表格)
 *
 * 对标 ag-grid 企业版 Range Selection / Excel 矩形选区:
 * - anchor (锚点, 选区起点) + current (当前活动单元格)
 * - 鼠标拖拽 / Shift 点击 / 键盘方向键都归一到这两个点
 * - 高亮、TSV 复制都由 getBounds() 推导出的矩形决定
 *
 * 纯状态, 不碰 DOM。
 */
export interface CellPos {
  row: number
  col: number
}

export interface CellBounds {
  r0: number
  r1: number
  c0: number
  c1: number
}

export class CellRangeManager {
  private anchor: CellPos | null = null
  private current: CellPos | null = null
  private onChanged?: () => void

  public setOnChanged(cb: () => void): void {
    this.onChanged = cb
  }

  private emit(): void {
    this.onChanged?.()
  }

  /** 单击: 从新单元格开始 (锚点 = 当前) */
  public start(row: number, col: number): void {
    this.anchor = { row, col }
    this.current = { row, col }
    this.emit()
  }

  /** Shift 点击: 保持锚点, 扩展到新单元格 */
  public extendTo(row: number, col: number): void {
    if (!this.anchor) {
      this.start(row, col)
      return
    }
    this.current = { row, col }
    this.emit()
  }

  /**
   * 键盘移动活动单元格
   * @param extend true=Shift 扩展 (锚点不动), false=普通移动 (锚点跟随)
   */
  public moveActive(row: number, col: number, extend: boolean): void {
    if (!this.anchor || !this.current) {
      this.start(row, col)
      return
    }
    if (!extend) {
      this.anchor = { row, col }
    }
    this.current = { row, col }
    this.emit()
  }

  /** 全选 (Ctrl+A) */
  public selectAll(maxRow: number, maxCol: number): void {
    this.anchor = { row: 0, col: 0 }
    this.current = { row: maxRow, col: maxCol }
    this.emit()
  }

  /** 清空选区 */
  public clear(): void {
    this.anchor = null
    this.current = null
    this.emit()
  }

  public hasSelection(): boolean {
    return this.anchor !== null && this.current !== null
  }

  public getAnchor(): CellPos | null {
    return this.anchor ? { ...this.anchor } : null
  }

  public getCurrent(): CellPos | null {
    return this.current ? { ...this.current } : null
  }

  /** 归一化矩形 (无论拖拽方向) */
  public getBounds(): CellBounds | null {
    if (!this.anchor || !this.current) return null
    return {
      r0: Math.min(this.anchor.row, this.current.row),
      r1: Math.max(this.anchor.row, this.current.row),
      c0: Math.min(this.anchor.col, this.current.col),
      c1: Math.max(this.anchor.col, this.current.col),
    }
  }

  /** 某单元格是否在选区内 */
  public isWithin(row: number, col: number): boolean {
    const b = this.getBounds()
    if (!b) return false
    return row >= b.r0 && row <= b.r1
      && col >= b.c0 && col <= b.c1
  }

  /** 该单元格是否为当前活动单元格 (矩形内不填充的那一个) */
  public isActive(row: number, col: number): boolean {
    return !!this.current && this.current.row === row && this.current.col === col
  }
}
