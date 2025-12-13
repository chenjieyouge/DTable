// src/main.ts
import { VirtualTable } from '@/table/VirtualTable'
import { IPageInfo } from '@/types'

// 全局配置
const config = {
  container: '#container',
  tableWidth: 500,
  tableHeight: 500,
  headerHeight: 30,
  summaryHeight: 24,
  rowHeight: 20,
  totalRows: 1000000,
  frozenColumns: 2,
  showSummary: true,

  pageSize: 200, // 每页显示多少条
  bufferRows: 50, // 缓冲区行数
  maxCachedPages: 20, // 最大缓存页数

  columns: [
    { key: 'name', title: '姓名', width: 100 },
    { key: 'dept', title: '部门', width: 80 },
    { key: 'region', title: '区域', width: 100 },
    { key: 'product', title: '产品', width: 120 },
    { key: 'sales', title: '销售额', width: 120 },
    { key: 'cost', title: '成本', width: 120 },
    { key: 'profit', title: '利润', width: 120 },
  ],

  fetchPageData(pageIndex: number): Promise<Record<string, any>[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const rows = []
        const startRowIdx = pageIndex * this.pageSize
        for (let i = 0; i < this.pageSize; i++) {
          const rowIndex = startRowIdx + i
          if (rowIndex >= this.totalRows) break

          rows.push({
            name: `员工${(rowIndex + 1).toLocaleString()}`,
            dept: ['市场部', '销售部', '生产部'][rowIndex % 3],
            region: ['华南', '华东', '华北'][rowIndex % 3],
            product: ['Ai智能眼镜', '学习平板'][rowIndex % 2],
            sales: `¥${(5 + Math.random() * 20).toFixed(1)}万`,
            cost: `¥${(2 + Math.random() * 10).toFixed(1)}万`,
            profit: `¥${(1 + Math.random() * 10).toFixed(1)}万`,
          })
        }
        resolve(rows)
      }, Math.random() * 200 + 50)
    })
  },

  fetchSummaryData(): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          name: '合计',
          sales: '¥85亿',
          cost: '¥52亿',
          profit: '¥33亿',
        })
      }, 300)
    })
  },

  // 回调: 在这里 "消费" 页面变化数据
  // VirtualTable: this.config.onPageChange?.(pageInfo)
  onPageChange(pageInfo: IPageInfo) {
    const el = document.getElementById('page-indicator')
    if (el) {
      el.textContent = `当前显示 第 ${pageInfo.startPage}-${pageInfo.endPage} 页 (共 ${pageInfo.totalPages} 页)`
    }
  },

  // },
}

document.addEventListener('DOMContentLoaded', () => {
  new VirtualTable(config)
})
