import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  .cmd-media-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cmd-media-btn {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-dim);
    font: inherit;
    font-size: 12px;
    padding: 2px 8px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cmd-media-btn:hover {
    color: var(--text);
    border-color: var(--blue);
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
    min-height: 0;
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
  .cmd-warnings {
    display: grid;
    gap: 4px;
    border: 1px solid rgba(255, 107, 107, 0.28);
    background: rgba(255, 107, 107, 0.08);
    color: var(--red);
    font-size: 11px;
    padding: 6px 8px;
  }
  .cmd-warning {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmd-previews {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    min-height: 56px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .cmd-preview {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    max-width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-dim);
    font-size: 11px;
    padding: 4px 8px 4px 4px;
    overflow: hidden;
    flex: 0 0 180px;
  }
  .cmd-preview img {
    width: 48px;
    height: 48px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg3);
  }
  .cmd-preview-video {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--green);
    font-size: 18px;
  }
  .cmd-preview-meta {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .cmd-preview-meta strong {
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
  .cmd-preview-meta span {
    overflow: hidden;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmd-preview button {
    position: absolute;
    top: 2px;
    right: 4px;
    border: none;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .cmd-preview button:hover {
    color: var(--red);
  }
  .cmd-prompt {
    color: var(--green);
    flex-shrink: 0;
  }
  .cmd-input {
    flex: 1;
    width: 100%;
    height: auto;
    display: block;
    box-sizing: border-box;
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
  .cmd-input-line {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .cmd-input::placeholder {
    color: var(--text-dim);
  }
  @media (max-width: 599px) {
    .cmd-input-wrap {
      min-height: 32px;
      padding: 0 10px;
      gap: 6px;
    }
    .cmd-input-stack {
      gap: 4px;
      padding: 4px 0;
    }
    .cmd-reply {
      padding: 1px 6px;
      font-size: 10px;
      line-height: 1.25;
    }
    .cmd-reply strong {
      margin-right: 4px;
    }
    .cmd-reply button {
      font-size: 10px;
    }
    .cmd-warnings {
      gap: 2px;
      padding: 4px 6px;
      font-size: 10px;
    }
    .cmd-previews {
      min-height: 48px;
    }
    .cmd-preview {
      flex-basis: 160px;
      height: 48px;
    }
    .cmd-preview img,
    .cmd-preview-video {
      width: 40px;
      height: 40px;
    }
    .cmd-preview-meta strong {
      max-width: 140px;
    }
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
  onHeightChange,
  publishWarnings = []
}) {
  const isExpanded = expanded || Boolean(replyTarget)
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [previewItems, setPreviewItems] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const wrapRef = useRef(null)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [replyTarget, isExpanded])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || !onHeightChange) return

    const report = () => {
      onHeightChange(Math.ceil(el.scrollHeight))
    }

    const frame = requestAnimationFrame(report)

    const observer = new ResizeObserver(report)
    observer.observe(el)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [onHeightChange, replyTarget, isExpanded, attachedFiles.length])

  useEffect(() => {
    const nextPreviews = attachedFiles.map((file) => ({
      file,
      kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file',
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }))

    setPreviewItems(nextPreviews)

    return () => {
      nextPreviews.forEach(item => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
    }
  }, [attachedFiles])

  const addFiles = (incomingFiles) => {
    const accepted = incomingFiles.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
    setAttachedFiles(prev => dedupeFiles([...prev, ...accepted]).slice(0, 3))
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

  const openPicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      addFiles(files)
    }
    event.target.value = ''
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
          {previewItems.length > 0 ? (
            <div className="cmd-previews">
              {previewItems.map((item, index) => (
                <div className="cmd-preview" key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${index}`}>
                  {item.kind === 'image' && item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.file.name} />
                  ) : (
                    <div className="cmd-preview-video" aria-hidden="true">
                      {item.kind === 'video' ? '▶' : '⇪'}
                    </div>
                  )}
                  <div className="cmd-preview-meta">
                    <strong title={item.file.name}>{item.file.name}</strong>
                    <span>{Math.ceil(item.file.size / 1024)} KB</span>
                  </div>
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${item.file.name}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {publishWarnings.length > 0 ? (
            <div className="cmd-warnings" role="status" aria-live="polite">
              {publishWarnings.map((warning) => (
                <div className="cmd-warning" key={warning} title={warning}>
                  media warning: {warning}
                </div>
              ))}
            </div>
          ) : null}
          <div className="cmd-input-line">
            <button type="button" className="cmd-media-btn" onClick={openPicker}>
              [+]
            </button>
            <span className="cmd-prompt">{'>'}</span>
            <textarea
              ref={inputRef}
              className="cmd-input"
              value={value}
              onChange={event => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isExpanded
                  ? (replyTarget
                    ? 'enter to send a reply, shift+enter for a newline'
                    : attachedFiles.length > 0
                      ? 'enter to send, shift+enter for a newline'
                      : 'type a message, /help, or shift+enter for a newline')
                  : (attachedFiles.length > 0
                    ? 'press enter to send with attachments'
                    : 'type a message or /help')
              }
              rows={isExpanded ? 4 : 1}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                minHeight: isExpanded ? '92px' : '20px',
                maxHeight: isExpanded ? '160px' : '72px'
              }}
            />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </>
  )
}
