export type Screen = 'shelf' | 'room' | 'reader'
export type LastView = { screen: Screen; bookId?: string }
export type CompanionPronoun = '她' | '他' | 'TA' | 'name'
export type CallingCard = {
  userName: string
  companionName: string
  companionPronoun: CompanionPronoun
}

const LAST_VIEW_KEY = 'marginalia:last-view'
const BOOK_RECENCY_KEY = 'marginalia:book-recency'
const CALLING_CARD_KEY = 'marginalia:calling-card'
const DEFAULT_CALLING_CARD: CallingCard = {
  userName: '小狐狸',
  companionName: '小鱼',
  companionPronoun: '她',
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
