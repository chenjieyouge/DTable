import type { IConfig } from "@/types";

/**
 * 创建默认配置值
 * 
 * 职责: 提供所有配置项的默认值
 * @returns 默认配置对象 (不包含 columns, 它是必填)
 */
export function createDefaultConfig(): Omit<IConfig, 'columns'> {
  return {
    // 默认容器
    container: '#container',
    tableId: '',  // 运行时生成
    // 默认尺寸
    tableWidth: '100%',  // 默认占满容器
    tableHeight: 500,
    headerHeight: 40,
    summaryHeight: 36,
    rowHeight: 36,
    minColumnWidth: 100, // 默认最小列宽
    // 默认数据
    totalRows: 100000,
    // 默认功能
    frozenColumns: 1,
    showSummary: true,
    // 默认分页
    pageSize: 200,
    bufferRows: 20,
    maxCachedPages: 10,
    // 底部状态栏
    showStatusBar: true,
    statusBarHeight: 32,

    // sidePanel 不提供默认值, 保持 undefined
    // 回调函数不提供默认值, 保持 undefined
    // 数据源函数不提供默认值, 保持 undefined
  }
}

// 获取默认的右侧面板配置, 默认不开启
export function getDefaultSidePanelConfig() {
  return {
    position: 'right' as const,
    width: 250,
    defaultOpen: false
  }
}