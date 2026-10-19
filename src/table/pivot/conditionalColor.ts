/**
 * 条件格式颜色工具 (Power BI 色阶)
 *
 * 三色阶: 低(红) → 中(黄) → 高(绿), 与 Power BI 默认色阶一致
 */
export class ConditionalColor {
  private static readonly LOW = [248, 105, 107]
  private static readonly MID = [255, 235, 132]
  private static readonly HIGH = [99, 190, 123]

  /**
   * 按归一化位置 t ∈ [0,1] 取色
   * t<0.5 在 低→中 之间插值, t>=0.5 在 中→高 之间插值
   */
  static scale(t: number): string {
    const x = Math.max(0, Math.min(1, t))
    const [a, b, k] = x < 0.5
      ? [ConditionalColor.LOW, ConditionalColor.MID, x * 2]
      : [ConditionalColor.MID, ConditionalColor.HIGH, (x - 0.5) * 2]
    const rgb = a.map((av, i) => Math.round(av + (b[i] - av) * k))
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
  }
}
