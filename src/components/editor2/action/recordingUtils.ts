import type { RoundActionsInput } from './roundMapping'

export const RECORDER_SLOT_KEYS = ['1', '2', '3', '4', '5'] as const

export type RecorderTokenDisplay =
  | {
      area: 'slot'
      slot: number
      label: string
    }
  | {
      area: 'extra'
      label: string
    }

export interface RecorderRoundItem {
  index: number
  order: number
  token: string
  targetIndex?: number
  automaticTargetSwitch?: boolean
  display: RecorderTokenDisplay
}

export interface RecorderRoundGroups {
  slots: Record<number, RecorderRoundItem[]>
  extras: RecorderRoundItem[]
}

const BASE_ACTION_LABELS: Record<string, string> = {
  普: 'A',
  大: '↑',
  下: '↓',
  sp: '圈',
}

const RECORDER_TARGET_METADATA_PREFIX = '目标位:'
export const RECORDER_AUTOMATIC_TARGET_SWITCH_METADATA = '自动切换'

export function serializeRecorderTargetMetadata(
  targetIndex?: number,
): string | undefined {
  return targetIndex === undefined
    ? undefined
    : `${RECORDER_TARGET_METADATA_PREFIX}${targetIndex}`
}

export function parseRecorderTargetMetadata(
  value?: string,
): number | undefined {
  const match = value?.trim().match(/^目标位:([1-5])$/)
  return match ? Number(match[1]) : undefined
}

export function isRecorderAutomaticTargetSwitchMetadata(
  value?: string,
): boolean {
  return value?.trim() === RECORDER_AUTOMATIC_TARGET_SWITCH_METADATA
}

export function isRecorderAttackToken(token: string): boolean {
  return /^[1-5](?:[普大下]|sp)$/.test(token.trim())
}

export function isRecorderTargetSwitchToken(token: string): boolean {
  const normalized = token.trim()
  return (
    normalized === '额外:左侧目标' || normalized === '额外:右侧目标'
  )
}

export function cloneRoundActions(
  source: RoundActionsInput,
): RoundActionsInput {
  const result: RoundActionsInput = {}
  for (const [round, actions] of Object.entries(source)) {
    result[round] = actions.map((entry) => [...entry])
  }
  return result
}

export function getRecorderRoundNumbers(input: RoundActionsInput): number[] {
  return Object.keys(input)
    .map((round) => Number(round))
    .filter((round) => Number.isFinite(round) && round > 0)
    .sort((a, b) => a - b)
}

export function getNextRecorderRound(input: RoundActionsInput): number {
  const numbers = getRecorderRoundNumbers(input)
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
}

export function ensureRecorderRound(
  input: RoundActionsInput,
  round: number,
): RoundActionsInput {
  const key = String(round)
  if (input[key]) {
    return input
  }
  const result = cloneRoundActions(input)
  result[key] = []
  return result
}

export function appendRecorderToken(
  input: RoundActionsInput,
  round: number,
  token: string,
  targetIndex?: number,
): RoundActionsInput {
  const key = String(round)
  const result = ensureRecorderRound(cloneRoundActions(input), round)
  const targetMetadata = serializeRecorderTargetMetadata(targetIndex)
  result[key].push(
    targetMetadata === undefined ? [token] : [token, targetMetadata],
  )
  return result
}

export function setRecorderTokenTarget(
  input: RoundActionsInput,
  round: number,
  index: number,
  targetIndex?: number,
): RoundActionsInput {
  const result = cloneRoundActions(input)
  const key = String(round)
  const actions = result[key] ?? []
  const entry = actions[index]
  if (!entry) {
    return result
  }

  const targetMetadata = serializeRecorderTargetMetadata(targetIndex)
  result[key] = actions.map((action, actionIndex) =>
    actionIndex === index
      ? targetMetadata === undefined
        ? action.filter(
            (value, valueIndex) =>
              valueIndex === 0 || !parseRecorderTargetMetadata(value),
          )
        : [
            action[0],
            ...action
              .slice(1)
              .filter((value) => !parseRecorderTargetMetadata(value)),
            targetMetadata,
          ]
      : action,
  )
  return result
}

const clampTargetIndex = (targetIndex: number, enemyCount: number) =>
  Math.min(Math.max(targetIndex, 1), Math.max(enemyCount, 1))

const moveRecorderTarget = (
  currentTargetIndex: number,
  direction: -1 | 1,
  enemyCount: number,
) => ((currentTargetIndex - 1 + direction + enemyCount) % enemyCount) + 1

const getRecorderTargetSwitchTokens = (
  previousTargetIndex: number,
  targetIndex: number,
  enemyCount: number,
): string[] => {
  if (enemyCount <= 1 || previousTargetIndex === targetIndex) {
    return []
  }

  const clockwiseDistance =
    (targetIndex - previousTargetIndex + enemyCount) % enemyCount
  const counterDistance =
    (previousTargetIndex - targetIndex + enemyCount) % enemyCount

  // 与 auto-fight-gen 保持一致：顺时针为右侧目标，逆时针为左侧目标。
  return new Array(
    clockwiseDistance <= counterDistance
      ? clockwiseDistance
      : counterDistance,
  ).fill(
    clockwiseDistance <= counterDistance ? '额外:右侧目标' : '额外:左侧目标',
  )
}

export function rebuildRecorderTargetSwitches(
  input: RoundActionsInput,
  enemyCount: number,
  initialTargetIndex = 1,
): RoundActionsInput {
  const safeEnemyCount = Math.min(Math.max(Math.round(enemyCount), 1), 5)
  const result: RoundActionsInput = {}
  let currentTargetIndex = clampTargetIndex(initialTargetIndex, safeEnemyCount)

  getRecorderRoundNumbers(input).forEach((round) => {
    const key = String(round)
    const rebuilt: string[][] = []

    ;(input[key] ?? []).forEach((entry) => {
      const metadata = entry.slice(1)
      if (
        metadata.some((value) =>
          isRecorderAutomaticTargetSwitchMetadata(value),
        )
      ) {
        return
      }

      const token = entry[0]?.trim() ?? ''
      const targetIndex = metadata
        .map((value) => parseRecorderTargetMetadata(value))
        .find((value) => value !== undefined)

      if (token === '额外:左侧目标' || token === '额外:右侧目标') {
        rebuilt.push([...entry])
        if (currentTargetIndex !== undefined) {
          currentTargetIndex = moveRecorderTarget(
            currentTargetIndex,
            token === '额外:左侧目标' ? -1 : 1,
            safeEnemyCount,
          )
        }
        return
      }

      if (
        isRecorderAttackToken(token) &&
        targetIndex !== undefined &&
        safeEnemyCount > 0
      ) {
        const normalizedTargetIndex = clampTargetIndex(
          targetIndex,
          safeEnemyCount,
        )
        if (currentTargetIndex === undefined) {
          currentTargetIndex = normalizedTargetIndex
        } else if (currentTargetIndex !== normalizedTargetIndex) {
          getRecorderTargetSwitchTokens(
            currentTargetIndex,
            normalizedTargetIndex,
            safeEnemyCount,
          ).forEach((switchToken) => {
            rebuilt.push([
              switchToken,
              RECORDER_AUTOMATIC_TARGET_SWITCH_METADATA,
            ])
          })
          currentTargetIndex = normalizedTargetIndex
        }
      }

      rebuilt.push([...entry])
    })

    result[key] = rebuilt
  })

  return result
}

export function removeRecorderToken(
  input: RoundActionsInput,
  round: number,
  index: number,
): RoundActionsInput {
  const result = cloneRoundActions(input)
  const key = String(round)
  const actions = result[key] ?? []
  result[key] = actions.filter((_, actionIndex) => actionIndex !== index)
  return result
}

export function groupRecorderRoundActions(
  input: RoundActionsInput,
  round: number,
  options: { showTargetSwitches?: boolean } = {},
): RecorderRoundGroups {
  const slots: Record<number, RecorderRoundItem[]> = {}
  const extras: RecorderRoundItem[] = []
  let visibleOrder = 0

  ;(input[String(round)] ?? []).forEach((entry, index) => {
    const token = entry[0] ?? ''
    if (
      options.showTargetSwitches === false &&
      isRecorderTargetSwitchToken(token)
    ) {
      return
    }

    visibleOrder += 1
    const metadata = entry.slice(1)
    const display = describeRecorderToken(token)
    const item: RecorderRoundItem = {
      index,
      order: visibleOrder,
      token,
      targetIndex: metadata
        .map((value) => parseRecorderTargetMetadata(value))
        .find((value) => value !== undefined),
      automaticTargetSwitch: metadata.some((value) =>
        isRecorderAutomaticTargetSwitchMetadata(value),
      ),
      display,
    }

    if (display.area === 'slot') {
      ;(slots[display.slot] ??= []).push(item)
    } else {
      extras.push(item)
    }
  })

  return { slots, extras }
}

export function clearRecorderRound(
  input: RoundActionsInput,
  round: number,
): RoundActionsInput {
  const result = cloneRoundActions(input)
  result[String(round)] = []
  return result
}

export function describeRecorderToken(rawToken: string): RecorderTokenDisplay {
  const token = rawToken.trim()
  const baseMatch = token.match(/^([1-5])([普大下]|sp)$/)
  if (baseMatch) {
    return {
      area: 'slot',
      slot: Number(baseMatch[1]),
      label: BASE_ACTION_LABELS[baseMatch[2]] ?? baseMatch[2],
    }
  }

  if (token === '额外:左侧目标') {
    return { area: 'extra', label: '左侧目标' }
  }
  if (token === '额外:右侧目标') {
    return { area: 'extra', label: '右侧目标' }
  }
  if (token.startsWith('额外:')) {
    return { area: 'extra', label: token.slice('额外:'.length) || '额外' }
  }

  return { area: 'extra', label: token || '未知' }
}

export function formatRecorderRoundItem(item: RecorderRoundItem): string {
  return `${item.order}${item.display.label}`
}
