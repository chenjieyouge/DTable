import { describe, it, expect } from 'vitest'
import { parseCSV } from '@/utils/parseCSV'

/**
 * CSV 解析
 *
 * 真实数据里门店名、地址都可能带逗号和引号, 所以不能简单按 , 和 \n 切分。
 * 这些边界一旦处理错, 表现是"某几行的列整体错位"——非常难排查。
 */
describe('parseCSV', () => {
  it('首行作表头, 其余作数据', () => {
    expect(parseCSV('a,b\n1,2')).toEqual([{ a: '1', b: '2' }])
  })

  it('多行数据', () => {
    expect(parseCSV('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('空输入返回空数组', () => {
    expect(parseCSV('')).toEqual([])
  })

  it('只有表头没有数据行', () => {
    expect(parseCSV('a,b')).toEqual([])
  })

  it('引号内的逗号不切分', () => {
    expect(parseCSV('a,b\n"x,y",2')).toEqual([{ a: 'x,y', b: '2' }])
  })

  it('引号内的换行不切分', () => {
    expect(parseCSV('a,b\n"line1\nline2",2')).toEqual([{ a: 'line1\nline2', b: '2' }])
  })

  it('双写引号还原为一个引号', () => {
    expect(parseCSV('a\n"他说""你好"""')).toEqual([{ a: '他说"你好"' }])
  })

  it('CRLF 换行', () => {
    expect(parseCSV('a,b\r\n1,2\r\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('剥离 UTF-8 BOM (Excel 导出的 CSV 常带)', () => {
    // 不剥离的话第一个列名会变成 "﻿a", 前端按列名取数会全部取不到
    expect(parseCSV('﻿a,b\n1,2')).toEqual([{ a: '1', b: '2' }])
  })

  it('末尾换行不产生多余空行', () => {
    expect(parseCSV('a,b\n1,2\n')).toEqual([{ a: '1', b: '2' }])
  })

  it('字段数少于表头时补空字符串', () => {
    expect(parseCSV('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('字段数多于表头时忽略多余部分', () => {
    expect(parseCSV('a,b\n1,2,3')).toEqual([{ a: '1', b: '2' }])
  })

  it('保留引号包裹的空字段为空字符串', () => {
    expect(parseCSV('a,b\n"",2')).toEqual([{ a: '', b: '2' }])
  })

  it('中文字段值不受影响', () => {
    expect(parseCSV('省,城市\n河南,周口市')).toEqual([{ 省: '河南', 城市: '周口市' }])
  })

  it('maxRows 限制返回行数 (用于先用小样本试跑)', () => {
    const csv = 'a\n1\n2\n3\n4'
    expect(parseCSV(csv, { maxRows: 2 })).toEqual([{ a: '1' }, { a: '2' }])
  })
})
