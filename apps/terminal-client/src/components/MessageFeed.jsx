import { useEffect, useMemo, useRef, useState } from 'react'

const CSS = `
  .feed {
    overflow-y: auto;
    padding: 8px 0;
    background: var(--bg);
    font-size: 12px;
    line-height: 1.6;
    height: 100%;
  }
  .msg-row {
    display: flex;
    padding: 1px 12px;
    gap: 0;
    align-items: baseline;
  }
  .msg-row:hover {
    background: var(--bg2);
  }
  .msg-time {
    color: var(--text-dim);
    min-width: 48px;
    flex-shrink: 0;
  }
  .msg-author {
    min-width: 116px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .msg-author.relay { color: var(--blue); }
  .msg-author.bt { color: var(--green); }
  .msg-author.hybrid { color: var(--yellow); }
  .msg-author.system { color: var(--text-dim); font-style: italic; }
  .msg-author.me { color: var(--purple); }
  .msg-content {
    flex: 1;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-content.system {
    color: var(--text-dim);
    font-style: italic;
  }
  .msg-badge {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 8px;
    align-self: center;
  }
  .badge-relay {
    color: var(--blue);
    border: 1px solid var(--blue);
  }
  .badge-bt {
    color: var(--green);
    border: 1px solid var(--green);
  }
  .badge-hybrid {
    color: var(--yellow);
    border: 1px solid var(--yellow);
  }
  .msg-magnet {
    padding: 0 12px 2px 170px;
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty-feed {
    color: var(--text-dim);
    font-style: italic;
    padding: 16px 12px;
  }
`

function formatTime(ts) {
  return new Date(ts * 1000).toTimeString().slice(0, 5)
}

function filterMessages(messages, activeChannel, follows) {
  if (activeChannel === 'nostr-bt') {
    return messages.filter(message => message.source !== 'system' && message.hasBT)
  }

  if (activeChannel === 'follows') {
    return messages.filter(message => message.source === 'system' || (message.pubkey && follows.has(message.pubkey)))
  }

  return messages
}

export default function MessageFeed({ messages, activeChannel, follows }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = useMemo(
    () => filterMessages(messages, activeChannel, follows),
    [messages, activeChannel, follows]
  )

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' })
    }
  }, [filtered.length, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="feed" ref={containerRef} onScroll={handleScroll}>
        {filtered.length === 0 ? (
          <div className="empty-feed">No events for this channel.</div>
        ) : (
          filtered.map(message => (
            <div key={message.id}>
              <div className="msg-row">
                <span className="msg-time">{formatTime(message.ts)}</span>
                <span className={`msg-author ${message.source}`}>
                  &lt;{message.author?.slice(0, 16)}&gt;
                </span>
                <span className={`msg-content ${message.source === 'system' ? 'system' : ''}`}>
                  {message.content}
                </span>
                {message.source !== 'system' && (
                  <span className={`msg-badge badge-${message.source}`}>
                    [{message.source}]
                  </span>
                )}
              </div>
              {message.magnetUri && (
                <div className="msg-magnet">└─ 📦 {message.magnetUri}</div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </>
  )
}
