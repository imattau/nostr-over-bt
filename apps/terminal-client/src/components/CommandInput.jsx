import { useRef, useState } from 'react'

const CSS = `
  .cmd-input-wrap {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--border);
    background: var(--bg2);
    padding: 0 12px;
    height: 36px;
    gap: 8px;
    flex-shrink: 0;
  }
  .cmd-prompt {
    color: var(--green);
    flex-shrink: 0;
  }
  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    caret-color: var(--green);
  }
  .cmd-input::placeholder {
    color: var(--text-dim);
  }
`

export default function CommandInput({ onSubmit }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef(null)

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      const trimmed = value.trim()
      if (!trimmed) return

      onSubmit(trimmed)
      setHistory(prev => [trimmed, ...prev].slice(0, 50))
      setHistoryIdx(-1)
      setValue('')
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

  return (
    <>
      <style>{CSS}</style>
      <div className="cmd-input-wrap" onClick={() => inputRef.current?.focus()}>
        <span className="cmd-prompt">{'>'}</span>
        <input
          ref={inputRef}
          className="cmd-input"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="type a message or /help"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </>
  )
}
