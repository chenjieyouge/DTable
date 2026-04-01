/**
 * 行选中管理器
 * 独立于 TableStore，不触发全量重绘
 * 使用 rowIndex 作为 key（适合 client 模式；server 模式后续可扩展 rowKey）
 */
export class RowSelectionManager {
  private selected = new Set<number>()
  private onChange: ((indices: Set<number>) => void) | null = null

  public setOnChange(fn: (indices: Set<number>) => void) {
    this.onChange = fn
  }

  public toggle(index: number): void {
    if (this.selected.has(index)) {
      this.selected.delete(index)
    } else {
      this.selected.add(index)
    }
    this.notify()
  }

  public selectAll(totalRows: number): void {
    for (let i = 0; i < totalRows; i++) {
      this.selected.add(i)
    }
    this.notify()
  }

  public clear(): void {
    this.selected.clear()
    this.notify()
  }

  public has(index: number): boolean {
    return this.selected.has(index)
  }

  public getCount(): number {
    return this.selected.size
  }

  public getSelectedIndices(): number[] {
    return Array.from(this.selected).sort((a, b) => a - b)
  }

  /** 全选状态：全部选中 / 部分选中 / 未选中 */
  public getSelectAllState(totalRows: number): 'all' | 'partial' | 'none' {
    if (this.selected.size === 0) return 'none'
    if (this.selected.size >= totalRows) return 'all'
    return 'partial'
  }

  private notify(): void {
    this.onChange?.(this.selected)
  }
}
