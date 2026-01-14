import type { IColumn } from "@/types";

// 单元格渲染器: 专注于单元格内容渲染

export class CellRenderer {
  
  public renderCell(
    cell: HTMLDivElement,
    col: IColumn,
    value: any,
    rowData: Record<string, any>,
    rowIndex: number
  ): void {
    // 优先使用自定义渲染器
    if (col.render) {
      const rendered = col.render(value, rowData, rowIndex)
      cell.innerHTML = ''

      if (typeof rendered == 'string') {
        cell.innerHTML = rendered
      } else if (rendered instanceof HTMLElement) {
        cell.appendChild(rendered)
      } // else if 其他类型 ?

    } else {
      // 默认文本渲染
      cell.textContent = value ?? ''
    }
  }

  // 清理单元格样式 (虚拟滚动复用时)
  public clearCellStyles(cell: HTMLDivElement): void {
    cell.style.color = ''
    cell.style.backgroundColor = ''
    cell.style.fontWeight = ''
  }


}