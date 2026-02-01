import { IUserConfig, IConfig } from '@/types'
import { createDefaultConfig } from './defaultConfig'
import { ConfigValidator } from './ConfigValidator'
import { calculateColumnWidth, getContainerWidth } from '@/utils/calculateColumnWidth'


export class TableConfig {
  private readonly config: IConfig // 内部是严格版

  constructor(userConfig: IUserConfig) {
    // 1. 验证用户配置
    ConfigValidator.vilidate(userConfig)
    // 2. 合并默认值 + 用户配置
    const merged = { 
      ...createDefaultConfig(),
      ...userConfig,
      tableId: userConfig.tableId || this.generateTableId(userConfig),
     } as IConfig

    // 3. 计算列宽, 若有列没有指定 width
    this.initColumnWidths(merged)
    this.config = merged
  }

  get<K extends keyof IConfig>(key: K): IConfig[K] {
    return this.config[key]
  }

  getAll(): IConfig {
    return this.config
  }

  private generateTableId(userConfig: IUserConfig): string {
    // 根据人工传递的容器标识, 生成稳定的 tableId
    const containerId = typeof userConfig.container === 'string'
      ? userConfig.container
      : 'yougeya'
    const cleanId = containerId.replace(/[^a-zA-z0-9]/g, '-')
    return `cj-${cleanId}`
  }

  /**
   * 初始化列宽
   * 对于没有指定 width 的列, 自动计算宽度
   */
  private initColumnWidths(config: IConfig): void {
    // 检查是否有列没有配置固定宽度
    const hasAutoWidthColumn = config.columns.some(col => col.width === undefined)
    if (!hasAutoWidthColumn) {
      // 所有列都有 width, 则无需计算
      return 
    }

    // 获取容器宽度
    let containerWidth: number
    if (typeof config.tableWidth === 'number') {
      containerWidth = config.tableWidth

    } else {
      // tableWidth 是 '100%', 则需获取容器的实际宽度
      const actualWidth = getContainerWidth(config.container, 0)
      containerWidth = actualWidth > 0 ? actualWidth : 1314
    }

    // 计算列宽
    const minWidth = config.minColumnWidth || 100
    const widths = calculateColumnWidth(config.columns, containerWidth, minWidth)
    // 应用计算后的宽度
    config.columns.forEach((col, index) => {
      if (col.width === undefined) {
        col.width = widths[index]
      }
    })
  }

}
