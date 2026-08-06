export type Screen = 'shelf' | 'room' | 'reader'
export type LastView = { screen: Screen; bookId?: string }
export type CompanionPronoun = '她' | '他' | 'TA' | 'name'
export type CallingCard = {
  userName: string
  companionName: string
  companionPronoun: CompanionPronoun
}
export type ReaderTheme = 'day' | 'night'
export type ReaderTypeface = 'serif' | 'sans'
export type ReaderAppearance = {
  theme: ReaderTheme
  fontSize: number
  lineHeight: number
  pageMargin: number
  readerTypeface: ReaderTypeface
}

const LAST_VIEW_KEY = 'marginalia:last-view'
const BOOK_RECENCY_KEY = 'marginalia:book-recency'
const CALLING_CARD_KEY = 'marginalia:calling-card'
const READER_APPEARANCE_KEY = 'marginalia:reader-appearance'
const DEFAULT_CALLING_CARD: CallingCard = {
  userName: '小狐狸',
  companionName: '小鱼',
  companionPronoun: '她',
}
export const DEFAULT_READER_APPEARANCE: ReaderAppearance = {
  theme: 'day',
  fontSize: 19,
  lineHeight: 1.8,
  pageMargin: 8,
  readerTypeface: 'serif',
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
}

export function readReaderAppearance(): ReaderAppearance {
  try {
    const stored = JSON.parse(window.localStorage.getItem(READER_APPEARANCE_KEY) ?? '{}') as Partial<ReaderAppearance>
    return {
      theme: stored.theme === 'night' ? 'night' : 'day',
      fontSize: numberInRange(stored.fontSize, 16, 25, DEFAULT_READER_APPEARANCE.fontSize),
      lineHeight: numberInRange(stored.lineHeight, 1.5, 2.3, DEFAULT_READER_APPEARANCE.lineHeight),
      pageMargin: numberInRange(stored.pageMargin, 7, 18, DEFAULT_READER_APPEARANCE.pageMargin),
      readerTypeface: stored.readerTypeface === 'sans' ? 'sans' : 'serif',
    }
  } catch {
    return DEFAULT_READER_APPEARANCE
  }
}

export function writeReaderAppearance(appearance: ReaderAppearance) {
  try {
    window.localStorage.setItem(READER_APPEARANCE_KEY, JSON.stringify(appearance))
  } catch {
    // 阅读偏好写不进去时只在本次打开期间生效。
  }
}

export function readLastView(): LastView {
  try {
    const raw = window.localStorage.getItem(LAST_VIEW_KEY)
    if (!raw) return { screen: 'shelf' }
    const parsed = JSON.parse(raw) as LastView
    return parsed.screen === 'reader' || parsed.screen === 'room' ? parsed : { screen: 'shelf' }
  } catch {
    return { screen: 'shelf' }
  }
}

export function writeLastView(view: LastView) {
  try {
    window.localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(view))
  } catch {
    // IndexedDB 仍保存阅读位置；只是不恢复界面层。
  }
}

export function readBookRecency(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(BOOK_RECENCY_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function writeBookRecency(recency: Record<string, string>) {
  try {
    window.localStorage.setItem(BOOK_RECENCY_KEY, JSON.stringify(recency))
  } catch {
    // 排序偏好写不进去时不影响书籍本身。
  }
}

export function readCallingCard(): CallingCard {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CALLING_CARD_KEY) ?? '{}') as Partial<CallingCard>
    const pronoun = stored.companionPronoun
    return {
      userName: stored.userName ?? DEFAULT_CALLING_CARD.userName,
      companionName: stored.companionName ?? DEFAULT_CALLING_CARD.companionName,
      companionPronoun: pronoun === '她' || pronoun === '他' || pronoun === 'TA' || pronoun === 'name'
        ? pronoun
        : DEFAULT_CALLING_CARD.companionPronoun,
    }
  } catch {
    return DEFAULT_CALLING_CARD
  }
}

export function writeCallingCard(card: CallingCard) {
  try {
    window.localStorage.setItem(CALLING_CARD_KEY, JSON.stringify(card))
  } catch {
    // 称呼属于轻量界面设置；存储受限时仅保留到本次打开。
  }
}
