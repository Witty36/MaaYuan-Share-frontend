import { describe, expect, it } from 'vitest'

import {
  compareLevelsByEndTime,
  compareLevelsForDisplay,
  getNextLevelEndTime,
  isLevelWithinTimeRange,
} from './level'
import { Level } from './operation'

describe('isLevelWithinTimeRange', () => {
  const endTime = Date.parse('2026-09-30T23:59:59+08:00')

  it('keeps an operation visible through the end boundary', () => {
    const level = {
      endTime: '2026-09-30T23:59:59+08:00',
    }

    expect(isLevelWithinTimeRange(level, endTime - 1)).toBe(true)
    expect(isLevelWithinTimeRange(level, endTime)).toBe(true)
    expect(isLevelWithinTimeRange(level, endTime + 1)).toBe(false)
  })

  it('keeps unbounded and invalid end times visible', () => {
    expect(isLevelWithinTimeRange({})).toBe(true)
    expect(
      isLevelWithinTimeRange({ endTime: '2026-09-30T23:59:59+08:00' }, endTime),
    ).toBe(true)
    expect(isLevelWithinTimeRange({ endTime: 'invalid' }, endTime)).toBe(true)
    expect(isLevelWithinTimeRange({ endTime: 123 as never }, endTime)).toBe(
      true,
    )
  })
})

describe('getNextLevelEndTime', () => {
  const first = Date.parse('2026-09-30T23:59:59+08:00')
  const second = Date.parse('2026-10-01T00:00:10+08:00')

  it('returns the nearest current or future boundary', () => {
    const levels = [
      { endTime: 'invalid' },
      { endTime: '2026-09-30T23:59:59+08:00' },
      { endTime: '2026-10-01T00:00:10+08:00' },
      {},
    ]

    expect(getNextLevelEndTime(levels, first - 1)).toBe(first)
    expect(getNextLevelEndTime(levels, first)).toBe(first)
    expect(getNextLevelEndTime(levels, first + 1)).toBe(second)
    expect(getNextLevelEndTime(levels, second + 1)).toBeUndefined()
  })
})

describe('compareLevelsByEndTime', () => {
  const now = Date.parse('2026-09-30T12:00:00+08:00')
  const level = (
    stageId: string,
    endTime?: string,
    catOne = '活动',
  ): Level => ({
    stageId,
    levelId: stageId,
    name: stageId,
    catOne,
    catTwo: '',
    catThree: '',
    width: 0,
    height: 0,
    endTime,
  })
  const sortedIds = (levels: Level[], time = now) =>
    [...levels]
      .sort((a, b) => compareLevelsByEndTime(a, b, time))
      .map((item) => item.stageId)

  it('puts nearest future deadlines first, unbounded next, and recent expirations last', () => {
    const levels = [
      level('old', '2026-08-01T00:00:00+08:00', '主线'),
      level('unbounded'),
      level('later', '2026-11-01T00:00:00+08:00', '白鹄'),
      level('recent', '2026-09-29T00:00:00+08:00'),
      level('nearest', '2026-10-01T00:00:00+08:00'),
    ]

    expect(sortedIds(levels)).toEqual([
      'nearest',
      'later',
      'unbounded',
      'recent',
      'old',
    ])
    expect(levels[0].stageId).toBe('old')
  })

  it('uses the existing display order for missing, blank, and invalid dates', () => {
    const levels = [
      level('missing'),
      level('invalid', 'invalid', '主线'),
      level('blank', '  ', '白鹄'),
      { ...level('null'), endTime: null as never },
      { ...level('number'), endTime: 123 as never },
    ]

    expect(sortedIds(levels)).toEqual(
      [...levels].sort(compareLevelsForDisplay).map((item) => item.stageId),
    )
  })

  it('breaks equal deadlines by category, levelId, and stageId across time zones', () => {
    const endTime = '2026-10-01T00:00:00+08:00'
    const levels = [
      level('activity', endTime),
      { ...level('b', endTime, '主线'), levelId: 'same' },
      { ...level('a', '2026-09-30T16:00:00Z', '主线'), levelId: 'same' },
      level('first', endTime, '主线'),
    ]

    expect(sortedIds(levels)).toEqual(['first', 'a', 'b', 'activity'])
  })

  it('keeps the exact deadline active and moves it behind unbounded levels after expiration', () => {
    const levels = [
      level('boundary', '2026-09-30T12:00:00+08:00'),
      level('unbounded'),
      level('future', '2026-10-01T00:00:00+08:00'),
    ]

    expect(sortedIds(levels, now)).toEqual(['boundary', 'future', 'unbounded'])
    expect(sortedIds(levels, now + 1)).toEqual([
      'future',
      'unbounded',
      'boundary',
    ])
  })
})
