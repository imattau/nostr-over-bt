const PANES = ['feed', 'swarm', 'channels']

const LABELS = {
  feed: '# feed',
  swarm: '◈ swarm',
  channels: '≡ channels'
}

const CSS = `
  .mobile-nav {
    display: none;
    height: 40px;
    border-top: 1px solid var(--border);
    background: var(--bg2);
  }
  .mobile-nav-btn {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 12px;
    padding: 0;
    cursor: pointer;
  }
  .mobile-nav-btn.active {
    color: var(--green);
  }
  .mobile-nav-btn:hover:not(.active) {
    color: var(--text);
  }
  @media (max-width: 599px) {
    .mobile-nav {
      display: flex;
    }
  }
`

export default function MobileNav({ activePane, onSelect }) {
  return (
    <>
      <style>{CSS}</style>
      <nav className="mobile-nav" aria-label="Mobile panes">
        {PANES.map(pane => (
          <button
            key={pane}
            type="button"
            className={`mobile-nav-btn ${activePane === pane ? 'active' : ''}`}
            onClick={() => onSelect?.(pane)}
          >
            {LABELS[pane]}
          </button>
        ))}
      </nav>
    </>
  )
}
