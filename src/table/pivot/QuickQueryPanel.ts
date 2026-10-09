import type { IPivotConfig, AggregationType } from "@/types/pivot";
import { MAX_GROUP_LEVELS } from "@/types/pivot";
import type { IColumn } from "@/types";

/**
 * 快速查询 字段窗格 (图1 形态: 左侧字段勾选, 按勾选顺序自动透视)
 *
 * 与"高级透视"(Excel 四区域拖拽) 并列的轻量模式:
 * - 左侧列出非数值字段作为维度, 按勾选顺序生成行分组
 * - 数值字段自动作为度量 (默认 sum 聚合)
 * - 结果扁平展示: 每组一行, 勾选字段值平铺, 不合并相邻同值单元格
 *
 * 交互:
 * - onQuery: 点击"查询"时回调, 携带 flatMode=true 的 IPivotConfig
 * - onBack: 点击"← 高级透视"时回调, 恢复标准配置面板
 */
export class QuickQueryPanel {
  private container: HTMLDivElement | null = null
  private dimensionList: HTMLDivElement | null = null

  constructor(
    private columns: IColumn[],
    private onQuery: (config: IPivotConfig) => void,
    private onBack: () => void,
  ) {}

  /** 数值字段 (自动聚合为度量) */
  private get measureFields(): IColumn[] {
    return this.columns.filter(
      col =>
        col.dataType === 'number' ||
        (col.summaryType !== undefined && col.summaryType !== 'none')
    )
  }

  /** 维度字段 (非数值、非 id 类, 可勾选分组) */
  private get dimensionFields(): IColumn[] {
    const measures = new Set(this.measureFields.map(col => col.key))
    return this.columns.filter(col => {
      if (measures.has(col.key)) return false
      const key = col.key.toLowerCase()
      return !key.includes('id') && !key.includes('time') && !key.includes('date')
    })
  }

  /** 渲染面板 */
  public render(): HTMLDivElement {
    const panel = document.createElement('div')
    panel.className = 'vt-quick-query-panel'
    this.container = panel

    // ── 头部: 标题 + 返回 ──
    const header = document.createElement('div')
    header.className = 'vt-quick-query-header'

    const title = document.createElement('span')
    title.className = 'vt-quick-query-title'
    title.textContent = '⚡ 快速查询'
    header.appendChild(title)

    const backBtn = document.createElement('button')
    backBtn.className = 'vt-quick-query-back-btn'
    backBtn.textContent = '← 高级透视'
    backBtn.setAttribute('data-vt-tip', '返回 Excel 四区域拖拽透视')
    backBtn.addEventListener('click', () => this.onBack())
    header.appendChild(backBtn)

    panel.appendChild(header)

    // ── 红色提示条 (对齐参考图) ──
    const tip = document.createElement('div')
    tip.className = 'vt-quick-query-tip'
    tip.textContent = '勾选字段，按勾选顺序，自动进行透视，不合并行'
    panel.appendChild(tip)

    // ── 操作行: 全选 / 清空 ──
    const actions = document.createElement('div')
    actions.className = 'vt-quick-query-actions'
    const selectAll = document.createElement('button')
    selectAll.className = 'vt-quick-query-link-btn'
    selectAll.textContent = '全选'
    const clearAll = document.createElement('button')
    clearAll.className = 'vt-quick-query-link-btn'
    clearAll.textContent = '清空'
    actions.appendChild(selectAll)
    actions.appendChild(clearAll)
    panel.appendChild(actions)

    // ── 维度字段列表 ──
    const dimLabel = document.createElement('div')
    dimLabel.className = 'vt-pivot-config-label'
    dimLabel.textContent = '维度字段（勾选顺序即透视层级）'
    panel.appendChild(dimLabel)

    this.dimensionList = document.createElement('div')
    this.dimensionList.className = 'vt-quick-query-dim-list'
    panel.appendChild(this.dimensionList)
    this.renderDimensionList()

    selectAll.addEventListener('click', () => this.setAllChecked(true))
    clearAll.addEventListener('click', () => this.setAllChecked(false))

    // ── 度量字段 (只读展示) ──
    const measureLabel = document.createElement('div')
    measureLabel.className = 'vt-pivot-config-label'
    measureLabel.textContent = '度量字段（自动聚合）'
    panel.appendChild(measureLabel)

    const measureList = document.createElement('div')
    measureList.className = 'vt-quick-query-measure-list'
    for (const col of this.measureFields) {
      const item = document.createElement('div')
      item.className = 'vt-quick-query-measure-item'
      item.textContent = `${col.title}`
      const agg = document.createElement('span')
      agg.className = 'vt-quick-query-agg-badge'
      agg.textContent = col.summaryType && col.summaryType !== 'none' ? `(${col.summaryType})` : '(sum)'
      item.appendChild(agg)
      measureList.appendChild(item)
    }
    panel.appendChild(measureList)

    // ── 查询按钮 ──
    const queryBtn = document.createElement('button')
    queryBtn.className = 'vt-quick-query-submit'
    queryBtn.textContent = '查 询'
    queryBtn.addEventListener('click', () => this.runQuery())
    panel.appendChild(queryBtn)

    // 勾选上限提示
    const limitTip = document.createElement('div')
    limitTip.className = 'vt-quick-query-limit-tip'
    limitTip.textContent = `最多勾选 ${MAX_GROUP_LEVELS} 个维度字段`
    panel.appendChild(limitTip)

    return panel
  }

  /** 渲染维度字段复选框列表 */
  private renderDimensionList(): void {
    if (!this.dimensionList) return
    this.dimensionList.innerHTML = ''

    for (const col of this.dimensionFields) {
      const item = document.createElement('label')
      item.className = 'vt-quick-query-dim-item'

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.className = 'vt-quick-query-dim-checkbox'
      cb.value = col.key

      const name = document.createElement('span')
      name.className = 'vt-quick-query-dim-name'
      name.textContent = col.title

      item.appendChild(cb)
      item.appendChild(name)
      this.dimensionList.appendChild(item)
    }
  }

  /** 全选 / 清空 (上限 MAX_GROUP_LEVELS) */
  private setAllChecked(checked: boolean): void {
    if (!this.dimensionList) return
    const cbs = Array.from(
      this.dimensionList.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    )
    if (checked) {
      // 全选时只勾前 MAX_GROUP_LEVELS 个
      cbs.slice(0, MAX_GROUP_LEVELS).forEach(cb => { cb.checked = true })
    } else {
      cbs.forEach(cb => { cb.checked = false })
    }
  }

  /** 按 DOM 顺序收集勾选字段, 生成 flatMode 配置并回调 */
  private runQuery(): void {
    if (!this.dimensionList) return
    const cbs = Array.from(
      this.dimensionList.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked')
    )
    const rowGroups = cbs.map(cb => cb.value).slice(0, MAX_GROUP_LEVELS)

    if (rowGroups.length === 0) {
      // 无维度时给出提示, 不产出空透视
      this.showToast('请至少勾选一个维度字段')
      return
    }

    const valueFields: IPivotConfig['valueFields'] = this.measureFields.map(col => ({
      key: col.key,
      aggregation: (col.summaryType && col.summaryType !== 'none'
        ? col.summaryType
        : 'sum') as AggregationType,
      label: col.title,
    }))

    const config: IPivotConfig = {
      enabled: true,
      flatMode: true,
      rowGroups,
      colGroups: [], // 快速查询仅做行方向扁平透视
      valueFields,
      showSubtotals: false,
      rowFilters: {},
      colFilters: {},
      sortBy: null,
    }

    this.onQuery(config)
  }

  /** 轻提示 (面板内联, 不依赖全局 toast) */
  private showToast(message: string): void {
    if (!this.container) return
    const old = this.container.querySelector('.vt-quick-query-toast')
    if (old) old.remove()
    const toast = document.createElement('div')
    toast.className = 'vt-quick-query-toast'
    toast.textContent = message
    this.container.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }
}
