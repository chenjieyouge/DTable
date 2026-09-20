package models_test

import (
	"testing"

	"div_table_server/models"
)

// 字段名白名单是这类 SQL 注入的唯一防线:
// 请求里的字段名会被拼进 SQL 语句文本, 参数绑定(?)只能保护"值", 保护不了"字段名"。
func TestResolveColumnAcceptsSchemaFields(t *testing.T) {
	cases := map[string]string{
		"id":         "id",
		"name":       "name",
		"age":        "age",
		"region":     "region",
		"department": "department",
		"salary":     "salary",
		"status":     "status",
		"joinDate":   "join_date", // API 名与数据库列名不一致, 必须正确映射
		"createdAt":  "created_at",
		"updatedAt":  "updated_at",
	}

	for apiName, wantCol := range cases {
		gotCol, ok := models.ResolveColumn(apiName)
		if !ok {
			t.Errorf("ResolveColumn(%q) 应被接受, 实际被拒绝", apiName)
			continue
		}
		if gotCol != wantCol {
			t.Errorf("ResolveColumn(%q) = %q, 期望 %q", apiName, gotCol, wantCol)
		}
	}
}

func TestResolveColumnRejectsIllegalNames(t *testing.T) {
	payloads := []string{
		"region;DROP TABLE table_data--",
		"region) UNION SELECT password FROM users--",
		"region,password",
		"1=1",
		"region WHERE 1=1",
		"`region`",
		"users.password",
		"password",
		"",
		" ",
	}

	for _, p := range payloads {
		if col, ok := models.ResolveColumn(p); ok {
			t.Errorf("ResolveColumn(%q) 应被拒绝, 实际返回 (%q, true)", p, col)
		}
	}
}
