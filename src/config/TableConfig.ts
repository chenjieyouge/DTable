import { IUserConfig, IConfig } from '@/types'
import { createDefaultConfig } from './defaultConfig'
import { ConfigValidator } from './ConfigValidator'


export class TableConfig {
  private readonly config: IConfig // 内部是严格版

  constructor(userConfig: IUserConfig) {
    // 1. 验证用户配置
    ConfigValidator.vilidate(userConfig)
    // 2. 合并默认值 + 用户配置
    this.config = { 
      ...createDefaultConfig,
      ...userConfig,
      tableId: userConfig.tableId || this.generateTableId(userConfig),
     } as IConfig
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

}
