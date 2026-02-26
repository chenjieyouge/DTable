import type { ColumnFilterType, ColumnFilterValue } from "@/types"


export class ColumnFilterBinder {
  private popEl: HTMLDivElement | null = null 
  private onClickOutside: ((e: MouseEvent) => void) | null = null 

  public bind(params: {
    scrollContainer: HTMLDivElement,
    portalContainer: HTMLDivElement,
    headerRow: HTMLDivElement,
    onFilterChange: (key: string, filter: ColumnFilterValue | null) => void 
    getFilterOptions: (key: string) => Promise<string[]>,
    getCurrentFilter: (key: string) => ColumnFilterValue | undefined,
    onBeforeOpen?: () => void
  }) {
    // 解构出从 tableShell 传入进来的参数
    const {
      scrollContainer,
      portalContainer,
      headerRow,
      onFilterChange,
      getFilterOptions,
      getCurrentFilter,
      onBeforeOpen,
    } = params

    headerRow.addEventListener('click', async (e: MouseEvent) => {
      const target = e.target as HTMLDivElement
      const btn = target?.closest<HTMLDivElement>('.vt-col-filter-btn')
      if (!btn) return 
      e.stopPropagation()

      // 获取筛选字段的 key 和 值类型 (set/text/dateRante/numberRange), 用来展示不同 筛选 UI 
      const key = btn.dataset.columnKey 
      const filterType = btn.dataset.filterType as ColumnFilterType | undefined

      if (!key || !filterType) return 
      // 打开前关闭其他弹框
      onBeforeOpen?.()
      // 关闭旧弹层
      this.closePopup()

      // 获取可选值 (client 从 DataManager 推导; server 从接口中拉取)
      // const options = await getFilterOptions(key)
      const current = getCurrentFilter(key) // 筛选项的值
      // 创建弹层
      this.popEl = document.createElement('div')
      this.popEl.className = 'vt-col-filter-popup'
      const rect = btn.getBoundingClientRect()
      const portalRect = portalContainer.getBoundingClientRect()

      // this.popEl.style.left = `${rect.left - portalRect.left + scrollContainer.scrollLeft}px`
      // this.popEl.style.top = `${rect.bottom - portalRect.top + scrollContainer.scrollTop}px`
      this.popEl.style.left = `${rect.left - portalRect.left}px`
      this.popEl.style.top = `${rect.bottom - portalRect.top}px`

      // 根据不同类型渲染不同 UI, 类型有 set/text/dateRante/numberRange 等 
      if (filterType === 'set') {
        await this.renderSetFilter(key, current, getFilterOptions, onFilterChange)

      } else if (filterType === 'text') {
        await this.renderTextFilter(key, current, onFilterChange)

      } else if (filterType === 'dateRange') {
        await this.renderDateRangeFilter(key, current, onFilterChange)

      } else if (filterType === 'numberRange') {
        await this.renderNumberRangeFilter(key, current, onFilterChange)
      }

      // 弹层挂载到 portalContainer上 
      portalContainer.appendChild(this.popEl)
      // 点击弹层外部则关闭
      this.onClickOutside = (ce: MouseEvent) => {
        if (!this.popEl?.contains(ce.target as Node)) {
          this.closePopup()
        }
      }

    })
  }

  // UI-set类型: 多选框列表
  private async renderSetFilter(
    key: string,
    current: ColumnFilterValue | undefined,
    getFilterOptions: (key: string) => Promise<string[]>,
    onFilterChange: (key: string, filter: ColumnFilterValue | null) => void
  ) {
    // 获取下拉框可选值 (client 从 DataManager 推导; server 从接口中拉取)
    const options = await getFilterOptions(key)
    const selected = new Set(current?.kind === 'set' ? current.values : []) // 选中的值
    const checkboxes: HTMLInputElement[] = []
    // 渲染下拉框的每行元素
    options.forEach(val => {
      const label = document.createElement('label')
      label.className = 'vt-filter-option'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox' // 原生多选下拉框
      checkbox.value = val
      checkbox.checked = selected.has(val)
      checkboxes.push(checkbox)
      // 挂载: popEl -> lable -> checkbox
      label.appendChild(checkbox)
      label.appendChild(document.createTextNode(val))
      this.popEl!.appendChild(label)
    })
    // 添加通用的底部 "确认, 清空" 按钮
    this.appendFooter(
      // ok 回调
      () => {
        const values = checkboxes.filter(c => c.checked).map(c => c.value)
        // emit 外部哪个字段, 筛选了什么值等信息
        if (values.length === 0) {
          onFilterChange(key, null)
        } else {
          onFilterChange(key, { kind: 'set', values })
        }
        this.closePopup()
      },
      // clear 回调
      () => {
        onFilterChange(key, null)
        this.closePopup()
      }
    )
  }

  // UI-text类型: 单行输入框 (contains)
  private renderTextFilter(
    key: string,
    current: ColumnFilterValue | undefined,
    onFilterChange: (key: string, filter: ColumnFilterValue | null) => void
  ) {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'vt-filter-text-input'
    input.placeholder = '输入文本筛选...'
    input.value = current?.kind === 'text' ? current.value: ''
    // 挂载
    this.popEl?.appendChild(input)
    // 底部的 "确认+清空" 按钮
    this.appendFooter(
      // ok 回调
      () => {
        const value = input.value.trim()
        if (!value) {
          onFilterChange(key, null)
        } else {
          onFilterChange(key, { kind: 'text', value })
        }
        this.closePopup()
      },
      // clear 回调
      () => {
        onFilterChange(key, null)
        this.closePopup()
      }
    )
  }

  // UI-dateRange类型: 两个日期输入框
  private renderDateRangeFilter(
    key: string,
    current: ColumnFilterValue | undefined,
    onFilterChange: (key: string, filter: ColumnFilterValue | null) => void
  ) {
    // 开始日期
    const startInput = document.createElement('input')
    startInput.type = 'date' // 日期输入框
    startInput.className = 'vt-filter-date-input'
    startInput.value = current?.kind === 'dateRange' ? current.start ?? '' : ''
    // 结束日期
    const endInput = document.createElement('input')
    endInput.type = 'date'
    endInput.className = 'vt-filter-date-input'
    endInput.value = current?.kind === 'dateRange' ? current.end ?? '' : ''
    // 标签 label 
    const startLabel = document.createElement('div')
    startLabel.textContent = '开始日期:'
    startLabel.appendChild(startInput)

    const endLabel = document.createElement('div')
    endLabel.textContent = '结束日期:'
    endLabel.appendChild(endInput)
    // 挂载
    this.popEl!.appendChild(startLabel)
    this.popEl?.appendChild(endLabel)
    // 添加底部的 "确定 + 清空" 按钮
    this.appendFooter(
      // ok 回调
      () => {
      const start = startInput.value
      const end = endInput.value 
      if (!start && !end) {
        onFilterChange(key, null)
      } else {
        onFilterChange(key, { kind: 'dateRange', start: start || undefined, end: end || undefined})
      }
      this.closePopup()
      },
      // clear 回调
      () => {
        onFilterChange(key, null)
        this.closePopup()
      }
    )
  }


  // UI-numberRange类型: 两个数字输入框
  private renderNumberRangeFilter(
    key: string,
    current: ColumnFilterValue | undefined,
    onFilterChange: (key: string, filter: ColumnFilterValue | null) => void
  ) {
    // 最小数字输入框
    const minInput = document.createElement('input')
    minInput.type = 'number'
    minInput.className = 'vt-filter-number-input'
    minInput.placeholder = '最小值'
    minInput.value = current?.kind === 'numberRange' && current.min !== undefined ? String(current.min) : ''
    // 最大值输入框
    const maxInput = document.createElement('input')
    maxInput.type = 'number'
    maxInput.className = 'vt-filter-number-input'
    maxInput.placeholder = '最大值'
    maxInput.value = current?.kind === 'numberRange' && current.max !== undefined ? String(current.max) : ''
    // 标签 label 
    const minLabel = document.createElement('div')
    minLabel.textContent = '最小值'
    minLabel.appendChild(minInput)

    const maxLabel = document.createElement('div')
    maxLabel.textContent = '最大值'
    maxLabel.appendChild(maxInput)
    // 挂载
    this.popEl!.appendChild(minLabel)
    this.popEl!.appendChild(maxLabel)
    // 添加底部的 "确定 + 清空" 按钮
    this.appendFooter(
      // ok 回调
      () => {
        const minVal = minInput.value ? Number(minInput.value) : undefined
        const maxVal = maxInput.value ? Number(maxInput.value) : undefined

        if (minVal === undefined && maxVal === undefined) {
          onFilterChange(key, null ) // 没传
        } else {
          onFilterChange(key, { kind: 'numberRange', min: minVal, max: maxVal })
        }
        this.closePopup()
      },
      // clear 回调
      () => {
        onFilterChange(key, null)
        this.closePopup()
      }
    )

  }


  // 通用-底部按钮 (确定 + 清空)
  private appendFooter(onOk: () => void, onClear: () => void) {
    // 确认按钮
    const btnOk = document.createElement('button')
    btnOk.className = 'vt-filter-btn-ok'
    btnOk.textContent = '确定'
    btnOk.onclick = onOk 

    // 清空按钮
    const btnClear = document.createElement('button')
    btnClear.className = 'vt-filter-btn-clear'
    btnClear.textContent = '清空'
    btnClear.onclick = onClear

    // 页脚
    const footer = document.createElement('div')
    footer.className = 'vt-filter-popup-footer'
    footer.appendChild(btnOk)
    footer.appendChild(btnClear)
    this.popEl!.appendChild(footer)
  }

  // 关闭筛选弹窗
  public closePopup() {
    if (this.popEl) {
      this.popEl.remove()
      this.popEl = null 
    }
    if (this.onClickOutside) {
      window.removeEventListener('click', this.onClickOutside, true)
      this.onClickOutside = null
    }
  }

  public unbind() {
    this.closePopup()
  }
}