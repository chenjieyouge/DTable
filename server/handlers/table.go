package handlers

import (
	"net/http"
	"strconv"

	"div_table_server/config"
	"div_table_server/models"
	"div_table_server/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 筛选选项最多返回多少个不同值
//
// 加上限的原因: 门店 这类高基数字段去重后可能有几万个值, 全量返回会让下拉框
// 既不可用又拖慢网络。这里与前端 ClientDataStrategy 的 1000 上限保持一致。
const maxFilterOptions = 1000

// 获取分页数据
func GetTablePage(c *gin.Context) {
	var params models.PageQueryBody

	// 先绑定请求体参数, 分页/筛选/排序都在 body 里
	if err := c.ShouldBindJSON(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 再补齐默认值
	if params.PageSize == 0 {
		params.PageSize = 50
	}

	db := config.DB.Model(&models.RetailSales{})

	// 应用筛选
	if len(params.Filters) > 0 {
		db = utils.ApplyFilters(db, params.Filters)
	}

	// 应用排序
	if params.Sort != "" {
		db = utils.ApplySort(db, params.Sort)
	}

	// 查询总数
	var totalRows int64
	if err := db.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询总行数失败"})
		return
	}

	// 查询分页
	var list []models.RetailSales
	offset := params.PageIndex * params.PageSize
	if err := db.Offset(offset).Limit(params.PageSize).Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询数据失败"})
		return // 缺少 return 会继续往下走, 返回一份空列表却带着 200
	}

	// 计算汇总数据 (可选)
	summary := calculateSummary(db)

	c.JSON(http.StatusOK, models.PageResponse{
		List:      list,
		TotalRows: totalRows,
		Summary:   summary,
	})
}

// 计算汇总数据
//
// 只聚合 积分额:
//   - 销量 在原始数据里恒为 1, 聚合它毫无意义 (sum 恒等于 count), 放进汇总行只会误导人
//   - 返回的 key 必须与列 key 一致, 前端的 updateSummaryRow 是拿 data[col.key] 去取的,
//     返回英文 key(如 sumPoints) 会导致汇总行整列显示为空
func calculateSummary(db *gorm.DB) map[string]interface{} {
	var result struct {
		SumPoints float64
	}

	db.Select("sum(`积分额`) as sum_points").Scan(&result)

	return map[string]interface{}{
		"积分额": result.SumPoints,
	}
}

// 获取汇总数据
func GetSummary(c *gin.Context) {
	db := config.DB.Model(&models.RetailSales{})

	// 应用筛选, 如果有
	var filters map[string]interface{}
	if err := c.ShouldBindQuery(&filters); err == nil && len(filters) > 0 {
		db = utils.ApplyFilters(db, filters)
	}

	c.JSON(http.StatusOK, calculateSummary(db))
}

// 获取筛选选项
func GetFilterOptions(c *gin.Context) {
	var body models.FilterOptionsBody

	// 该路由注册为 GET, 参数只能从 query string 绑定,
	// 用 ShouldBindJSON 读请求体会因 GET 无 body 而恒失败
	if err := c.ShouldBindQuery(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "columnKey 参数缺失"})
		return
	}

	// 字段名会被拼进 SQL 语句, 必须过白名单 —— 这是这个接口唯一的注入防线
	column, ok := models.ResolveColumn(body.Columnkey)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不合法的 columnKey"})
		return
	}

	var options []string
	// column 来自白名单常量, 不是请求原文, 因此拼接安全。
	// 中文标识符统一加反引号, 避免个别字符被 SQL 解析器误读。
	query := "select distinct `" + column + "` from `" + models.TableNameRetailSales +
		"` where `" + column + "` is not null limit " + strconv.Itoa(maxFilterOptions)

	if err := config.DB.Raw(query).Scan(&options).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询筛选选项失败"})
		return
	}

	c.JSON(http.StatusOK, options)
}

// 获取全量数据 (用于 client 模式一次性全加载)
func GetAllData(c *gin.Context) {
	var params struct {
		Sort   string                 `form:"sort"`
		Filter map[string]interface{} `form:"filter"`
		Limit  int                    `form:"limit"`
	}

	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 默认最多 100w 条, 防止一次性加载太多搞爆服务器
	if params.Limit == 0 {
		params.Limit = 1000000
	}

	db := config.DB.Model(&models.RetailSales{})

	if len(params.Filter) > 0 {
		db = utils.ApplyFilters(db, params.Filter)
	}

	if params.Sort != "" {
		db = utils.ApplySort(db, params.Sort)
	}

	var totalRows int64
	if err := db.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询总行数失败"})
		return
	}

	var list []models.RetailSales
	if err := db.Limit(params.Limit).Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询数据失败"})
		return
	}

	c.JSON(http.StatusOK, models.PageResponse{
		List:      list,
		TotalRows: totalRows,
		Summary:   calculateSummary(db),
	})
}
