-- 百万级门店零售测试数据
--
-- 中文列名说明:
--   表名/列名保持中文, 与原始 xlsx 一致, 前端拿去直接用, 不需要任何字段映射。
--   MySQL 完全支持 utf8mb4 下的中文标识符, 但引用时建议加反引号, 更稳妥。
--
-- 编码必须在三个环节都锁死, 否则中文会乱码:
--   1. 建库/建表: CHARACTER SET utf8mb4
--   2. 导入: LOAD DATA ... CHARACTER SET utf8mb4
--   3. 连接串:   ?charset=utf8mb4  (见 config/db.go)

CREATE DATABASE IF NOT EXISTS div_table_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE div_table_db;

-- ============ 门店零售数据 (百万级测试用) ============
DROP TABLE IF EXISTS `retail_sales`;
CREATE TABLE `retail_sales` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '代理主键, 仅供分页排序稳定用',
  `激活日期`   DATE                  COMMENT '原始为 Excel 序列号, 转换脚本已还原为日期',
  `品牌`       VARCHAR(50),
  `二级`       VARCHAR(50)           COMMENT '二级城市/负责人',
  `省`         VARCHAR(50),
  `城市`       VARCHAR(50),
  `区县`       VARCHAR(50),
  `门店`       VARCHAR(200),
  `品类`       VARCHAR(50),
  `渠道类型`   VARCHAR(50),
  `市场层级`   VARCHAR(50),
  `条码`       VARCHAR(50),
  `销量`       INT,
  `积分额`     DECIMAL(14, 3),
  PRIMARY KEY (`id`),
  -- 透视/分组常用维度加索引, 否则百万行的 group by 会全表扫
  KEY `idx_激活日期`   (`激活日期`),
  KEY `idx_省`         (`省`),
  KEY `idx_城市`       (`城市`),
  KEY `idx_品类`       (`品类`),
  KEY `idx_渠道类型`   (`渠道类型`),
  KEY `idx_市场层级`   (`市场层级`),
  -- 下面两个是实测后补的, 原因各不相同:
  --
  -- idx_积分额: 主度量, 排序走索引反向扫描, 1.4s -> 0.34s。
  --   销量 刻意不加索引 —— 它在这份数据里恒为 1, 排它只是白做一次 filesort。
  --
  -- idx_品牌: 只有 2 个不同值, 看着最不需要索引, 但它卡的是筛选下拉接口。
  --   那个接口是 `select distinct 品牌 ... limit 1000`, MySQL 攒够 1000 个不同值
  --   就提前退出 —— 2 个不同值永远攒不到, 只能把 104 万行整个扫完(541ms)。
  --   加了索引改走索引扫描, 4.9ms。
  KEY `idx_积分额`     (`积分额`),
  KEY `idx_品牌`       (`品牌`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 数据导入 ============
--
-- 百万行绝对不要用逐行 INSERT(要跑几小时), 用 LOAD DATA 秒级完成。
--
-- 前提: MySQL 8 默认关闭了 local_infile, 需要先打开:
--   SET GLOBAL local_infile = 1;          -- 服务端
--   mysql --local-infile=1 ...            -- 客户端也要带这个参数
--
-- 导入命令(注意 CHARACTER SET 和 FIELDS TERMINATED):
--   LOAD DATA LOCAL INFILE 'C:/Users/20804338/Desktop/AI/DTable/data/retail.csv'
--     INTO TABLE `retail_sales`
--     CHARACTER SET utf8mb4
--     FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' ESCAPED BY '"'
--     LINES TERMINATED BY '\n'
--     IGNORE 1 LINES                        -- 跳过表头
--     (`激活日期`, `品牌`, `二级`, `省`, `城市`, `区县`, `门店`,
--      `品类`, `渠道类型`, `市场层级`, `条码`, `销量`, `积分额`);
--
-- ESCAPED BY '"' 是刻意的: CSV 用双写引号转义("" 表示一个 "),
-- MySQL 默认用反斜杠转义, 不改的话字段里的引号会串行。
--
-- 实际导入请用 scripts/import-csv.sh, 它会把上面这些一次性做对。

-- 验证
-- SELECT COUNT(*) FROM `retail_sales`;
-- SELECT * FROM `retail_sales` LIMIT 5;
