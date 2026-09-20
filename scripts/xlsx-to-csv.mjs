#!/usr/bin/env node
/**
 * xlsx -> CSV 转换器 (零依赖)
 *
 * 为什么手写: xlsx 本质是个 zip, Node 内置 zlib 能解 deflate, 但没有 zip 容器解析。
 * 为了一次性转换引入 exceljs/xlsx 这类库不划算, 而且这个项目一直标榜零依赖。
 * 这里只实现用到的那部分 ZIP 读取 (普通 zip, 不支持 ZIP64 —— 单文件超 4GB 才需要)。
 *
 * 用法:
 *   node scripts/xlsx-to-csv.mjs <input.xlsx> <output.csv>
 *
 * 输出统一为 UTF-8 无 BOM:
 *   - MySQL 的 LOAD DATA 用 CHARACTER SET utf8mb4 读, 不能有 BOM
 *   - 浏览器端解析时我们再自己处理
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'

// ============ 最小 ZIP 读取 ============

/**
 * 解析 zip 的中央目录, 返回 { 文件名 -> 条目信息 }
 * 只读了文件尾部 + 中央目录, 不碰数据区
 */
function readZipEntries(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const stat = fs.fstatSync(fd)
    const fileSize = stat.size

    // EOCD 在文件末尾, 注释最长 65535, 所以最多往回找 65557 字节
    const tailSize = Math.min(fileSize, 65557)
    const tail = Buffer.alloc(tailSize)
    fs.readSync(fd, tail, 0, tailSize, fileSize - tailSize)

    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('不是合法的 zip/xlsx: 找不到 EOCD')

    const entryCount = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)

    const cd = Buffer.alloc(cdSize)
    fs.readSync(fd, cd, 0, cdSize, cdOffset)

    const entries = new Map()
    let p = 0
    for (let i = 0; i < entryCount; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break
      const method = cd.readUInt16LE(p + 10)
      const compressedSize = cd.readUInt32LE(p + 20)
      const uncompressedSize = cd.readUInt32LE(p + 24)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen)

      entries.set(name, { method, compressedSize, uncompressedSize, localOffset })
      p += 46 + nameLen + extraLen + commentLen
    }
    return { fd, entries, fileSize }
  } catch (e) {
    fs.closeSync(fd)
    throw e
  }
}

/**
 * 打开某个条目的解压流
 * 定位到本地文件头, 跳过文件名/extra, 再对数据区做 inflate —— 全程流式, 不整块读进内存
 */
function openEntryStream(fd, fileSize, entry) {
  const lh = Buffer.alloc(30)
  fs.readSync(fd, lh, 0, 30, entry.localOffset)
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('本地文件头损坏')
  const nameLen = lh.readUInt16LE(26)
  const extraLen = lh.readUInt16LE(28)

  const dataStart = entry.localOffset + 30 + nameLen + extraLen
  const dataEnd = Math.min(dataStart + entry.compressedSize, fileSize)

  const raw = fs.createReadStream(null, { fd, start: dataStart, end: dataEnd - 1, autoClose: false })
  // method 0 = 不压缩, 8 = deflate
  return entry.method === 0 ? raw : raw.pipe(zlib.createInflateRaw())
}

// ============ XML 处理 ============

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(s) {
  if (!s.includes('&')) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code] ?? m
  })
}

/**
 * Excel 内置的日期 numFmtId
 *
 * 注意分两类, 只认日期不认纯时间:
 *   国际通用: 14-17, 22, 36
 *   区域格式: 27-31 / 50-58 (中文 Excel 的「日期」样式常用 58, 少这一类会漏掉)
 * 纯时间格式 (18-21, 32-35, 45-47) 不在此列 —— 时间值换算成日期是错的。
 */
const BUILTIN_DATE_FMT_IDS = new Set([
  14, 15, 16, 17, 22, 36,
  27, 28, 29, 30, 31,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
])

/** 自定义格式串是否是日期 (去掉引号里的字面量后, 出现 y/m/d 即为日期) */
function isDateFormatCode(code) {
  // formatCode 里的引号在 XML 中是 &quot;, 先还原再剥离, 否则字面量里的 m/d 会误判
  const stripped = code
    .replace(/&quot;/g, '"')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
  return /[ymd]/i.test(stripped)
}

/**
 * 解析 styles.xml, 返回"日期样式的索引集合"
 *
 * 为什么需要: Excel 把日期存成序列号(如 44527), 靠单元格的 s 属性指向样式表,
 * 样式表里再说明这是不是日期格式。不看样式表就没法区分 44527 是日期还是普通数字。
 */
async function parseStyles(stream) {
  let xml = ''
  for await (const chunk of stream) xml += chunk

  const customDateFmtIds = new Set()
  const fmtRe = /<numFmt\s+[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g
  let m
  while ((m = fmtRe.exec(xml)) !== null) {
    if (isDateFormatCode(m[2])) customDateFmtIds.add(Number(m[1]))
  }

  // cellXfs 里的顺序索引就是单元格 s 属性的值
  const dateStyles = new Set()
  const xfsMatch = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)
  if (xfsMatch) {
    const xfRe = /<xf\b[^>]*>/g
    let i = 0
    let x
    while ((x = xfRe.exec(xfsMatch[1])) !== null) {
      const idm = /numFmtId="(\d+)"/.exec(x[0])
      const id = idm ? Number(idm[1]) : 0
      if (BUILTIN_DATE_FMT_IDS.has(id) || customDateFmtIds.has(id)) dateStyles.add(i)
      i++
    }
  }
  return dateStyles
}

/**
 * Excel 序列号 -> yyyy-MM-dd
 *
 * 原点取 1899-12-30: Excel 错误地把 1900 当闰年(存在不存在的 1900-02-29),
 * 用这个原点正好抵消该 bug。serial < 61 的情况会差一天, 但那是 1900 年, 不影响实际数据。
 */
function excelSerialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000)
  const y = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/** 列字母 -> 序号: A=0, B=1, ..., Z=25, AA=26 */
function colToIndex(letters) {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64)
  }
  return n - 1
}

/**
 * 解析 sharedStrings.xml
 * 结构: <sst><si><t>文本</t></si>...</sst>  (也可能有 <si><r><t>分段</t></r></si>)
 */
async function parseSharedStrings(stream) {
  const strings = []
  let carry = ''

  const handle = (chunk) => {
    carry += chunk
    // 只处理完整的 <si>...</si>
    let idx
    while ((idx = carry.indexOf('</si>')) !== -1) {
      const start = carry.lastIndexOf('<si>', idx)
      const seg = start === -1 ? carry.slice(0, idx) : carry.slice(start + 4, idx)
      carry = carry.slice(idx + 5)

      // 富文本会有多个 <t>, 全部拼起来; 取最后一个 </t> 也可, 但拼更稳
      const parts = seg.match(/<t[^>]*>([\s\S]*?)<\/t>/g)
      strings.push(parts ? parts.map((p) => decodeXml(p.replace(/^<t[^>]*>|<\/t>$/g, ''))).join('') : '')
    }
    // 防止 carry 无限增长
    if (carry.length > 1_000_000) carry = carry.slice(-1000)
  }

  await pipeline(stream, new Transform({
    decodeStrings: false,
    transform(chunk, _enc, cb) { handle(chunk); cb() },
  }))
  return strings
}

/** CSV 单元格转义 */
function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * 流式解析 sheet, 边解析边写 CSV
 * 行结构: <row r="1" ...><c r="A1" t="s"><v>0</v></c>...</row>
 */
async function sheetToCsv(stream, sharedStrings, dateStyles, outPath, limit = Infinity) {
  const out = fs.createWriteStream(outPath, { encoding: 'utf8' })
  const write = (s) => new Promise((res) => {
    if (out.write(s)) res()
    else out.once('drain', res)
  })

  let carry = ''
  let rowCount = 0
  let maxCol = 0
  // 统计每个列被当成日期转换了多少次, 最后汇报出来供人工核对
  const dateColHits = {}
  const colHits = {}
  let header = null

  const handleRow = async (rowXml) => {
    // 取每列的 (列号, 值)
    const cells = []
    const re = /<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let m
    while ((m = re.exec(rowXml)) !== null) {
      const colIdx = colToIndex(m[1])
      const attrs = m[2] ?? ''
      const inner = m[3] ?? ''

      let value = ''
      if (/t="s"/.test(attrs)) {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner)
        const si = vm ? Number(vm[1]) : -1
        value = si >= 0 ? (sharedStrings[si] ?? '') : ''
      } else if (/t="inlineStr"/.test(attrs)) {
        const tm = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)
        value = tm ? decodeXml(tm[1]) : ''
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner)
        value = vm ? vm[1] : ''

        // 数值 + 日期样式 => 把 Excel 序列号还原成 yyyy-MM-dd
        if (value !== '') {
          const sm = /\bs="(\d+)"/.exec(attrs)
          const styleIdx = sm ? Number(sm[1]) : -1
          const num = Number(value)
          if (styleIdx >= 0 && dateStyles.has(styleIdx) && Number.isFinite(num)) {
            value = excelSerialToDate(num)
            dateColHits[colIdx] = (dateColHits[colIdx] ?? 0) + 1
          }
        }
      }

      cells[colIdx] = value
      colHits[colIdx] = (colHits[colIdx] ?? 0) + 1
      if (colIdx > maxCol) maxCol = colIdx
    }

    if (header === null) header = cells.slice()

    const width = maxCol + 1
    const line = []
    for (let i = 0; i < width; i++) line.push(csvCell(cells[i]))
    await write(line.join(',') + '\n')
    rowCount++

    if (rowCount % 100000 === 0) {
      process.stderr.write(`  已转换 ${rowCount.toLocaleString()} 行\n`)
    }
  }

  await pipeline(
    stream,
    new Transform({
      decodeStrings: false,
      async transform(chunk, _enc, cb) {
        // 已取够行数: 剩下的直接丢弃, 不再做逐行解析 (解析才是耗时大头)
        if (rowCount >= limit) return cb()

        carry += chunk
        try {
          let idx
          while ((idx = carry.indexOf('</row>')) !== -1) {
            const start = carry.lastIndexOf('<row ', idx)
            if (start === -1) { carry = carry.slice(idx + 6); continue }
            const rowXml = carry.slice(start, idx)
            carry = carry.slice(idx + 6)
            await handleRow(rowXml)
            if (rowCount >= limit) { carry = ''; break }
          }
          cb()
        } catch (e) { cb(e) }
      },
      async flush(cb) {
        // 最后一行可能没有换行
        const start = carry.lastIndexOf('<row ')
        if (start !== -1) {
          try { await handleRow(carry.slice(start)) } catch (e) { return cb(e) }
        }
        cb()
      },
    }),
    new Transform({ transform(_c, _e, cb) { cb() } }) // 收尾用, 数据已直接写入 out
  )

  await new Promise((res) => out.end(res))
  return { rowCount, width: maxCol + 1, dateColHits, colHits, header: header ?? [] }
}

// ============ 主流程 ============

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity

  const [inPath, outPath] = positional
  if (!inPath || !outPath) {
    console.error('用法: node scripts/xlsx-to-csv.mjs <input.xlsx> <output.csv> [--limit=N]')
    process.exit(1)
  }
  if (Number.isFinite(limit)) console.log(`只转换前 ${limit} 行 (--limit)`)

  console.log(`读取: ${inPath}`)
  const { fd, entries, fileSize } = readZipEntries(inPath)

  const ssEntry = entries.get('xl/sharedStrings.xml')
  const sheetEntry = entries.get('xl/worksheets/sheet1.xml')
  const styleEntry = entries.get('xl/styles.xml')
  if (!sheetEntry) throw new Error('找不到 xl/worksheets/sheet1.xml')

  let sharedStrings = []
  if (ssEntry) {
    console.log(`解析共享字符串 (${(ssEntry.uncompressedSize / 1024 / 1024).toFixed(1)} MB)...`)
    sharedStrings = await parseSharedStrings(openEntryStream(fd, fileSize, ssEntry))
    console.log(`  共 ${sharedStrings.length.toLocaleString()} 条`)
  }

  let dateStyles = new Set()
  if (styleEntry) {
    dateStyles = await parseStyles(openEntryStream(fd, fileSize, styleEntry))
    console.log(`样式表: ${dateStyles.size} 个日期样式索引`)
  }

  console.log(`解析工作表 (解压后 ${(sheetEntry.uncompressedSize / 1024 / 1024).toFixed(0)} MB)...`)
  const { rowCount, width, dateColHits, colHits, header } = await sheetToCsv(
    openEntryStream(fd, fileSize, sheetEntry),
    sharedStrings,
    dateStyles,
    outPath,
    limit
  )

  fs.closeSync(fd)
  const size = fs.statSync(outPath).size
  console.log(`完成: ${outPath}`)
  console.log(`  ${rowCount.toLocaleString()} 行 × ${width} 列, ${(size / 1024 / 1024).toFixed(1)} MB`)

  // 列出被判定为日期的列, 供人工核对 —— 判错了会静默产出错误日期, 必须能一眼看出来
  const dateCols = Object.keys(dateColHits)
    .filter((i) => dateColHits[i] > (colHits[i] ?? 0) * 0.5)
    .map((i) => header[i] ?? `第${Number(i) + 1}列`)
  console.log(
    dateCols.length
      ? `  识别为日期的列: ${dateCols.join(', ')}`
      : '  未识别到日期列'
  )
}

main().catch((e) => {
  console.error('转换失败:', e)
  process.exit(1)
})
