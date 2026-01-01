// 列宽持久化存储工具类
export class ColumnWidthStorage {
  private columnsKey: string 
  private tableWidthKey: string 
  private columnOrderKey: string

  // 用来存储到 localStorage 的 key 标识前缀
  private columnPrefix = 'Dtable-column-widths-'
  private tablePrefix = 'Dtable-all-width-'
  private orderPrefix = 'Dtable-column-order-'
  
  constructor(tableId: string) {
    this.columnsKey = `${this.columnPrefix}${tableId}`
    this.tableWidthKey = `${this.tablePrefix}${tableId}`
    this.columnOrderKey = `${this.orderPrefix}${tableId}`
   
    // todo: 自动清理无效的 key, 暂时先禁用
    // this.cleanupInvalidKeys()
  }

  // 保存列宽到 localstorage
  public saveColumnWidth(widths: Record<string, number>): void {
    try {
      localStorage.setItem(this.columnsKey, JSON.stringify(widths))
    } catch (err) {
      console.warn('保存列宽失败: ', err)
    }
  }

  // 从 localStorage 恢复列宽
  public loadColumnWidth(): Record<string, number> | null {
    try {
      const data = localStorage.getItem(this.columnsKey)
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

  public saveColumnOrder(order: string[]): void {
    try {
      localStorage.setItem(this.columnOrderKey, JSON.stringify(order))
    } catch (err) {
      console.warn('保存列顺序失败: ', err)
    }
  }

  public loadColumnOrder(): string[] | null {
    try {
      const data = localStorage.getItem(this.columnOrderKey)
      return data ? JSON.parse(data) : null 
    } catch (err) {
      console.warn('恢复列顺序失败: ', err)
      return null 
    }
  }

  // 清除保存的列宽, 整表宽度
  public clear(): void {
    try {
      localStorage.removeItem(this.columnsKey)
      localStorage.removeItem(this.tableWidthKey)
      localStorage.removeItem(this.columnOrderKey)
    } catch (err) {
      console.warn('清除-列宽/列顺序/表宽-等失败: ', err)
    }
  }

  // todo: 自动清理无效的 key 防止堆屎山到用户的 localStorage 中 
  public cleanupInvalidKeys(): void {
    try {
      const keysToRemove: string[] = []
      const currentTableId = this.columnsKey.replace(this.columnPrefix, '')

      for (let i = 0; i < localStorage.length; i++) {
        const key  = localStorage.key(i) 

        if (key && (key.startsWith(this.columnPrefix) || key.startsWith(this.tablePrefix))) {
          const storedTableId = key.replace(this.columnPrefix, '').replace(this.tablePrefix, '')
          
          // 检查对应的容器是否还存在 且 不是当前表格
          if (storedTableId !== currentTableId && !document.querySelector(storedTableId)) {
            keysToRemove.push(key)
          }
        }
      }
      // 删除无效 key 
      if (keysToRemove.length > 0) {
        keysToRemove.forEach(key => localStorage.removeItem(key))
      }

    } catch (err) {
      console.warn('清理 localStorage key 失败: ', err)
    }
  }
}