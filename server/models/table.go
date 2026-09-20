package models

import "time"

// 表名常量: handler 里拼原生 SQL 时用, 避免出现硬编码字符串与模型漂移
const TableNameRetailSales = "retail_sales"

// RetailSales 门店零售数据 (百万级测试数据)
//
// 字段命名约定:
//   Go 字段名用英文, 保持代码可读;
//   数据库列名和 JSON 字段名都保持中文 —— 前端拿到的 key 与原始 xlsx 表头完全一致,
//   不需要任何字段映射, 也避免了中文列名在两端对不上的低级错误。
type RetailSales struct {
	ID uint64 `gorm:"primaryKey" json:"id"`

	// 注意用指针: 该列有 45 万行为 NULL(原始数据里是 '0000-00-00' 占位),
	// 用 time.Time 会在扫描时报错
	ActivateDate *time.Time `gorm:"column:激活日期" json:"激活日期"`

	Brand       string  `gorm:"column:品牌;size:50" json:"品牌"`
	Level2      string  `gorm:"column:二级;size:50" json:"二级"`
	Province    string  `gorm:"column:省;size:50" json:"省"`
	City        string  `gorm:"column:城市;size:50" json:"城市"`
	District    string  `gorm:"column:区县;size:50" json:"区县"`
	Store       string  `gorm:"column:门店;size:200" json:"门店"`
	Category    string  `gorm:"column:品类;size:50" json:"品类"`
	ChannelType string  `gorm:"column:渠道类型;size:50" json:"渠道类型"`
	MarketTier  string  `gorm:"column:市场层级;size:50" json:"市场层级"`
	Barcode     string  `gorm:"column:条码;size:50" json:"条码"`
	Quantity    int     `gorm:"column:销量" json:"销量"`
	Points      float64 `gorm:"column:积分额" json:"积分额"`
}

func (RetailSales) TableName() string {
	return TableNameRetailSales
}

// PageResponse 分页响应, 对应前端 IPageResponse
type PageResponse struct {
	List      []RetailSales         `json:"list"`
	TotalRows int64                 `json:"totalRows"`
	Summary   map[string]interface{} `json:"summary,omitempty"`
}

// QueryParms 查询参数 (GET 形式)
type QueryParms struct {
	PageIndex int                    `form:"pageIndex" binding:"gte=0"`
	PageSize  int                    `form:"pageSize" binding:"required,max=100000"`
	Sort      string                 `form:"sort"`   // 格式: "字段:asc"
	Filter    map[string]interface{} `form:"filter"`
}

// PageQueryBody post 请求体结构 (用于分页接口)
type PageQueryBody struct {
	PageIndex int                    `json:"pageIndex" binding:"gte=0"`
	PageSize  int                    `json:"pageSize" binding:"omitempty,min=1,max=100000"`
	Sort      string                 `json:"sort"`
	Filters   map[string]interface{} `json:"filters"`
}

// FilterOptionsBody 筛选选项接口的参数 (路由为 GET, 故用 form 标签从 query string 绑定)
type FilterOptionsBody struct {
	Columnkey string                 `form:"columnKey" binding:"required"`
	Filters   map[string]interface{} `form:"filters"`
}

// ============ 字段名白名单 ============
//
// 为什么必须有: 排序字段名和筛选字段名会被拼进 SQL 语句文本,
// 参数绑定(?)只能保护"值", 保护不了"字段名"。例如:
//
//	sort = "省;DROP TABLE retail_sales--:asc"
//	filter = {"省) UNION SELECT ...--": "x"}
//
// 新增字段时记得在这里同步登记, 否则该字段无法排序/筛选。
//
// 这里 key 与 value 相同(中文列名直接就是列名), 看似冗余,
// 但白名单的职责是"限制", 不是"重命名", 保留映射结构以后改名才不会漏。
var allowedColumns = map[string]string{
	"激活日期": "激活日期",
	"品牌":   "品牌",
	"二级":   "二级",
	"省":    "省",
	"城市":   "城市",
	"区县":   "区县",
	"门店":   "门店",
	"品类":   "品类",
	"渠道类型": "渠道类型",
	"市场层级": "市场层级",
	"条码":   "条码",
	"销量":   "销量",
	"积分额":  "积分额",
}

// ResolveColumn 把请求里传来的字段名解析成数据库列名。
// 不在白名单中的一律拒绝, 返回 ok=false, 调用方必须据此放弃该字段。
func ResolveColumn(name string) (string, bool) {
	col, ok := allowedColumns[name]
	return col, ok
}
