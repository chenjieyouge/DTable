package utils_test

import (
	"testing"

	"div_table_server/utils"
)

// BuildLikePattern 的转义规则
//
// 背景: 文本筛选用的是 LIKE 子串匹配, 用户输入会原样进到模式串里。
// 不转义的话 "%" 和 "_" 会被 MySQL 当成通配符 —— 用户输入一个 "%"
// 会匹配全部百万行, 界面上的表现是"筛选完全没起作用", 而不是报错。
//
// 转义字符特意选了 "!" 而不是反斜杠: NO_BACKSLASH_ESCAPES 模式下
// SQL 里的 '\\' 字面量不再代表单个反斜杠, ESCAPE '\\' 会直接报错。
func TestBuildLikePattern(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"普通中文子串", "郑州", "%郑州%"},
		{"百分号必须转义", "100%", "%100!%%"},
		{"下划线必须转义", "a_b", "%a!_b%"},
		{"转义符自身要先转义", "a!b", "%a!!b%"},
		{"组合", "%_!", "%!%!_!!%"},
		{"空串", "", "%%"},
		{"只有通配符", "%", "%!%%"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := utils.BuildLikePattern(c.in)
			if got != c.want {
				t.Fatalf("BuildLikePattern(%q) = %q, 期望 %q", c.in, got, c.want)
			}
		})
	}
}

// 转义字符常量必须和 SQL 里 ESCAPE 子句用的一致, 否则转义是无效的
func TestLikeEscapeCharIsSingleChar(t *testing.T) {
	if len(utils.LikeEscapeChar) != 1 {
		t.Fatalf("SQL 的 ESCAPE 子句只接受单个字符, 当前为 %q", utils.LikeEscapeChar)
	}
	if utils.LikeEscapeChar == `\` {
		t.Fatal("转义字符不能是反斜杠: NO_BACKSLASH_ESCAPES 下 ESCAPE '\\\\' 会报错")
	}
}
