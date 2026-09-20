package models

import "time"

// TableData 表格数据模型
type TableData struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Name       string    `gorm:"size:100" json:"name"`
	Age        int       `json:"age"`
	Region     string    `gorm:"size:50" json:"region"`
	Department string    `gorm:"size:100" json:"department"`
	Salary     float64   `json:"salary"`
	Status     string    `gorm:"size:20" json:"status"`
	JoinDate   time.Time `json:"joinDate"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (TableData) TableName() string {
	return "table_data"
}

// allowedColumns 允许出现在 SQL 中的字段白名单: 接口字段名 -> 数据库列名
//
// 为什么必须有: 排序字段名和筛选字段名会被拼进 SQL 语句文本,
// 参数绑定(?)只能保护"值", 保护不了"字段名"。例如:
//
//	sort = "name;DROP TABLE table_data--:asc"
//	filter = {"region) UNION SELECT ...--": "x"}
//
// 新增 TableData 字段时, 记得在这里同步登记, 否则该字段无法排序/筛选。
var allowedColumns = map[string]string{
	"id":         "id",
	"name":       "name",
	"age":        "age",
	"region":     "region",
	"department": "department",
	"salary":     "salary",
	"status":     "status",
	"joinDate":   "join_date", // 接口用驼峰, 数据库是下划线, 需要映射
	"createdAt":  "created_at",
	"updatedAt":  "updated_at",
}

// ResolveColumn 把请求里传来的字段名解析成数据库列名。
// 不在白名单中的一律拒绝, 返回 ok=false, 调用方必须据此放弃该字段。
func ResolveColumn(name string) (string, bool) {
	col, ok := allowedColumns[name]
	return col, ok
}

// 分页响应结构, 对应前端 IPageResponse
type PageResponse struct {
	List      []TableData            `json:"list"`
	TotalRows int64                  `json:"totalRows"`
	Summary   map[string]interface{} `json:"summary,omitempty"`
}

// 查询参数
type QueryParms struct {
	PageIndex int                    ` form:"pageIndex" binding:"gte=0"`
	PageSize  int                    `form:"pageSize" binding:"required,max=100000"` // 10w一页试试
	Sort      string                 `form:"sort"`                                   // 格式: "name:asc" 或 "age:desc"
	Filter    map[string]interface{} `form:"filter"`                                 // 筛选条件
}

// post 请求体结构 (用于分页 和 筛选项接口)
type PageQueryBody struct {
	PageIndex int                    `json:"pageIndex" binding:"gte=0"`
	PageSize  int                    `json:"pageSize" binding:"omitempty,min=1,max=100000"`
	Sort      string                 `json:"sort"`
	Filters   map[string]interface{} `json:"filters"`
}

// 筛选选项接口的参数 (路由为 GET, 故用 form 标签从 query string 绑定)
type FilterOptionsBody struct {
	Columnkey string                 `form:"columnKey" binding:"required"`
	Filters   map[string]interface{} `form:"filters"`
}
