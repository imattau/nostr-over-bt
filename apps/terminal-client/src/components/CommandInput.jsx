import { useEffect, useRef, useState } from 'react'

const CSS = `
  .cmd-input-wrap {
    display: flex;
    align-items: stretch;
    border-top: 1px solid var(--border);
    background: var(--bg2);
    padding: 0 12px;
    min-height: 36px;
    gap: 8px;
    flex-shrink: 0;
    position: relative;
    cursor: text;
  }
  .cmd-input-wrap.dragging {
    border-top-color: var(--blue);
    box-shadow: inset 0 0 0 1px rgba(97, 167, 255, 0.2);
  }
  .cmd-drop-cover {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(8, 14, 24, 0.8);
    color: var(--blue);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
  }
  .cmd-input-stack {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 0;
    align-self: stretch;
  }
  .cmd-reply {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid rgba(97, 167, 255, 0.25);
    background: rgba(97, 167, 255, 0.08);
    color: var(--text-dim);
    font-size: 11px;
    padding: 2px 8px;
  }
  .cmd-reply strong {
    color: var(--blue);
    font-weight: 600;
    margin-right: 6px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .cmd-reply button {
    border: none;
    background: transparent;
    color: var(--blue);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .cmd-reply button:hover {
    color: var(--yellow);
  }
  .cmd-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cmd-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-dim);
    font-size: 11px;
    padding: 2px 8px;
  }
  .cmd-chip span {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmd-chip button {
    border: none;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .cmd-chip button:hover {
    color: var(--red);
  }
  .cmd-prompt {
    color: var(--green);
    flex-shrink: 0;
  }
  .cmd-input {
    flex: 1;
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    line-height: 1.45;
    caret-color: var(--green);
    resize: none;
    padding: 0;
    margin: 0;
    min-height: 20px;
    overflow: auto;
  }
  .cmd-input::placeholder {
    color: var(--text-dim);
  }
`

function dedupeFiles(files) {
  const seen = new Set()
  const next = []
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(file)
  }
  return next
}

export default function CommandInput({
  onSubmit,
  expanded = false,
  replyTarget = null,
  onClearReplyTarget,
  onHeightChange
}) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [replyTarget, expanded])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !onHeightChange) return

    const report = () => {
      onHeightChange(Math.ceil(el.getBoundingClientRect().height))
    }

    report()

    const observer = new ResizeObserver(report)
    observer.observe(el)

    return () => observer.disconnect()
  }, [onHeightChange, replyTarget, expanded, attachedFiles.length])

  const addFiles = (incomingFiles) => {
    setAttachedFiles(prev => dedupeFiles([...prev, ...incomingFiles]))
  }

  const clearFiles = () => {
    setAttachedFiles([])
  }

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed && attachedFiles.length === 0) return

    await onSubmit(trimmed, attachedFiles)
    setHistory(prev => trimmed ? [trimmed, ...prev].slice(0, 50) : prev)
    setHistoryIdx(-1)
    setValue('')
    clearFiles()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(nextIndex)
      setValue(history[nextIndex] ?? '')
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = Math.max(historyIdx - 1, -1)
      setHistoryIdx(nextIndex)
      setValue(nextIndex === -1 ? '' : history[nextIndex])
    }
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer?.items || []).some(item => item.kind === 'file')
    if (!files) return
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)

    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length > 0) {
      addFiles(files)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div
        ref={wrapRef}
        className={`cmd-input-wrap ${isDragging ? 'dragging' : ''}`}
        onClick={() => inputRef.current?.focus()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging ? <div className="cmd-drop-cover">drop to attach</div> : null}
        <span className="cmd-prompt">{'>'}</span>
        <div className="cmd-input-stack">
          {replyTarget ? (
            <div className="cmd-reply">
              <span title={replyTarget.content || replyTarget.id}>
                <strong>reply mode</strong>
                replying to {replyTarget.author || replyTarget.pubkey?.slice(0, 8) || 'post'}
              </span>
              <button type="button" onClick={onClearReplyTarget} aria-label="Clear reply target">
                clear
              </button>
            </div>
          ) : null}
          {attachedFiles.length > 0 ? (
            <div className="cmd-attachments">
              {attachedFiles.map((file, index) => (
                <div className="cmd-chip" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                  <span title={file.name}>{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            ref={inputRef}
            className="cmd-input"
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              expanded
                ? (replyTarget
                  ? 'enter to send a reply, shift+enter for a newline'
                  : attachedFiles.length > 0
                    ? 'enter to send, shift+enter for a newline'
                    : 'type a message, /help, or shift+enter for a newline')
                : (attachedFiles.length > 0
                  ? 'press enter to send with attachments'
                  : 'type a message or /help')
            }
            rows={expanded ? 4 : 1}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              minHeight: expanded ? '92px' : '20px',
              maxHeight: expanded ? '160px' : '72px'
            }}
          />
        </div>
      </div>
    </>
  )
}
