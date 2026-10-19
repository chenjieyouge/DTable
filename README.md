# DTable · 轻量化虚拟滚动表格

> **零依赖 · < 50KB gzip · 百万行 60fps · 对标 ag-grid 商业版的交互体验**

DTable 是一个纯 TypeScript + DOM 实现的轻量级虚拟滚动表格库，专为"大数据量 + 极致流畅"而生。
没有框架绑定、没有运行时依赖、没有构建包袱 —— 一个 `<script>` 或一行 import，百万行数据即刻起飞。

**ag-grid 商业版的核心能力，这里免费内置**：全局快速筛选、**高级筛选（嵌套分组构建器，跨字段 AND/OR 无限分组）**、
明暗主题、行/单元格范围选择、自定义右键菜单、Excel 级透视表（钻取 / 条件格式 / 列总计 / 布局预设），
全部 MIT 免费商用。

[![npm](https://img.shields.io/npm/v/@youge/dtable)](https://www.npmjs.com/package/@youge/dtable)
[![license](https://img.shields.io/npm/l/@youge/dtable)](./LICENSE)
![bundle](https://img.shields.io/badge/gzip-%3C%2050KB-00b42a)
![tests](https://img.shields.io/badge/tests-162%20passed-165dff)

---

## 为什么选 DTable？

| 对比维度 | **DTable** | ag-grid 商业版（Enterprise） |
|---|---|---|
| 打包体积 | **JS gzip < 50KB**，零依赖 | 企业版数百 KB ~ 1MB+，模块众多 |
| 价格 | **MIT 免费商用** | **$999 / 开发者**，按年付更新 |
| 上手成本 | 1 个类、20 行代码 | 复杂配置体系，学习曲线陡 |
| 大数据渲染 | 双轴虚拟化 + 行池复用，百万行流畅 | 同样虚拟化，但体积与复杂度更高 |
| 透视表 | **Excel 级**：钻取/条件格式/列总计/布局预设 | 企业版功能，需付费 |
| 主题 | 浅色 / 暗色一键切换，CSS 变量 | 主题对象，需配套构建 |

**核心主张**：把 ag-grid 商业版的交互体验，压缩进一个 `<50KB`、零依赖、MIT 许可的包里。

---

## 特性一览

### 普通表格

| 能力 | 说明 |
|---|---|
| 🚀 **双轴虚拟化** | 纵向行虚拟化 + **横向列虚拟化**（仅渲染可见列 ± 缓冲），横向/纵向滚动都只动必要 DOM。百万行总高度超过浏览器上限时，自动压缩滚动条但**可见行始终保持真实行高**（对标 ag-grid 归一化滚动），绝不压扁文字 |
| 🔁 **行池化复用** | 滚动时行 DOM 节点回收复用，滚动 100 万行也不会无限累积节点 |
| 🔍 **全局快速筛选** | 顶部 Quick Filter，空格拆词、**每词都要命中（AND）**，不区分大小写，对标 ag-grid Quick Filter |
| 📋 **列筛选菜单** | ag-grid 化：搜索框 + 全选/清空快捷行 + 可滚动勾选列表 + 确定/取消 |
| 🧮 **高级筛选** | 对标 ag-grid 企业版 **Advanced Filter Builder**：分组下可继续嵌套分组，每组独立 AND/OR，条件 `字段 + 操作符 + 值`（文本/数值/日期全套操作符），输入即筛（300ms 防抖、Enter 立即应用）；与列筛选共存叠加。**Client 全在内存求值；Server 模式整棵树随分页请求发后端，递归翻译成参数化 SQL WHERE** |
| 🎨 **明暗主题** | 浅色 / 暗色一键切换，CSS 变量驱动，刷新自动恢复（`localStorage`） |
| 🖱️ **行选择** | 点击行单选整行、**Shift 区间批量选中**；复选框整行勾选，状态带锚点 |
| 🧩 **单元格范围选择** | 按下拖拽 / Shift 点击框选矩形区域，矩形边缘描边、活动单元格高亮，**Ctrl+C 一键复制 TSV** |
| 🗂️ **右键菜单** | 单元格 / 表头右键：复制（含表头）、固定列、列宽自适应、隐藏列、重置、排序、全选 |
| 📏 **可变行高** | `rowHeight` 支持固定值或 `(rowIndex) => number` 回调，懒计算 + 前缀和二分定位 |
| 🔀 **多列排序** | Shift + 点击叠加多列排序，排序指示器带序号徽标；`table.setSorts()` 编程式控制 |
| 🗂️ **行分组** | `groupBy` 一维/多维分组，组头折叠/展开/全收全展 |
| ✏️ **内联编辑** | 双击编辑，内置 text/number 编辑器或自定义工厂，Enter 提交 / Esc 取消 |
| 🧲 **单元格合并** | `colSpan` / `rowSpan` 回调，跨列/跨行合并，被覆盖单元格自动跳过 |
| 📊 **双模式** | Client（全量内存，前端排序/筛选/汇总）/ Server（分页 API，后端计算）无缝切换 |
| 🎛️ **列管理** | 拖拽排序、显隐、**冻结列**、宽度调整、列宽自适应 |

### 透视表（Excel / Power BI 级，免费内置）

| 能力 | 说明 |
|---|---|
| 🔽 **钻取 Drill Up/Down** | 双击组行向下钻取（只展开本分支、隐藏同级），面包屑导航条一键回退 |
| 🌈 **条件格式** | **色阶**（低红→中黄→高绿）/ **数据条**（横向渐变填充），对标 Power BI |
| ➕ **列总计** | 多级列分组最右侧自动生成**跨列总计列**，纵跨整个表头；可一键开关 |
| 📐 **布局预设** | 标准（含小计）/ 大纲（无小计）/ 紧凑（扁平）三种布局一键切换 |
| 🧱 **字段面板** | 字段勾选列表（文本→行、数值→值，带搜索）+ **筛选器/列/行/值四区拖拽** |
| ⚙️ **值字段设置** | 重命名 / 聚合方式（sum·count·avg·max·min）/ 数字格式（整数·小数·百分比） |
| 🧾 **小计/总计** | 每层分组自带小计、底部总计，分色粗线，数据行斑马纹 |
| 📋 **单元格选择** | 点击 / 矩形 / 方向键 / Shift 扩展，**Ctrl+C 复制 TSV**，直接粘进 Excel |
| 💾 **导出** | 一键导出 **CSV / Excel(.xls)**，总计/小计行原样保留 |

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

打开首页**自动加载 20 万行真实零售数据**，右侧列管理面板默认展开，无需任何操作即可体验：

- **普通表格**：全局快速筛选、**高级筛选（嵌套分组构建器，分组 AND/OR 无限嵌套）**、列筛选菜单、明暗主题、点击行 / Shift 区间选择、**框选复制**、右键菜单、双击编辑、列管理/冻结列、双轴虚拟化滚动。
- **透视表**：右侧面板顶部直接切到 **「透视表」平铺 Tab**（无需翻找开关）→ 双击钻取、色阶/数据条条件格式、列总计、标准/大纲/紧凑布局、四区拖拽、导出 CSV / Excel。

点绿色 **"功能演示"** 按钮可一键切换到分组/编辑/合并/多列排序的完整演示数据集。

- **百万行实测**：下拉选"全部 104 万"或切换 **Server 模式**（连本地 MySQL）。
- **Server 后端**：`server/` 目录（Go + Gin），本地 MySQL 建库导入 `server/db.sql` 后 `go run .` 即启，默认 `:8080`，`/api/table/page` 分页接口；排序、列筛选、**高级筛选（递归翻译为参数化 SQL）** 均由后端完成。
- **性能基准**：`http://localhost:5173/bench.html?rows=500000&cols=8`，末尾自动跑 ag-grid A/B。

---

## QA 与测试

自动化测试基于 vitest + happy-dom，共 **162 个用例**全绿，覆盖：

- 虚拟化、行池复用、可变行高、渲染器生命周期、多列排序、行分组、内联编辑、单元格合并、列配置变化；
- 50 万行 Client / 100 万行 Server 大数据场景（**含百万行可见行高不被压缩的回归断言**）；
- **高级筛选**：扁平条件、嵌套分组、26 个条件求值/构建器用例；
- **P1**：全局快速筛选（拆词 AND）、明暗主题、行选择增强、ag-grid 化筛选菜单；
- **P2**：透视表钻取、条件格式（色阶/数据条）、列总计、布局预设；
- **P3**：普通表格单元格范围选择、右键菜单、TSV 复制；
- **透视表专项**：值列命名、字段面板勾选/值字段设置、右键菜单、展开状态记忆、键盘导航、状态持久化、导出。

```bash
pnpm test                                  # 全部 162 个测试
pnpm vitest run tests/advanced-filter.test.ts   # 高级筛选/嵌套分组构建器
pnpm vitest run tests/p2-powerbi.test.ts    # 透视钻取/条件格式/列总计
pnpm vitest run tests/p3-range-context.test.ts # 范围选择/右键菜单
pnpm build                                 # tsc + vite 构建
```

---

## 数据透视表（Excel / Power BI 级体验，内置免费）

打开右侧列管理面板，顶部用 **「列管理 / 透视表」平铺 Tab** 一键切换，即可把普通表格变成 Excel 式数据透视表（首次进入自带"品牌 × 积分额"开箱默认，也可一键清空重来）：

### 钻取与布局（Power BI 同款）

| 能力 | 怎么用 |
|---|---|
| **钻取 Drill Down** | **双击组行** → 只展开本分支、隐藏同级；顶部面包屑导航条显示路径，点击回退 |
| **布局预设** | 面板「标准 / 大纲 / 紧凑」：标准含小计、大纲无小计、紧凑扁平（不合并同值） |
| **列总计** | 多级列分组最右侧自动生成跨列总计列，面板「显示列总计」一键开关 |
| **条件格式** | 面板「色阶 / 数据条」：色阶按值着色、数据条横向填充，直观对比大小 |

### 字段与交互（Excel 同款）

| 能力 | 怎么用 |
|---|---|
| **字段勾选列表** | 勾选文本字段自动进"行"区、数值字段自动进"值"区，取消勾选全域移除（带搜索框） |
| **四区域拖拽** | 把字段拖进"筛选器 / 列 / 行 / 值"，区域内拖拽排序，拖回字段池即移除 |
| **值字段设置** | 点值区字段 ⚙：重命名 / 聚合方式 / 数字格式 |
| **展开折叠** | 点组行 ▶▼ 展开/折叠；右键组行可展开/折叠该组、全部展开/折叠；状态自动记忆 |
| **单元格选择** | 点击选中、方向键移动、Shift 扩展矩形、Ctrl+C 复制（直接粘进 Excel） |
| **导出** | 一键导出 **CSV / Excel(.xls)**，总计/小计行原样保留 |

**键盘快捷键（Excel 同款）**：

| 按键 | 行为 |
|---|---|
| `↑ ↓ ← →` | 移动选中单元格 |
| `Shift + 方向键` | 扩展矩形选区 |
| `Ctrl/Cmd + A` | 全选 |
| `Ctrl/Cmd + C` | 复制选区为 TSV（Excel 可直接粘贴） |
| `Enter` | 展开/折叠选中的组行 |
| `Home / End` | 跳当前行首列 / 末列 |
| `Ctrl+Home / Ctrl+End` | 跳首行首列 / 末行末列 |
| `PageUp / PageDown` | 上下翻一页 |
| `Esc` | 取消选区 |

> 层级上限（多年业务经验）：行分组最多 **5 层**，列分组 **3–5 层**——层数再多反而看不清，既保性能又保可读性。

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
  enableRangeSelection?: boolean                        // 范围选择 + 复制, 默认 true
  theme?: 'light' | 'dark'                              // 主题
  showToolbar?: boolean                                 // 顶部工具条
  stripeRows?: boolean                                  // 斑马纹
  bufferCols?: number                                   // 横向缓冲列数（默认 2）
  onCellValueChange?: (key, rowIndex, newValue, oldValue, row) => void
}

// 表格实例方法
table.setSorts([{ key: 'dept', direction: 'asc' }, { key: 'sales', direction: 'desc' }])
table.autoSizeColumn('dept')
table.collapseAllGroups()
table.expandAllGroups()
```

---

## 浏览器兼容性

Chrome 80+ · Firefox 75+ · Safari 13+ · Edge 80+，现代浏览器全支持。

---

## License

MIT
