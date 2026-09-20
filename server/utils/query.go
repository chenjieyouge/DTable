package utils

import (
	"strings"

	"div_table_server/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 应用排序
//
// 排序字段名来自请求参数, 必须过白名单后才能进入 SQL；
// 列名一律用 clause.OrderByColumn 交给 GORM 加引号, 不做字符串拼接。
func ApplySort(db *gorm.DB, sortStr string) *gorm.DB {
	if sortStr == "" {
		return db
	}

	// 格式: "name:asc" 或者 "age:desc"
	parts := strings.Split(sortStr, ":")
	if len(parts) != 2 {
		return db
	}

	column, ok := models.ResolveColumn(parts[0])
	if !ok {
		return db
	}

	direction := strings.ToUpper(parts[1])
	if direction != "ASC" && direction != "DESC" {
		return db
	}

	return db.Order(clause.OrderByColumn{
		Column: clause.Column{Name: column},
		Desc:   direction == "DESC",
	})
}

// 应用筛选条件
//
// 筛选字段名同样来自请求, 非法字段一律跳过, 绝不拼进 SQL。
// 注意: 跳过意味着该条件不生效(返回的数据比预期多), 而不是报错。
func ApplyFilters(db *gorm.DB, filters map[string]interface{}) *gorm.DB {
	for key, value := range filters {
		column, ok := models.ResolveColumn(key)
		if !ok {
			continue
		}

		// 中文列名统一加反引号, 避免个别字符被 SQL 解析器误读。
		// column 来自白名单常量, 不是请求原文, 拼接安全; 值一律走 ? 占位符。
		col := "`" + column + "`"

		switch v := value.(type) {
		case string:
			// 文本筛选, 精准匹配
			db = db.Where(col+" = ?", v)

		case []interface{}:
			// 数组筛选: in 查询
			db = db.Where(col+" in ?", v)

		case map[string]interface{}:
			// 范围筛选: 支持 min/max
			if min, ok := v["min"]; ok {
				db = db.Where(col+" >= ?", min)
			}

			if max, ok := v["max"]; ok {
				db = db.Where(col+" <= ?", max)
			}
		}
	}

	return db
}
