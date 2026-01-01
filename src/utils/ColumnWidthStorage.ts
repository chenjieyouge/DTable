// 列宽持久化存储工具类
export class ColumnWidthStorage {
  private storageKey: string 
  private tableWidthKey: string 
  
  constructor(tableId: string) {
    this.storageKey = `div_table_column_widths_${tableId}`
    this.tableWidthKey = `div_table_table_width_${tableId}`
  }

  // 保存列宽到 localstorage
  public saveColumnWidth(widths: Record<string, number>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(widths))
    } catch (err) {
      console.warn('保存列宽失败: ', err)
    }
  }

  // 从 localStorage 恢复列宽
  public loadColumnWidth(): Record<string, number> | null {
    try {
      const data = localStorage.getItem(this.storageKey)
      return data ? JSON.parse(data) : null 
    } catch (err) {
      console.warn('恢复列宽失败: ', err)
      return null 
    }
  }

  // 保存整表宽度到 localStorage
  public saveTableWidth(width: number): void {
    try {
      localStorage.setItem(this.tableWidthKey, String(width))
    } catch (err) {
      console.warn('保存整表宽度失败: ', err)
    }
  }

  public loadTableWidth(): number | null {
    try {
      const data = localStorage.getItem(this.tableWidthKey)
      return data ? parseInt(data, 10): null 
    } catch (err) {
      console.warn('恢复整表宽度失败: ', err)
      return null 
    }
  }

  // 清除保存的列宽, 整表宽度
  public clear(): void {
    try {
      localStorage.removeItem(this.storageKey)
      localStorage.removeItem(this.tableWidthKey)
    } catch (err) {
      console.warn('清除列宽或表格整宽失败: ', err)
    }
  }
}