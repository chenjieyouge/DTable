package utils

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// 应用排序
func ApplySort(db *gorm.DB, sortStr string) *gorm.DB {
	if sortStr == "" {
		return db
	}

	// 格式: "name:asc" 或者 "age:desc"
	parts := strings.Split(sortStr, ":")
	if len(parts) != 2 {
		return db
	}

	field := parts[0]
	direction := strings.ToUpper(parts[1])

	if direction != "ASC" && direction != "DESC" {
		return db
	}

	return db.Order(fmt.Sprintf("%s %s", field, direction))
}

// 应用筛选条件
func ApplyFilters(db *gorm.DB, filters map[string]interface{}) *gorm.DB {
	for key, value := range filters {
		switch v := value.(type) {
		case string:
			// 文本筛选, 精准匹配
			db = db.Where(fmt.Sprintf("%s = ?", key), v)

		case []interface{}:
			// 数组筛选: in 查询
			db = db.Where(fmt.Sprintf("%s in ?", key), v)

		case map[string]interface{}:
			// 范围筛选: 支持 min/max
			if min, ok := v["min"]; ok {
				db = db.Where(fmt.Sprintf("%s >= ?", key), min)
			}

			if max, ok := v["max"]; ok {
				db = db.Where(fmt.Sprintf("%s <= ?", key), max)
			}
		}
	}

	return db
}
