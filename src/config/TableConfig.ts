import { IUserConfig, IConfig } from '@/types'

type MyDefault = Omit<
  IConfig,
  'columns' | 'fetchPageData' | 'fetchSummaryData' | 'initialData'
>

const DEFAULTS: MyDefault = {
  container: '#container',
  tableWidth: 500,
  tableId: '',
  tableHeight: 500,
  headerHeight: 30,
  summaryHeight: 24,
  rowHeight: 20,
  totalRows: 100000,
  frozenColumns: 1,
  showSummary: true,

  pageSize: 200, // 每页显示多少条
  bufferRows: 50, // 缓冲区行数
  maxCachedPages: 10, // 最大缓存页数
}

export class TableConfig {
  private readonly config: IConfig // 内部是严格版

  constructor(userConfig: IUserConfig) {
    // 用户宽松版
    // 1. 验证必要字段
    if (!userConfig.columns || userConfig.columns.length === 0) {
      throw new Error('columns is required')
    }

    // 可选
    // if (!userConfig.fetchPageData || !userConfig.fetchSummaryData) {
    //   throw new Error('api of detail data and summary data is required')
    // }

    // ... 其他校验

    // 2. 合并默认值 + 用户配置
    this.config = { ...DEFAULTS, ...userConfig }
  }

  get<K extends keyof IConfig>(key: K): IConfig[K] {
    return this.config[key]
  }

  getAll(): IConfig {
    return this.config
  }
}
