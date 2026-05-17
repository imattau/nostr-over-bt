import { useEffect, useState } from 'react'
import { useNostrBT } from './hooks/useNostrBT.js'
import StatusBar from './components/StatusBar.jsx'
import ChannelList from './components/ChannelList.jsx'
import MessageFeed from './components/MessageFeed.jsx'
import CommandInput from './components/CommandInput.jsx'
import SwarmPanel from './components/SwarmPanel.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import AccountMenu from './components/AccountMenu.jsx'

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

  * {
    box-sizing: border-box;
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

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(to bottom, rgba(255, 255, 255, 0.03), transparent 18%),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03), transparent 2px);
    background-size: 100% 100%, 48px 100%;
    opacity: 0.12;
  }

  #root {
    height: 100%;
  }

  .app {
    display: grid;
    grid-template-rows: 28px minmax(0, 1fr);
    grid-template-columns: 150px minmax(0, 1fr) 280px;
    grid-template-areas:
      'status status status'
      'channels feed swarm';
    height: 100vh;
    overflow: hidden;
  }

  .status-bar {
    grid-area: status;
  }

  .channel-list {
    grid-area: channels;
    min-width: 150px;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .feed-shell {
    grid-area: feed;
    min-width: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 36px;
    overflow: hidden;
  }

  .swarm-panel {
    grid-area: swarm;
    min-width: 280px;
    border-left: 1px solid var(--border);
    overflow: hidden;
  }

  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }
`

export default function App() {
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const {
    status,
    authMode,
    authError,
    extensionAvailable,
    refreshExtensionAvailability,
    messages,
    peers,
    stats,
    swarmEvents,
    identity,
    activeChannel,
    setActiveChannel,
    follows,
    seeding,
    publish,
    connectWithNsec,
    connectWithExtension,
    logout
  } = useNostrBT()

  useEffect(() => {
    if (status === 'online' && identity) {
      setShowAccountMenu(false)
    }
  }, [identity, status])

  if (status === 'initializing' && !identity && !showAccountMenu) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
          checking saved login...
        </div>
      </>
    )
  }

  if (!identity && !authMode && !showAccountMenu) {
    return (
      <LoginScreen
        authMode={authMode}
        extensionAvailable={extensionAvailable}
        authError={authError}
        isConnecting={status === 'initializing'}
        onRefreshExtension={refreshExtensionAvailability}
        onConnectExtension={connectWithExtension}
        onConnectNsec={connectWithNsec}
      />
    )
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="status-bar">
          <StatusBar
            status={status}
            identity={identity}
            stats={stats}
            activeChannel={activeChannel}
            onLogout={logout}
            onAccountSwitch={() => setShowAccountMenu(true)}
          />
        </div>
        <div className="channel-list">
          <ChannelList
            activeChannel={activeChannel}
            setActiveChannel={setActiveChannel}
            peers={peers}
          />
        </div>
        <div className="feed-shell">
          <MessageFeed
            messages={messages}
            activeChannel={activeChannel}
            follows={follows}
          />
          <CommandInput onSubmit={publish} />
        </div>
        <div className="swarm-panel">
          <SwarmPanel swarmEvents={swarmEvents} stats={stats} seeding={seeding} />
        </div>
      </div>
      {showAccountMenu ? (
        <AccountMenu
          authMode={authMode}
          extensionAvailable={extensionAvailable}
          authError={authError}
          isConnecting={status === 'initializing'}
          onClose={() => setShowAccountMenu(false)}
          onRefreshExtension={refreshExtensionAvailability}
          onConnectExtension={connectWithExtension}
          onConnectNsec={connectWithNsec}
        />
      ) : null}
    </>
  )
}
