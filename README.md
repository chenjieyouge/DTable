# DTable — 高性能虚拟滚动表格组件

> 面向大数据分析、报表与 BI 场景的前端表格解决方案，基于原生 TypeScript 实现，无任何 UI 框架依赖。

## 应用场景

- **大数据量展示**：百万级行数据的流畅渲染与交互，财务报表、销售数据、运营看板
- **数据分析报表**：多维分组聚合透视、动态字段配置、条件格式高亮
- **企业管理后台**：员工数据、订单列表、日志查询等需要灵活筛选排序的场景
- **嵌入式 BI**：支持 Client / Server 两种数据模式，可独立部署也可集成到现有系统

---

## 核心特性

### 🚀 虚拟滚动引擎
- 仅渲染可视区 DOM，行数从 1 万到 100 万无感知卡顿
- 增量更新策略：新进入可视区的行创建，离开的行销毁，无全量重绘
- 可配置缓冲区行数与最大缓存页数，平衡内存与流畅度

### 📊 双模式数据架构
| 模式 | 数据来源 | 适用场景 |
|------|----------|----------|
| **Client 模式** | 一次性加载全量数据，客户端处理排序/筛选/聚合 | 数据量 ≤ 50w，分析场景，响应极快 |
| **Server 模式** | 分页 API，每次交互请求后端 | 数据量无上限，实时数据，权限管控 |

### 🔍 多维筛选
- **Set 筛选**：下拉多选，适合枚举类字段（地区、状态、部门）
- **文本筛选**：模糊匹配，适合姓名、编号等字段
- **数值范围筛选**：min/max 区间，适合金额、年龄等
- **日期范围筛选**：起止日期选择，适合入职日期、账期等

### 📐 透视表（Pivot Table）
- 支持最多 5 层嵌套行分组，递归树形展示
- 内置聚合：`sum` / `avg` / `count` / `max` / `min`
- 展开/折叠节点，吸顶分组行，面包屑导航
- 透视模式与普通表格无缝切换，数据共享
- 虚拟滚动透视渲染，大分组数据依然流畅

### 🎛️ 列管理面板
- 拖拽调整列顺序
- 显示/隐藏列
- 列宽调整，自动持久化到 `localStorage`
- 冻结列支持

### 💅 条件格式与自定义渲染
```typescript
cellStyle: (value, row) => value < 0 ? { color: 'red' } : null,
render: (value, row) => `<span class="tag">${value}</span>`
```

### ⚡ 性能设计
- 开发模式内置性能监控（`PerformanceMonitor`）
- 列类型自动推断（`inferColumnTypes`），无需手动标注
- Store 订阅白名单机制，避免未知 Action 触发全量重绘
- 列宽、列顺序本地持久化，刷新后自动恢复

---

## 快速开始

```bash
pnpm install
pnpm dev
```

```typescript
import { VirtualTable } from '@/table/VirtualTable'

// Client 模式：传入全量数据
const table = new VirtualTable({
  container: '#app',
  initialData: myData,          // Record<string, any>[]
  columns: [
    { key: 'name',   title: '姓名', filter: { type: 'text' } },
    { key: 'region', title: '区域', filter: { type: 'set' }, sortable: true },
    { key: 'salary', title: '薪资', summaryType: 'avg' },
  ],
})

// Server 模式：传入分页 fetch 函数
const table = new VirtualTable({
  container: '#app',
  columns: [...],
  fetchPageData: async (pageIndex, query) => {
    return fetch(`/api/table/page`, { method: 'POST', body: JSON.stringify({ pageIndex, ...query }) })
  },
  fetchFilterOptions: async ({ key, query }) => { ... },
})
```

---

## 技术栈

- **TypeScript** — 全量类型覆盖，无运行时框架
- **Vite** — 构建与开发服务器
- **原生 DOM API** — 零框架依赖，可嵌入任意技术栈
- **Go + Gin + MySQL**（可选后端）— 提供 Server 模式演示接口

---

## 项目结构

```
src/
├── table/
│   ├── VirtualTable.ts        # 主协调类
│   ├── core/                  # 查询协调、生命周期、状态同步
│   ├── data/                  # Client/Server 数据策略
│   ├── pivot/                 # 透视表引擎
│   ├── panel/                 # 右侧面板系统
│   ├── interaction/           # 排序、筛选、列宽交互
│   └── viewport/              # 虚拟滚动视口
├── types/                     # 类型定义
├── api/                       # 后端接口封装
└── utils/                     # 工具函数
```