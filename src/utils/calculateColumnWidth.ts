import type { IColumn } from "@/types";

/**
 * 计算列宽
 * 
 * 策略
 * 1. 有 width 的列: 使用指定宽度
 * 2. 有 flex 的列: 按 flex 比例分配剩余空间
 * 3. 无 width 且 无 flex 的列: 均分剩余空间
 * 4. 所有列宽不能小于 minWidth
 * 
 * @param columns 列配置
 * @param containerWidth 容器宽度
 * @param defaultMinWidth 默认最新列宽
 * @returns 计算后的列宽数组
 */
export function calculateColumnWidth(
  columns: IColumn[],
  containerWidth: number,
  defaultMinWidth: number = 100

): number[] {
  if (columns.length === 0) return []

  // 将列分为3类: 手动配置列; 半自动 flex 配置列; auto 全自动列
  const fixedCols: { index: number; width: number }[] = []
  const flexCols: { index: number; flex: number; minWidth: number }[] = []
  const autoCols: { index: number; minWidth: number }[] = []

  columns.forEach((col, index) => {
    const minWidth = col.minWidth || defaultMinWidth
    if (col.width !== undefined) {
      fixedCols.push({ index, width: Math.max(col.width, minWidth) })

    } else if (col.flex !== undefined) {
      flexCols.push({ index, flex: col.flex, minWidth })

    } else {
      autoCols.push({ index, minWidth })
    }
  })

  // 计算固定宽度总和
  const fixedWidth = fixedCols.reduce((sum, col) => sum + col.width, 0)
  // 计算剩余空间
  let remainingWidth = containerWidth - fixedWidth
  // 初始化结果数组
  const result: number[] = new Array(columns.length).fill(0)
  
  // 填充固定宽度列
  fixedCols.forEach(col => {
    result[col.index] = col.width
  })

  // 处理 flex 列
  if (flexCols.length > 0) {
    const totalFlex = flexCols.reduce((sum, col) => sum + col.flex, 0)
    // 先按 flex 比例分配
    flexCols.forEach(col => {
      const width = Math.floor(remainingWidth * (col.flex / totalFlex))
      result[col.index] = Math.max(width, col.minWidth)
    })
    // 更新剩余空间
    const flexUsedWidth = flexCols.reduce((sum, col) => sum + result[col.index], 0)
    remainingWidth -= flexUsedWidth
  }

  // 处理 auto 列, 均匀分配剩余空间
  if (autoCols.length > 0) {
    const autoWidth = Math.max(Math.floor(remainingWidth / autoCols.length), defaultMinWidth)

    autoCols.forEach(col => {
      result[col.index] = Math.max(autoWidth, col.minWidth)
    })
  }

  return result

}

/**
 * 获取容器实际宽度
 * 
 * @param container 容器选择器或元素
 * @param fallbackWidth 回退宽度
 * @returns 容器宽度
 */
export function getContainerWidth(
  container: string | HTMLDivElement, 
  fallbackWidth: number = 800
): number {
  let containerEl: HTMLDivElement | null = null 

  if (typeof container === 'string') {
    containerEl = document.querySelector(container)
  } else {
    containerEl = container
  }

  if (containerEl) {
    const width = containerEl.offsetWidth
    return width > 0 ? width : fallbackWidth
  }

  return fallbackWidth
}