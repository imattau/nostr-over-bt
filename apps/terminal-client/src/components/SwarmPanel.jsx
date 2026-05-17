import { useEffect, useRef } from 'react'

const CSS = `
  .swarm {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
    font-size: 11px;
  }
  .swarm-header {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.8;
  }
  .swarm-header span {
    color: var(--text);
  }
  .swarm-log {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .swarm-entry {
    padding: 1px 10px;
    display: flex;
    gap: 8px;
    line-height: 1.6;
  }
  .swarm-entry .t {
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .swarm-entry .m {
    word-break: break-all;
  }
  .swarm-entry.success .m {
    color: var(--green);
  }
  .swarm-entry.info .m {
    color: var(--text-dim);
  }
  .swarm-entry.error .m {
    color: var(--red);
  }
  .swarm-entry.warning .m {
    color: var(--yellow);
  }
  .swarm-footer {
    border-top: 1px solid var(--border);
    padding: 6px 10px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .swarm-footer .title {
    color: var(--text);
    margin-bottom: 4px;
  }
  .seed-item {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-dim);
  }
  .seed-item::before {
    content: '· ';
  }
`

export default function SwarmPanel({ swarmEvents, stats, seeding }) {
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [swarmEvents.length])

  return (
    <>
      <style>{CSS}</style>
      <div className="swarm">
        <div className="swarm-header">
          DHT <span>{stats.dhtNodes}</span> nodes<br />
          ↑ <span>{stats.uploadSpeed}</span>KB/s&nbsp;
          ↓ <span>{stats.downloadSpeed}</span>KB/s
        </div>
        <div className="swarm-log" ref={logRef}>
          {swarmEvents.length === 0 ? (
            <div className="swarm-entry info">
              <span className="t">--:--:--</span>
              <span className="m">waiting for traffic...</span>
            </div>
          ) : (
            swarmEvents.map((event, index) => (
              <div key={`${event.time}-${index}`} className={`swarm-entry ${event.type}`}>
                <span className="t">{event.time}</span>
                <span className="m">{event.msg}</span>
              </div>
            ))
          )}
        </div>
        <div className="swarm-footer">
          <div className="title">SEEDING ({seeding.length})</div>
          {seeding.slice(0, 8).map(infoHash => (
            <div key={infoHash} className="seed-item" title={infoHash}>
              {infoHash}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
