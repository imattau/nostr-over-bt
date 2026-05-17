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

  html, body, #root {
    height: 100%;
  }

  body {
    margin: 0;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    background:
      radial-gradient(circle at top left, rgba(97, 167, 255, 0.12), transparent 30%),
      radial-gradient(circle at bottom right, rgba(78, 229, 155, 0.08), transparent 26%),
      var(--bg);
    overflow: hidden;
  }

  .login-screen {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at top left, rgba(97, 167, 255, 0.18), transparent 30%),
      radial-gradient(circle at bottom right, rgba(78, 229, 155, 0.1), transparent 28%),
      var(--bg);
  }

  .login-card {
    width: min(720px, 100%);
    border: 1px solid var(--border);
    background: rgba(13, 17, 24, 0.92);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }

  .login-header {
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }

  .login-title {
    font-size: 18px;
    color: var(--text);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .login-subtitle {
    color: var(--text-dim);
    font-size: 12px;
  }

  .login-body {
    display: grid;
    gap: 18px;
    padding: 20px;
  }

  .login-panel {
    border: 1px solid var(--border);
    background: rgba(17, 24, 39, 0.72);
    padding: 16px;
  }

  .login-panel h2 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--text);
  }

  .login-panel p {
    margin: 0 0 12px;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.5;
  }

  .login-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .login-input {
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

  .login-input::placeholder {
    color: var(--text-dim);
  }

  .login-button {
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    padding: 10px 14px;
    cursor: pointer;
  }

  .login-button.primary {
    border-color: var(--blue);
    color: var(--blue);
  }

  .login-button:hover:not(:disabled) {
    background: var(--bg3);
  }

  .login-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-foot {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 0 20px 20px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .login-error {
    margin-top: 10px;
    color: var(--red);
    font-size: 12px;
    white-space: pre-wrap;
  }

  .login-note {
    color: var(--text-dim);
    font-size: 11px;
  }

  .login-refresh {
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

  .login-refresh:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--blue);
  }
`

export default function LoginScreen({
  authMode,
  extensionAvailable,
  authError,
  isConnecting,
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
      <div className="login-screen">
        <div className="login-card">
          <div className="login-header">
            <div className="login-title">terminal client</div>
            <div className="login-subtitle">
              {authMode ? `saved session: ${authMode}` : 'NIP-07 or imported secret'}
            </div>
          </div>

          <form className="login-body" onSubmit={handleSubmit}>
            <div className="login-panel">
              <h2>Browser Extension</h2>
              <p>
                Connect using a NIP-07 provider such as Alby or nos2x.
                Your signing key stays in the extension.
              </p>
              <div className="login-row">
                <button
                  type="button"
                  className="login-button primary"
                  onClick={onConnectExtension}
                  disabled={!extensionAvailable || isConnecting}
                >
                  {extensionAvailable ? 'Use browser extension' : 'No extension detected'}
                </button>
                <button
                  type="button"
                  className="login-refresh"
                  onClick={onRefreshExtension}
                  disabled={isConnecting}
                >
                  refresh
                </button>
              </div>
            </div>

            <div className="login-panel">
              <h2>Private Key Fallback</h2>
              <p>
                Paste an `nsec1...` secret or a 64-character hex secret.
                The secret is stored locally in this browser for auto-login.
              </p>
              <div className="login-row">
                <input
                  className="login-input"
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="nsec1... or 64 hex chars"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  className="login-button primary"
                  disabled={isConnecting || !secret.trim()}
                >
                  {isConnecting ? 'Connecting...' : 'Use secret'}
                </button>
              </div>
              {authError ? <div className="login-error">{authError}</div> : null}
            </div>
          </form>

          <div className="login-foot">
            <div>Relay signing uses your Nostr identity. P2P transport uses a stable local key.</div>
            <div className="login-note">No data leaves the browser unless you choose to connect.</div>
          </div>
        </div>
      </div>
    </>
  )
}
