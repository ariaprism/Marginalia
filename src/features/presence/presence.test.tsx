import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoomPresence } from './Presence'
import { Visits } from './Visits'
import { withTransaction } from '../../data/local/db'
import { createBook } from '../../domain/book'
import { saveBook, saveChapters } from '../../data/local/bookStore'
import type { ReaderState, ReaderSession } from '../../domain/reader'
import { dayLabel } from './model'

const locator={bookId:'presence',position:{chapterIndex:0,elementPath:[0],textOffset:0,selectedText:'雨落下来。',beforeContext:'',afterContext:''}}
const state:ReaderState={bookId:'presence',readerId:'xiaog',cursor:'p1:0:0:0',locator,understanding:'雨使房间安静。',feeling:'安静',questions:['灯会亮吗？'],attention:['灯'],updatedAt:'2026-10-18T01:00:00Z'}
const visit:ReaderSession={id:'visit',readerId:'xiaog',bookId:'presence',mode:'reading',startedAt:'2026-10-18T01:00:00Z',updatedAt:'2026-10-18T01:01:00Z',startCursor:'p1:0:0:0',endCursor:'p1:0:0:6',endLocator:locator,characterCount:6,traceCount:1,viewedAnnotationIds:[]}

describe('可见的阅读足迹',()=>{
  it('最近停留和旧合书签各自保留位置，点击只打开对应内容',()=>{
    const jump=vi.fn(),open=vi.fn()
    render(<RoomPresence progress={[{bookId:'presence',readerId:'xiaog',locator:{...locator,position:{...locator.position,chapterIndex:1}},updatedAt:'2026-10-19T01:00:00Z'}]} states={[state]} chapters={[{chapter:'',title:'雨',kicker:'',paragraphs:['雨落下来。']},{chapter:'',title:'灯',kicker:'',paragraphs:['灯亮起来。']}]} companionLabel="小鱼" onJump={jump} onState={open} />)
    expect(screen.getByText('小G 停在 · 灯')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/看看小G的最近停留/}))
    expect(jump.mock.calls[0][0].position.chapterIndex).toBe(1)
    fireEvent.click(screen.getByRole('button',{name:/合书时的余记/}))
    expect(open).toHaveBeenCalledWith(state)
  })
  it('来访按真实 session 显示，并将页边文字连回原文，不推断在线',async()=>{
    await saveBook(createBook({id:'presence',title:'雨夜',author:'测试',source:'marginalia',status:'reading'}))
    await saveChapters('presence',[{id:'presence:0',index:0,title:'雨',inToc:true,href:'one',html:'<p>雨落下来。</p>'}])
    await withTransaction('readerSessions','readwrite',s=>s.put(visit))
    await withTransaction('readerTraces','readwrite',s=>s.put({id:'note',readerBookId:'xiaog:presence',sessionId:'visit',bookId:'presence',readerId:'xiaog',kind:'annotation',locator,text:'记住这场雨。',createdAt:visit.startedAt}))
    const jump=vi.fn()
    render(<Visits companionLabel="小鱼" onOpen={jump} />)
    expect(await screen.findByText('小G翻开了《雨夜》')).toBeInTheDocument()
    expect(screen.getByText('这次尚未留下合书余记')).toBeInTheDocument()
    expect(screen.queryByText(/正在阅读/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('查看页边文字 · 1'))
    fireEvent.click(screen.getByText('记住这场雨。'))
    expect(jump).toHaveBeenCalledWith('presence',locator)
  })
  it('空书房不展示模拟来访',async()=>{
    render(<Visits companionLabel="小G" />)
    await waitFor(()=>expect(screen.getByText('来访簿还留着空白。')).toBeInTheDocument())
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
  it('日分组按上海时区跨午夜',()=>{
    expect(dayLabel('2026-10-18T16:05:00Z',new Date('2026-10-19T05:00:00Z'))).toBe('今天')
    expect(dayLabel('2026-10-18T15:59:00Z',new Date('2026-10-19T05:00:00Z'))).toBe('昨天')
  })
})
