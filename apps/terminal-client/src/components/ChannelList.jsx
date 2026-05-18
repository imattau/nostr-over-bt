const CHANNELS = ['global', 'nostr-bt', 'follows', 'myposts']

const CSS = `
  .chanlist {
    padding: 8px 0;
    background: var(--bg);
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .chanlist-section {
    padding: 4px 8px;
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 8px;
  }
  .channel-item {
    padding: 3px 12px;
    cursor: pointer;
    color: var(--text-dim);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-left: 2px solid transparent;
  }
  .channel-item:hover {
    background: var(--bg3);
    color: var(--text);
  }
  .channel-item.active {
    color: var(--blue);
    background: var(--bg2);
    border-left-color: var(--blue);
  }
  .peer-item {
    padding: 2px 12px;
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.72;
  }
  .peer-item::before {
    content: '· ';
  }
`

export default function ChannelList({ activeChannel, setActiveChannel, peers }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="chanlist">
        <div className="chanlist-section">channels</div>
        {CHANNELS.map(channel => (
          <div
            key={channel}
            className={`channel-item ${activeChannel === channel ? 'active' : ''}`}
            onClick={() => setActiveChannel(channel)}
            role="button"
            tabIndex={0}
          >
            #{channel}
          </div>
        ))}

        <div className="chanlist-section">peers</div>
        {peers.length === 0 ? (
          <div className="peer-item" style={{ fontStyle: 'italic' }}>none</div>
        ) : (
          peers.map(peer => (
            <div key={peer} className="peer-item" title={peer}>
              {peer.slice(0, 10)}
            </div>
          ))
        )}
      </div>
    </>
  )
}
