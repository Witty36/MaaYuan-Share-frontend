import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Icon,
  Spinner,
  Switch,
} from '@blueprintjs/core'

import { useAtomValue } from 'jotai'
import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getOperationShareImageConfigs,
  updateOperationShareImageConfig,
} from '../../apis/operation-share-image-config'
import { languageAtom, useTranslation } from '../../i18n/i18n'
import type { Operation } from '../../models/operation'
import { formatError } from '../../utils/error'
import { AppToaster } from '../Toaster'
import { DeployedOperatorsShareCard } from './DeployedOperatorsShareCard'
import {
  OperationShareCard,
  getOperationShareActionColor,
  getOperationShareActionLabel,
  getOperationShareActionTextColor,
  getOperationShareCellVisualStyle,
  getOperationShareNoteActionLabel,
  getOperationShareRoundDisplay,
  getOperationShareRoundNoteText,
} from './OperationShareCard'
import {
  createOperationShareQrDataUrl,
  renderOperationShareCardBlob,
} from './operationShareImage'
import {
  OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
  OPERATION_SHARE_CARD_KEYS,
  OPERATION_SHARE_CELL_COLOR_KEYS,
  ObjectUrlStore,
  type OperationShareCardConfig,
  type OperationShareCardKind,
  type OperationShareCellColorKey,
  type OperationShareCellColumn,
  type OperationShareRound,
  buildOperationShareActionKey,
  buildOperationShareCardConfigPayload,
  buildOperationShareCellKey,
  buildOperationShareDiscKey,
  buildOperationShareFilename,
  buildOperationShareModel,
  buildOperationShareUrl,
  createOperationShareCardConfig,
  getOperationShareCellSelectionState,
  getOperationShareOtherActions,
  getOperationShareRemoteConfigByKind,
  isOperationShareTargetSwitchAction,
  mergeOperationShareRemoteConfigs,
  readOperationShareCardConfig,
  readOperationShareShortCode,
  replaceOperationShareCardConfigKind,
  resolveOperationShareCardConfig,
  resolveOperationShareShortCode,
  saveOperationShareCardConfig,
  saveOperationShareShortCode,
  updateOperationShareCellSelection,
} from './operationShareModel'
import {
  DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR,
  OPERATION_SHARE_TABLE_THEME_PRESETS,
  type OperationShareTableThemeOverrideKey,
  getOperationShareTableTheme,
  normalizeOperationShareTableColor,
} from './operationShareTheme'

type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error'
type ColorMode = 'action' | 'cell'
type EditMode = 'color' | 'note'

function appendOperationShareNoteText(note: string, text: string) {
  const trimmed = note.trim()
  if (!trimmed) return text
  if (trimmed.includes(text)) return trimmed
  return `${trimmed}\n${text}`
}

function removeOperationShareNoteText(note: string, text: string) {
  return note
    .split(text)
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export default function OperationShareDialog({
  operation,
  canManageAuthorConfig,
  onClose,
}: {
  operation: Operation
  canManageAuthorConfig: boolean
  onClose: () => void
}) {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  const maayuanUrl = useMemo(
    () => buildOperationShareUrl(operation.id, window.location.origin),
    [operation.id],
  )
  const model = useMemo(
    () => buildOperationShareModel(operation, language, maayuanUrl),
    [operation, language, maayuanUrl],
  )
  // 「神秘代码」默认值：仅在用户显式切换前生效，私密作业默认不分享。
  // 独立用例，使下面的重置 effect 无需依赖 operation 对象本身。
  const defaultShowShortCode = useMemo(
    () =>
      resolveOperationShareShortCode(
        operation,
        readOperationShareShortCode(operation.id),
      ),
    [operation],
  )
  const [cardNode, setCardNode] = useState<HTMLDivElement | null>(null)
  const localConfigRef = useRef(readOperationShareCardConfig(operation.id))
  const [cardConfig, setCardConfig] = useState(
    () => localConfigRef.current ?? createOperationShareCardConfig(),
  )
  const shouldPersistCardConfigRef = useRef(false)
  const [authorCardConfig, setAuthorCardConfig] = useState(() =>
    createOperationShareCardConfig(),
  )
  const [remoteConfigsByKind, setRemoteConfigsByKind] = useState(() =>
    getOperationShareRemoteConfigByKind([]),
  )
  const [authorConfigStatus, setAuthorConfigStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [authorConfigError, setAuthorConfigError] = useState<string>()
  const [savingCardKind, setSavingCardKind] = useState<OperationShareCardKind>()
  const [selectedActionKeys, setSelectedActionKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [colorMode, setColorMode] = useState<ColorMode>('action')
  const [editMode, setEditMode] = useState<EditMode>('color')
  const urlStoreRef = useRef(new ObjectUrlStore())
  const generationRef = useRef(0)
  const generatingRef = useRef(false)
  const [cardKind, setCardKind] = useState<OperationShareCardKind>('actions')
  const [hideQrCode, setHideQrCode] = useState(true)
  const shouldPersistShortCodeRef = useRef(false)
  const [showShortCode, setShowShortCode] = useState(defaultShowShortCode)
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [qrCode, setQrCode] = useState<{
    targetUrl: string
    dataUrl: string
  }>()
  const [isTableThemeAdvancedOpen, setIsTableThemeAdvancedOpen] =
    useState(false)
  const qrDataUrl =
    qrCode?.targetUrl === model.qrTargetUrl ? qrCode.dataUrl : undefined
  const [error, setError] = useState<string>()

  const updateCardConfig = useCallback(
    (
      updater: (current: OperationShareCardConfig) => OperationShareCardConfig,
    ) => {
      shouldPersistCardConfigRef.current = true
      setCardConfig(updater)
    },
    [],
  )

  useEffect(() => {
    if (!shouldPersistCardConfigRef.current) return
    shouldPersistCardConfigRef.current = false
    saveOperationShareCardConfig(operation.id, cardConfig)
  }, [cardConfig, operation.id])

  useEffect(() => {
    if (!shouldPersistShortCodeRef.current) return
    shouldPersistShortCodeRef.current = false
    saveOperationShareShortCode(operation.id, showShortCode)
  }, [operation.id, showShortCode])

  useEffect(() => {
    let active = true
    const localConfig = readOperationShareCardConfig(operation.id)
    localConfigRef.current = localConfig
    shouldPersistCardConfigRef.current = false
    shouldPersistShortCodeRef.current = false
    setCardConfig(localConfig ?? createOperationShareCardConfig())
    setShowShortCode(defaultShowShortCode)
    setAuthorConfigStatus('loading')
    setAuthorConfigError(undefined)

    void getOperationShareImageConfigs(operation.id)
      .then((configs) => {
        if (!active) return
        const authorConfig = mergeOperationShareRemoteConfigs(configs)
        setAuthorCardConfig(authorConfig)
        setRemoteConfigsByKind(getOperationShareRemoteConfigByKind(configs))
        setCardConfig(
          resolveOperationShareCardConfig(localConfig, authorConfig),
        )
        setAuthorConfigStatus('ready')
      })
      .catch((reason) => {
        if (!active) return
        setAuthorConfigStatus('error')
        setAuthorConfigError(formatError(reason))
      })

    return () => {
      active = false
    }
  }, [defaultShowShortCode, operation.id])

  const isPrivateOperation = operation.status === CopilotInfoStatusEnum.Private
  // 原创作业（无外站原贴）的二维码编码的就是站内地址，关闭神秘代码时必须一并隐藏
  const qrFollowsShortCode =
    !showShortCode && model.qrTargetUrl === model.maayuanUrl
  const effectiveHideQrCode = hideQrCode || qrFollowsShortCode
  const shortCodeHint = showShortCode
    ? undefined
    : isPrivateOperation
      ? t.components.viewer.OperationViewer.share_image_short_code_private_hint
      : qrFollowsShortCode
        ? t.components.viewer.OperationViewer.share_image_qr_follows_short_code
        : t.components.viewer.OperationViewer.share_image_short_code_hidden_hint

  const cellColorNames: Record<OperationShareCellColorKey, string> = {
    yellow: t.components.viewer.OperationViewer.share_cell_color_yellow,
    pink: t.components.viewer.OperationViewer.share_cell_color_pink,
    blue: t.components.viewer.OperationViewer.share_cell_color_blue,
    green: t.components.viewer.OperationViewer.share_cell_color_green,
    ice: t.components.viewer.OperationViewer.share_cell_color_ice,
  }

  const editableColumns = useMemo<
    Array<{ key: OperationShareCellColumn; slot: number; label: string }>
  >(
    () =>
      model.actionSlots.map((slot) => ({
        key: `slot-${slot}` as OperationShareCellColumn,
        slot,
        label: model.operators[slot - 1]?.name || `${slot} 号位`,
      })),
    [model.actionSlots, model.operators],
  )
  const editableColumnGroups = useMemo(
    () =>
      editableColumns.map((column) => ({
        ...column,
        actionKeys: model.rounds.flatMap((round) =>
          (round.slots[column.slot] ?? []).map((action) =>
            buildOperationShareActionKey(round.round, action.order),
          ),
        ),
        cellKeys: model.rounds.map((round) =>
          buildOperationShareCellKey(round.round, column.key),
        ),
      })),
    [editableColumns, model.rounds],
  )
  const editableRoundGroups = useMemo(
    () =>
      model.rounds.map((sourceRound) => ({
        round: sourceRound.round,
        sourceRound,
        actionKeys: editableColumns.flatMap((column) =>
          (sourceRound.slots[column.slot] ?? []).map((action) =>
            buildOperationShareActionKey(sourceRound.round, action.order),
          ),
        ),
        cellKeys: editableColumns.map((column) =>
          buildOperationShareCellKey(sourceRound.round, column.key),
        ),
      })),
    [editableColumns, model.rounds],
  )

  const invalidatePreview = useCallback(() => {
    generationRef.current += 1
    generatingRef.current = false
    urlStoreRef.current.revoke()
    setBlob(undefined)
    setPreviewUrl(undefined)
    setError(undefined)
    setStatus('idle')
  }, [])

  const updateOption = (
    option: 'showTargetSwitches' | 'showNotes' | 'showCellPattern',
    checked: boolean,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => ({ ...current, [option]: checked }))
  }

  const updateNotesColumnVisibility = (checked: boolean) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      showNotes: checked,
      showOtherActions: checked,
    }))
  }

  const updateTableColor = (color?: string) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      tableColor: normalizeOperationShareTableColor(color),
      tableThemeOverrides: undefined,
    }))
  }

  const updateTableThemeOverride = (
    key: OperationShareTableThemeOverrideKey,
    color: string,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const tableThemeOverrides = { ...current.tableThemeOverrides }
      const normalizedColor = normalizeOperationShareTableColor(color)
      if (normalizedColor) tableThemeOverrides[key] = normalizedColor
      else delete tableThemeOverrides[key]

      return {
        ...current,
        tableThemeOverrides:
          Object.keys(tableThemeOverrides).length > 0
            ? tableThemeOverrides
            : undefined,
      }
    })
  }

  const resetTableTheme = () => {
    setIsTableThemeAdvancedOpen(false)
    updateTableColor()
  }

  const changeCardKind = (nextKind: OperationShareCardKind) => {
    if (nextKind === cardKind) return
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    setCardKind(nextKind)
  }

  const updateQrCodeVisibility = (hidden: boolean) => {
    invalidatePreview()
    setHideQrCode(hidden)
  }

  const updateShortCodeVisibility = (shareShortCode: boolean) => {
    invalidatePreview()
    shouldPersistShortCodeRef.current = true
    setShowShortCode(shareShortCode)
  }

  const updateRoundNote = (round: number, note: string) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      roundNoteOverrides: {
        ...current.roundNoteOverrides,
        [round]: note,
      },
    }))
  }

  const toggleOtherActionInNote = (
    round: OperationShareRound,
    label: string,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const note = getOperationShareRoundNoteText(round, current)
      const included = note.includes(label)
      return {
        ...current,
        roundNoteOverrides: {
          ...current.roundNoteOverrides,
          [round.round]: included
            ? removeOperationShareNoteText(note, label)
            : appendOperationShareNoteText(note, label),
        },
      }
    })
  }

  const restoreRoundNote = (round: number) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const roundNoteOverrides = { ...current.roundNoteOverrides }
      delete roundNoteOverrides[round]

      const hiddenOtherActionKeys = { ...current.hiddenOtherActionKeys }
      Object.keys(hiddenOtherActionKeys).forEach((key) => {
        if (key.startsWith(`${round}:`)) delete hiddenOtherActionKeys[key]
      })

      return {
        ...current,
        roundNoteOverrides:
          Object.keys(roundNoteOverrides).length > 0
            ? roundNoteOverrides
            : undefined,
        hiddenOtherActionKeys:
          Object.keys(hiddenOtherActionKeys).length > 0
            ? hiddenOtherActionKeys
            : undefined,
      }
    })
  }

  const toggleActionSelection = (key: string, checked: boolean) => {
    setSelectedActionKeys((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleActionGroupSelection = (
    actionKeys: readonly string[],
    checked: boolean,
  ) => {
    setSelectedActionKeys((current) =>
      updateOperationShareCellSelection(current, actionKeys, checked),
    )
  }

  const toggleCellSelection = (key: string, checked: boolean) => {
    setSelectedCellKeys((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleCellGroupSelection = (
    cellKeys: readonly string[],
    checked: boolean,
  ) => {
    setSelectedCellKeys((current) =>
      updateOperationShareCellSelection(current, cellKeys, checked),
    )
  }

  const applyActionColor = (style: string) => {
    if (selectedActionKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedActionKeys.forEach((key) => {
        actionColors[key] = style
      })
      return { ...current, actionColors }
    })
    setSelectedActionKeys(new Set())
  }

  const applyCellColor = (style: string) => {
    if (selectedCellKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const cellColors = { ...current.cellColors }
      selectedCellKeys.forEach((key) => {
        cellColors[key] = style
      })
      return { ...current, cellColors }
    })
    setSelectedCellKeys(new Set())
  }

  const clearActionColor = () => {
    if (selectedActionKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedActionKeys.forEach((key) => {
        delete actionColors[key]
      })
      return { ...current, actionColors }
    })
    setSelectedActionKeys(new Set())
  }

  const clearCellColor = () => {
    if (selectedCellKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const cellColors = { ...current.cellColors }
      selectedCellKeys.forEach((key) => {
        delete cellColors[key]
      })
      return { ...current, cellColors }
    })
    setSelectedCellKeys(new Set())
  }

  const restoreDefaults = () => {
    const defaults = createOperationShareCardConfig()
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    updateCardConfig(() => defaults)
  }

  const restoreAuthorConfig = () => {
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    updateCardConfig((current) =>
      replaceOperationShareCardConfigKind(cardKind, current, authorCardConfig),
    )
  }

  const updateRequiredDisc = (key: string, checked: boolean) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const requiredDiscs = { ...current.requiredDiscs }
      if (checked) requiredDiscs[key] = true
      else delete requiredDiscs[key]
      return { ...current, requiredDiscs }
    })
  }

  const clearRequiredDiscs = () => {
    if (Object.keys(cardConfig.requiredDiscs).length === 0) return
    invalidatePreview()
    updateCardConfig((current) => ({ ...current, requiredDiscs: {} }))
  }

  const generate = useCallback(async () => {
    if (!cardNode || !qrDataUrl || generatingRef.current) return

    const generation = ++generationRef.current
    generatingRef.current = true
    setStatus('generating')
    setError(undefined)
    try {
      const nextBlob = await renderOperationShareCardBlob(cardNode)
      if (generation !== generationRef.current) return

      const nextUrl = urlStoreRef.current.replace(nextBlob)
      setBlob(nextBlob)
      setPreviewUrl(nextUrl)
      setStatus('ready')
    } catch (reason) {
      if (generation !== generationRef.current) return
      setStatus('error')
      setError(formatError(reason))
    } finally {
      if (generation === generationRef.current) generatingRef.current = false
    }
  }, [cardNode, qrDataUrl])

  useEffect(() => {
    let active = true
    const createQrCode = async () => {
      try {
        const nextQrDataUrl = await createOperationShareQrDataUrl(
          model.qrTargetUrl,
        )
        if (active) {
          setQrCode({ targetUrl: model.qrTargetUrl, dataUrl: nextQrDataUrl })
        }
      } catch (reason) {
        if (!active) return
        setStatus('error')
        setError(formatError(reason))
      }
    }

    void createQrCode()
    return () => {
      active = false
    }
  }, [model.qrTargetUrl])

  useEffect(() => {
    const urlStore = urlStoreRef.current
    return () => {
      generationRef.current += 1
      generatingRef.current = false
      urlStore.revoke()
    }
  }, [])

  const download = () => {
    if (!blob || !previewUrl) return
    const anchor = document.createElement('a')
    anchor.href = previewUrl
    anchor.download = buildOperationShareFilename(model, cardKind)
    anchor.click()
  }

  const currentRemoteConfig = remoteConfigsByKind[cardKind]
  const hasUnsupportedRemoteConfig =
    currentRemoteConfig !== undefined &&
    currentRemoteConfig.schemaVersion >
      OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION
  const shareTableTheme = getOperationShareTableTheme(
    cardConfig.tableColor,
    cardConfig.tableThemeOverrides,
  )
  const normalizedTableColor = normalizeOperationShareTableColor(
    cardConfig.tableColor,
  )
  const matchingTableThemePreset = normalizedTableColor
    ? OPERATION_SHARE_TABLE_THEME_PRESETS.find(
        (preset) =>
          preset.baseColor &&
          normalizeOperationShareTableColor(preset.baseColor) ===
            normalizedTableColor,
      )
    : undefined
  const selectedTableThemePreset =
    matchingTableThemePreset ?? OPERATION_SHARE_TABLE_THEME_PRESETS[0]
  const isCustomTableBaseColor = Boolean(
    normalizedTableColor && !matchingTableThemePreset,
  )
  const tableThemeOverrideCount = Object.keys(
    cardConfig.tableThemeOverrides ?? {},
  ).length
  const hasTableThemeOverrides = tableThemeOverrideCount > 0
  const tableThemeBaseLabel = isCustomTableBaseColor
    ? `自定义 ${normalizedTableColor}`
    : selectedTableThemePreset.label
  const tableThemeStatus = hasTableThemeOverrides
    ? `自定义（基于${tableThemeBaseLabel}，已修改 ${tableThemeOverrideCount} 项）`
    : `当前：${tableThemeBaseLabel}`
  const tableThemeColorFields: Array<{
    key: OperationShareTableThemeOverrideKey
    label: string
    value: string
  }> = [
    {
      key: 'headerBackground',
      label: '表头',
      value: shareTableTheme.headerBackground,
    },
    {
      key: 'pageBackground',
      label: '图片背景',
      value: shareTableTheme.pageBackground,
    },
    {
      key: 'lightRowBackground',
      label: '浅色行',
      value: shareTableTheme.bodyBackgrounds[0],
    },
    {
      key: 'darkRowBackground',
      label: '深色行',
      value: shareTableTheme.bodyBackgrounds[1],
    },
    {
      key: 'border',
      label: '表格线',
      value: shareTableTheme.border,
    },
    {
      key: 'text',
      label: '文字',
      value: shareTableTheme.text,
    },
  ]

  const saveAuthorConfig = async () => {
    if (!canManageAuthorConfig || hasUnsupportedRemoteConfig) return

    setSavingCardKind(cardKind)
    try {
      const saved = await updateOperationShareImageConfig(
        operation.id,
        OPERATION_SHARE_CARD_KEYS[cardKind],
        {
          schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
          expectedRevision: currentRemoteConfig?.revision ?? 0,
          payload: buildOperationShareCardConfigPayload(cardKind, cardConfig),
        },
      )
      setRemoteConfigsByKind((current) => ({
        ...current,
        [cardKind]: saved,
      }))
      setAuthorCardConfig((current) =>
        replaceOperationShareCardConfigKind(cardKind, current, cardConfig),
      )
      AppToaster.show({
        intent: 'success',
        message: '作者分享图配置已保存',
      })
    } catch (reason) {
      AppToaster.show({
        intent: 'danger',
        message: `作者分享图配置保存失败：${formatError(reason)}`,
      })
    } finally {
      setSavingCardKind(undefined)
    }
  }

  return (
    <Dialog
      canEscapeKeyClose
      canOutsideClickClose
      className="w-[min(96vw,960px)]"
      icon="media"
      isOpen
      onClose={onClose}
      title={t.components.viewer.OperationViewer.share_image_dialog_title}
    >
      <div className="max-h-[76vh] overflow-auto bg-slate-100 p-4 md:p-6">
        <div
          aria-label="分享图片类型"
          className="mb-5 grid grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-2"
          role="tablist"
        >
          <Button
            active={cardKind === 'actions'}
            aria-selected={cardKind === 'actions'}
            icon="timeline-events"
            onClick={() => changeCardKind('actions')}
            role="tab"
          >
            动作序列
          </Button>
          <Button
            active={cardKind === 'operators'}
            aria-selected={cardKind === 'operators'}
            icon="people"
            onClick={() => changeCardKind('operators')}
            role="tab"
          >
            上阵密探
          </Button>
        </div>

        {authorConfigStatus === 'error' ? (
          <Callout className="mb-5" intent="warning" title="作者配置加载失败">
            {authorConfigError}
          </Callout>
        ) : null}
        {hasUnsupportedRemoteConfig ? (
          <Callout className="mb-5" intent="warning" title="作者配置版本较新">
            当前页面版本无法编辑这份作者配置，请刷新或升级后重试。
          </Callout>
        ) : null}

        <div className="mb-3 flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
            <Switch
              checked={showShortCode}
              className="m-0"
              disabled={status === 'generating'}
              label={
                t.components.viewer.OperationViewer.share_image_share_short_code
              }
              onChange={(event) =>
                updateShortCodeVisibility(event.currentTarget.checked)
              }
            />
            <Switch
              checked={!effectiveHideQrCode}
              className="m-0"
              disabled={status === 'generating' || qrFollowsShortCode}
              label={
                t.components.viewer.OperationViewer.share_image_share_qr_code
              }
              onChange={(event) =>
                updateQrCodeVisibility(!event.currentTarget.checked)
              }
            />
          </div>
          {shortCodeHint ? (
            <p className="m-0 text-xs text-slate-500">{shortCodeHint}</p>
          ) : null}
        </div>

        {cardKind === 'actions' ? (
          <fieldset
            className="mb-5 rounded border border-slate-200 bg-white p-4"
            disabled={
              status === 'generating' || authorConfigStatus === 'loading'
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800">
                    生成前编辑
                  </h3>
                  <Button icon="reset" minimal onClick={restoreDefaults} small>
                    恢复至默认
                  </Button>
                  <Button
                    disabled={
                      !currentRemoteConfig || hasUnsupportedRemoteConfig
                    }
                    icon="cloud-download"
                    minimal
                    onClick={restoreAuthorConfig}
                    small
                  >
                    恢复作者配置
                  </Button>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  配置会自动保存到当前作业。
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Checkbox
                  checked={cardConfig.showNotes || cardConfig.showOtherActions}
                  label="显示其他动作与备注列"
                  onChange={(event) =>
                    updateNotesColumnVisibility(event.currentTarget.checked)
                  }
                />
                <Checkbox
                  checked={cardConfig.showTargetSwitches}
                  disabled={
                    !(cardConfig.showNotes || cardConfig.showOtherActions)
                  }
                  label="显示左滑 / 右滑"
                  onChange={(event) =>
                    updateOption(
                      'showTargetSwitches',
                      event.currentTarget.checked,
                    )
                  }
                />
              </div>
            </div>

            {model.rounds.length > 0 ? (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-700">
                    表格配色
                  </h4>
                  <Button
                    aria-label="恢复预设表格配色"
                    disabled={!normalizedTableColor && !hasTableThemeOverrides}
                    icon="reset"
                    minimal
                    onClick={resetTableTheme}
                    small
                  >
                    恢复预设
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  选择生成作业分享图整体的主题色，可自定义颜色。
                  <span aria-live="polite" className="ml-2 text-slate-500">
                    {tableThemeStatus}
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs text-slate-400">预设</span>
                  {OPERATION_SHARE_TABLE_THEME_PRESETS.map((preset) => {
                    const presetTheme = getOperationShareTableTheme(
                      preset.baseColor,
                    )
                    const selected =
                      selectedTableThemePreset.id === preset.id &&
                      (preset.baseColor !== undefined ||
                        cardConfig.tableColor === undefined)
                    const previewColor = presetTheme.bodyBackgrounds[1]

                    return (
                      <button
                        key={preset.id}
                        aria-label={`应用${preset.label}表格配色`}
                        aria-pressed={selected}
                        className={`flex h-7 items-center gap-1.5 rounded border px-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-sky-500 bg-sky-50 text-sky-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() => updateTableColor(preset.baseColor)}
                        type="button"
                      >
                        <span
                          aria-hidden
                          className="flex h-3 w-3 shrink-0 overflow-hidden rounded-[2px] border border-black/10"
                        >
                          <span
                            className="h-full w-full"
                            style={{ backgroundColor: previewColor }}
                          />
                        </span>
                        <span>{preset.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <label className="flex h-7 items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600">
                    <span>自定义</span>
                    <input
                      aria-label="选择表格主题色"
                      className="h-5 w-7 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                      onChange={(event) =>
                        updateTableColor(event.currentTarget.value)
                      }
                      type="color"
                      value={
                        cardConfig.tableColor ??
                        DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR
                      }
                    />
                    <span className="tabular-nums text-slate-500">
                      {cardConfig.tableColor ?? '默认'}
                    </span>
                  </label>
                  <Button
                    aria-controls="operation-share-table-theme-advanced"
                    aria-expanded={isTableThemeAdvancedOpen}
                    aria-label={
                      isTableThemeAdvancedOpen
                        ? '收起高级自定义'
                        : '展开高级自定义'
                    }
                    className="!text-xs !font-normal !text-slate-500 hover:!text-slate-700"
                    icon={
                      <Icon
                        icon={
                          isTableThemeAdvancedOpen
                            ? 'chevron-up'
                            : 'chevron-down'
                        }
                        size={12}
                      />
                    }
                    minimal
                    onClick={() =>
                      setIsTableThemeAdvancedOpen((current) => !current)
                    }
                    small
                  >
                    高级自定义
                    {hasTableThemeOverrides
                      ? `（已修改 ${tableThemeOverrideCount} 项）`
                      : ''}
                  </Button>
                </div>
                {isTableThemeAdvancedOpen ? (
                  <div
                    className="mt-2 w-fit max-w-full rounded border border-slate-200 bg-slate-50 p-2"
                    id="operation-share-table-theme-advanced"
                  >
                    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                      {tableThemeColorFields.map(({ key, label, value }) => (
                        <label
                          key={key}
                          className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 bg-white px-1.5"
                        >
                          <input
                            aria-label={`${label}颜色`}
                            className="h-4 w-6 shrink-0 cursor-pointer rounded-sm border border-black/10 bg-transparent p-0"
                            onChange={(event) =>
                              updateTableThemeOverride(
                                key,
                                event.currentTarget.value,
                              )
                            }
                            type="color"
                            value={value}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {model.rounds.length > 0 ? (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-700">
                        {
                          t.components.viewer.OperationViewer
                            .share_cell_color_section_title
                        }
                      </h4>
                      <div
                        aria-label="表格编辑模式"
                        className="inline-flex overflow-hidden rounded border border-slate-200 bg-white p-0.5"
                        role="group"
                      >
                        <Button
                          active={editMode === 'color'}
                          className="!inline-flex !h-6 !min-h-0 !items-center !justify-center !px-2 !py-0 !text-xs !font-normal !leading-none"
                          minimal
                          onClick={() => setEditMode('color')}
                          small
                        >
                          标注模式
                        </Button>
                        <Button
                          active={editMode === 'note'}
                          className="!inline-flex !h-6 !min-h-0 !items-center !justify-center !px-2 !py-0 !text-xs !font-normal !leading-none"
                          minimal
                          onClick={() => setEditMode('note')}
                          small
                        >
                          备注模式
                        </Button>
                      </div>
                      {editMode === 'color' ? (
                        <div
                          aria-label={
                            t.components.viewer.OperationViewer
                              .share_cell_color_section_title
                          }
                          className="flex items-center gap-0.5 text-xs text-slate-400"
                          role="group"
                        >
                          <span className="mr-0.5">配色对象</span>
                          <button
                            aria-label={
                              t.components.viewer.OperationViewer
                                .share_cell_color_mode_action
                            }
                            aria-pressed={colorMode === 'action'}
                            className={`h-6 rounded px-1.5 transition ${
                              colorMode === 'action'
                                ? 'bg-sky-50 font-medium text-sky-700'
                                : 'hover:text-slate-600'
                            }`}
                            onClick={() => setColorMode('action')}
                            type="button"
                          >
                            操作
                          </button>
                          <span aria-hidden="true" className="text-slate-300">
                            /
                          </span>
                          <button
                            aria-label={
                              t.components.viewer.OperationViewer
                                .share_cell_color_mode_cell
                            }
                            aria-pressed={colorMode === 'cell'}
                            className={`h-6 rounded px-1.5 transition ${
                              colorMode === 'cell'
                                ? 'bg-sky-50 font-medium text-sky-700'
                                : 'hover:text-slate-600'
                            }`}
                            onClick={() => setColorMode('cell')}
                            type="button"
                          >
                            单元格
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {editMode === 'note'
                        ? '当前编辑备注，动作仅供查看。'
                        : colorMode === 'action'
                          ? t.components.viewer.OperationViewer
                              .share_cell_color_section_hint_action
                          : t.components.viewer.OperationViewer
                              .share_cell_color_section_hint_cell}
                    </p>
                  </div>
                  {editMode === 'color' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {colorMode === 'cell' ? (
                        <Switch
                          checked={cardConfig.showCellPattern}
                          className="m-0 mr-1"
                          label={
                            t.components.viewer.OperationViewer
                              .share_cell_pattern
                          }
                          onChange={(event) =>
                            updateOption(
                              'showCellPattern',
                              event.currentTarget.checked,
                            )
                          }
                        />
                      ) : null}
                      <div
                        aria-label={
                          colorMode === 'action'
                            ? t.components.viewer.OperationViewer
                                .share_cell_color_group_action
                            : t.components.viewer.OperationViewer
                                .share_cell_color_group_cell
                        }
                        className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 p-1"
                        role="group"
                      >
                        {OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) => {
                          const label =
                            t.components.viewer.OperationViewer.share_cell_color_apply(
                              { label: cellColorNames[colorKey] },
                            )
                          return (
                            <button
                              key={colorKey}
                              aria-label={label}
                              className={`h-8 w-8 rounded text-base font-bold transition-transform enabled:hover:scale-105 enabled:focus:outline-none enabled:focus:ring-2 enabled:focus:ring-sky-500 enabled:focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                                colorMode === 'cell'
                                  ? 'border border-slate-300'
                                  : 'bg-white'
                              }`}
                              disabled={
                                (colorMode === 'action'
                                  ? selectedActionKeys.size
                                  : selectedCellKeys.size) === 0
                              }
                              onClick={() =>
                                colorMode === 'action'
                                  ? applyActionColor(colorKey)
                                  : applyCellColor(colorKey)
                              }
                              style={
                                colorMode === 'action'
                                  ? {
                                      color:
                                        getOperationShareActionTextColor(
                                          colorKey,
                                        ),
                                    }
                                  : getOperationShareCellVisualStyle(
                                      colorKey,
                                      cardConfig.showCellPattern,
                                    )
                              }
                              title={label}
                              type="button"
                            >
                              {colorMode === 'action' ? 'A' : null}
                            </button>
                          )
                        })}
                      </div>
                      <Button
                        disabled={
                          (colorMode === 'action'
                            ? selectedActionKeys.size
                            : selectedCellKeys.size) === 0
                        }
                        icon="eraser"
                        onClick={() =>
                          colorMode === 'action'
                            ? clearActionColor()
                            : clearCellColor()
                        }
                        small
                      >
                        {colorMode === 'action'
                          ? t.components.viewer.OperationViewer
                              .share_cell_color_clear
                          : t.components.viewer.OperationViewer
                              .share_cell_color_clear_cell}
                      </Button>
                      <Button
                        disabled={
                          (colorMode === 'action'
                            ? selectedActionKeys.size
                            : selectedCellKeys.size) === 0
                        }
                        minimal
                        onClick={() =>
                          colorMode === 'action'
                            ? setSelectedActionKeys(new Set())
                            : setSelectedCellKeys(new Set())
                        }
                        small
                      >
                        {t.components.viewer.OperationViewer.share_cell_color_clear_selection(
                          {
                            count:
                              colorMode === 'action'
                                ? selectedActionKeys.size
                                : selectedCellKeys.size,
                          },
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 max-h-56 overflow-auto rounded border border-slate-200">
                  <table
                    className="w-full table-fixed border-collapse bg-white text-center text-xs"
                    data-edit-mode={editMode}
                  >
                    <colgroup>
                      <col style={{ width: '2.5rem' }} />
                      {editableColumns.map((column) => (
                        <col key={column.key} />
                      ))}
                      {cardConfig.showNotes || cardConfig.showOtherActions ? (
                        <col
                          style={{
                            width: editMode === 'note' ? '56%' : '16%',
                          }}
                        />
                      ) : null}
                    </colgroup>
                    <thead className="text-slate-600">
                      <tr>
                        <th className="sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-1 py-1.5 shadow-[0_1px_0_rgba(148,163,184,0.35)]">
                          回合
                        </th>
                        {editableColumnGroups.map((column) => {
                          const keySet =
                            colorMode === 'action'
                              ? selectedActionKeys
                              : selectedCellKeys
                          const keys =
                            colorMode === 'action'
                              ? column.actionKeys
                              : column.cellKeys
                          const selection = getOperationShareCellSelectionState(
                            keySet,
                            keys,
                          )
                          return (
                            <th
                              key={column.key}
                              className={`sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 shadow-[0_1px_0_rgba(148,163,184,0.35)] last:border-r-0 ${
                                editMode === 'note' ? 'px-1 py-1' : 'px-2 py-2'
                              }`}
                            >
                              {editMode === 'color' ? (
                                <Checkbox
                                  aria-label={`选择${column.label}整列`}
                                  checked={selection.checked}
                                  className="m-0 inline-flex"
                                  indeterminate={selection.indeterminate}
                                  label={column.label}
                                  onChange={(event) =>
                                    colorMode === 'action'
                                      ? toggleActionGroupSelection(
                                          column.actionKeys,
                                          event.currentTarget.checked,
                                        )
                                      : toggleCellGroupSelection(
                                          column.cellKeys,
                                          event.currentTarget.checked,
                                        )
                                  }
                                />
                              ) : (
                                <span>{column.label}</span>
                              )}
                            </th>
                          )
                        })}
                        {cardConfig.showNotes || cardConfig.showOtherActions ? (
                          <th
                            className={`sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 text-left shadow-[0_1px_0_rgba(148,163,184,0.35)] last:border-r-0 ${
                              editMode === 'note'
                                ? 'px-2 py-2'
                                : 'px-1 py-1 text-[11px] text-slate-500'
                            }`}
                          >
                            回合备注
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {editableRoundGroups.map((round) => {
                        const keySet =
                          colorMode === 'action'
                            ? selectedActionKeys
                            : selectedCellKeys
                        const keys =
                          colorMode === 'action'
                            ? round.actionKeys
                            : round.cellKeys
                        const selection = getOperationShareCellSelectionState(
                          keySet,
                          keys,
                        )
                        const { displayOrderByActionOrder } =
                          getOperationShareRoundDisplay(
                            round.sourceRound,
                            cardConfig,
                          )
                        const note = getOperationShareRoundNoteText(
                          round.sourceRound,
                          cardConfig,
                        )
                        const noteActions = getOperationShareOtherActions(
                          round.sourceRound,
                          {
                            ...cardConfig,
                            hiddenOtherActionKeys: {},
                          },
                        ).filter(
                          (action) =>
                            !isOperationShareTargetSwitchAction(action.raw),
                        )
                        const hasNoteOverride =
                          Object.prototype.hasOwnProperty.call(
                            cardConfig.roundNoteOverrides ?? {},
                            round.round,
                          )
                        const hasHiddenOtherActions = Object.keys(
                          cardConfig.hiddenOtherActionKeys ?? {},
                        ).some((key) => key.startsWith(`${round.round}:`))
                        return (
                          <tr key={round.round}>
                            <th className="border-b border-r border-slate-200 px-1 py-1.5 font-medium text-slate-600">
                              {editMode === 'color' ? (
                                <Checkbox
                                  aria-label={`选择第 ${round.round} 回合整行`}
                                  checked={selection.checked}
                                  className="m-0 inline-flex"
                                  indeterminate={selection.indeterminate}
                                  label={`${round.round}`}
                                  onChange={(event) =>
                                    colorMode === 'action'
                                      ? toggleActionGroupSelection(
                                          round.actionKeys,
                                          event.currentTarget.checked,
                                        )
                                      : toggleCellGroupSelection(
                                          round.cellKeys,
                                          event.currentTarget.checked,
                                        )
                                  }
                                />
                              ) : (
                                round.round
                              )}
                            </th>
                            {editableColumns.map((column) => {
                              const cellKey = buildOperationShareCellKey(
                                round.round,
                                column.key,
                              )
                              const actions =
                                round.sourceRound.slots[column.slot] ?? []
                              const actionLabels = actions.map((action) =>
                                getOperationShareActionLabel(
                                  action,
                                  displayOrderByActionOrder.get(action.order),
                                ),
                              )
                              const cellSelected = selectedCellKeys.has(cellKey)
                              return (
                                <td
                                  key={column.key}
                                  className={`border-b border-r border-slate-200 last:border-r-0 ${
                                    editMode === 'note' ? 'p-0.5' : 'p-1'
                                  }`}
                                  style={getOperationShareCellVisualStyle(
                                    cardConfig.cellColors[cellKey],
                                    cardConfig.showCellPattern,
                                  )}
                                >
                                  {colorMode === 'action' ? (
                                    <div
                                      className={
                                        editMode === 'note'
                                          ? 'flex min-h-6 flex-wrap items-center justify-center gap-0.5'
                                          : 'flex min-h-8 flex-wrap items-center justify-center gap-1'
                                      }
                                    >
                                      {actions.length > 0 ? (
                                        actions.map((action) => {
                                          const actionKey =
                                            buildOperationShareActionKey(
                                              round.round,
                                              action.order,
                                            )
                                          const selected =
                                            selectedActionKeys.has(actionKey)
                                          const label =
                                            getOperationShareActionLabel(
                                              action,
                                              displayOrderByActionOrder.get(
                                                action.order,
                                              ),
                                            )
                                          const actionColor =
                                            getOperationShareActionColor(
                                              action,
                                              cardConfig.actionColors,
                                              round.round,
                                            )
                                          return editMode === 'color' ? (
                                            <button
                                              key={actionKey}
                                              aria-label={`${round.round} 回合 ${column.label}：${label}`}
                                              aria-pressed={selected}
                                              className={`rounded-sm px-1.5 py-1 font-medium leading-4 transition enabled:hover:bg-black/5 enabled:focus:outline-none ${
                                                selected
                                                  ? 'bg-sky-50 ring-1 ring-inset ring-sky-500'
                                                  : ''
                                              }`}
                                              onClick={() =>
                                                toggleActionSelection(
                                                  actionKey,
                                                  !selected,
                                                )
                                              }
                                              style={
                                                actionColor
                                                  ? { color: actionColor }
                                                  : undefined
                                              }
                                              type="button"
                                            >
                                              {label}
                                            </button>
                                          ) : (
                                            <span
                                              key={actionKey}
                                              className="rounded-sm px-0.5 py-0.5 text-[11px] font-medium leading-4"
                                              style={
                                                actionColor
                                                  ? { color: actionColor }
                                                  : undefined
                                              }
                                            >
                                              {label}
                                            </span>
                                          )
                                        })
                                      ) : (
                                        <span className="text-slate-400">
                                          —
                                        </span>
                                      )}
                                    </div>
                                  ) : editMode === 'color' ? (
                                    <button
                                      aria-label={`${round.round} 回合 ${column.label}${
                                        actionLabels.length > 0
                                          ? `：${actionLabels.join(' ')}`
                                          : ''
                                      }`}
                                      aria-pressed={cellSelected}
                                      className={`flex min-h-8 w-full items-center justify-center gap-1.5 rounded-sm px-1.5 py-1 transition enabled:hover:bg-black/5 enabled:focus:outline-none ${
                                        cellSelected
                                          ? 'ring-2 ring-inset ring-sky-500'
                                          : ''
                                      }`}
                                      onClick={() =>
                                        toggleCellSelection(
                                          cellKey,
                                          !cellSelected,
                                        )
                                      }
                                      type="button"
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                                          cellSelected
                                            ? 'border-sky-500 bg-sky-500 text-white'
                                            : 'border-slate-400 bg-white/70'
                                        }`}
                                      >
                                        {cellSelected ? (
                                          <Icon icon="tick" size={10} />
                                        ) : null}
                                      </span>
                                      <span className="min-w-0 break-words font-medium leading-4">
                                        {actionLabels.length > 0
                                          ? actionLabels.join(' ')
                                          : '—'}
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="flex min-h-6 items-center justify-center px-0.5 py-0.5">
                                      <span className="min-w-0 break-words text-[11px] font-medium leading-4">
                                        {actionLabels.length > 0
                                          ? actionLabels.join(' ')
                                          : '—'}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                            {cardConfig.showNotes ||
                            cardConfig.showOtherActions ? (
                              <td
                                className={`border-b border-slate-200 text-left align-top ${
                                  editMode === 'note' ? 'p-2' : 'p-1'
                                }`}
                              >
                                <textarea
                                  aria-label={`${round.round} 回合备注`}
                                  className={`w-full resize-y rounded border border-slate-300 text-slate-800 outline-none focus:border-sky-500 ${
                                    editMode === 'note'
                                      ? 'min-h-14 px-2 py-1.5 text-xs leading-5'
                                      : 'max-h-24 min-h-8 px-1 py-0.5 text-[11px] leading-4'
                                  }`}
                                  maxLength={500}
                                  onChange={(event) =>
                                    updateRoundNote(
                                      round.round,
                                      event.currentTarget.value,
                                    )
                                  }
                                  placeholder="可直接修改本回合备注"
                                  value={note}
                                />
                                {editMode === 'note' &&
                                noteActions.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-0.5">
                                    <span className="mr-0.5 text-[10px] text-slate-400">
                                      快捷填入
                                    </span>
                                    {noteActions.map((action) => {
                                      const label =
                                        getOperationShareNoteActionLabel(
                                          round.sourceRound,
                                          action,
                                          displayOrderByActionOrder,
                                        )
                                      const included = note.includes(label)

                                      return (
                                        <Button
                                          key={`${action.order}-${action.raw}`}
                                          aria-label={
                                            included
                                              ? `从备注移除${label}`
                                              : `填入备注${label}`
                                          }
                                          className={`!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none ${
                                            included
                                              ? '!bg-slate-100 !text-slate-700'
                                              : '!text-slate-400'
                                          }`}
                                          icon={
                                            <Icon
                                              icon={included ? 'cross' : 'plus'}
                                              size={9}
                                            />
                                          }
                                          minimal
                                          onClick={() =>
                                            toggleOtherActionInNote(
                                              round.sourceRound,
                                              label,
                                            )
                                          }
                                          small
                                        >
                                          {label}
                                        </Button>
                                      )
                                    })}
                                    {hasNoteOverride ||
                                    hasHiddenOtherActions ? (
                                      <Button
                                        className="!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                        icon={<Icon icon="reset" size={9} />}
                                        minimal
                                        onClick={() =>
                                          restoreRoundNote(round.round)
                                        }
                                        small
                                      >
                                        恢复自动内容
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : editMode === 'note' &&
                                  (hasNoteOverride || hasHiddenOtherActions) ? (
                                  <Button
                                    className="!mt-1 !inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                    icon={<Icon icon="reset" size={9} />}
                                    minimal
                                    onClick={() =>
                                      restoreRoundNote(round.round)
                                    }
                                    small
                                  >
                                    恢复自动内容
                                  </Button>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </fieldset>
        ) : (
          <fieldset
            className="mb-5 rounded border border-slate-200 bg-white p-4"
            disabled={
              status === 'generating' || authorConfigStatus === 'loading'
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800">
                    生成前编辑
                  </h3>
                  <Button
                    disabled={
                      Object.keys(cardConfig.requiredDiscs).length === 0
                    }
                    icon="reset"
                    minimal
                    onClick={clearRequiredDiscs}
                    small
                  >
                    清除必须标记
                  </Button>
                  <Button
                    disabled={
                      !currentRemoteConfig || hasUnsupportedRemoteConfig
                    }
                    icon="cloud-download"
                    minimal
                    onClick={restoreAuthorConfig}
                    small
                  >
                    恢复作者配置
                  </Button>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  配置会按当前作业自动缓存；可将关键命盘标记为“必须”，禁用命盘会自动标注为“绝对不能有”。
                </p>
              </div>
            </div>

            {model.operators.some((operator) => operator.discs.length > 0) ? (
              <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2 md:grid-cols-5">
                {model.operators.map((operator, operatorIndex) => (
                  <section
                    key={`${operator.rawName}-${operatorIndex}`}
                    className="min-w-0 rounded border border-slate-200 bg-slate-50 p-2"
                  >
                    <h4 className="break-words text-xs font-semibold leading-5 text-slate-700">
                      {operator.slot ?? operatorIndex + 1} 号位 {'·'}
                      {operator.name}
                    </h4>
                    {operator.discs.length > 0 ? (
                      <div className="mt-1.5 grid gap-1">
                        {operator.discs.map((disc) => {
                          const key = buildOperationShareDiscKey(
                            operator.slot ?? operatorIndex + 1,
                            disc.slot,
                          )
                          if (disc.forbidden) {
                            return (
                              <div
                                key={key}
                                className="flex flex-col items-start gap-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold leading-5 text-red-800"
                              >
                                <span className="shrink-0 rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">
                                  绝对不能有
                                </span>
                                <span>
                                  {disc.slot} 号命盘：{disc.abbreviation}
                                </span>
                              </div>
                            )
                          }
                          return (
                            <Checkbox
                              key={key}
                              checked={cardConfig.requiredDiscs[key] === true}
                              className="m-0 text-xs leading-5"
                              label={`${disc.slot} 号命盘：${disc.abbreviation}`}
                              onChange={(event) =>
                                updateRequiredDisc(
                                  key,
                                  event.currentTarget.checked,
                                )
                              }
                            />
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">未配置命盘</p>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-400">
                当前上阵密探未配置命盘。
              </p>
            )}
          </fieldset>
        )}

        {status === 'idle' ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white text-slate-500">
            <span className="text-base font-medium">图片尚未生成</span>
            <span className="text-sm">
              完成上方编辑后，点击“生成图片”预览。
            </span>
          </div>
        ) : null}
        {status === 'generating' ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-slate-600">
            <Spinner />
            <span>
              {t.components.viewer.OperationViewer.share_image_generating}
            </span>
          </div>
        ) : null}
        {status === 'error' ? (
          <Callout
            intent="danger"
            title={t.components.viewer.OperationViewer.share_image_failed}
          >
            {error}
          </Callout>
        ) : null}
        {status === 'ready' && previewUrl ? (
          <img
            alt={t.components.viewer.OperationViewer.share_image_preview_alt}
            className="mx-auto block h-auto max-w-full shadow"
            src={previewUrl}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
        <Button onClick={onClose}>
          {t.components.viewer.OperationViewer.share_image_close}
        </Button>
        {canManageAuthorConfig ? (
          <Button
            disabled={
              authorConfigStatus === 'loading' ||
              status === 'generating' ||
              savingCardKind !== undefined ||
              hasUnsupportedRemoteConfig
            }
            icon="floppy-disk"
            loading={savingCardKind === cardKind}
            onClick={() => void saveAuthorConfig()}
          >
            保存作者配置
          </Button>
        ) : null}
        <Button
          disabled={status === 'generating' || !cardNode || !qrDataUrl}
          icon={status === 'idle' ? 'media' : 'refresh'}
          intent={status === 'idle' ? 'primary' : 'none'}
          onClick={() => void generate()}
        >
          {status === 'idle'
            ? '生成图片'
            : t.components.viewer.OperationViewer.share_image_regenerate}
        </Button>
        <Button
          disabled={status !== 'ready'}
          icon="download"
          intent="primary"
          onClick={download}
        >
          {t.components.viewer.OperationViewer.share_image_download}
        </Button>
      </div>
      <div aria-hidden className="fixed left-[-12000px] top-0">
        {qrDataUrl ? (
          cardKind === 'actions' ? (
            <OperationShareCard
              cardRef={setCardNode}
              config={cardConfig}
              hideQrCode={effectiveHideQrCode}
              model={model}
              qrDataUrl={qrDataUrl}
              showShortCode={showShortCode}
            />
          ) : (
            <DeployedOperatorsShareCard
              cardRef={setCardNode}
              config={cardConfig}
              hideQrCode={effectiveHideQrCode}
              model={model}
              qrDataUrl={qrDataUrl}
              showShortCode={showShortCode}
            />
          )
        ) : null}
      </div>
    </Dialog>
  )
}
