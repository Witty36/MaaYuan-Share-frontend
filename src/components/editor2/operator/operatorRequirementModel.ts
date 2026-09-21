import type { EditorOperator } from '../types'

export const OPERATOR_LEVEL_MIN = 1
export const OPERATOR_LEVEL_MAX = 100
export const OPERATOR_ELITE_MIN = 0
export const OPERATOR_ELITE_MAX = 17

/** 低等级按区间提升修为上限，40 级后每 5 级增加 1 点，100 级时上限为 17。 */
export function getMaxEliteForLevel(level: number): number {
  const normalizedLevel = Math.min(
    OPERATOR_LEVEL_MAX,
    Math.max(OPERATOR_LEVEL_MIN, Math.trunc(level)),
  )
  if (normalizedLevel <= 9) return 1
  if (normalizedLevel <= 14) return 2
  if (normalizedLevel <= 29) return 3
  if (normalizedLevel <= 39) return 4
  return Math.min(OPERATOR_ELITE_MAX, Math.floor(normalizedLevel / 5) - 3)
}

const ANY_REQUIREMENT_DISC_SLOTS = [0, 1, 2].map((index) => ({
  index,
  disc: 0,
  discConfirmed: true,
  starStone: '任意',
  assistStar: '任意',
}))

/**
 * 将密探一键设为“不限练度/命盘/星石”。
 * 会清空具体练度与数值，并将命盘/星石槽位显示为“任意”。
 */
export function applyAnyRequirements(operator: EditorOperator): EditorOperator {
  return {
    ...operator,
    unrestricted: true,
    requirements: undefined,
    starLevel: undefined,
    attack: undefined,
    hp: undefined,
    discsSelected: [0, 0, 0],
    discStarStones: ['任意', '任意', '任意'],
    discAssistStars: ['任意', '任意', '任意'],
    extensions: {
      version: 1,
      ...(operator.extensions ?? {}),
      stats: undefined,
      discs: {
        slots: ANY_REQUIREMENT_DISC_SLOTS,
      },
    },
  }
}
