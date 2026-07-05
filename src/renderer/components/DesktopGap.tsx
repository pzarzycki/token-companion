import type React from 'react'
import type { DesktopGapEntry } from '@shared/types'

interface Props {
  gaps: DesktopGapEntry[]
}

export function DesktopGap({ gaps }: Props): React.JSX.Element | null {
  if (gaps.length === 0) return null
  const total = gaps.reduce((n, g) => n + g.conversationCount, 0)

  return (
    <section className="panel gap-panel">
      <h2>
        Desktop chats not yet counted
        <span className="gap-total">~{total} conversations</span>
      </h2>
      <p className="gap-intro">
        These desktop apps store plain-chat conversations in binary databases that
        do <b>not</b> record token counts. They&apos;re detected here so the gap is
        visible — token counting for these is a planned follow-up (local tokenizer).
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>App</th>
            <th className="num">Conversations (approx)</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((g, i) => (
            <tr key={i}>
              <td>{g.app}</td>
              <td className="num">{g.conversationCount}</td>
              <td className="gap-note">{g.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}