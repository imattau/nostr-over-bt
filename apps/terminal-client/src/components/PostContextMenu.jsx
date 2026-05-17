import { useEffect, useRef } from 'react'

const CSS = `
  .post-menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: transparent;
  }
  .post-menu {
    position: fixed;
    min-width: 220px;
    max-width: 260px;
    border: 1px solid var(--border);
    background: rgba(9, 13, 20, 0.98);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    padding: 6px;
  }
  .post-menu-head {
    padding: 4px 8px 6px;
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    margin-bottom: 6px;
  }
  .post-menu-author {
    display: block;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0;
    text-transform: none;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .post-menu-list {
    display: grid;
    gap: 2px;
  }
  .post-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    padding: 6px 8px;
    cursor: pointer;
  }
  .post-menu-item:hover {
    background: var(--bg2);
    border-color: var(--border);
  }
  .post-menu-item.danger {
    color: var(--red);
  }
  .post-menu-item.danger:hover {
    border-color: rgba(255, 107, 107, 0.4);
    background: rgba(255, 107, 107, 0.08);
  }
  .post-menu-item.muted {
    color: var(--text-dim);
  }
`

export default function PostContextMenu({
  message,
  x,
  y,
  isBlocked = false,
  onClose,
  onReply,
  onToggleBlock,
  onReport,
  onCopyPubkey,
  onCopyEventId,
  onOpenNjump
}) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const handleScroll = () => onClose()

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  useEffect(() => {
    menuRef.current?.focus()
  }, [])

  if (!message) return null

  return (
    <>
      <style>{CSS}</style>
      <div className="post-menu-overlay" onClick={onClose} onContextMenu={(event) => event.preventDefault()}>
        <div
          ref={menuRef}
          className="post-menu"
          style={{ left: x, top: y }}
          role="menu"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="post-menu-head">
            post actions
            <span className="post-menu-author">
              {message.author || message.pubkey?.slice(0, 8) || 'unknown'}
            </span>
          </div>
          <div className="post-menu-list">
            <button type="button" className="post-menu-item" onClick={onReply}>
              Reply
            </button>
            <button
              type="button"
              className={`post-menu-item ${isBlocked ? 'muted' : 'danger'}`}
              onClick={onToggleBlock}
            >
              {isBlocked ? 'Unblock user' : 'Block user'}
            </button>
            <button type="button" className="post-menu-item danger" onClick={onReport}>
              Report
            </button>
            <button type="button" className="post-menu-item" onClick={onCopyPubkey} disabled={!message.pubkey}>
              Copy pubkey
            </button>
            <button type="button" className="post-menu-item" onClick={onCopyEventId} disabled={!message.id}>
              Copy event id
            </button>
            <button type="button" className="post-menu-item" onClick={onOpenNjump} disabled={!message.id}>
              Open on njump
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
