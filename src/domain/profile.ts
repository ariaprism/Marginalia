export type CompanionPronoun = '她' | '他' | 'TA' | 'name'

export type CallingCard = {
  userName: string
  companionName: string
  companionPronoun: CompanionPronoun
}

export const DEFAULT_CALLING_CARD: CallingCard = {
  userName: '小狐狸',
  companionName: '小鱼',
  companionPronoun: '她',
}
