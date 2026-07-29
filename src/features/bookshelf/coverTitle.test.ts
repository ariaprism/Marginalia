import { describe, expect, it } from 'vitest'
import { coverTitleLines } from './coverTitle'

describe('coverTitleLines', () => {
  it.each([
    ['小王子', ['小王子']],
    ['《小王子》', ['小王子']],
    ['雨夜书房', ['雨夜', '书房']],
    ['漂流瓶博物馆', ['漂流瓶', '博物馆']],
    ['温室里的冬天', ['温室里的', '冬天']],
    ['玻璃温室里的冬天', ['玻璃温室', '里的冬天']],
  ])('breaks %s into natural horizontal lines', (title, expected) => {
    expect(coverTitleLines(title)).toEqual(expected)
  })
})
