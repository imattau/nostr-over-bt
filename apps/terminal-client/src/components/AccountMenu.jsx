import { useState } from 'react'

const CSS = `
  :root {
    --bg: #0b0f14;
    --bg2: #111827;
    --bg3: #1b2331;
    --border: #273244;
    --text: #d7dde8;
    --text-dim: #768096;
    --green: #4ee59b;
    --blue: #61a7ff;
    --yellow: #f3c969;
    --red: #ff6b6b;
    --purple: #c792ea;
    --font: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  }

  .account-overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(5, 8, 12, 0.72);
    backdrop-filter: blur(8px);
    z-index: 30;
    padding: 20px;
  }

  .account-card {
    width: min(720px, 100%);
    border: 1px solid var(--border);
    background: rgba(13, 17, 24, 0.96);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }

  .account-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: baseline;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .account-title {
    color: var(--text);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 15px;
  }

  .account-close {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
  }

  .account-close:hover {
    color: var(--text);
    border-color: var(--blue);
  }

  .account-body {
    display: grid;
    gap: 16px;
    padding: 20px;
  }

  .account-panel {
    border: 1px solid var(--border);
    background: rgba(17, 24, 39, 0.72);
    padding: 16px;
  }

  .account-panel h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--text);
  }

  .account-panel p {
    margin: 0 0 12px;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.5;
  }

  .account-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .account-input {
    flex: 1;
    min-width: 260px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    padding: 10px 12px;
    outline: none;
  }

  .account-button {
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    padding: 10px 14px;
    cursor: pointer;
  }

  .account-button.primary {
    border-color: var(--blue);
    color: var(--blue);
  }

  .account-button:hover:not(:disabled) {
    background: var(--bg3);
  }

  .account-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .account-error {
    margin-top: 10px;
    color: var(--red);
    font-size: 12px;
    white-space: pre-wrap;
  }

  .account-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 20px 18px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .account-refresh {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .account-refresh:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--blue);
  }
`

export default function AccountMenu({
  authMode,
  extensionAvailable,
  authError,
  isConnecting,
  onClose,
  onRefreshExtension,
  onConnectExtension,
  onConnectNsec
}) {
  const [secret, setSecret] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onConnectNsec(secret)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="account-overlay" role="dialog" aria-modal="true">
        <div className="account-card">
          <div className="account-head">
            <div className="account-title">
              account switcher
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
                {authMode ? `current session: ${authMode}` : 'choose a signing method'}
              </div>
            </div>
            <button type="button" className="account-close" onClick={onClose}>
              close
            </button>
          </div>

          <form className="account-body" onSubmit={handleSubmit}>
            <div className="account-panel">
              <h3>Browser Extension</h3>
              <p>Swap to a NIP-07 wallet or extension without leaving the app.</p>
              <div className="account-row">
                <button
                  type="button"
                  className="account-button primary"
                  onClick={onConnectExtension}
                  disabled={!extensionAvailable || isConnecting}
                >
                  {extensionAvailable ? 'Use browser extension' : 'No extension detected'}
                </button>
                <button
                  type="button"
                  className="account-refresh"
                  onClick={onRefreshExtension}
                  disabled={isConnecting}
                >
                  refresh
                </button>
              </div>
            </div>

            <div className="account-panel">
              <h3>Private Key Fallback</h3>
              <p>Paste an `nsec1...` secret or 64-character hex secret to switch accounts.</p>
              <div className="account-row">
                <input
                  className="account-input"
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="nsec1... or 64 hex chars"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  className="account-button primary"
                  disabled={isConnecting || !secret.trim()}
                >
                  {isConnecting ? 'Connecting...' : 'Switch account'}
                </button>
              </div>
              {authError ? <div className="account-error">{authError}</div> : null}
            </div>
          </form>

          <div className="account-meta">
            <div>The new account replaces the active session immediately after sign-in.</div>
            <div>Local transport identity is regenerated only when needed.</div>
          </div>
        </div>
      </div>
    </>
  )
}
