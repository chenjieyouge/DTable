import { describe, it, expect } from "vitest";
import { ConfigValidator } from "@/config/ConfigValidator";

describe('ConfigValidator', () => {

  it('验证 columns 必填', () => {
    expect(() => {
      ConfigValidator.vilidate({ columns: []})
    }).toThrow('[ConfigValidator] columns 是必填, 且不能为空数组')
  })

  it('验证右侧面板配置', () => {
    expect(() => {
      ConfigValidator.vilidate({
        columns: [{ key: 'id', title: 'ID', width: 100 }],
        sidePanel: {
          enabled: true,
          panels: []
        }
      })
    }).toThrow('[ConfigValidator] 启用右侧面板时, panels 不能为空')
  })

  it('验证列 key 不重复', () => {
    expect(() => {
      ConfigValidator.vilidate({
        columns: [
          { key: 'id', title: 'ID', width: 100 },
          { key: 'id', title: 'ID2', width: 100}
        ]
      })
    }).toThrow('[ConfigValidator] 列 key "id" 重复')
  })

  it('验证通过有效配置', () => {
    expect(() => {
      ConfigValidator.vilidate({
        columns: [{ key: 'id', title: 'ID', width: 100 }],
        tableWidth: 800
      })
    }).not.toThrow()
  })


})