# DTable · 轻量化虚拟滚动表格

> **零依赖 · < 50KB gzip · 百万行 60fps · 对标 ag-grid 的交互体验**

DTable 是一个纯 TypeScript + DOM 实现的轻量级虚拟滚动表格库，专为"大数据量 + 极致流畅"而生。
没有框架绑定、没有运行时依赖、没有构建包袱 —— 一个 `<script>` 或一行 import，百万行数据即刻起飞。

[![npm](https://img.shields.io/npm/v/@youge/dtable)](https://www.npmjs.com/package/@youge/dtable)
[![license](https://img.shields.io/npm/l/@youge/dtable)](./LICENSE)
![bundle](https://img.shields.io/badge/gzip-%3C%2050KB-00b42a)
![tests](https://img.shields.io/badge/tests-97%20passed-165dff)

---

## 为什么选 DTable？

| 对比维度 | **DTable** | 传统大表格方案（如 ag-grid） |
|---|---|---|
| 打包体积 | **JS gzip < 50KB**，零依赖 | 数百 KB ~ 1MB+，需要配套样式/模块 |
| 上手成本 | 1 个类、20 行代码 | 复杂配置体系，学习曲线陡 |
| 大数据渲染 | 双轴虚拟化 + 行池复用，百万行流畅 | 同样虚拟化，但体积与复杂度更高 |
| 能力覆盖 | 排序/筛选/分组/编辑/合并/透视/双模式 | 功能全，但大多要付费版 |
| 许可 | **MIT 免费商用** | 企业版收费 |

**核心主张**：把 ag-grid 级别的交互体验，压缩进一个 `<50KB`、零依赖、MIT 许可的包里。

---

## 特性一览

| 能力 | 说明 |
|---|---|
| 🚀 **双轴虚拟化** | 纵向行虚拟化 + **横向列虚拟化**（仅渲染可见列 ± 缓冲），横向/纵向滚动都只动必要 DOM |
| 🔁 **行池化复用** | 滚动时行 DOM 节点回收复用，滚动 100 万行也不会无限累积节点 |
| 📏 **可变行高** | `rowHeight` 支持固定值或 `(rowIndex) => number` 回调，懒计算 + 前缀和二分定位 |
| 🧩 **渲染器组件化** | 单元格支持 `string / HTMLElement / 组件(mount/update/destroy)` 三态，生命周期自动管理 |
| 🔀 **多列排序** | Shift + 点击叠加多列排序，排序指示器带序号徽标；`table.setSorts()` 编程式控制 |
| 🗂️ **行分组** | `groupBy` 一维/多维分组，组头折叠/展开/全收全展（`collapseAllGroups` / `expandAllGroups`） |
| ✏️ **内联编辑** | 双击编辑，内置 text/number 编辑器或自定义工厂，Enter 提交 / Esc 取消，`onCellValueChange` 回调 |
| 🧲 **单元格合并** | `colSpan` / `rowSpan` 回调，跨列/跨行合并，被覆盖单元格自动跳过 |
| 📊 **双模式** | Client（全量内存，前端排序/筛选/汇总）/ Server（分页 API，后端计算）无缝切换 |
| 📐 **透视表** | 多层行/列分组、聚合、展开折叠，内置免费 |
| 🔍 **多维筛选** | set / text / dateRange / numberRange 四种筛选类型，Column 级漏斗指示 |
| 🎛️ **列管理** | 拖拽排序、显隐、**冻结列**、宽度调整 |
| ⚡ **零依赖** | 纯原生 TS + DOM，无框架、无运行时库，gzip < 50KB |

---

## 快速开始

### 安装

```bash
npm install @youge/dtable
# 或
pnpm add @youge/dtable
```

```ts
import { VirtualTable } from '@youge/dtable'
import '@youge/dtable/style.css' // 必须
```

### Client 模式（本地数据，20 行代码跑起来）

```ts
const table = new VirtualTable({
  container: '#app',
  initialData: [
    { name: '张三', dept: '研发部', sales: 12000 },
    { name: '李四', dept: '运营部', sales: 8500 },
    // ...几十万行也可以, 全部在浏览器内存里
  ],
  columns: [
    { key: 'name',  title: '姓名' },
    { key: 'dept',  title: '部门', filter: { type: 'set' } },
    { key: 'sales', title: '销售额', summaryType: 'sum', sortable: true },
  ],
  rowHeight: 32,
})
await table.ready
```

### Server 模式（分页 API，百万行起步）

```ts
const table = new VirtualTable({
  container: '#app',
  columns: [{ key: 'id', title: 'ID' }, /* ... */],
  pageSize: 500,
  fetchPageData: async (pageIndex, query) => {
    const res = await fetch('/api/table/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageIndex, pageSize: 500, query }),
    })
    return res.json() // { list, totalRows }
  },
})
```

---

## 性能

同数据、同视口下的实测（`bench.html` 自动跑 ag-grid 社区版 A/B 对照，浏览器自动化环境，相对可比）：

| 指标 | **DTable** | ag-grid | 说明 |
|---|---|---|---|
| 滚动 300 帧 p50 | 19.9ms | 18.0ms | 同量级 |
| 滚动 300 帧 p95 | 36.2ms | 36.1ms | 几乎一致 |
| 初始化 ready | 9.1ms | 3387ms | 5 万行, ag-grid 全量建模型 |
| 初始 DOM 行数 | 约 40 | 28 | 双方均虚拟化 |

> 自动化环境帧率本身有损耗，真实浏览器两者都会明显更好；相对对比不受影响。
> 纵向 50 万行 Client 深滚动、100 万行 Server 分页按需加载均有自动化测试覆盖（QA）。

---

## 本地体验（启动即完整功能）

```bash
pnpm install
pnpm dev        # 打开 http://localhost:5173
```

打开首页**自动加载 20 万行真实零售数据**，无需任何操作即可体验：
排序（Shift 多列）· 筛选 · 双击编辑 · 行分组折叠 · 单元格合并 · 列管理/冻结列 · 横向/纵向虚拟化滚动。
点绿色 **"功能演示"** 按钮一键切换到分组/编辑/合并/多列排序的完整演示数据集。

- **百万行实测**：下拉选"全部 104 万"或切换 **Server 模式**（连本地 MySQL）。
- **Server 后端**：`server/` 目录（Go + Gin），本地 MySQL 建库导入 `server/db.sql` 后 `go run .` 即启，默认 `:8080`，`/api/table/page` 分页接口。
- **性能基准**：`http://localhost:5173/bench.html?rows=500000&cols=8`，末尾自动跑 ag-grid A/B。

---

## QA 与测试

自动化测试基于 vitest + happy-dom，覆盖虚拟化、行池复用、可变行高、渲染器生命周期、
多列排序、行分组、内联编辑、单元格合并、列配置变化，以及 50 万行 Client / 100 万行 Server 场景，
并新增 **Excel 级数据透视表**专项回归（值列命名「求和项:字段」、字段面板勾选/值字段设置、
右键菜单、展开状态记忆、键盘导航/单元格选择/Ctrl+C 复制、状态持久化、导出 Excel）：

```bash
pnpm test                                  # 全部 97 个测试
pnpm vitest run tests/pivot-persist.test.ts # 透视表持久化 + 大数据保护
pnpm build                                 # tsc + vite 构建
```

---

## API 速查（对标 ag-grid 的关键扩展）

```ts
interface IColumn {
  key: string; title: string
  width?: number; sortable?: boolean
  filter?: { type: 'set' | 'text' | 'dateRange' | 'numberRange' }
  summaryType?: 'sum' | 'avg' | 'count' | 'none'
  render?: (value, row, rowIndex) => string | HTMLElement | ICellRenderer   // 组件化渲染
  editable?: boolean | ((value, row, rowIndex) => boolean)                  // 内联编辑
  editor?: 'text' | 'number' | (ctx) => ICellEditor                          // 编辑器
  colSpan?: (value, row, rowIndex) => number                                // 跨列合并
  rowSpan?: (value, row, rowIndex) => number                                // 跨行合并
}

interface IConfig {
  rowHeight?: number | ((rowIndex: number) => number)  // 可变行高
  groupBy?: string[]                                    // 行分组
  bufferCols?: number                                   // 横向缓冲列数（默认 2）
  onCellValueChange?: (key, rowIndex, newValue, oldValue, row) => void
}

// 表格实例方法
table.setSorts([{ key: 'dept', direction: 'asc' }, { key: 'sales', direction: 'desc' }])
table.collapseAllGroups()
table.expandAllGroups()
```

---

## 浏览器兼容性

Chrome 80+ · Firefox 75+ · Safari 13+ · Edge 80+，现代浏览器全支持。

---

## License

MIT
