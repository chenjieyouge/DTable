// src/main.ts
import { VirtualTable } from '@/table/VirtualTable'
import { IPageInfo } from '@/types'
import { mockFechPageData, mockFechSummaryData } from '@/utils/mockData'

const config = {
  container: '#container',
  // tableWidth: 500,
  // tableHeight: 500,
  // headerHeight: 30,
  // summaryHeight: 24,
  // rowHeight: 20,
  // frozenColumns: 2,
  // showSummary: true,

  // pageSize: 200, // 每页显示多少条
  // bufferRows: 50, // 缓冲区行数
  // maxCachedPages: 20, // 最大缓存页数

  // 事先已经返回的数据格式,进行列配置
  columns: [
    { key: 'name', title: '姓名', width: 100 },
    { key: 'dept', title: '部门', width: 80 },
    { key: 'region', title: '区域', width: 100 },
    { key: 'product', title: '产品', width: 120 },
    { key: 'sales', title: '销售额', width: 120 },
    { key: 'cost', title: '成本', width: 120 },
    { key: 'profit', title: '利润', width: 120 },
  ],

  fetchPageData(pageIndex: number) {
    return mockFechPageData(pageIndex, 50, 200)
  },

  fetchSummaryData(): Promise<Record<string, any>> {
    return mockFechSummaryData()
  },

  // 回调: 在这里 "消费" 页面变化数据
  // VirtualTable: this.config.onPageChange?.(pageInfo)
  onPageChange(pageInfo: IPageInfo) {
    const el = document.getElementById('page-indicator')
    if (el) {
      el.textContent = `当前显示 第 ${pageInfo.startPage}-${pageInfo.endPage} 页 (共 ${pageInfo.totalPages} 页)`
    }
  },
}

// main
document.addEventListener('DOMContentLoaded', () => {
  new VirtualTable(config)
})
