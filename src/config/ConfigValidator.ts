import type { IUserConfig } from "@/types";

/**
 * 配置验证器
 * 职责: 验证用户配置的合法性
 */

export class ConfigValidator {
  // 验证用户配置,  thorw Error 配置不合法
  static vilidate(config: IUserConfig): void {
    // 1. 必填字段验证 
    if (!config.columns || config.columns.length === 0) {
      throw new Error('[ConfigValidator] columns 是必填, 且不能为空数组')
    }
    // 2. 右侧面板验证
    if (config.sidePanel?.enabled) {
      // 取消严格验证,允许 panel 为空
      // if (!config.sidePanel.panels || config.sidePanel.panels.length === 0) {
      //   throw new Error('[ConfigValidator] 启用右侧面板时, panels 不能为空')
      // }

      // 验证 defaultPanel 是否存在于 panels 中
      if (config.sidePanel.defaultPanel && config.sidePanel.panels && config.sidePanel.panels.length > 0) {
        const panelsIds = config.sidePanel.panels.map(p => p.id)
        if (!panelsIds.includes(config.sidePanel.defaultPanel)) {
          throw new Error(`[ConfigValidator] ${config.sidePanel.defaultPanel} 不存在 panels 中`)
        }
      }
    }
    // 3. 尺寸验证
    if (config.tableWidth !== undefined) {
      // 支持数值 或者 '100%' 字符串
      if (typeof config.tableWidth === 'number' && config.tableWidth < 100) {
        throw new Error('[ConfigValidator] tableWidth 不能小于 100px')
      }
      if (typeof config.tableWidth === 'string' && config.tableWidth !== '100%') {
        throw new Error('[ConfigValidator] tableWidth 字符串只支持 "100%"')
      }
    }
    if (config.tableHeight !== undefined && config.tableHeight < 100) {
      throw new Error('[ConfigValidator] tableHeight 不能小于 100px')
    }
    // 4. 分页参数验证
    if (config.pageSize !== undefined && config.pageSize < 1) {
      throw new Error('[ConfigValidator] pageSize 必须大于 0')
    }
    if (config.bufferRows !== undefined && config.bufferRows < 0) {
      throw new Error('[ConfigValidator] bufferRows 不能为负数')
    }
    // 5. 冻结列验证
    if (config.frozenColumns !== undefined) {
      if (config.frozenColumns < 0) {
        throw new Error('[ConfigValidator] frozenColumns 不能为负数')
      }
      if (config.frozenColumns > config.columns.length) {
        throw new Error('[ConfigValidator] 冻结列数不能超过总表列数')
      }
    }
    // 6. 列配置验证
    const columnKeys = new Set<string>()
    config.columns.forEach((col, index) => {
      if (!col.key) {
        throw new Error(`[ConfigValidator] 第 ${index} 列缺少 key 字段` )
      }
      if (columnKeys.has(col.key)) {
        throw new Error(`[ConfigValidator] 列 key "${col.key}" 重复` )
      }
      columnKeys.add(col.key)
      if (col.width !== undefined && col.width < 20) {
        throw new Error(`[ConfigValidator] 列 "${col.key}" 的 width 不能小于 20px` )
      }
      if (col.minWidth !== undefined && col.minWidth < 20) {
        throw new Error(`[ConfigValidator] 列 "${col.key}" 的 minWidth 不能小于 20px` )
      }
      if (col.flex !== undefined && col.flex <= 0) {
        throw new Error(`[ConfigValidator] 列 "${col.key}" 的 flex 必须大于 0`)
      }
    })

    // ... 其他更多验证

  }
}