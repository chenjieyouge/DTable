import { ColumnManagerView, IColumnManagerConfig } from "@/table/interaction/ColumnManagerView";
import { IColumnMenuConfig } from "@/table/interaction/ColumnMenuView";
import type { IColumn } from "@/types";


export class ColumnManagerBinder {
  private managerView = new ColumnManagerView()
  private onClickOutside: ((e: MouseEvent) => void) | null = null

  public bind(params: {
    container: HTMLDivElement,
    triggerBtn: HTMLElement,  // 触发按钮, 当前是小齿轮图标
    getAllColumns: () => IColumn[] // 获取所有列, 包含隐藏
    getHiddenKeys: () => string[] // 获取当前隐藏的列 key 
    onToggle: (key: string, visible: boolean) => void // 切换显示/隐藏
    onShowAll: () => void 
    onHideAll: () => void 
    onReset: () => void 
  }) {
    // 解析传输的参数
    const {
      container,
      triggerBtn,
      getAllColumns,
      getHiddenKeys,
      onToggle,
      onShowAll,
      onHideAll,
      onReset
    } = params

    // 渲染面板的辅助函数
    const renderPanel = () => {
    const config: IColumnManagerConfig = {
      allColumns: getAllColumns(),
      hiddenKeys: getHiddenKeys(),
      onToggle: (key, visible) => {
        onToggle(key, visible)
        // ✅ 修复：更新后重新渲染面板，保持面板打开状态
        requestAnimationFrame(() => {
          renderPanel()
        })
      },
      onShowAll: () => {
        onShowAll()
        // ✅ 修复：全选后重新渲染面板，而不是关闭
        requestAnimationFrame(() => {
          renderPanel()
        })
      },
      onHideAll: () => {
        onHideAll()
        // ✅ 修复：全不选后重新渲染面板
        requestAnimationFrame(() => {
          renderPanel()
        })
      },
      onReset: () => {
        onReset()
        // ✅ 修复：重置后重新渲染面板
        requestAnimationFrame(() => {
          renderPanel()
        })
      },
    }
    this.managerView.render(config, container)
  }
    // 点击触发按钮小齿轮, 打开/关闭面板
    triggerBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation()
      // 若面板已经打开, 则关闭
      if (this.managerView.getElement()) {
        this.closePanel()
        return 
      }
      // 渲染面板-使用新的渲染函数
      renderPanel()

      // 点击外部关闭面板
      this.onClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.vt-colmgr-panel') && target !== triggerBtn) {
          this.closePanel()
        }
      }
      // 将点击外部的事件回调函数, 添加到宏队列(下一帧), 否则出现面板打开就关闭
      requestAnimationFrame(() => {
        document.addEventListener('click', this.onClickOutside!)
      })

    })
  }

  // 关闭面板
  private closePanel() {
    this.managerView.destroy()
    if (this.onClickOutside) {
      document.removeEventListener('click', this.onClickOutside)
      this.onClickOutside = null 
    }
  }

  // 解绑
  public unbind() {
    this.closePanel()
  }
}