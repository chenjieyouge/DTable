import type { IConfig, IColumn } from '@/types'

// 纯 dom 创建与更新: 无状态, 只负责如何画, 不关心数据

export class DOMRenderer {
  private config: IConfig

  constructor(config: IConfig) {
    this.config = config
  }

  // 创建单个表头单元格, 公共给外部使用
  createHeaderRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-sticky-header'
    this.renderCells(row, this.config.columns, 'header')
    return row
  }

  // 总结行 (一维)
  createSummaryRow(summaryData?: Record<string, any>): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-sticky-summary'
    this.renderCells(row, this.config.columns, 'summary', summaryData)
    return row
  }

  // 更新总结行数据
  updateSummaryRow(rowElement: HTMLDivElement, data: Record<string, any>) {
    const cells = rowElement.querySelectorAll('.vt-table-cell')
    cells.forEach((cell, idx) => {
      const col = this.config.columns[idx]
      cell.textContent = data[col.key] ?? (idx === 0 ? '合计' : '')
    })
  }

  // 骨架屏行
  createSkeletonRow(rowIndex: number): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-virtual-row vt-skeleton'
    row.dataset.rowIndex = rowIndex.toString() // 给每行一个行id, 是后续滚动计算的关键

    this.renderCells(row, this.config.columns, 'skeleton')
    return row
  }

  // 更新数据行, 给 cells 在骨架屏之后, 请求到数据, 则填充上
  updateDataRow(rowElement: HTMLDivElement, data: Record<string, any>, rowIndex?: number) {
    const cells = rowElement.querySelectorAll<HTMLDivElement>('.vt-table-cell')
    cells.forEach((cell, idx) => {
      cell.classList.remove('vt-skeleton')
      const col = this.config.columns[idx]
      const value = data[col.key]
      // 清理上一轮渲染残留,避免虚拟滚动复用导致样式串行, 注意千万不能暴力全清, 否则样式失效!
      cell.style.color = ''
      cell.style.backgroundColor = ''
      cell.style.fontWeight = ''
      // 有用到其他的再删吧, 就大致搞一下先

      cell.classList.add('vt-table-cell')
      // 重复加一次冻结样式, 兜底冻结列不生效
      if (idx < this.config.frozenColumns) {
        cell.classList.add('vt-cell-frozen')
      } else {
        cell.classList.remove('vt-cell-frozen')
      }

      // 优先自定义渲染器
      if (col.render) {
        const rendered = col.render(value, data, rowIndex ?? 0)
        // 清空单元格内容, 并判断返回的是 html 字符串还是 dom 元素
        cell.innerHTML = ''
        if (typeof rendered === 'string') {
          cell.innerHTML = rendered

        } else if (rendered instanceof HTMLElement) {
          cell.appendChild(rendered)

        } // else 还会有其他吗 ? 

      } else {
        // 默认渲染: 直接显示文本
        cell.textContent = value !== undefined && value !== null ? String(value) : ''
      }
      // 若配置了条件样式类名 class (约定返回单个 class 或者空字符)
      if (col.cellClassName) {
        const className = col.cellClassName(value, data)
        if (className) {
          cell.className = `vt-table-cell ${className}`
          // 保留冻结列样式
          if (idx < this.config.frozenColumns) {
            cell.classList.add('vt-cell-frozen')
          }
        }
      }
      // 若配置了 条件 style (约定返回 style 对象)
      if (col.cellStyle) {
        const styleObj = col.cellStyle(value, data, rowIndex ?? 0)
        if (styleObj) Object.assign(cell.style, styleObj) // 浅拷贝哈
      }
    })
  }

  // 单元格渲染 (通用)
  private renderCells(
    row: HTMLDivElement,
    columns: IColumn[],
    type: 'header' | 'summary' | 'skeleton',
    data?: Record<string, any>
  ): void {
    // 解析列配置, 创建单元格, 设置样式, 填充数据等
    let leftOffset = 0
    columns.forEach((col, index) => {
      const cell = document.createElement('div')
      cell.className = 'vt-table-cell'
      // 单元格宽优先用 css 变量宽, 其次是列宽
      // 给所有单元格都标记 列 key, 方便重排/按列更新
      cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
      cell.dataset.columnKey = col.key 

      // 处理冻结列
      if (index < this.config.frozenColumns) {
        cell.classList.add('vt-cell-frozen')
        cell.style.left = `${leftOffset}px`
      }
      // TODO: 拓展更多字段配置

      // 填充单元格数据
      if (type === 'header') {
        cell.classList.add('vt-header-cell')
        // 将表头文字包裹在 span 中, 方便精准点击
        const textSpan = document.createElement('span')
        textSpan.className = 'vt-header-text'
        textSpan.textContent = col.title
        cell.appendChild(textSpan)

        // 只有 sortable 列才标记排序, HeaderSortBinder 也只认这个
        if (col.sortable) {
          cell.dataset.sortable = 'true'
        }
        // 列宽拖拽手柄 (不引入第三方, 纯原生 dom)
        const handle = document.createElement('div')
        handle.className = 'vt-col-resize-handle'
        handle.dataset.columnKey = col.key
        cell.appendChild(handle)

        // 列值筛选按钮 (配置了 filter 且 enabled 才能筛选 )
        if (col.filter) {
          const filterBtn = document.createElement('div')
          filterBtn.className = 'vt-col-filter-btn'
          filterBtn.dataset.columnKey = col.key
          // 将类型塞到 dataset, binder 可以直接读取
          filterBtn.dataset.filterType = col.filter.type
          // 使用 SVG 漏斗图标（更美观）
          filterBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1 2h12l-5 6v4l-2 1V8L1 2z"/>
            </svg>
          `
          filterBtn.title = '筛选'
          cell.appendChild(filterBtn)
        }

        // 列菜单按钮 (三个横点)
        const menuBtn = document.createElement('div')
        menuBtn.className = 'vt-col-menu-btn'
        menuBtn.dataset.columnKey = col.key
        menuBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="8" cy="13" r="1.5"/>
          </svg>
        `
        menuBtn.title = '列菜单'
        cell.appendChild(menuBtn)

      } else if (type === 'summary') {
        cell.textContent = data?.[col.key] ?? (index === 0 ? '合计' : '')
      } else {
        // 先骨架屏, 等有数据再替换
        cell.classList.add('vt-skeleton')
        cell.textContent = ''
      }

      // 每一列都会计算上 leftOffset, 但只有冻结列才添加上样式
      leftOffset += col.width || 120
      row.appendChild(cell)
    })
  }

  // 辅助方法: 创建单个表头单元格 (公开给重建 dom 等多地方反复用)
  public createHeaderCell(col: IColumn, index: number): HTMLDivElement {
    // 新建一个单元格
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-header-cell' 
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key 

    // 添加-表头字段用 span 包裹一下, 方便精准控制
    const textSpan = document.createElement('span')
    textSpan.className = 'vt-header-text'
    textSpan.textContent = col.title 
    cell.appendChild(textSpan)

    // 添加-是否允许排序的标记
    if (col.sortable) {
      cell.dataset.sortable = 'true'
    }

    // 添加-拖拽列宽的手柄
    const handle = document.createElement('div')
    handle.className = 'vt-col-resize-handle'
    handle.dataset.columnKey = col.key
    cell.appendChild(handle)

    // 添加-过滤图标
    if (col.filter) {
      const filterBtn = document.createElement('div')
      filterBtn.className = 'vt-col-filter-btn'
      filterBtn.dataset.columnKey = col.key
      filterBtn.dataset.filterType = col.filter.type 
      filterBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M1 2h12l-5 6v4l-2 1V8L1 2z"/>
        </svg>
      `
      filterBtn.title = '筛选'
      cell.appendChild(filterBtn)
    }

    // 添加-列菜单功能弹框
    const menuBtn = document.createElement('div')
    menuBtn.className = 'vt-col-menu-btn'
    menuBtn.dataset.columnKey = col.key
    menuBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="3" r="1.5"/>
        <circle cx="8" cy="8" r="1.5"/>
        <circle cx="8" cy="13" r="1.5"/>
      </svg>
    `
    menuBtn.title = '列菜单'
    cell.appendChild(menuBtn)

    // 添加-冻结列处理
    if (index < this.config.frozenColumns) {
      cell.classList.add('vt-cell-frozen')
    }
    return cell 
  }

  // 辅助方法: 创建单个汇总行单元格
  public createSummaryCell(col: IColumn, index: number, summaryData?: Record<string, any>): HTMLDivElement {
    // 创建单元格
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell'
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key
    cell.textContent = summaryData?.[col.key] ?? (index === 0 ? '合计' : '')

    // 添加-冻结列处理
    if (index < this.config.frozenColumns) {
      cell.classList.add('vt-cell-frozen')
    }
    return cell
  }

  // 辅助方法: 创建单个数据单元格
  public createDataCell(
    col: IColumn,
    rowData: Record<string, any> | null,  // 允许 null, 用的地方均要判断
    rowIndex: number,
    colIndex: number
  ): HTMLDivElement {
    // 创建单元格
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell'
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key

    // 添加空值检查
    if (rowData) {
      // 获取单元格的值, 可能是 string, html, ...
      const value = rowData[col.key]

      // 逻辑复用 updateDataRow 即可
      if (col.render) {
        const rendered = col.render(value, rowData, rowIndex)
        if (typeof rendered === 'string') {
          cell.innerHTML = rendered
        } else if (rendered instanceof HTMLElement) {
          cell.appendChild(rendered)
        }
      } else {
        cell.textContent = value != null ? String(value) : ''
      }

      // 应用条件样式-类名字符串
      if (col.cellClassName) {
        const className = col.cellClassName(value, rowData)
        if (className) {
          cell.className = `vt-table-cell ${className}`
        }
      }

      // 应用条件样式-css对象
      if (col.cellStyle) {
        const styleObj = col.cellStyle(value, rowData, rowIndex)
        if (styleObj) {
          Object.assign(cell.style, styleObj)
        }
      }
    }
    // 处理冻结列
    if (colIndex < this.config.frozenColumns) {
      cell.classList.add('vt-cell-frozen')
    }
    return cell 
  }

  // 辅助方法: 统一应用冻结列样式和位置
  public applyFrozenStyles(row: HTMLDivElement): void {
    // 优先用 css 变量, 避免用 getBoundingClientRect() 产生重排
    const cells = Array.from(row.querySelectorAll<HTMLDivElement>('.vt-table-cell'))
    cells.forEach((cell, index) => {
      const key = cell.dataset.columnKey
      // 先移除所有冻结列样式
      cell.classList.remove('vt-cell-frozen')
      cell.style.left = ''
      // 根据所有重新应用冻结列样式
      if (index < this.config.frozenColumns && key) {
        cell.classList.add('vt-cell-frozen')
        // 优先使用 css 变量, 比 getBoundingClientRect 性能更好
        cell.style.left = `var(--col-${key}-left, 0px)`
      }
    })
  }
  

}
