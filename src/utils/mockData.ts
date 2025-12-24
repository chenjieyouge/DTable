
import { IPageResponse, ITableQuery } from "@/types";

// 模拟生成后端分页数据, 全局 filter / sort 后分页 + totalRows

/**
 * 模拟分页 API
 * @param pageIndex 页码从 0 开始
 * @param pageSize  每页的数量
 * @param totalRows 总行数
 * @param query?: ITableQuery 全局的筛选排序条件
 * @returns Promise<{ list: Record<string, any>[]>, totalRows: number }>
 */

export async function mockFechPageData(
  pageIndex: number,
  pageSize: number,
  totalRows: number,
  query?: ITableQuery
): Promise<IPageResponse> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000 + 50))
  // 1. 解析筛选条件, 模拟实现 "全局筛选后分页", 约定按照 rowIndex % 3 分组
  const remainder = pickRemainderByFilter(query?.filterText)
  // 2. 计算筛选后的总行数, 避免还是原来的 totalRows, 防滚动空白
  const filteredTotalRows = calcFilteredTotalRows(totalRows, remainder)

  // 3. 组装改页数据, 注意这里的 "逻辑行号" 是 筛选 + 排序后 的序号 seq
  const list: Record<string, any>[] = []
  const start = pageIndex * pageSize 
  const end = Math.min(start + pageSize, filteredTotalRows)

  // 4. 排序, 也要 "全局排序后分页", 约定 sales 与 rowIndex 单调相关, 方便计算
  const isDesc = query?.sortKey === 'sales' && query.sortDirection === 'desc'
  for (let logicalIndex = start; logicalIndex < end; logicalIndex++) {
    // logicalIndex 表示 "筛选+排序" 后的序号
    const mapped = mapLogicalIndexToRowIndex(logicalIndex, filteredTotalRows, remainder, isDesc)
    // 痛处返回 seq (筛选后的序号) 与 id (原始行号), 便于俺肉眼验证效果
    list.push(generateRow(mapped.rowIndex, mapped.seq))
  }

  return { list, totalRows }
}

// 生成模拟数据行, rowIndex 是原始行号, seq 是 "筛选+排序"后的行号
function generateRow(rowIndex: number, seq: number) {
  const region = ['华南', '华东', '华北'][rowIndex % 3]
  const dept = ['市场部', '销售部', '生产部'][rowIndex % 3]
  const product = ['AI智能手机', 'AI学习平板', 'AI眼镜'][rowIndex % 3]
  const sales = rowIndex // 约定让它单调递增, 方便模拟 "全局排序后分页"
  const cost = (rowIndex * 16) % 5000 // 成本/利润页做成确定性
  const profit = sales - cost

  return {
    seq,
    id: rowIndex + 1,
    name: `员工${(rowIndex + 1).toLocaleString()}`,
    dept,
    region,
    product,
    sales,
    cost,
    profit
  }
}

// 辅助函数 
// 用户选了 "华东", 则对应 remainder 就是 1
function pickRemainderByFilter(filterText?: string) {
  const text = (filterText ?? '').trim()
  if (!text) return null 
  // 已约定了, region, dept, product 都是 rowIndex % 3 因此可统一映射
  const mapping: Record<string, 0 | 1 | 2> = {
    '华南': 0, '华东': 1, '华北': 2,
    '市场部': 0, '销售部': 1, '生产部': 2,
    'AI智能手机': 0, 'AI学习平板': 1, 'AI眼镜': 2
  }
  // 支持输入框模糊搜索, 如筛选包含 "华东"
  for (const key of Object.keys(mapping)) {
    if (text.includes(key)) return mapping[key]
  }
  return null 
}

// 计算过滤后的总行数  
// 如 有 100条数据, 华东:1, 只要华东则, 1, 4, 7 ... 共有 (100 -1) / 3 + 1 = 34 行数据
function calcFilteredTotalRows(totalRows: number, remainder: 0 | 1 | 2 | null) {
  if (remainder === null) return totalRows
  if (totalRows <= 0) return 0
  if (remainder > totalRows - 1) return 0
  // 统计 [0, totalRows] 中满足 i % 3 ==== remainder 的数量 (过滤)
  return Math.floor((totalRows - 1 - remainder) / 3) + 1
}

// 记录原始行号, 筛选过滤后的行号
function mapLogicalIndexToRowIndex(
  logicalIndex: number,
  filteredTotalRows: number,
  remainder: 0 | 1 | 2 | null,
  isDesc: boolean
) {
  // desc 时将逻辑序号反过来, 映射到 rowIndex 
  const k = isDesc ? filteredTotalRows - 1 - logicalIndex : logicalIndex
  // sqe 是筛选+排序后的连续序号, 从 1 开始更直观
  const seq = logicalIndex + 1
  if (remainder === null) {
    return { rowIndex: k, seq }
  }
  // 有筛选
  return { rowIndex: remainder + 3 * k, seq}
}

// 总结行模拟
export function mockFechSummaryData(): Promise<Record<string, any>> {
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
}

// test
// mockFechPageData(1, 100, 1000).then((res) => console.log(res))
