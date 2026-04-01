// src/main.ts
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import { IPageInfo } from '@/types'
import type { IUserConfig, IPageResponse, ITableQuery } from '@/types'
import { fetchFilterOptions, fetchTablePage } from '@/api/table'

// ##### 场景 01: Client 模式 - 本地数据 ##########
const smallData = Array.from({ length: 500000 }, (_, i) => ({
  name: `User ${i}`,
  id: i,
  dept: ['研发部', '产品部', '运营部'][i % 3],
  region: ['华东', '华北', '华南'][i % 3],
  product: `Product-${i % 10}`,
  sales: (Math.random() * 10000).toFixed(2),
  cost: Math.floor(Math.random() * 8000),
  profit: Math.floor(Math.random() * 2000),
}))

const configSmall: IUserConfig = {
  container: '#table-small',
  tableHeight: 'auto',
  minTableHeight: 300,
  maxTableHeight: 700,
  initialData: smallData,
  columns: [
    { key: 'name', title: '姓名', width: 180 },
    { key: 'id', title: 'ID' },
    { key: 'dept', title: '部门', filter: {type: 'set' }}, 
    { key: 'region', title: '区域', },
    { key: 'product', title: '产品' },
    { key: 'sales', title: '销售额', summaryType: 'sum' },
    { key: 'cost', title: '成本', summaryType: 'avg'},
    { key: 'profit', title: '利润'},
  ],
  rowSelection: {
    enabled: true,
    onSelect: (rows, indices) => {
      console.log('[rowSelection] 已选:', indices.length, '行', rows)
    }
  },
  onRowClick: (row, rowIndex) => {
    console.log('[onRowClick]', rowIndex, row)
  },
  sidePanel: {
    enabled: true,
    defaultOpen: false,
    defaultPanel: 'columns',
    panels: []
  }
}


// ##### 场景 02: Server 模式 - 后端 API ##########
const configLarge: IUserConfig = {
  container: '#table-large',
  tableHeight: 500,
  pageSize: 50,
  columns: [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'name', title: '姓名', filter: { type: 'text' }},
    { key: 'region', title: '区域', filter: { type: 'set' }, sortable: true },
    { key: 'department', title: '部门', width: 120, filter: { type: 'set' } },
    { key: 'salary', title: '薪资', sortable: true, summaryType: 'avg' },
    { key: 'status', title: '状态', width: 100, filter: { type: 'set'} },
    { key: 'joinDate', title: '入职日期', filter: { type: 'dateRange'} },
  ],
  // 使用封装的 api 函数
  fetchPageData: async (pageIndex, query) => {
    return fetchTablePage(pageIndex, 50, query)
  },

  fetchFilterOptions: async ({ key, query }) => {
    return fetchFilterOptions(key, query)
  }, 

  sidePanel: {
    enabled: true,
    defaultOpen: false,
    defaultPanel: 'columns',
    panels: []
  }, 

  onPageChange(pageInfo: IPageInfo) {
    const el = document.getElementById('page-indicator')
    if (el) {
      el.textContent = `当前显示 第 ${pageInfo.startPage}-${pageInfo.endPage} 页 (共 ${pageInfo.totalPages} 页`
    }
  },
}


// main 初始化
document.addEventListener('DOMContentLoaded', () => {
  const table = new VirtualTable(configSmall)
  table.ready

  if (typeof window !== 'undefined') {
    (window as any).table = table 
  }
  // const tableLarge = new VirtualTable(configLarge)

})
