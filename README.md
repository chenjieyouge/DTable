# dtable

轻量级虚拟滚动表格库，零依赖，支持百万行数据、透视表分析、Client/Server 双模式。

[![npm](https://img.shields.io/npm/v/@youge/dtable)](https://www.npmjs.com/package/@youge/dtable)
[![license](https://img.shields.io/npm/l/@youge/dtable)](./LICENSE)

---

## 安装

```bash
npm install @youge/dtable
# or
pnpm add @youge/dtable
```

```ts
// 引入 JS
import { VirtualTable } from '@youge/dtable'
// 引入样式（必须）
import '@youge/dtable/style.css'
```

---

## 快速上手

### Client 模式（本地数据，适合分析报表）

```ts
import { VirtualTable } from '@youge/dtable'
import '@youge/dtable/style.css'

const table = new VirtualTable({
  container: '#app',
  initialData: [
    { name: '张三', dept: '研发部', sales: 12000, profit: 3000 },
    { name: '李四', dept: '运营部', sales: 8500,  profit: 1500 },
    // ...更多数据
  ],
  columns: [
    { key: 'name',   title: '姓名' },
    { key: 'dept',   title: '部门', filter: { type: 'set' } },
    { key: 'sales',  title: '销售额', summaryType: 'sum', sortable: true },
    { key: 'profit', title: '利润',   summaryType: 'sum' },
  ],
})
```

### Server 模式（分页 API，适合大数据列表）

```ts
const table = new VirtualTable({
  container: '#app',
  columns: [
    { key: 'id',     title: 'ID' },
    { key: 'name',   title: '姓名', filter: { type: 'text' } },
    { key: 'region', title: '区域', filter: { type: 'set' }, sortable: true },
    { key: 'salary', title: '薪资', summaryType: 'avg' },
  ],
  fetchPageData: async (pageIndex, query) => {
    const res = await fetch(`/api/table?page=${pageIndex}`, {
      method: 'POST',
      body: JSON.stringify(query),
    })
    // 返回格式: { list: [...], totalRows: 100000 }
    return res.json()
  },
  fetchFilterOptions: async ({ key }) => {
    const res = await fetch(`/api/filter-options?key=${key}`)
    return res.json() // 返回 string[]
  },
})
```

### 启用透视表

```ts
// 在右侧面板中开启 Pivot 开关后，可通过拖拽配置
// 或直接通过代码控制
import { VirtualTable } from '@youge/dtable'
import '@youge/dtable/style.css'

const table = new VirtualTable({
  container: '#app',
  initialData: salesData,
  columns: [...],
  sidePanel: {
    enabled: true,
    defaultOpen: true,
    panels: [],
  },
})
```

---

## 核心特性

| 特性 | 说明 |
|------|------|
| 🚀 **虚拟滚动** | 仅渲染可视区 DOM，百万行数据流畅滚动 |
| 📊 **双模式** | Client（全量本地）/ Server（分页 API）无缝切换 |
| 📐 **透视表** | 多层行/列分组、聚合、展开折叠，免费功能 |
| 🔍 **多维筛选** | set / text / dateRange / numberRange 四种类型 |
| 🎛️ **列管理** | 拖拽排序、显隐、冻结、宽度持久化 |
| 💅 **自定义渲染** | `render` / `cellStyle` / `cellClassName` 回调 |
| ⚡ **零依赖** | 纯原生 TS + DOM，打包体积 < 50KB gzip |

---

## Column 配置

```ts
interface IColumn {
  key: string                   // 字段名（必填）
  title: string                 // 表头显示名（必填）
  width?: number                // 列宽，不填则自动计算
  sortable?: boolean            // 是否可排序
  filter?: {
    type: 'set' | 'text' | 'dateRange' | 'numberRange'
  }
  summaryType?: 'sum' | 'avg' | 'count' | 'none'
  render?: (value, row, rowIndex) => string | HTMLDivElement
  cellStyle?: (value, row, rowIndex) => Partial<CSSStyleDeclaration> | null
  cellClassName?: (value, row) => string
}
```

---

## 浏览器兼容性

支持所有现代浏览器（Chrome 80+、Firefox 75+、Safari 13+、Edge 80+）。

---

## License

MIT