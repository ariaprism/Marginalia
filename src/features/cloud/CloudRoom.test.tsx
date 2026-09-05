import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CloudRoom } from './CloudRoom'

describe('CloudRoom', () => {
  it('keeps localhost in an explicit local-only workroom by default', async () => {
    render(<CloudRoom />)

    expect(screen.getByText('这处施工书房只留在当前浏览器')).toBeInTheDocument()
    expect(screen.getByText(/localhost 默认不碰真实藏书/)).toBeInTheDocument()
    expect(screen.queryByLabelText('云端门帖邮箱')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('待收内容')).toBeInTheDocument())
  })

  it('keeps staged sync and restore disabled in the local-only workroom', () => {
    render(<CloudRoom />)

    expect(screen.getByRole('button', { name: /收好书页与痕迹/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /从云端恢复/ })).toBeDisabled()
  })
})
