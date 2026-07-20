import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Marginalia visual prototype', () => {
  it('opens a book room from the cover and continues into the reader', () => {
    render(<App />)

    expect(screen.getByText('在正文之外，我们相遇。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: /一座只在雨夜出现的旧书房.*展开/ }))
    expect(screen.getByRole('dialog', { name: '雨夜书房' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭完整简介' }))

    fireEvent.click(screen.getByRole('button', { name: /从这里继续/ }))
    expect(screen.getByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    expect(screen.getByLabelText(/第 1 页，共/)).toBeInTheDocument()
  })

  it('filters the mobile-friendly shelf', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /已读完/ }))
    expect(screen.getAllByText('玻璃温室里的冬天')).toHaveLength(2)
    expect(screen.queryByText('雨夜书房')).not.toBeInTheDocument()
  })
})
