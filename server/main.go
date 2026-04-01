package main

import (
	"log"
	"os"

	"div_table_server/config"
	"div_table_server/handlers"
	"div_table_server/middleware"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("未找到 .env 文件, 使用系统环境变量")
	}

	// 初始化数据库
	config.InitDB()

	// 创建 Gin 路由
	r := gin.Default()

	// 配置 CORS
	r.Use(middleware.SetupCORS())

	// API 路由
	api := r.Group("/api")
	{
		// 表格数据接口
		api.POST("/table/page", handlers.GetTablePage)
		api.POST("/table/all", handlers.GetAllData)
		api.GET("/table/filter-options", handlers.GetFilterOptions)
		api.GET("/table/summary", handlers.GetSummary)
	}

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "okk"})
	})

	// 启动服务
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 服务启动成功, 监听端口: %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
