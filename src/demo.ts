// src/demo.ts - Client/Server 模式测试页面
import { VirtualTable } from '@/table/VirtualTable'
import './style.css'
import type { IUserConfig, IPageResponse, ITableQuery } from '@/types'

let currentTable: VirtualTable | null = null
let currentMode: 'client' | 'server' | 'client-api' = 'client'

// ============ Client 模式配置 ============
function getClientConfig(): IUserConfig {
  // 生成 50 万条本地数据
  const clientData = Array.from({ length: 50000 }, (_, i) => ({
    id: i + 1,
    name: `员工${i + 1}`,
    age: 20 + (i % 40),
    region: ['华东', '华南', '华北', '西南', '东北'][i % 5],
    department: ['技术部', '销售部', '市场部', '人力资源部'][i % 4],
    salary: Math.round(5000 + Math.random() * 20000),
    status: ['在职', '离职', '试用期'][i % 3],
    joinDate: new Date(2020 + (i % 5), i % 12, (i % 28) + 1).toISOString().split('T')[0]
  }))

  return {
    container: '#table-container',
    tableHeight: 500,
    initialData: clientData,
    columns: [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'name', title: '姓名', width: 120, filter: { type: 'text' } },
      { key: 'age', title: '年龄', width: 80, sortable: true },
      { key: 'region', title: '区域', width: 100, filter: { type: 'set' }, sortable: true },
      { key: 'department', title: '部门', width: 120, filter: { type: 'set' } },
      { key: 'salary', title: '薪资', width: 120, sortable: true, summaryType: 'avg' },
      { key: 'status', title: '状态', width: 100, filter: { type: 'set' } },
      { key: 'joinDate', title: '入职日期', width: 120 }
    ],
    sidePanel: {
      enabled: true,
      defaultOpen: false,
      defaultPanel: 'columns',
      panels: []
    },
    onModeChange: (mode) => {
      updateStats({ mode })
    }
  }
}

// ============ Server 模式配置 ============
function getServerConfig(): IUserConfig {
  return {
    container: '#table-container',
    tableHeight: 500,
    pageSize: 50,
    columns: [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'name', title: '姓名', width: 120 },
      { key: 'age', title: '年龄', width: 80, sortable: true },
      { key: 'region', title: '区域', width: 100, sortable: true },
      { key: 'department', title: '部门', width: 120 },
      { key: 'salary', title: '薪资', width: 120, sortable: true, summaryType: 'avg' },
      { key: 'status', title: '状态', width: 100 },
      { key: 'joinDate', title: '入职日期', width: 120 }
    ],
    // 从后端 API 获取分页数据
    fetchPageData: async (pageIndex: number, query?: ITableQuery): Promise<IPageResponse> => {
      try {
        // 构建查询参数
        const params = new URLSearchParams({
          pageIndex: String(pageIndex),
          pageSize: '50'
        })

        // 添加排序参数
        if (query?.sortKey && query?.sortDirection) {
          params.append('sort', `${query.sortKey}:${query.sortDirection}`)
        }

        // 添加筛选参数（简化版，实际需要根据后端 API 调整）
        if (query?.columnFilters) {
          Object.entries(query.columnFilters).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              // Set 筛选：传递数组
              params.append(`filter[${key}]`, value.join(','))
            } else if (typeof value === 'string') {
              // 文本筛选
              params.append(`filter[${key}]`, value)
            }
          })
        }

        const response = await fetch(`/api/table/page?${params.toString()}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        updateStats({ 
          total: data.totalRows,
          status: '✅ 加载成功'
        })

        return {
          list: data.list,
          totalRows: data.totalRows,
          summary: data.summary
        }
      } catch (error) {
        console.error('获取数据失败:', error)
        updateStats({ status: '❌ 加载失败' })
        return {
          list: [],
          totalRows: 0
        }
      }
    },
    // 获取筛选选项
    fetchFilterOptions: async ({ key }) => {
      try {
        const response = await fetch(`/api/table/filter-options?columnKey=${key}`)
        if (!response.ok) return []
        return await response.json()
      } catch (error) {
        console.error('获取筛选选项失败:', error)
        return []
      }
    },
    sidePanel: {
      enabled: true,
      defaultOpen: false,
      defaultPanel: 'columns',
      panels: []
    },
    onModeChange: (mode) => {
      updateStats({ mode })
    }
  }
} 

// ============== Client + API 模式配置 ========
async function getClientAPIConfig(): Promise<IUserConfig> {
  try {
    updateStats({ status: '⏳ 从后端加载数据...' })
    const response = await fetch('/api/table/all?limit=100000')
    const data = await response.json()

    updateStats({
      total: data.totalRows,
      status: '后端数据加载成功'
    })

    return {
      container: `#table-container`,
      tableHeight: 500,
      initialData: data.list,
      columns: [
        { key: 'id', title: 'ID', width: 80 },
        { key: 'name', title: '姓名', width: 120, filter: { type: 'text'} },
        { key: 'region', title: '区域', width: 100, filter: {type: 'set'}, sortable: true },
        { key: 'department', title: '部门', width: 120, filter: { type: 'set' } },
        { key: 'salary', title: '薪资', width: 120, sortable: true, summaryType: 'avg' },
        { key: 'status', title: '状态', width: 100, filter: { type: 'set' } },
        { key: 'joinDate', title: '入职日期', width: 120 }
      ],
      sidePanel: {
        enabled: true,
        defaultOpen: false,
        defaultPanel: 'columns',
        panels: []
      },
      onModeChange: (mode: any) => {
        updateStats({ mode })
      }
    }
  } catch (error) {
    console.error('获取全量数据失败: ', error)
    return getClientConfig()
  }

}

// ============ 初始化表格 ============
async function initTable(mode: 'client' | 'server' | 'client-api') {
  currentMode = mode
  
  // 销毁旧表格
  if (currentTable) {
    currentTable.destroy()
    currentTable = null
  }

  // 清空容器
  const container = document.getElementById('table-container')
  if (container) {
    container.innerHTML = ''
  }

  updateStats({ status: '⏳ 初始化中...' })

  // 创建新表格
  let config: IUserConfig
  if (mode === 'client') {
    config = getClientConfig()

  } else if (mode === 'server') {
    config = getServerConfig()

  } else {
    // client-api 
    config = await getClientAPIConfig()
  }

  currentTable = new VirtualTable(config)

  await currentTable.ready

  updateStats({ 
    status: '✅ 就绪',
    total: mode === 'client' ? 50000 : '-'
  })
}

// ============ 更新统计信息 ============
function updateStats(stats: {
  mode?: string
  total?: number | string
  visible?: number | string
  status?: string
}) {
  if (stats.mode) {
    const el = document.getElementById('stat-mode')
    if (el) el.textContent = stats.mode === 'client' ? 'Client（本地）' : 'Server（API）'
  }
  if (stats.total !== undefined) {
    const el = document.getElementById('stat-total')
    if (el) el.textContent = typeof stats.total === 'number' 
      ? stats.total.toLocaleString() 
      : stats.total
  }
  if (stats.visible !== undefined) {
    const el = document.getElementById('stat-visible')
    if (el) el.textContent = String(stats.visible)
  }
  if (stats.status) {
    const el = document.getElementById('stat-status')
    if (el) el.textContent = stats.status
  }
}

// ============ 页面初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  // 模式切换按钮
  const modeButtons = document.querySelectorAll('.mode-btn')
  const modeInfo = document.getElementById('mode-info')
  const modeBadge = document.getElementById('mode-badge')
  const clientControls = document.getElementById('client-controls')
  const serverControls = document.getElementById('server-controls')

  modeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-mode') as 'client' | 'server' | 'client-api'
      
      // 更新按钮状态
      modeButtons.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      // 更新信息提示
      if (modeInfo) {
        if (mode === 'client') {
          modeInfo.innerHTML = '<strong>Client 模式：</strong>使用 10 万条本地数据，前端内存计算排序/筛选，适合中小数据量'

        } else if (mode === 'client-api') {
          modeInfo.innerHTML = '<strong>Client-API 模式: 从后端一次性加载全量数据到前端, 前端内存计算</strong'

        } else {
          modeInfo.innerHTML = '<strong>Server 模式：</strong>从后端 API 分页加载数据，后端处理排序/筛选，适合大数据量'
        }
      }

      // 更新徽章
      if (modeBadge) {
        if (mode === 'client') {
          modeBadge.textContent = 'Client'
          modeBadge.className = 'badge badge-client'

        } else if (mode === 'client-api') {
          modeBadge.textContent = 'Client-API'
          modeBadge.className = 'badge badge-client'

        } else {
          modeBadge.textContent = 'Server'
          modeBadge.className = 'badge badge-server'
        }
      }

      // 切换控制面板
      if (clientControls && serverControls) {
        if (mode === 'client') {
          clientControls.style.display = 'flex'
          serverControls.style.display = 'none'

        } else {
          clientControls.style.display = 'none'
          serverControls.style.display = 'flex'
        }
      }

      // 初始化表格
      await initTable(mode)
    })
  })

  // ============ Client 模式控制 ============
  const btnClientReset = document.getElementById('btn-client-reset')
  const btnClientSort = document.getElementById('btn-client-sort')

  btnClientReset?.addEventListener('click', async () => {
    if (currentMode === 'client') {
      await initTable('client')
    }
  })

  btnClientSort?.addEventListener('click', () => {
    if (currentTable && currentMode === 'client') {
      currentTable.sort('salary', 'desc')
      updateStats({ status: '✅ 已按薪资降序排序' })
    }
  })

  // ============ Server 模式控制 ============
  const serverFilterInput = document.getElementById('server-filter-input') as HTMLInputElement
  const btnServerFilterRegion = document.getElementById('btn-server-filter-region')
  const btnServerSort = document.getElementById('btn-server-sort')
  const btnServerClear = document.getElementById('btn-server-clear')

  btnServerFilterRegion?.addEventListener('click', () => {
    if (currentTable && currentMode === 'server') {
      currentTable.dispatch({
        type: 'COLUMN_FILTER_SET',
        payload: { 
          key: 'region', 
          filter: { kind: 'set', values: ['华东'] }
        }
      })
      updateStats({ status: '✅ 已筛选：华东' })
    }
  })

  btnServerSort?.addEventListener('click', () => {
    if (currentTable && currentMode === 'server') {
      currentTable.sort('salary', 'desc')
      updateStats({ status: '✅ 已按薪资降序排序' })
    }
  })

  btnServerClear?.addEventListener('click', () => {
    if (currentTable && currentMode === 'server') {
      currentTable.dispatch({ type: 'CLEAR_FILTER_TEXT' })
      if (serverFilterInput) serverFilterInput.value = ''
      updateStats({ status: '✅ 已清空筛选' })
    }
  })

  serverFilterInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentTable && currentMode === 'server') {
      const value = serverFilterInput.value.trim()
      if (value) {
        currentTable.dispatch({
          type: 'COLUMN_FILTER_SET',
          payload: { 
            key: 'name', 
            filter: { kind: 'text', value }
          }
        })
        updateStats({ status: `✅ 已筛选：${value}` })
      }
    }
  })

  // 默认初始化 Client 模式
  initTable('client')
})
