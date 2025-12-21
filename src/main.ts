// src/main.ts
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import { IPageInfo, ITableQuery } from '@/types'
import { mockFechPageData, mockFechSummaryData } from '@/utils/mockData'

// ##### 场景01: 小数据 -> 内存模式 ##########
const smallData = Array.from({ length: 200000 }, (_, i) => ({
  name: `User ${i}`,
  dept: ['研发', '产品', '运营'][i % 3],
  region: ['华东', '华北', '华南'][i % 3],
  product: `Product-${i % 10}`,
  sales: (Math.random() * 10000).toFixed(2),
  cost: Math.floor(Math.random() * 8000),
  profit: Math.floor(Math.random() * 2000),
}))

const configSmall = {
  container: '#table-small',
  tableWidth: 600,
  tableHeight: 500,
  rowHeight: 36,
  headerHeight: 40,
  initialData: smallData, // 传全量数据
  columns: [
    { key: 'name', title: '姓名', width: 120 },
    { key: 'dept', title: '部门', width: 80 },
    { key: 'region', title: '区域', width: 100 },
    { key: 'product', title: '产品', width: 140, sortable: true },
    { key: 'sales', title: '销售额', width: 120, sortable: true },
    { key: 'cost', title: '成本', width: 120, sortable: true },
    { key: 'profit', title: '利润', width: 120 },
  ],
  onModeChange(mode: 'client' | 'server') {
    // console.log('[小数据表格-内存模式]: ', mode)
  },
}

// ##### 场景02: 大数据 -> 分页模式 ##########
const PAGE_SIZE = 200 // 和 mock 表格配置共用
const configLarge = {
  container: '#table-large',
  tableWidth: 600,
  tableHeight: 500,
  // headerHeight: 30,
  // summaryHeight: 24,
  rowHeight: 20,
  // frozenColumns: 2,
  // showSummary: true,

  pageSize: PAGE_SIZE, // 每页显示多少条
  // bufferRows: 50, // 缓冲区行数
  // maxCachedPages: 20, // 最大缓存页数

  // 事先已经返回的数据格式,进行列配置
  columns: [
    { key: 'seq', title: '序号(筛选后)', width: 110 },
    { key: 'id', title: '原始ID', width: 80 },
    { key: 'name', title: '姓名', width: 150 },
    { key: 'dept', title: '部门', width: 80 },
    { key: 'region', title: '区域', width: 100 },
    { key: 'product', title: '产品', width: 140 },
    { key: 'sales', title: '销售额', width: 120, sortable: true },
    { key: 'cost', title: '成本', width: 120 },
    { key: 'profit', title: '利润', width: 120 },
  ],

  fetchPageData: async (pageIndex: number, query?: ITableQuery) => {
    // 模拟 100 w 行数据(分页), 并带有 query 交给 mock 做“全局筛选排序后分页"
    // console.log('[fetchPageData] ', { pageIndex, query })
    return mockFechPageData(pageIndex, PAGE_SIZE, 10_000_000, query)
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
  const tableSmall = new VirtualTable(configSmall)
  const tableLarge = new VirtualTable(configLarge)

  // test-start 在 server 下最小手动测试面板绑定 ============
  const input = document.getElementById('server-filter-input') as HTMLInputElement
  const btnHuadong = document.getElementById('btn-server-filter-huadong')
  const btnClear = document.getElementById('btn-server-filter-clear')
  const btnSortSalesDesc = document.getElementById('btn-server-sort-sales-desc')

  // 按钮A: 固定筛选 "华东"
  btnHuadong?.addEventListener('click', () => {
    tableLarge.filter('华东') 
  })

  // 清空筛选
  btnClear?.addEventListener('click', () => {
    tableLarge.filter('')
    if (input) input.value = ''
  })

  // 按 sales 降序
  btnSortSalesDesc?.addEventListener('click', () => {
    tableLarge.sort('sales', 'desc')
  })

  // 自定义筛选 
  input?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return 
    tableLarge.filter(input.value.trim())
  })

  // test-end ============

  // 绑定排序按钮
  document.getElementById('sort-small')?.addEventListener('click', () => {
    tableSmall.sort('sales', 'desc')
  })
})
