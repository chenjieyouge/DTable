// src/main.ts
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import { IPageInfo, ITableQuery } from '@/types'
import { mockFechPageData, mockFechSummaryData } from '@/utils/mockData'
import type { IUserConfig } from '@/types'

// ##### 场景01: 小数据 -> 内存模式 ##########
const smallData = Array.from({ length: 200000 }, (_, i) => ({
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
  tableWidth: 600,
  tableHeight: 500,
  rowHeight: 36,
  headerHeight: 40,
  initialData: smallData, // 传全量数据
  columns: [
    { key: 'name', title: '姓名', width: 120 },
    { key: 'id', title: 'ID', width: 100, filter: { enabled: true, type: 'numberRange'}},
    { 
      key: 'dept', 
      title: '部门', 
      width: 80, 
      sortable: true, 
      filter: { enabled: true, type: 'text' },
      // 自定义渲染, 部门带颜色标签
      render: (value) => {
        const colors: Record<string, string> = {
          '产品部': '#1890ff',
          '研发部': '#52c41a',
          '运营部': '#faad14'
        }
        const color = colors[value] || '#999'
        return `<span style="color: ${color}; font-weight: bold;">${value}</span>`
      }
     },
    { 
      key: 'region', 
      title: '区域', 
      width: 100, 
      filter: { enabled: true, type: 'set' },
      // 自定义渲染, 区域 字段加粗显示
      render: (value) => {
        return `<strong>${value}</stron>`
      }
    },
    { key: 'product', title: '产品', width: 140, sortable: true, summaryType: 'count'},
    { 
      key: 'sales', 
      title: '销售额',
       width: 120, 
       sortable: true, 
       summaryType: 'sum',
       // 自定义渲染：成本格式化为货币
      render: (value) => {
        const num = parseFloat(value)
        if (isNaN(num)) return value
        return `<span style="color: #ff4d4f;">¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>`
      }
      },
    { key: 'cost', title: '成本', width: 120, sortable: true, summaryType: 'avg' },
    { 
      key: 'profit', 
      title: '利润', 
      width: 120,
      sortable: true,
      // 条件格式化 (背景, 字体)
      cellStyle: (value, row) => {
        const num = Number(value)
        if (isNaN(num)) return null
        return {
          color: num >= 1000 ? '#ef4444' : '#16a34a',
          fontWeight: '700',
          // flexDirection: 'column',
          // alignSelf: 'flex-end'
          justifyContent: 'flex-end'
        }
      },
      // 内置组件雏形: 进图条 + 文本
      render: (value, row) => {
        const profit = parseFloat(value)
        const sales = parseInt(row.sales)
        const percentage = sales > 0 ? (profit / sales * 100).toFixed(1) : 0
        const color = profit > 0 ? 'red' : '#52c41a'

        return `
          <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
            <div style="flex: 1; height: 6px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
              <div style="width: ${Math.min(Math.abs(Number(percentage)), 100)}%; height: 100%; background: ${color};"></div>
              <span style="color: ${color}; font-size: 12px; white-space: nowrap;">${percentage}%</span>
            </div>
          </div>
        `
      }
    },
  ],
  onModeChange(mode: 'client' | 'server') {
    // console.log('[小数据表格-内存模式]: ', mode)
  },
} 


// ##### 场景02: 大数据 -> 分页模式 ##########
const PAGE_SIZE = 200 // 和 mock 表格配置共用
const configLarge: IUserConfig = {
  container: '#table-large',
  tableWidth: 600,
  tableHeight: 500,
  headerHeight: 40,
  summaryHeight: 20,
  rowHeight: 20,
  // frozenColumns: 2,
  // showSummary: true,

  pageSize: PAGE_SIZE, // 每页显示多少条
  // bufferRows: 50, // 缓冲区行数
  // maxCachedPages: 20, // 最大缓存页数

  // 事先已经返回的数据格式,进行列配置
  columns: [
    { key: 'seq', title: '序号(筛选后)', width: 120 },
    { key: 'id', title: '原始ID', width: 100, filter: { enabled: true, type: 'numberRange'}},
    { key: 'name', title: '姓名', width: 150, filter: { enabled: true, type: 'text'}},
    { key: 'dept', title: '部门', width: 80, filter: { enabled: true, type: 'set'} },
    { key: 'region', title: '区域', width: 100, filter: { enabled: true, type: 'set'} },
    { 
      key: 'product', 
      title: '产品', 
      width: 140,
      render: (value) => `<strong>${value}</strong>`
    },
    { key: 'sales', title: '销售额', width: 120, sortable: true },
    { key: 'cost', title: '成本', width: 120 },
    { 
      key: 'profit', 
      title: '利润', 
      width: 120,
      // 自定义渲染: 利润带进度条
    },
  ],

  fetchPageData: async (pageIndex: number, query?: ITableQuery) => {
    // 模拟 100 w 行数据(分页), 并带有 query 交给 mock 做“全局筛选排序后分页"
    // console.log('[fetchPageData] ', { pageIndex, query })
    return mockFechPageData(pageIndex, PAGE_SIZE, 500_000, query)
  },

  // mock 下拉框值用, 后续搞个真正接口来测试
  fetchFilterOptions: async ({ key, query }) => {
    void query 
    if (key === 'dept') {
      return ['市场部', '销售部', '生产部']
    }
    if (key === 'region') {
      return ['华南', '华北', '华东']
    }
    if (key === 'region') {
      return ['AI智能手机', 'AI学习平板', 'AI眼镜']
    }
    // 其他字段暂不支持 set 下拉框筛选
    return []
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
  // ready 后在绑定时间, 避免初始化前调用 sort/filter/dispatch

  // test-start 在 server 下最小手动测试面板绑定 ============
  const input = document.getElementById('server-filter-input') as HTMLInputElement
  const btnHuadong = document.getElementById('btn-server-filter-huadong')
  const btnClear = document.getElementById('btn-server-filter-clear')
  const btnSortSalesDesc = document.getElementById('btn-server-sort-sales-desc')

  tableLarge.onReady(() => {
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

  // 列顺序, 冻结列数
  setTimeout(() => {
    tableLarge.dispatch({
      type: 'FROZEN_COUNT_SET',
      payload: { count: 2 }
    })
  }, 1000);
  })
  
  // test-end ============
})
