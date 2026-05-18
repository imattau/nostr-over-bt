import * as nip19 from 'nostr-tools/nip19'

const CSS = `
  .statusbar {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 12px;
    height: 28px;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--red);
    display: inline-block;
    transition: background 0.3s;
    flex-shrink: 0;
  }
  .dot.online {
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .statusbar .label { color: var(--text); }
  .statusbar .channel {
    color: var(--blue);
    margin-left: auto;
  }
  .statusbar .logout {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .statusbar .logout:hover {
    color: var(--text);
    border-color: var(--blue);
  }
  .statusbar .account {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .statusbar .account:hover {
    color: var(--text);
    border-color: var(--blue);
  }
  .statusbar .swarm-toggle {
    display: none;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .statusbar .swarm-toggle:hover {
    color: var(--text);
    border-color: var(--yellow);
  }
  .statusbar .pubkey {
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (min-width: 600px) and (max-width: 767px) {
    .statusbar .swarm-toggle {
      display: inline-flex;
    }
  }
`

function formatPubkey(identity) {
  const pk = identity?.nostrPubkey || identity?.pubkey
  if (!pk) return '···'
  try {
    return `${nip19.npubEncode(pk).slice(0, 12)}···`
  } catch {
    return `${pk.slice(0, 12)}···`
  }
}

export default function StatusBar({
  status,
  identity,
  stats,
  activeChannel,
  onLogout,
  onAccountSwitch,
  showSwarmToggle = false,
  onToggleSwarm
}) {
  const isOnline = status === 'online'

  return (
    <>
      <style>{CSS}</style>
      <div className="statusbar">
        <span className={`dot ${isOnline ? 'online' : ''}`} />
        <span className="label">{isOnline ? 'ONLINE' : 'CONNECTING'}</span>
        <span className="pubkey">{formatPubkey(identity)}</span>
        <span>peers: {stats.peerCount}</span>
        <span>↑ {stats.uploadSpeed}KB/s</span>
        <span>↓ {stats.downloadSpeed}KB/s</span>
        <span className="channel">#{activeChannel}</span>
        {onAccountSwitch ? (
          <button type="button" className="account" onClick={onAccountSwitch}>
            account
          </button>
        ) : null}
        {onToggleSwarm ? (
          <button type="button" className="swarm-toggle" onClick={onToggleSwarm} aria-pressed={showSwarmToggle}>
            {showSwarmToggle ? 'hide swarm' : 'swarm'}
          </button>
        ) : null}
        {onLogout ? (
          <button type="button" className="logout" onClick={onLogout}>
            logout
          </button>
        ) : null}
      </div>
    </>
  )
}
