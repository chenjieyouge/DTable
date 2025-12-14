// 模拟生成后端分页数据

/**
 * 模拟分页 API
 * @param pageIndex 页码从 0 开始
 * @param pageSize  每页的数量
 * @param totalRows 总行数
 * @returns Promise<{ list: Record<string, any>[]>, totalRows: number }>
 */

export async function mockFechPageData(
  pageIndex: number,
  pageSize: number,
  totalRows: number
): Promise<{ list: Record<string, any>[]; totalRows: number }> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000 + 50))

  const start = pageIndex * pageSize
  const end = Math.min(start + pageSize, totalRows)

  if (start >= totalRows) {
    return { list: [], totalRows }
  }

  const list = []
  for (let i = start; i < end; i++) {
    list.push(generateRow(i))
  }

  return { list, totalRows }
}

// 生成模拟数据行
function generateRow(rowIndex: number) {
  return {
    name: `员工${(rowIndex + 1).toLocaleString()}`,
    dept: ['市场部', '销售部', '生产部'][rowIndex % 3],
    region: ['华南', '华东', '华北'][rowIndex % 3],
    sales: `¥${(5 + Math.random() * 20).toFixed(1)}万`,
    cost: `¥${(2 + Math.random() * 10).toFixed(1)}万`,
    profit: `¥${(1 + Math.random() * 10).toFixed(1)}万`,
  }
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
