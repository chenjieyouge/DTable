/**
 * 表格顶部工具条 (对标 ag-grid Quick Filter Access Toolbar)
 * 左侧: 全局快速筛选输入框 (跨列实时过滤, 拆词 AND)
 * 右侧: 主题切换按钮 (浅色/暗色)
 * 零依赖, 纯 DOM
 */
export interface ToolbarCallbacks {
  onQuickFilter: (text: string) => void
  onToggleTheme: () => void
}

export class TableToolbar {
  public el: HTMLDivElement
  private input: HTMLInputElement
  private themeBtn: HTMLButtonElement
  private debounceTimer: number | null = null
  private callbacks: ToolbarCallbacks

  // 工具条高度 (shell 据此调整滚动区高度)
  public static readonly HEIGHT = 44

  constructor(callbacks: ToolbarCallbacks, initialFilter = '', theme: 'light' | 'dark' = 'light') {
    this.callbacks = callbacks
    this.el = document.createElement('div')
    this.el.className = 'vt-toolbar'

    // 左侧: 快速筛选
    const filterWrap = document.createElement('div')
    filterWrap.className = 'vt-toolbar-filter'

    const searchIcon = document.createElement('span')
    searchIcon.className = 'vt-toolbar-search-icon'
    searchIcon.innerHTML = SEARCH_SVG

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.className = 'vt-quick-filter-input'
    this.input.placeholder = '全局搜索... (跨所有列, 空格分词)'
    this.input.value = initialFilter
    this.input.setAttribute('aria-label', '全局快速筛选')
    this.input.addEventListener('input', () => {
      if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
      this.debounceTimer = window.setTimeout(() => {
        this.callbacks.onQuickFilter(this.input.value)
      }, 180)
    })

    filterWrap.appendChild(searchIcon)
    filterWrap.appendChild(this.input)

    // 右侧: 主题切换
    this.themeBtn = document.createElement('button')
    this.themeBtn.type = 'button'
    this.themeBtn.className = 'vt-theme-toggle-btn'
    this.themeBtn.setAttribute('aria-label', '切换主题')
    this.themeBtn.addEventListener('click', () => this.callbacks.onToggleTheme())
    this.setThemeIcon(theme)

    this.el.appendChild(filterWrap)
    this.el.appendChild(this.themeBtn)
  }

  /** 主题切换后更新图标与提示 */
  public setThemeIcon(theme: 'light' | 'dark'): void {
    this.themeBtn.innerHTML = theme === 'light' ? MOON_SVG : SUN_SVG
    this.themeBtn.title = theme === 'light' ? '切换到暗色主题' : '切换到浅色主题'
  }

  /** 外部设置筛选文本 (不触发回调) */
  public setFilterText(text: string): void {
    this.input.value = text
  }

  public destroy(): void {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.el.remove()
  }
}

const SEARCH_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`

const MOON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`

const SUN_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
