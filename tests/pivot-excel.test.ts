import { describe, it, expect } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

/**
 * M1 透视表本体 Excel 化回归测试:
 * 1. 值列命名「求和项:字段」/「计数项:字段」等 (对标 Excel 值列头)
 * 2. 组行整行点击 展开/折叠
 * 3. Excel 斑马纹 (偶数数据行浅灰底 class)
 * 4. 多级列分组叶子列命名
 */

function mountPivot(config: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
  const table = new PivotTable(config, columns, data)
  const host = document.createElement('div')
  document.body.appendChild(host)
  table.mount(host)
  return { table, host }
}

describe('M1 透视表 Excel 化', () => {
  it('无列分组时值列表头显示「求和项:字段」', () => {
    const { host } = mountPivot(
      {
        enabled: true,
        rowGroups: ['省', '城市'],
        valueFields: [{ key: '金额', aggregation: 'sum' }],
      },
      [
        { key: '省', title: '省' },
        { key: '城市', title: '城市' },
        { key: '金额', title: '金额' },
      ],
      [
        { 省: '广东', 城市: '广州', 金额: 100 },
        { 省: '广东', 城市: '深圳', 金额: 200 },
        { 省: '浙江', 城市: '杭州', 金额: 50 },
      ],
    )

    const headers = host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-wrapper .vt-pivot-header-cell')
    expect(headers.length).toBeGreaterThan(0)
    expect(headers[0]?.textContent).toContain('求和项:金额')
  })

  it('非 sum 聚合使用对应 Excel 前缀: 计数项/平均值项', () => {
    const { host } = mountPivot(
      {
        enabled: true,
        rowGroups: ['省'],
        valueFields: [
          { key: '金额', aggregation: 'count' },
          { key: '单价', aggregation: 'avg' },
        ],
      },
      [
        { key: '省', title: '省' },
        { key: '金额', title: '金额' },
        { key: '单价', title: '单价' },
      ],
      [
        { 省: '广东', 金额: 100, 单价: 10 },
        { 省: '广东', 金额: 200, 单价: 20 },
      ],
    )

    const headers = host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-wrapper .vt-pivot-header-cell')
    expect(headers[0]?.textContent).toContain('计数项:金额')
    expect(headers[1]?.textContent).toContain('平均值项:单价')
  })

  it('组行整行点击切换展开/折叠', () => {
    const { host } = mountPivot(
      {
        enabled: true,
        rowGroups: ['省', '城市'],
        valueFields: [{ key: '金额', aggregation: 'sum' }],
      },
      [
        { key: '省', title: '省' },
        { key: '城市', title: '城市' },
        { key: '金额', title: '金额' },
      ],
      [
        { 省: '广东', 城市: '广州', 金额: 100 },
        { 省: '广东', 城市: '深圳', 金额: 200 },
        { 省: '浙江', 城市: '杭州', 金额: 50 },
      ],
    )

    // 初始: 广东组展开 → 广州/深圳数据行可见
    expect(host.textContent).toContain('广州')
    expect(host.textContent).toContain('深圳')

    // 点击广东组行 (冻结区第一行) → 折叠, 子行消失
    const groupRow = host.querySelector<HTMLDivElement>('.vt-pivot-group-row')
    expect(groupRow).toBeTruthy()
    groupRow!.click()

    expect(host.textContent).not.toContain('广州')
    expect(host.textContent).not.toContain('深圳')

    // 再点 → 展开, 子行恢复
    groupRow!.click()
    expect(host.textContent).toContain('广州')
  })

  it('Excel 斑马纹: 偶数全局索引数据行加 vt-pivot-zebra', () => {
    const { host } = mountPivot(
      {
        enabled: true,
        rowGroups: ['省', '城市'],
        valueFields: [{ key: '金额', aggregation: 'sum' }],
      },
      [
        { key: '省', title: '省' },
        { key: '城市', title: '城市' },
        { key: '金额', title: '金额' },
      ],
      [
        { 省: '广东', 城市: '广州', 金额: 100 },
        { 省: '广东', 城市: '深圳', 金额: 200 },
        { 省: '浙江', 城市: '杭州', 金额: 50 },
      ],
    )

    // 展平行序: 0=广东(组) 1=广州(data) 2=深圳(data) 3=广东小计 4=浙江(组) 5=杭州(data) 6=浙江小计 7=总计
    // 连续数据行: 广州(0→无) 深圳(1→有) 杭州(2→无); 组行/小计行不参与计数
    const zebraRows = host.querySelectorAll<HTMLDivElement>('.vt-pivot-zebra')
    const zebraTexts = Array.from(zebraRows).map((r) => r.textContent)
    expect(zebraTexts.some((t) => t?.includes('广州'))).toBe(false)
    expect(zebraTexts.some((t) => t?.includes('深圳'))).toBe(true)
    expect(zebraTexts.some((t) => t?.includes('杭州'))).toBe(false)
    expect(zebraTexts.some((t) => t?.includes('深圳'))).toBe(true)
    expect(zebraTexts.some((t) => t?.includes('杭州'))).toBe(false)
  })

  it('多级列分组时叶子列头显示「求和项:字段」', () => {
    const { host } = mountPivot(
      {
        enabled: true,
        rowGroups: ['省'],
        colGroups: ['品类'],
        valueFields: [{ key: '金额', aggregation: 'sum' }],
      },
      [
        { key: '省', title: '省' },
        { key: '品类', title: '品类' },
        { key: '金额', title: '金额' },
      ],
      [
        { 省: '广东', 品类: '手机', 金额: 100 },
        { 省: '广东', 品类: '手表', 金额: 200 },
        { 省: '浙江', 品类: '手机', 金额: 50 },
      ],
    )

    // 列树: 手机 / 手表 → 叶子层显示求和项:金额
    const headers = host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-wrapper .vt-pivot-header-cell')
    const leafTexts = Array.from(headers).map((h) => h.textContent ?? '')
    // 顶层: 品类值; 叶子层: 求和项:金额
    expect(leafTexts.some((t) => t.includes('手机'))).toBe(true)
    expect(leafTexts.some((t) => t.includes('求和项:金额'))).toBe(true)
  })
})
