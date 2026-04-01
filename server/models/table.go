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

type FilterOptionsBody struct {
	Columnkey string                 `json:"columnKey" binding:"required"`
	Filters   map[string]interface{} `json:"filters"`
}
