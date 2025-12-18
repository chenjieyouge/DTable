export type SortDirection = 'asc' | 'desc'
export type SortValue = { key: string, direction: SortDirection } | null

export class SortState {
  private current: SortValue = null 

  get value(): SortValue {
    return this.current
  }

  set(key: string, direction: SortDirection) {
    this.current = { key, direction }
    return this.current
  }

  clear() {
    this.current = null 
  }

  toggle(key: string): SortValue {
    // 若为当前字段, 按 desc -> asc -> null 循环
    if (this.current && this.current.key === key) {
      if (this.current.direction === 'desc') {
        // desc -> asc 
        this.current = { key, direction: 'asc'}
      } else if (this.current.direction === 'asc') {
        // asc -> null
        this.current = null
      } 
      } else {
        //新字段, 从 desc 开始
        this.current = { key, direction: 'desc'}
      }
    return this.current
  }



}