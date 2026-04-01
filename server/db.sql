-- 创建数据库
CREATE DATABASE IF NOT EXISTS div_table_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE div_table_db;

-- 创建表
CREATE TABLE IF NOT EXISTS table_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT,
    region VARCHAR(50),
    department VARCHAR(100),
    salary DECIMAL(10, 2),
    status VARCHAR(20),
    join_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_region (region),
    INDEX idx_department (department),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入测试数据（100000 条）
DELIMITER $$
CREATE PROCEDURE insert_test_data()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE regions VARCHAR(50);
    DECLARE departments VARCHAR(100);
    DECLARE statuses VARCHAR(20);
    
    WHILE i <= 100000 DO
        SET regions = ELT(FLOOR(1 + RAND() * 5), '华东', '华南', '华北', '西南', '东北');
        SET departments = ELT(FLOOR(1 + RAND() * 4), '技术部', '销售部', '市场部', '人力资源部');
        SET statuses = ELT(FLOOR(1 + RAND() * 3), '在职', '离职', '试用期');
        
        INSERT INTO table_data (name, age, region, department, salary, status, join_date)
        VALUES (
            CONCAT('员工', i),
            FLOOR(20 + RAND() * 40),
            regions,
            departments,
            ROUND(5000 + RAND() * 20000, 2),
            statuses,
            DATE_SUB(CURDATE(), INTERVAL FLOOR(RAND() * 3650) DAY)
        );
        
        SET i = i + 1;
    END WHILE;
END$$
DELIMITER ;

-- 执行存储过程
CALL insert_test_data();

-- 删除存储过程
DROP PROCEDURE insert_test_data;

-- 验证数据
SELECT COUNT(*) as total_rows FROM table_data;
SELECT * FROM table_data LIMIT 10;