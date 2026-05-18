import * as nip19 from 'nostr-tools/nip19'

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
  .follow-item {
    padding: 4px 12px 5px;
    font-size: 11px;
    color: var(--text-dim);
    overflow: hidden;
    cursor: pointer;
    display: grid;
    gap: 1px;
    line-height: 1.2;
  }
  .follow-item:hover {
    background: var(--bg3);
    color: var(--text);
  }
  .follow-item .follow-name,
  .follow-item .follow-pubkey {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .follow-item .follow-name {
    font-size: 11px;
    color: var(--text);
  }
  .follow-item .follow-pubkey {
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.8;
  }
`

function formatFollowKey(pubkey) {
  if (!pubkey) return '···'
  try {
    return `${nip19.npubEncode(pubkey).slice(0, 10)}…`
  } catch {
    return `${pubkey.slice(0, 10)}…`
  }
}

export default function ChannelList({ activeChannel, setActiveChannel, peers, follows, onOpenFollow }) {
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

        <div className="chanlist-section">follows</div>
        {follows.length === 0 ? (
          <div className="peer-item" style={{ fontStyle: 'italic' }}>none</div>
        ) : (
          follows.map(follow => (
            <div
              key={follow.pubkey}
              className="follow-item"
              title={follow.pubkey}
              onClick={() => onOpenFollow?.(follow.pubkey)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenFollow?.(follow.pubkey)
                }
              }}
            >
              <span className="follow-name">{follow.label}</span>
              <span className="follow-pubkey">{formatFollowKey(follow.pubkey)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
