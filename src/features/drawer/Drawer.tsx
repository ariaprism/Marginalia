import { BookOpenText, ChevronRight, Cloud, Feather, Fish, LibraryBig, SquarePen } from 'lucide-react'
import { SidebarMenuButton } from '../bookshelf/components'
import type { CallingCard, CompanionPronoun } from '../settings/localSettings'

export type SidebarSection = 'shelf' | 'calling-card' | 'thoughts' | 'visits' | 'shadow-books' | 'cloud'
export type DrawerPage = Exclude<SidebarSection, 'shelf'>
export type SidebarPhase = 'open' | 'closing' | null

const PAGE_TITLES: Record<DrawerPage, { title: string; eyebrow: string }> = {
  'calling-card': { title: '名帖', eyebrow: 'CALLING CARDS' },
  thoughts: { title: '念头', eyebrow: 'THOUGHTS' },
  visits: { title: '来访', eyebrow: 'VISITS' },
  'shadow-books': { title: '影子书', eyebrow: 'SHADOW BOOKS' },
  cloud: { title: '云端书房', eyebrow: 'CLOUD ROOM' },
}

export function DrawerPageHeader({ section, onOpenSidebar }: { section: DrawerPage; onOpenSidebar: () => void }) {
  const pageTitle = PAGE_TITLES[section]
  return (
    <header className="shelf-header drawer-page-header">
      <div className="drawer-page-title"><SidebarMenuButton onOpen={onOpenSidebar} /><h1>{pageTitle.title}</h1></div>
      <small>{pageTitle.eyebrow}</small>
    </header>
  )
}

export function DrawerOverlay({
  phase,
  activeSection,
  companionLabel,
  onClose,
  onSelect,
}: {
  phase: Exclude<SidebarPhase, null>
  activeSection: SidebarSection
  companionLabel: string
  onClose: () => void
  onSelect: (section: SidebarSection) => void
}) {
  const closing = phase === 'closing'
  return (
    <>
      <button className={`shelf-sidebar-backdrop ${closing ? 'is-closing' : ''}`} type="button" onClick={onClose} aria-label="关闭侧边栏" />
      <aside className={`shelf-sidebar ${closing ? 'is-closing' : ''}`} aria-label="侧边栏">
        <header className="sidebar-heading"><div><small>MARGINALIA</small><h2>目录</h2></div></header>
        <nav className="drawer-index" aria-label="书房抽屉">
          <h3><span>书房</span><small>THE READING ROOM</small></h3>
          {([
            ['shelf', '书架', '全部藏书', <BookOpenText key="shelf" />],
            ['thoughts', '念头', '一处私人写作区', <Feather key="thoughts" />],
            ['visits', '来访', `${companionLabel}的活动记录`, <Fish key="visits" />],
          ] as const).map(([id, title, description, icon]) => (
            <button type="button" key={id} className={activeSection === id ? 'is-active' : ''} aria-pressed={activeSection === id} onClick={() => onSelect(id)}>
              {icon}<span><strong>{title}</strong><small>{description}</small></span><ChevronRight />
            </button>
          ))}
          <h3><span>抽屉</span><small>THE DRAWER</small></h3>
          {([
            ['calling-card', '名帖', '称呼与落款', <SquarePen key="calling-card" />],
            ['shadow-books', '影子书', '微信读书旧痕迹', <LibraryBig key="shadow-books" />],
            ['cloud', '云端书房', '同步、备份与数据', <Cloud key="cloud" />],
          ] as const).map(([id, title, description, icon]) => (
            <button type="button" key={id} className={activeSection === id ? 'is-active' : ''} aria-pressed={activeSection === id} onClick={() => onSelect(id)}>
              {icon}<span><strong>{title}</strong><small>{description}</small></span><ChevronRight />
            </button>
          ))}
        </nav>
      </aside>
    </>
  )
}

export function DrawerPageContent({
  section,
  callingCard,
  companionLabel,
  companionSubject,
  onCallingCardChange,
}: {
  section: DrawerPage
  callingCard: CallingCard
  companionLabel: string
  companionSubject: string
  onCallingCardChange: (patch: Partial<CallingCard>) => void
}) {
  if (section === 'calling-card') {
    return (
      <section className="drawer-page" aria-live="polite">
        <section className="calling-card drawer-panel" aria-label="名帖设置">
          <label><span>我的落款</span><input aria-label="我的落款" value={callingCard.userName} onChange={(event) => onCallingCardChange({ userName: event.target.value })} /><small>写批注时，文字会署上这个名字。</small></label>
          <label><span>共读者的名字</span><input aria-label="共读者的名字" value={callingCard.companionName} onChange={(event) => onCallingCardChange({ companionName: event.target.value })} /></label>
          <label>
            <span>如何称呼共读者</span>
            <select aria-label="如何称呼共读者" value={callingCard.companionPronoun} onChange={(event) => onCallingCardChange({ companionPronoun: event.target.value as CompanionPronoun })}>
              <option value="她">她</option><option value="他">他</option><option value="TA">TA</option><option value="name">只使用名字</option>
            </select>
          </label>
          <div className="calling-card-preview"><span>{companionLabel}</span><p>{companionSubject}来过时，留下的文字会以这个名字落款。</p></div>
        </section>
      </section>
    )
  }

  return (
    <section className="drawer-page" aria-live="polite">
      <section className="drawer-placeholder drawer-panel" aria-live="polite">
        <p>
          {section === 'thoughts' && '以后可以在这里写下不依附于某一本书的文字。'}
          {section === 'visits' && `${companionLabel}进入书房、翻过书页或留下文字的踪迹，会安静地收在这里。`}
          {section === 'shadow-books' && '从微信读书带回的旧划线与想法，会先以影子书的方式留在这里。'}
          {section === 'cloud' && '跨设备同步、书房备份与 Supabase 连接状态，将在这里统一照看。'}
        </p>
        <span>这只抽屉已经留好位置，尚未启用。</span>
      </section>
    </section>
  )
}
