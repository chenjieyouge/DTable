package models_test

import (
	"testing"

	"div_table_server/models"
)

// 字段名白名单是这类 SQL 注入的唯一防线:
// 请求里的字段名会被拼进 SQL 语句文本, 参数绑定(?)只能保护"值", 保护不了"字段名"。
func TestResolveColumnAcceptsSchemaFields(t *testing.T) {
	cols := []string{
		"激活日期", "品牌", "二级", "省", "城市", "区县", "门店",
		"品类", "渠道类型", "市场层级", "条码", "销量", "积分额",
	}

	for _, c := range cols {
		got, ok := models.ResolveColumn(c)
		if !ok {
			t.Errorf("ResolveColumn(%q) 应被接受, 实际被拒绝", c)
			continue
		}
		if got != c {
			t.Errorf("ResolveColumn(%q) = %q, 期望 %q", c, got, c)
		}
	}
}

func TestResolveColumnRejectsIllegalNames(t *testing.T) {
	payloads := []string{
		"省;DROP TABLE retail_sales--",
		"省) UNION SELECT password FROM users--",
		"省,password",
		"1=1",
		"省 WHERE 1=1",
		"`省`",
		"users.password",
		"id",         // 代理主键不在白名单里, 不该允许前端拿它排序/筛选
		"password",
		"region",     // 旧 schema 的字段, 换成新表后必须失效
		"",
		" ",
	}

	for _, p := range payloads {
		if col, ok := models.ResolveColumn(p); ok {
			t.Errorf("ResolveColumn(%q) 应被拒绝, 实际返回 (%q, true)", p, col)
		}
	}
}
