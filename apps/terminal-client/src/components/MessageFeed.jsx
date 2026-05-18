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
  .thread-shell {
    padding: 4px 0 12px;
  }
  .thread-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 12px 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .thread-banner strong {
    color: var(--text);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 8px;
  }
  .thread-banner button {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .thread-banner button:hover {
    color: var(--text);
    border-color: var(--blue);
  }
  .thread-tree {
    display: grid;
    gap: 2px;
  }
  .thread-node {
    display: grid;
    gap: 2px;
  }
  .thread-node.depth-0 > .msg-row {
    background: rgba(97, 167, 255, 0.06);
  }
  .thread-node.depth-1 {
    margin-left: 18px;
  }
  .thread-node.depth-2 {
    margin-left: 36px;
  }
  .thread-node.depth-3 {
    margin-left: 54px;
  }
  .thread-node.depth-4 {
    margin-left: 72px;
  }
  .thread-node.depth-5 {
    margin-left: 90px;
  }
  .msg-content.system {
    color: var(--text-dim);
    font-style: italic;
  }
  .msg-link {
    color: var(--blue);
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-word;
  }
  .msg-link:hover {
    color: var(--yellow);
  }
  .msg-badge {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 8px;
    align-self: center;
  }
  @media (max-width: 599px) {
    .msg-row {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 2px 8px;
      padding: 4px 12px;
    }
    .msg-time {
      min-width: 0;
      order: 2;
    }
    .msg-author {
      min-width: 0;
      order: 3;
      white-space: nowrap;
      max-width: 100%;
    }
    .msg-content {
      order: 1;
      flex: 1 1 100%;
      min-width: 0;
      width: 100%;
    }
    .msg-badge {
      order: 4;
      margin-left: auto;
    }
    .msg-magnet,
    .msg-files {
      padding-left: 12px;
    }
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
  .msg-files {
    padding: 0 12px 2px 170px;
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .msg-file {
    border: 1px solid var(--border);
    background: var(--bg2);
    padding: 1px 6px;
  }
  .empty-feed {
    color: var(--text-dim);
    font-style: italic;
    padding: 16px 12px;
  }
  @media (max-width: 599px) {
    .thread-shell {
      padding: 2px 0 8px;
    }
    .thread-banner {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 4px 12px 8px;
      margin-bottom: 6px;
      line-height: 1.25;
    }
    .thread-banner strong {
      margin-left: 6px;
    }
    .thread-banner button {
      align-self: flex-end;
      font-size: 10px;
      padding: 1px 6px;
    }
    .thread-node.depth-1 {
      margin-left: 12px;
    }
    .thread-node.depth-2 {
      margin-left: 20px;
    }
    .thread-node.depth-3 {
      margin-left: 28px;
    }
    .thread-node.depth-4 {
      margin-left: 36px;
    }
    .thread-node.depth-5 {
      margin-left: 44px;
    }
  }
`

function formatTime(ts) {
  return new Date(ts * 1000).toTimeString().slice(0, 5)
}

const LINK_RE = /(nostr:)?(?:npub|note|nevent|nprofile|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+|https?:\/\/[^\s<>"')\]]+|magnet:\?[^\s<>"')\]]+/gi

function normalizeLinkTarget(raw) {
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }

  if (raw.startsWith('magnet:')) {
    return raw
  }

  if (raw.toLowerCase().startsWith('nostr:')) {
    return `https://njump.me/${raw.slice(6)}`
  }

  return `https://njump.me/${raw}`
}

function renderLinkedContent(content) {
  if (!content) return ''

  const parts = []
  let lastIndex = 0
  let match

  LINK_RE.lastIndex = 0
  while ((match = LINK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const raw = match[0]
    const href = normalizeLinkTarget(raw)
    parts.push(
      <a
        key={`${match.index}-${raw}`}
        href={href}
        className="msg-link"
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {raw}
      </a>
    )

    lastIndex = match.index + raw.length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

function filterMessages(messages, activeChannel, follows, blockedPubkeys, selfPubkey) {
  const isBlocked = (message) => Boolean(message.pubkey && blockedPubkeys.has(message.pubkey))

  if (activeChannel === 'nostr-bt') {
    return messages.filter(message => message.source !== 'system' && message.hasBT && !isBlocked(message))
  }

  if (activeChannel === 'follows') {
    return messages.filter(message => {
      if (message.source === 'system') return true
      const isSelf = selfPubkey && message.pubkey === selfPubkey
      return (isSelf || (message.pubkey && follows.has(message.pubkey))) && !isBlocked(message)
    })
  }

  if (activeChannel === 'myposts') {
    return messages.filter(message => {
      if (message.source === 'system') return false
      return Boolean(selfPubkey && message.pubkey === selfPubkey)
    })
  }

  return messages.filter(message => message.source === 'system' || !isBlocked(message))
}

function buildThread(messages, rootId) {
  const byId = new Map(messages.map(message => [message.id, message]))
  const childrenByParent = new Map()

  for (const message of messages) {
    if (!message.replyTo) continue
    if (!childrenByParent.has(message.replyTo)) {
      childrenByParent.set(message.replyTo, [])
    }
    childrenByParent.get(message.replyTo).push(message)
  }

  const sortMessages = (items) => items
    .slice()
    .sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))

  const visit = (id, depth = 0) => {
    const node = byId.get(id)
    if (!node) return []

    const children = sortMessages(childrenByParent.get(id) || [])
    return [{
      message: node,
      depth,
      children: children.flatMap(child => visit(child.id, depth + 1))
    }]
  }

  return visit(rootId)
}

function flattenThread(nodes) {
  const flat = []
  for (const node of nodes) {
    flat.push({ message: node.message, depth: node.depth })
    flat.push(...flattenThread(node.children))
  }
  return flat
}

function MessageRow({ message, onFocusMessage, onContextMenu }) {
  const touchTimerRef = useRef(null)
  const touchStartRef = useRef(null)
  const longPressFiredRef = useRef(false)

  useEffect(() => () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
    }
  }, [])

  const clearTouchTimer = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    longPressFiredRef.current = false
    clearTouchTimer()
    touchTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      navigator.vibrate?.(10)
      onContextMenu?.(message, {
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {}
      })
    }, 500)
  }

  const handleTouchMove = (event) => {
    const start = touchStartRef.current
    const touch = event.touches?.[0]
    if (!start || !touch) return

    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      clearTouchTimer()
    }
  }

  const handleTouchEnd = () => {
    clearTouchTimer()
    touchStartRef.current = null
  }

  const handleTouchCancel = () => {
    clearTouchTimer()
    touchStartRef.current = null
  }

  const handleClick = (event) => {
    if (longPressFiredRef.current) {
      event.preventDefault()
      event.stopPropagation()
      longPressFiredRef.current = false
      return
    }
    onFocusMessage?.(message)
  }

  return (
    <div
      className="msg-row"
      onClick={handleClick}
      onContextMenu={(event) => onContextMenu?.(message, event)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <span className="msg-time">{formatTime(message.ts)}</span>
      <span className={`msg-author ${message.source}`}>
        &lt;{message.author?.slice(0, 16)}&gt;
      </span>
      <span className={`msg-content ${message.source === 'system' ? 'system' : ''}`}>
        {renderLinkedContent(message.content)}
      </span>
      {message.source !== 'system' && (
        <span className={`msg-badge badge-${message.source}`}>
          [{message.source}]
        </span>
      )}
    </div>
  )
}

function MessageEntry({ message, onFocusMessage, onContextMenu }) {
  return (
    <div>
      <MessageRow
        message={message}
        onFocusMessage={onFocusMessage}
        onContextMenu={onContextMenu}
      />
      {message.magnetUri && (
        <div className="msg-magnet">
          └─ 📦{' '}
          <a
            href={message.magnetUri}
            className="msg-link"
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {message.magnetUri}
          </a>
        </div>
      )}
      {message.files && message.files.length > 0 ? (
        <div className="msg-files">
          {message.files.map(file => (
            <span key={file} className="msg-file">└─ {file}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ThreadNode({ message, depth, onFocusMessage, onContextMenu }) {
  return (
    <div className={`thread-node depth-${Math.min(depth, 5)}`}>
      <MessageEntry message={message} onFocusMessage={onFocusMessage} onContextMenu={onContextMenu} />
    </div>
  )
}

export default function MessageFeed({
  messages,
  activeChannel,
  follows,
  blockedPubkeys,
  selfPubkey,
  focusedMessageId,
  onContextMenu,
  onFocusMessage,
  onClearFocusedThread
}) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = useMemo(
    () => filterMessages(messages, activeChannel, follows, blockedPubkeys, selfPubkey),
    [messages, activeChannel, follows, blockedPubkeys, selfPubkey]
  )

  const threadMessages = useMemo(
    () => messages.filter(message => message.source !== 'system' && !(message.pubkey && blockedPubkeys.has(message.pubkey))),
    [messages, blockedPubkeys]
  )

  const focusedThread = useMemo(() => {
    if (!focusedMessageId) return null
    const root = threadMessages.find(message => message.id === focusedMessageId)
    if (!root) return null
    return flattenThread(buildThread(threadMessages, root.id))
  }, [focusedMessageId, threadMessages])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' })
    }
  }, [focusedThread?.length || filtered.length, autoScroll])

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
        {focusedThread ? (
          <div className="thread-shell">
            <div className="thread-banner">
              <span>
                thread view
                <strong>{focusedThread[0]?.message.author || 'post'}</strong>
              </span>
              <button type="button" onClick={onClearFocusedThread}>back to feed</button>
            </div>
            <div className="thread-tree">
              {focusedThread.map(({ message, depth }) => (
                <ThreadNode
                  key={message.id}
                  message={message}
                  depth={depth}
                  onFocusMessage={onFocusMessage}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-feed">No events for this channel.</div>
        ) : (
          filtered.map(message => (
            <MessageEntry key={message.id} message={message} onFocusMessage={onFocusMessage} onContextMenu={onContextMenu} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </>
  )
}
