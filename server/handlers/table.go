package handlers

import (
	"net/http"

	"div_table_server/config"
	"div_table_server/models"
	"div_table_server/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 获取分页数据
func GetTablePage(c *gin.Context) {
	var params models.PageQueryBody

	// 先绑定请求体参数, 不是之前的 查询参数哦, 现在都改为 post 请求了, 在 body 里面
	if err := c.ShouldBindJSON(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 再补齐默认值
	if params.PageSize == 0 {
		params.PageSize = 50
	}

	db := config.DB.Model(&models.TableData{})

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
	var list []models.TableData
	offset := params.PageIndex * params.PageSize
	if err := db.Offset(offset).Limit(params.PageSize).Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询数据失败"})
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
func calculateSummary(db *gorm.DB) map[string]interface{} {
	var result struct {
		TotalCount int64
		AvgSalary  float64
		MaxSalary  float64
		MinSalary  float64
		SumSalary  float64
	}

	db.Select(`
	  count(*)      as total_count
		, avg(salary) as avg_salary 
		, max(salary) as max_salary
		, min(salary) as min_salary
		, sum(salary) as sum_salary
	`).Scan(&result)

	return map[string]interface{}{
		"totalCount": result.TotalCount,
		"avgSalary":  result.AvgSalary,
		"maxSalary":  result.MaxSalary,
		"minSalary":  result.MinSalary,
		"sumSalary":  result.SumSalary,
	}
}

// 获取汇总数据
func GetSummary(c *gin.Context) {
	db := config.DB.Model(&models.TableData{})

	// 应用筛选, 如果有
	var filters map[string]interface{}
	if err := c.ShouldBindQuery(&filters); err == nil && len(filters) > 0 {
		db = utils.ApplyFilters(db, filters)
	}

	summary := calculateSummary(db)

	c.JSON(http.StatusOK, summary)
}

// 获取筛选选项
func GetFilterOptions(c *gin.Context) {
	var body models.FilterOptionsBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "columnKey 参数缺失"})
		return
	}

	var options []string
	query := "select distinct " + body.Columnkey + " from table_data where " + body.Columnkey + " is not null"

	if err := config.DB.Raw(query).Scan(&options).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询筛选选项失败"})
	}

	c.JSON(http.StatusOK, options)
}

// 获取全量数据 (用于 client 模式 一次性全加载)
func GetAllData(c *gin.Context) {
	var params struct {
		Sort   string                 `form:"sort"`   // 格式: "name:asc" 或 "age:desc"
		Filter map[string]interface{} `form:"filter"` // 筛选条件
		Limit  int                    `form:"limit"`  // 最大返回量, 防止数据过大
	}

	// 绑定查询参数
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 设置默认限制值, 防止一次性加载太多搞爆服务器
	if params.Limit == 0 {
		params.Limit = 1000000 // 默认最多 100w 条
	}

	db := config.DB.Model(&models.TableData{})

	// 应用筛选
	if len(params.Filter) > 0 {
		db = utils.ApplyFilters(db, params.Filter)
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

	// 查询全量数据 (带限制条件)
	var list []models.TableData
	if err := db.Limit(params.Limit).Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询数据失败"})
		return
	}

	// 计算汇总数据
	summary := calculateSummary(db)

	c.JSON(http.StatusOK, models.PageResponse{
		List:      list,
		TotalRows: totalRows,
		Summary:   summary,
	})
}
