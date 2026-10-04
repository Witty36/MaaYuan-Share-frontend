import { Icon } from '@blueprintjs/core'

import { type CSSProperties, Fragment, type Ref } from 'react'

import { getRecorderMetaTargetColor } from '../editor2/action/recorderMeta'
import {
  getRecorderTargetGridPosition,
  getRecorderTargetLabel,
} from '../editor2/action/recordingUtils'
import {
  OPERATION_SHARE_ACTION_COLOR_DEFAULT_NOTES,
  OPERATION_SHARE_ACTION_COLOR_ORDER,
  OPERATION_SHARE_CELL_COLOR_KEYS,
  OPERATION_SHARE_CELL_PALETTE,
  type OperationShareAction,
  type OperationShareCardConfig,
  type OperationShareCellColorKey,
  type OperationShareCellPattern,
  type OperationShareModel,
  type OperationShareOperator,
  type OperationShareRound,
  buildOperationShareActionKey,
  buildOperationShareCellKey,
  createOperationShareCardConfig,
  getOperationShareActionColorNote,
  getOperationShareOtherActions,
  isOperationShareTargetSwitchAction,
} from './operationShareModel'
import {
  hasOperationShareNoteText,
  OperationShareNoteContent,
} from './operationShareNote'
import {
  DEFAULT_OPERATION_SHARE_TABLE_THEME,
  type OperationShareTableTheme,
  type OperationShareTableThemeOverrides,
  getOperationShareTableTheme,
} from './operationShareTheme'
import {
  ShareCardFrame,
  ShareOperatorAvatar,
  ShareSectionTitle,
  shareCardPalette as palette,
} from './shareCardComponents'

const defaultCardConfig = createOperationShareCardConfig()
const accessibleDarkTextColor = '#231f20'

// 动作符号是作业里的固定写法，分享图补一行说明，避免不熟悉缩写的读者看不懂。
const operationShareActionSymbolLegend = [
  { symbol: '↑', meaning: '放大' },
  { symbol: 'A', meaning: '普攻' },
  { symbol: '↓', meaning: '下拉' },
  { symbol: '圈', meaning: 'SP（吕布史子眇）' },
] as const

export const OPERATION_SHARE_ACTION_TEXT_COLORS: Record<
  OperationShareCellColorKey,
  string
> = {
  yellow: '#b45309',
  pink: '#be185d',
  blue: '#1d4ed8',
  green: '#047857',
  ice: '#475569',
}

export const OPERATION_SHARE_ACTION_FILL_COLORS: Record<
  OperationShareCellColorKey,
  string
> = Object.fromEntries(
  OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) => [
    colorKey,
    OPERATION_SHARE_CELL_PALETTE[colorKey].hex,
  ]),
) as Record<OperationShareCellColorKey, string>

export const OPERATION_SHARE_ACTION_BORDER_COLORS: Record<
  OperationShareCellColorKey,
  string
> = {
  yellow: '#fde68a',
  pink: '#fbcfe8',
  blue: '#9fcfeb',
  green: '#c6d8aa',
  ice: '#bfd5df',
}

const OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS: Partial<
  Record<number, OperationShareCellColorKey>
> = {
  2: 'pink',
  3: 'blue',
  4: 'yellow',
  5: 'green',
}

export function getOperationShareActionTextColor(style?: string) {
  if (!style) return undefined
  if (
    Object.prototype.hasOwnProperty.call(
      OPERATION_SHARE_ACTION_TEXT_COLORS,
      style,
    )
  ) {
    return OPERATION_SHARE_ACTION_TEXT_COLORS[
      style as OperationShareCellColorKey
    ]
  }
  return /^#[0-9a-f]{3,8}$/i.test(style) ? style : undefined
}

function getOperationShareActionPaletteKey(
  style?: string,
  targetIndex?: number,
) {
  const explicitColorKey =
    style &&
    Object.prototype.hasOwnProperty.call(
      OPERATION_SHARE_ACTION_FILL_COLORS,
      style,
    )
      ? (style as OperationShareCellColorKey)
      : undefined

  return (
    explicitColorKey ??
    (targetIndex === undefined
      ? undefined
      : OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS[targetIndex])
  )
}

export function getOperationShareActionFillColor(
  style?: string,
  targetIndex?: number,
) {
  const colorKey = getOperationShareActionPaletteKey(style, targetIndex)

  return colorKey ? OPERATION_SHARE_ACTION_FILL_COLORS[colorKey] : undefined
}

export function getOperationShareActionBorderColor(
  style?: string,
  targetIndex?: number,
) {
  const colorKey = getOperationShareActionPaletteKey(style, targetIndex)

  return colorKey ? OPERATION_SHARE_ACTION_BORDER_COLORS[colorKey] : undefined
}

export function getOperationShareActionColor(
  action: OperationShareAction,
  actionColors: OperationShareCardConfig['actionColors'],
  round: number,
) {
  return (
    getOperationShareActionTextColor(
      actionColors[buildOperationShareActionKey(round, action.order)],
    ) ?? getRecorderMetaTargetColor(action.targetIndex)
  )
}

export function getOperationShareActionColorKey(
  action: OperationShareAction,
  actionColors: OperationShareCardConfig['actionColors'],
  round: number,
) {
  const explicitColor =
    actionColors[buildOperationShareActionKey(round, action.order)]
  if (
    explicitColor &&
    (OPERATION_SHARE_CELL_COLOR_KEYS as readonly string[]).includes(
      explicitColor,
    )
  ) {
    return explicitColor as OperationShareCellColorKey
  }

  return action.targetIndex === undefined
    ? undefined
    : OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS[action.targetIndex]
}

function getOperationShareEnemyColorKey(
  action: OperationShareAction,
  config: OperationShareCardConfig,
  round: number,
  cellKey: string,
) {
  const actionColor = config.actionColors[
    buildOperationShareActionKey(round, action.order)
  ]
  if (
    actionColor &&
    (OPERATION_SHARE_CELL_COLOR_KEYS as readonly string[]).includes(actionColor)
  ) {
    return actionColor as OperationShareCellColorKey
  }

  const cellColor = config.cellColors[cellKey]
  if (
    cellColor &&
    (OPERATION_SHARE_CELL_COLOR_KEYS as readonly string[]).includes(cellColor)
  ) {
    return cellColor as OperationShareCellColorKey
  }

  return action.targetIndex === undefined
    ? undefined
    : OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS[action.targetIndex]
}

export function getOperationShareUsedActionColorKeys(
  model: OperationShareModel,
  config: OperationShareCardConfig,
) {
  const usedColors = new Set<OperationShareCellColorKey>()

  model.rounds.forEach((round) => {
    model.actionSlots.forEach((slot) => {
      ;(round.slots[slot] ?? []).forEach((action) => {
        const colorKey = getOperationShareActionColorKey(
          action,
          config.actionColors,
          round.round,
        )
        if (colorKey) usedColors.add(colorKey)
      })
    })
  })

  return OPERATION_SHARE_ACTION_COLOR_ORDER.filter((colorKey) =>
    usedColors.has(colorKey),
  )
}

export function getOperationShareUsedEnemyColorKeys(
  model: OperationShareModel,
  config: OperationShareCardConfig,
) {
  const usedColors = new Set<OperationShareCellColorKey>()

  model.rounds.forEach((round) => {
    model.actionSlots.forEach((slot) => {
      const cellKey = buildOperationShareCellKey(round.round, `slot-${slot}`)
      ;(round.slots[slot] ?? []).forEach((action) => {
        const colorKey = getOperationShareEnemyColorKey(
          action,
          config,
          round.round,
          cellKey,
        )
        if (colorKey) usedColors.add(colorKey)
      })
    })
  })

  return usedColors
}

const shareCellPatternStyles: Record<OperationShareCellPattern, CSSProperties> =
  {
    solid: {},
    vertical: {
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.2) 0 3px, transparent 3px 11px)',
    },
    horizontal: {
      backgroundImage:
        'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0 3px, transparent 3px 11px)',
    },
    diagonal: {
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.18) 0 3px, transparent 3px 11px)',
    },
    cross: {
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.16) 0 3px, transparent 3px 11px), repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.16) 0 3px, transparent 3px 11px)',
    },
    dots: {
      backgroundImage:
        'radial-gradient(circle at 3px 3px, rgba(0, 0, 0, 0.16) 0 2px, transparent 2.25px)',
      backgroundSize: '10px 10px',
    },
  }

// 每种颜色在「增加底纹」打开时使用专属纹样，保证同一张图里不同颜色
// 在黑白打印/色盲场景下也能靠纹样分辨；关闭时全部退化为纯色块。
const shareCellColorVisualStyles: Record<
  string,
  { plain: CSSProperties; patterned: CSSProperties }
> = Object.fromEntries(
  OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) => {
    const { hex, pattern } = OPERATION_SHARE_CELL_PALETTE[colorKey]
    const plain: CSSProperties = {
      backgroundColor: hex,
      color: accessibleDarkTextColor,
    }
    return [
      colorKey,
      { plain, patterned: { ...plain, ...shareCellPatternStyles[pattern] } },
    ]
  }),
)

// 未上色的单元格按回合隔行取底色，始终不带纹样。
const emptyOperationShareCellVisualStyle: CSSProperties = {}

export function getOperationShareCellVisualStyle(
  cellColor?: string,
  showPattern = false,
  tableTheme = DEFAULT_OPERATION_SHARE_TABLE_THEME,
): CSSProperties {
  if (!cellColor) return emptyOperationShareCellVisualStyle

  const colorStyle = shareCellColorVisualStyles[cellColor]
  if (colorStyle) {
    return showPattern ? colorStyle.patterned : colorStyle.plain
  }

  if (
    cellColor === tableTheme.bodyBackgrounds[0] ||
    cellColor === tableTheme.bodyBackgrounds[1]
  ) {
    return { backgroundColor: cellColor, color: tableTheme.text }
  }

  return emptyOperationShareCellVisualStyle
}

function getOperationShareRoundBackground(
  round: number,
  tableColor?: string,
  tableThemeOverrides?: OperationShareTableThemeOverrides,
) {
  const { bodyBackgrounds } = getOperationShareTableTheme(
    tableColor,
    tableThemeOverrides,
  )
  return bodyBackgrounds[(round - 1) % bodyBackgrounds.length]
}

export function getOperationShareActionCellBackground(
  cellColors: OperationShareCardConfig['cellColors'],
  round: number,
  slot: number,
  tableColor?: string,
  tableThemeOverrides?: OperationShareTableThemeOverrides,
) {
  return (
    cellColors[buildOperationShareCellKey(round, `slot-${slot}`)] ??
    getOperationShareRoundBackground(round, tableColor, tableThemeOverrides)
  )
}

export function getOperationShareActionLabel(
  action: OperationShareAction,
  displayOrder = action.order,
) {
  const starColor = action.raw.match(/^重开:无(.+)星$/)?.[1]

  if (starColor) {
    return `${displayOrder}无${starColor}星重开`
  }

  const fallenSlot = action.raw.match(/^重开:检测(\d+)号位阵亡$/)?.[1]
  if (fallenSlot) {
    return `${fallenSlot}号位阵亡就重开`
  }

  const birdSlot = action.raw.match(/^重开:检测(\d+)号位鹦鹉$/)?.[1]
  if (birdSlot) {
    return `${birdSlot}号位鹦鹉未被复制就重开`
  }

  return `${displayOrder}${action.label}`
}

function getOperationShareOperatorActions(round: OperationShareRound) {
  const operatorActions: OperationShareAction[] = []

  Object.values(round.slots).forEach((actions) => {
    operatorActions.push(...actions)
  })

  return operatorActions.sort((left, right) => left.order - right.order)
}

function getOperationShareCountedActions(round: OperationShareRound) {
  const countedActions = getOperationShareOperatorActions(round)

  round.others.forEach((action) => {
    if (isOperationShareTargetSwitchAction(action.raw)) {
      countedActions.push(action)
    }
  })

  return countedActions.sort((left, right) => left.order - right.order)
}

function getOperationShareNoteActionDescription(action: OperationShareAction) {
  const starColor = action.raw.match(/^重开:无(.+)星$/)?.[1]
  if (starColor) return `无${starColor}星重开`

  const fallenSlot = action.raw.match(/^重开:检测(\d+)号位阵亡$/)?.[1]
  if (fallenSlot) return `${fallenSlot}号位阵亡就重开`

  const birdSlot = action.raw.match(/^重开:检测(\d+)号位鹦鹉$/)?.[1]
  if (birdSlot) return `${birdSlot}号位鹦鹉未被复制就重开`

  return action.label
}

export function getOperationShareNoteActionLabel(
  round: OperationShareRound,
  action: OperationShareAction,
  displayOrderByActionOrder: ReadonlyMap<number, number>,
) {
  const description = getOperationShareNoteActionDescription(action)
  const precedingAction = [...getOperationShareCountedActions(round)]
    .reverse()
    .find(
      (countedAction) =>
        countedAction.order <= action.order &&
        displayOrderByActionOrder.has(countedAction.order),
    )

  if (!precedingAction) return description

  const precedingDisplayOrder = displayOrderByActionOrder.get(
    precedingAction.order,
  )
  if (precedingDisplayOrder === undefined) return description

  return `${getOperationShareActionLabel(
    precedingAction,
    precedingDisplayOrder,
  )}后${description}`
}

export function getOperationShareRoundDisplay(
  round: OperationShareRound,
  config: Pick<
    OperationShareCardConfig,
    'showOtherActions' | 'showTargetSwitches' | 'hiddenOtherActionKeys'
  >,
) {
  const otherActions = getOperationShareOtherActions(round, config).filter(
    (action) => isOperationShareTargetSwitchAction(action.raw),
  )
  const countedActions = [
    ...getOperationShareOperatorActions(round),
    ...otherActions,
  ].sort((left, right) => left.order - right.order)

  return {
    otherActions,
    displayOrderByActionOrder: new Map(
      countedActions.map((action, index) => [action.order, index + 1]),
    ),
  }
}

export function getOperationShareRoundNoteText(
  round: OperationShareRound,
  config: Pick<
    OperationShareCardConfig,
    | 'notes'
    | 'roundNoteOverrides'
    | 'showOtherActions'
    | 'showTargetSwitches'
    | 'hiddenOtherActionKeys'
  >,
) {
  const override = config.roundNoteOverrides?.[round.round]
  if (override !== undefined) return override

  const { displayOrderByActionOrder } = getOperationShareRoundDisplay(
    round,
    config,
  )
  const noteActionText = config.showOtherActions
    ? round.others
        .filter(
          (action) =>
            !isOperationShareTargetSwitchAction(action.raw) &&
            !config.hiddenOtherActionKeys?.[
              buildOperationShareActionKey(round.round, action.order)
            ],
        )
        .map((action) =>
          getOperationShareNoteActionLabel(
            round,
            action,
            displayOrderByActionOrder,
          ),
        )
        .join(' ')
    : ''

  return [noteActionText, config.notes[round.round]]
    .filter((text): text is string => Boolean(text))
    .join('\n')
}

export function getOperationShareOperatorStarLabel(
  operator: Pick<OperationShareOperator, 'starLevel'>,
) {
  return operator.starLevel === undefined
    ? undefined
    : `${operator.starLevel} 星`
}

function OperatorAvatar({
  operator,
  slot,
  tableTheme,
}: {
  operator?: OperationShareOperator
  slot: number
  tableTheme: OperationShareTableTheme
}) {
  if (!operator) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center border-2 border-dashed text-lg font-semibold"
        style={{
          borderColor: '#9aaba5',
          color: tableTheme.headerMutedText,
        }}
      >
        {slot} 号位
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden">
      <ShareOperatorAvatar
        className="block aspect-square h-auto w-full bg-white object-cover"
        operator={operator}
        size={180}
      />
      {operator.starLevel !== undefined ? (
        <span
          aria-label={getOperationShareOperatorStarLabel(operator)}
          className="absolute right-2 top-2 flex h-8 min-w-10 items-center justify-center gap-1 rounded-sm border-2 border-white px-1.5 text-sm font-bold text-white"
          style={{ background: '#e96913' }}
        >
          <Icon aria-hidden icon="star" iconSize={14} />
          <span>{operator.starLevel}</span>
        </span>
      ) : null}
    </div>
  )
}

function OperatorLabel({
  operator,
  tableTheme,
}: {
  operator?: OperationShareOperator
  tableTheme: OperationShareTableTheme
}) {
  if (!operator) {
    return <span style={{ color: tableTheme.headerMutedText }}>未配置密探</span>
  }

  return (
    <div
      className="px-1 py-2 text-center"
      style={{ color: tableTheme.headerText }}
    >
      <div className="break-words text-[20px] font-bold leading-tight">
        {operator.name}
      </div>
      {operator.skill || operator.module ? (
        <div
          className="mt-1 text-[12px] font-medium leading-4"
          style={{ color: tableTheme.headerMutedText }}
        >
          {operator.skill ? <div>技能 {operator.skill}</div> : null}
          {operator.module ? <div>{operator.module}模组</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function SubstituteOperator({
  operator,
}: {
  operator: OperationShareOperator
}) {
  return (
    <div className="flex w-[148px] items-center gap-3">
      <ShareOperatorAvatar
        className="h-14 w-14 shrink-0 border-2 border-white bg-white object-cover shadow-sm"
        operator={operator}
        size={56}
      />
      <div className="min-w-0 text-left">
        <div className="break-words text-base font-bold leading-tight">
          {operator.name}
        </div>
        <div className="mt-1 text-xs" style={{ color: palette.muted }}>
          {operator.skill ? `技能 ${operator.skill}` : '可替换'}
        </div>
      </div>
    </div>
  )
}

function ActionList({
  actions,
  displayOrderByActionOrder,
  actionColors,
  round,
  variant = 'default',
}: {
  actions: OperationShareAction[]
  displayOrderByActionOrder: ReadonlyMap<number, number>
  actionColors: OperationShareCardConfig['actionColors']
  round: number
  variant?: 'default' | 'other'
}) {
  const textClassName =
    variant === 'other'
      ? 'grid grid-cols-2 gap-x-1 gap-y-0.5 text-[14px] font-normal leading-[1.25]'
      : 'text-[22px] font-bold leading-[1.25]'
  const alignClassName = variant === 'other' ? 'text-left' : 'text-center'

  if (actions.length === 0) {
    return (
      <span
        className={
          variant === 'other'
            ? 'text-[14px] font-normal opacity-70'
            : 'text-lg opacity-70'
        }
      >
        —
      </span>
    )
  }

  return (
    <div className={`${alignClassName} ${textClassName}`}>
      {actions.map((action, index) => {
        const actionKey = buildOperationShareActionKey(round, action.order)
        const actionFill =
          variant === 'other'
            ? undefined
            : getOperationShareActionFillColor(
                actionColors[actionKey],
                action.targetIndex,
              )
        const actionBorder =
          variant === 'other'
            ? undefined
            : getOperationShareActionBorderColor(
                actionColors[actionKey],
                action.targetIndex,
              )
        const actionStyle =
          variant === 'other'
            ? { whiteSpace: 'nowrap' as const }
            : {
                whiteSpace: 'nowrap' as const,
                ...(actionFill
                  ? {
                      backgroundColor: actionFill,
                      borderRadius: '4px',
                      display: 'inline-block',
                      lineHeight: 1.25,
                      padding: '0 4px',
                      ...(actionBorder
                        ? { border: `0.5px solid ${actionBorder}` }
                        : {}),
                    }
                  : {}),
              }

        return (
          <Fragment key={`${action.order}-${index}`}>
            <span
              className={variant === 'other' ? 'whitespace-nowrap' : undefined}
              style={actionStyle}
            >
              {getOperationShareActionLabel(
                action,
                displayOrderByActionOrder.get(action.order),
              )}
            </span>
            {variant === 'other' ? null : <wbr />}
          </Fragment>
        )
      })}
    </div>
  )
}

const OPERATION_SHARE_ENEMY_TARGET_INDEXES = [1, 2, 3, 4, 5] as const

/**
 * 敌方站位图。布局与悬浮窗一致（中间是进场主位，显示为 0 号位），
 * 颜色沿用动作标色，读者据此判断某个颜色的动作打的是场上哪个敌人。
 */
function EnemyFormationBoard({
  colorNotes,
  tableTheme,
  usedEnemyColorKeys,
}: {
  colorNotes: Partial<Record<OperationShareCellColorKey, string>>
  tableTheme: OperationShareTableTheme
  usedEnemyColorKeys: ReadonlySet<OperationShareCellColorKey>
}) {
  return (
    <div
      aria-label="敌方站位图"
      className="relative shrink-0"
      style={{ height: 110, width: 190 }}
    >
      <span
        className="absolute left-0 top-0 text-base font-semibold leading-none"
        style={{ color: palette.muted }}
      >
        敌方站位图
      </span>
      <div className="absolute inset-x-0 bottom-0 top-[20px]">
        {OPERATION_SHARE_ENEMY_TARGET_INDEXES.map((targetIndex) => {
          const label = getRecorderTargetLabel(targetIndex)
          const position = getRecorderTargetGridPosition(targetIndex)
          const colorKey = OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS[targetIndex]
          const defaultNote = colorKey
            ? OPERATION_SHARE_ACTION_COLOR_DEFAULT_NOTES[colorKey]
            : undefined
          const colorNote = colorKey
            ? getOperationShareActionColorNote(colorKey, colorNotes)
            : undefined
          const customNote =
            colorNote && colorNote !== defaultNote ? colorNote : undefined
          const targetHeading =
            targetIndex === 1 ? '进场Boss' : `${label}号`
          const present =
            targetIndex === 1 ||
            (colorKey !== undefined && usedEnemyColorKeys.has(colorKey))
          const absentBoxColor = '#9ca3af'
          const verticalOffset =
            targetIndex === 2 || targetIndex === 5
              ? -8
              : targetIndex === 3 || targetIndex === 4
                ? -3
                : 0

          return (
            <div
              key={targetIndex}
              className="absolute flex w-12 -translate-x-1/2 -translate-y-2.5 flex-col items-center gap-0.5"
              style={{
                left: `${(position.column - 0.5) * 20}%`,
                top: `calc(${(position.row - 0.5) * 50}% + ${verticalOffset}px)`,
              }}
            >
              <span
                className="inline-flex h-5 w-7 items-center justify-center rounded-[3px] border text-[10px] font-medium leading-none"
                style={
                  present
                    ? {
                        backgroundColor: colorKey
                          ? OPERATION_SHARE_ACTION_FILL_COLORS[colorKey]
                          : tableTheme.headerBackground,
                        borderColor: colorKey
                          ? OPERATION_SHARE_ACTION_BORDER_COLORS[colorKey]
                          : tableTheme.border,
                        borderWidth: colorKey ? 1 : 1.5,
                      }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: absentBoxColor,
                        borderStyle: 'dashed',
                        borderWidth: 1,
                        color: absentBoxColor,
                      }
                }
              >
                {present ? null : '无'}
              </span>
              {present && customNote ? (
                <span className="flex w-[68px] flex-col items-center text-[10px] font-medium leading-[12px]">
                  <span style={{ color: tableTheme.mutedText }}>
                    {targetHeading}
                  </span>
                  <span
                    className="break-words text-center"
                    style={{ color: tableTheme.text }}
                  >
                    {customNote}
                  </span>
                </span>
              ) : null}
              {present && !customNote ? (
                <span
                  className="whitespace-nowrap text-[11px] font-medium leading-none"
                  style={{ color: tableTheme.text }}
                >
                  {targetIndex === 1 ? '进场Boss' : `${label}号敌人`}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function OperationShareCard({
  model,
  cardRef,
  qrDataUrl,
  hideQrCode = true,
  showShortCode = true,
  config = defaultCardConfig,
}: {
  model: OperationShareModel
  cardRef?: Ref<HTMLDivElement>
  qrDataUrl: string
  hideQrCode?: boolean
  showShortCode?: boolean
  config?: OperationShareCardConfig
}) {
  const tableTheme = getOperationShareTableTheme(
    config.tableColor,
    config.tableThemeOverrides,
  )
  const showOtherActionsColumn = config.showTargetSwitches
  const showNotesColumn = config.showNotes || config.showOtherActions
  const roundColumnWidthClassName = showNotesColumn ? 'w-[80px]' : 'w-[110px]'
  const notesColumnWidthClassName = showOtherActionsColumn
    ? 'w-[212px]'
    : 'w-[302px]'
  const usedActionColorKeys = getOperationShareUsedActionColorKeys(
    model,
    config,
  )
  const actionColorLegendItems = usedActionColorKeys
    .map((colorKey) => ({
      colorKey,
      note: getOperationShareActionColorNote(colorKey, config.actionColorNotes),
    }))
    .filter(
      (item): item is { colorKey: OperationShareCellColorKey; note: string } =>
        Boolean(item.note),
    )
  const usedEnemyColorKeySet = getOperationShareUsedEnemyColorKeys(
    model,
    config,
  )
  const formationColorKeys = new Set(
    Object.values(OPERATION_SHARE_TARGET_ACTION_COLOR_KEYS).filter(
      (colorKey): colorKey is OperationShareCellColorKey =>
        colorKey !== undefined,
    ),
  )
  const standaloneActionColorLegendItems = actionColorLegendItems.filter(
    (item) => !formationColorKeys.has(item.colorKey),
  )
  const operationGuide =
    model.rounds.length > 0 || standaloneActionColorLegendItems.length > 0 ? (
      <div
        className="flex w-full items-center justify-between gap-5"
      >
        <div className="ml-[15px] min-w-0 flex-1">
          <div
            className="text-base font-semibold"
            style={{ color: palette.muted }}
          >
            基础动作
          </div>
          {model.rounds.length > 0 ? (
            <div
              className="mt-2 flex flex-col items-start gap-y-1 text-[13px] leading-[18px]"
              style={{ color: palette.muted }}
            >
              {operationShareActionSymbolLegend.map(({ symbol, meaning }) => (
                <span
                  key={symbol}
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span
                    className="font-bold"
                    style={{ color: tableTheme.text }}
                  >
                    {symbol}
                  </span>
                  {meaning}
                </span>
              ))}
            </div>
          ) : null}
          {standaloneActionColorLegendItems.length > 0 ? (
            <div
              className={`flex flex-col items-start gap-y-1 text-[12px] leading-[18px] ${
                model.rounds.length > 0 ? 'mt-2 border-t pt-2' : ''
              }`}
              style={{
                borderColor: '#b9c4c0',
                color: palette.muted,
              }}
            >
              {standaloneActionColorLegendItems.map(({ colorKey, note }) => (
                <span
                  key={colorKey}
                  className="inline-flex min-w-0 items-center gap-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px]"
                    style={{
                      backgroundColor:
                        getOperationShareActionFillColor(colorKey),
                      border: `0.5px solid ${getOperationShareActionBorderColor(colorKey)}`,
                    }}
                  />
                  <span className="min-w-0">{note}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {model.rounds.length > 0 ? (
          <div className="shrink-0">
            <EnemyFormationBoard
              colorNotes={config.actionColorNotes}
              tableTheme={tableTheme}
              usedEnemyColorKeys={usedEnemyColorKeySet}
            />
          </div>
        ) : null}
      </div>
    ) : undefined

  return (
    <ShareCardFrame
      backgroundColor={tableTheme.pageBackground}
      cardRef={cardRef}
      eyebrow="MaaYuan · 作业分享"
      headerRight={operationGuide}
      hideQrCode={hideQrCode}
      model={model}
      qrDataUrl={qrDataUrl}
      showShortCode={showShortCode}
    >
      <section className="mt-10">
        <ShareSectionTitle>作战编排</ShareSectionTitle>
        <table
          className="mt-5 w-full table-fixed border-collapse text-center"
          style={{
            borderColor: tableTheme.border,
            color: tableTheme.text,
          }}
        >
          <thead>
            <tr aria-label="密探头像">
              <td
                className={`${roundColumnWidthClassName} border-2 p-0`}
                style={{
                  borderColor: tableTheme.border,
                  background: tableTheme.headerBackground,
                }}
              />
              {model.actionSlots.map((slot) => (
                <td
                  key={slot}
                  className="border-2 p-0 align-middle"
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                >
                  <OperatorAvatar
                    operator={model.operators[slot - 1]}
                    slot={slot}
                    tableTheme={tableTheme}
                  />
                </td>
              ))}
              {showOtherActionsColumn ? (
                <td
                  className="w-[104px] border-2 p-0"
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                />
              ) : null}
              {showNotesColumn ? (
                <td
                  className={`${notesColumnWidthClassName} border-2 p-0`}
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                />
              ) : null}
            </tr>
            <tr
              aria-label="列标题"
              style={{
                background: tableTheme.headerBackground,
                color: tableTheme.headerText,
              }}
            >
              <th
                className="border-2 px-3 py-3 text-[21px] font-bold"
                scope="col"
                style={{ borderColor: tableTheme.border }}
              >
                回合
              </th>
              {model.actionSlots.map((slot) => (
                <th
                  key={slot}
                  className="border-2 px-1 py-2 align-middle"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  <OperatorLabel
                    operator={model.operators[slot - 1]}
                    tableTheme={tableTheme}
                  />
                </th>
              ))}
              {showOtherActionsColumn ? (
                <th
                  className="border-2 px-3 py-3 text-lg font-bold"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  其他动作
                </th>
              ) : null}
              {showNotesColumn ? (
                <th
                  className="border-2 px-3 py-3 text-lg font-bold"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  备注
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {model.rounds.length > 0 ? (
              model.rounds.map((round) => {
                const { otherActions, displayOrderByActionOrder } =
                  getOperationShareRoundDisplay(round, config)
                const noteText = getOperationShareRoundNoteText(round, config)
                const hasNoteText = hasOperationShareNoteText(noteText)
                const rowBackground = getOperationShareRoundBackground(
                  round.round,
                  config.tableColor,
                  config.tableThemeOverrides,
                )

                return (
                  <tr key={round.round} style={{ background: rowBackground }}>
                    <th
                      className="border-2 px-3 py-3 text-[19px] leading-tight"
                      style={{
                        borderColor: tableTheme.border,
                        color: tableTheme.text,
                      }}
                    >
                      <span className="block text-[24px] font-bold">
                        {round.round}
                      </span>
                    </th>
                    {model.actionSlots.map((slot) => (
                      <td
                        key={slot}
                        className="border-2 px-1.5 py-2 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          ...getOperationShareCellVisualStyle(
                            getOperationShareActionCellBackground(
                              config.cellColors,
                              round.round,
                              slot,
                              config.tableColor,
                              config.tableThemeOverrides,
                            ),
                            config.showCellPattern,
                            tableTheme,
                          ),
                        }}
                      >
                        <ActionList
                          actionColors={config.actionColors}
                          actions={round.slots[slot] ?? []}
                          displayOrderByActionOrder={displayOrderByActionOrder}
                          round={round.round}
                        />
                      </td>
                    ))}
                    {showOtherActionsColumn ? (
                      <td
                        className="border-2 px-1 py-2 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          background: rowBackground,
                        }}
                      >
                        <ActionList
                          actionColors={config.actionColors}
                          actions={otherActions}
                          displayOrderByActionOrder={displayOrderByActionOrder}
                          round={round.round}
                          variant="other"
                        />
                      </td>
                    ) : null}
                    {showNotesColumn ? (
                      <td
                        className="border-2 px-3 py-3 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          background: rowBackground,
                          color: hasNoteText
                            ? tableTheme.text
                            : tableTheme.mutedText,
                        }}
                      >
                        <div
                          className={`whitespace-pre-wrap break-words text-[15px] font-medium leading-5 ${
                            hasNoteText ? 'text-left' : 'text-center'
                          }`}
                        >
                          {hasNoteText ? (
                            <OperationShareNoteContent value={noteText} />
                          ) : (
                            '—'
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })
            ) : (
              <tr style={{ background: tableTheme.bodyBackgrounds[0] }}>
                <td
                  className="border-2 px-4 py-8 text-base font-medium"
                  colSpan={
                    model.actionSlots.length +
                    1 +
                    (showOtherActionsColumn ? 1 : 0) +
                    (showNotesColumn ? 1 : 0)
                  }
                  style={{
                    borderColor: tableTheme.border,
                    color: tableTheme.mutedText,
                  }}
                >
                  此作业未定义动作序列
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {model.groups.length > 0 ? (
        <section className="mt-9">
          <ShareSectionTitle>可替换密探</ShareSectionTitle>
          <div className="mt-4 border-y" style={{ borderColor: '#b9c4c0' }}>
            {model.groups.map((group, index) => (
              <div
                key={`${group.name}-${index}`}
                className="flex min-h-[92px] items-center gap-6 px-4 py-4"
                style={{
                  background: index % 2 === 0 ? palette.panel : '#eee8dc',
                }}
              >
                <h3
                  className="w-[150px] shrink-0 border-r pr-5 text-lg font-bold"
                  style={{ borderColor: '#b9c4c0' }}
                >
                  {group.name}
                </h3>
                {group.operators.length > 0 ? (
                  <div className="flex flex-1 flex-wrap gap-x-5 gap-y-3">
                    {group.operators.map((operator, operatorIndex) => (
                      <SubstituteOperator
                        key={`${operator.rawName}-${operatorIndex}`}
                        operator={operator}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: palette.muted }}>
                    该密探组未配置可替换密探
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </ShareCardFrame>
  )
}
