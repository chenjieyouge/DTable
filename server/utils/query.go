package utils

import (
	"strings"

	"div_table_server/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// LIKE 的转义字符。
//
// 特意不用反斜杠: NO_BACKSLASH_ESCAPES 模式下, SQL 文本里的 '\\' 字面量
// 不再代表单个反斜杠, ESCAPE '\\' 会因为"escape 必须是单个字符"而直接报错。
// 感叹号没有这层歧义。
const LikeEscapeChar = "!"

// BuildLikePattern 把用户输入包成子串匹配的 LIKE 模式串, 并转义通配符。
//
// 不转义的后果: 输入 "%" 会匹配全部行, 输入 "_" 会匹配任意单字符。
// 界面表现是"筛选没生效", 而不是报错 —— 属于最难被发现的那类问题。
func BuildLikePattern(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('%')

	for _, r := range s {
		// 转义字符自身必须先转义, 否则用户输入的 "!" 会把后一个字符吃掉
		if r == '%' || r == '_' || string(r) == LikeEscapeChar {
			b.WriteString(LikeEscapeChar)
		}
		b.WriteRune(r)
	}

	b.WriteByte('%')
	return b.String()
}

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
			// 文本筛选: 子串匹配。
			//
			// 必须和客户端 ClientDataStrategy 的 text 语义一致 —— 那边是
			// 不区分大小写的 includes()。这里若做成精确匹配, 同一个输入框
			// 在两种模式下会给出完全不同的结果(实测筛 "郑州": 子串命中
			// 158362 行, 精确匹配命中 0 行), 而且不报错, 只是数据不一样。
			//
			// 代价: 前置通配符用不上索引, 百万行下是全表扫 —— 这是刻意取舍,
			// 精确匹配请走 set 筛选(in 查询, 能走索引)。
			db = db.Where(col+" LIKE ? ESCAPE '"+LikeEscapeChar+"'", BuildLikePattern(v))

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
