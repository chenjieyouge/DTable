package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"div_table_server/handlers"

	"github.com/gin-gonic/gin"
)

// 回归测试: GET /api/table/filter-options?columnKey=xxx
//
// 背景: 路由在 main.go 注册为 GET, 但 handler 用 c.ShouldBindJSON 从请求体读参数。
// GET 请求没有 body, ShouldBindJSON 必然失败 -> 恒返回 400 -> 前端筛选下拉永远为空。
//
// 说明: 本机未配置 MySQL, config.DB 为 nil, 参数绑定通过后会在此后访问 DB 时 panic,
// 故挂上 gin.Recovery()。这里只断言"有没有被判定为参数错误(400)",
// 即路由与绑定方式是否匹配, 不依赖真实数据库。
func newFilterOptionsRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.GET("/api/table/filter-options", handlers.GetFilterOptions)
	return r
}

func TestFilterOptionsAcceptsColumnKeyFromQuery(t *testing.T) {
	w := httptest.NewRecorder()
	// 注意用 url.Values 编码中文, 否则不是合法的 query string
	req := httptest.NewRequest(http.MethodGet,
		"/api/table/filter-options?columnKey="+url.QueryEscape("省"), nil)

	newFilterOptionsRouter().ServeHTTP(w, req)

	if w.Code == http.StatusBadRequest {
		t.Fatalf("columnKey 已通过 query 传入, 却被判为参数错误(400)\n"+
			"说明 handler 仍在从请求体绑定参数, 与 GET 路由不匹配\nbody=%s", w.Body.String())
	}
}

// 守住原有的必填校验: 修复绑定方式后, 缺少 columnKey 依然要返回 400
func TestFilterOptionsRejectsMissingColumnKey(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/table/filter-options", nil)

	newFilterOptionsRouter().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("缺少 columnKey 时应返回 400, 实际: %d", w.Code)
	}
}

// 非法字段名会被拼进 SQL 语句, 必须在进入查询前就拒绝
func TestFilterOptionsRejectsIllegalColumn(t *testing.T) {
	payloads := []string{
		"省;DROP TABLE retail_sales--",
		"省) UNION SELECT password FROM users--",
		"1=1",
		"password",
		"id", // 代理主键不在白名单
	}

	for _, p := range payloads {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/api/table/filter-options?columnKey="+url.QueryEscape(p), nil)

		newFilterOptionsRouter().ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("非法字段名 %q 应被拒绝(400), 实际: %d", p, w.Code)
		}
	}
}
