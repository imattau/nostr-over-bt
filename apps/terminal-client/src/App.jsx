import { useEffect, useMemo, useState } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { useNostrBT } from './hooks/useNostrBT.js'
import StatusBar from './components/StatusBar.jsx'
import ChannelList from './components/ChannelList.jsx'
import MessageFeed from './components/MessageFeed.jsx'
import CommandInput from './components/CommandInput.jsx'
import SwarmPanel from './components/SwarmPanel.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import AccountMenu from './components/AccountMenu.jsx'
import PostContextMenu from './components/PostContextMenu.jsx'
import MobileNav from './components/MobileNav.jsx'
import { useSwipe } from './hooks/useSwipe.js'

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
    width: 100%;
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
    grid-template-columns: 1fr;
    grid-template-areas:
      'status'
      'main';
    height: var(--app-height, 100vh);
    overflow: hidden;
  }

  .status-bar {
    grid-area: status;
  }

  .main-stage {
    grid-area: main;
    min-height: 0;
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 280px;
    grid-template-areas: 'channels feed swarm';
    overflow: hidden;
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
    grid-template-rows: minmax(0, 1fr) var(--composer-height, 36px);
    overflow: hidden;
  }

  .swarm-panel {
    grid-area: swarm;
    min-width: 280px;
    border-left: 1px solid var(--border);
    overflow: hidden;
  }

  .mobile-nav-bar {
    grid-area: mobile-nav;
    display: none;
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .main-stage {
      grid-template-columns: 120px minmax(0, 1fr) 220px;
    }
  }

  @media (min-width: 600px) and (max-width: 767px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-areas:
        'status'
        'main';
    }

    .main-stage {
      grid-template-columns: 120px minmax(0, 1fr);
      grid-template-areas: 'channels feed';
    }

    .swarm-panel {
      display: none;
    }

    .swarm-panel.overlay.visible {
      display: flex;
      position: fixed;
      top: 28px;
      right: 0;
      width: 280px;
      height: calc(100vh - 28px);
      z-index: 20;
      background: var(--bg);
    }

    .mobile-nav-bar {
      display: none;
    }
  }

  @media (max-width: 599px) {
    .app {
      grid-template-rows: 28px minmax(0, 1fr) 40px;
      grid-template-areas:
        'status'
        'main'
        'mobile-nav';
    }

    .main-stage {
      display: flex;
      width: 300%;
      transform: translateX(calc(var(--pane-index, 0) * -33.333333%));
      transition: transform 180ms ease;
    }

    .channel-list,
    .feed-shell,
    .swarm-panel {
      flex: 0 0 33.333333%;
      width: 33.333333%;
      min-width: 0;
      border: none;
    }

    .channel-list {
      border-right: 1px solid var(--border);
    }

    .feed-shell {
      grid-template-rows: minmax(0, 1fr) var(--composer-height, 36px);
    }

    .feed {
      padding-bottom: 40px;
    }

    .mobile-nav-bar {
      display: block;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
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
  const [postMenu, setPostMenu] = useState(null)
  const [focusedMessageId, setFocusedMessageId] = useState(null)
  const [composerHeight, setComposerHeight] = useState(36)
  const [activePane, setActivePane] = useState('feed')
  const [showSwarm, setShowSwarm] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))

  useEffect(() => {
    const setViewportHeight = () => {
      const height = Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight)
      document.documentElement.style.setProperty('--app-height', `${height}px`)
    }

    setViewportHeight()
    window.addEventListener('resize', setViewportHeight)
    window.addEventListener('orientationchange', setViewportHeight)
    window.visualViewport?.addEventListener('resize', setViewportHeight)

    return () => {
      window.removeEventListener('resize', setViewportHeight)
      window.removeEventListener('orientationchange', setViewportHeight)
      window.visualViewport?.removeEventListener('resize', setViewportHeight)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen?.()
    } catch {
      // ignore fullscreen failures
    }
  }

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
    composerExpanded,
    replyTarget,
    setReplyTarget,
    blockedPubkeys,
    toggleBlockedPubkey,
    reportMessage,
    publishWarnings,
    follows,
    seeding,
    publish,
    resolveNostrReference,
    addSystemMessage,
    connectWithNsec,
    connectWithExtension,
    logout
  } = useNostrBT({
    onToggleFullscreen: toggleFullscreen
  })

  const PHONE_PANES = ['channels', 'feed', 'swarm']

  const { onTouchStart, onTouchEnd } = useSwipe({
    onSwipeLeft: () => {
      const index = PHONE_PANES.indexOf(activePane)
      setActivePane(PHONE_PANES[(index + 1) % PHONE_PANES.length])
    },
    onSwipeRight: () => {
      const index = PHONE_PANES.indexOf(activePane)
      setActivePane(PHONE_PANES[(index + PHONE_PANES.length - 1) % PHONE_PANES.length])
    }
  })

  const paneIndex = { channels: 0, feed: 1, swarm: 2 }[activePane] ?? 1

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (status === 'online' && identity) {
      setShowAccountMenu(false)
    }
  }, [identity, status])

  useEffect(() => {
    setPostMenu(null)
  }, [activeChannel, identity])

  useEffect(() => {
    setFocusedMessageId(null)
    setReplyTarget(null)
  }, [activeChannel, identity, setReplyTarget])

  useEffect(() => {
    setActivePane('feed')
    setShowSwarm(false)
  }, [identity])

  const closePostMenu = () => setPostMenu(null)

  const copyText = async (text) => {
    if (!text) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }

      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    } catch {
      // ignore clipboard failures
    }
  }

  const openPostMenu = (message, event) => {
    if (!message || message.source === 'system') return
    event.preventDefault()

    const menuWidth = 248
    const menuHeight = 256
    const pad = 8
    const x = Math.max(pad, Math.min(event.clientX, window.innerWidth - menuWidth - pad))
    const y = Math.max(pad, Math.min(event.clientY, window.innerHeight - menuHeight - pad))

    setPostMenu({ message, x, y })
  }

  const activeMenuMessage = postMenu?.message || null
  const activeMenuBlocked = Boolean(activeMenuMessage?.pubkey && blockedPubkeys.has(activeMenuMessage.pubkey))
  const focusedMessage = focusedMessageId ? messages.find(message => message.id === focusedMessageId) || null : null
  const followEntries = useMemo(() => {
    const byPubkey = new Map()

    for (const message of messages) {
      if (!message?.pubkey || message.source === 'system') continue
      if (!byPubkey.has(message.pubkey)) {
        byPubkey.set(message.pubkey, message)
      }
    }

    return Array.from(follows)
      .filter(pubkey => pubkey && pubkey !== identity?.nostrPubkey)
      .sort((a, b) => a.localeCompare(b))
      .map(pubkey => {
        const latest = byPubkey.get(pubkey)
        const candidate = latest?.author || ''
        const label = candidate && !candidate.startsWith('npub1') && !candidate.startsWith('note1')
          ? candidate
          : (() => {
          try {
            return nip19.npubEncode(pubkey).slice(0, 12)
          } catch {
            return pubkey.slice(0, 12)
          }
          })()

        return {
          pubkey,
          label
        }
      })
  }, [follows, identity?.nostrPubkey, messages])

  const handleFocusMessage = (message) => {
    if (!message || message.source === 'system') return
    setFocusedMessageId(message.id)
    setReplyTarget(message)
  }

  const handleOpenFollow = (pubkey) => {
    if (!pubkey) return
    setActiveChannel('follows')
    setFocusedMessageId(null)
    setReplyTarget(null)

    const latestMessage = [...messages]
      .reverse()
      .find(message => message?.pubkey === pubkey && message.source !== 'system')

    if (latestMessage) {
      handleFocusMessage(latestMessage)
    }
  }

  const handleResolveNostrLink = async (raw) => {
    const input = raw?.trim()
    if (!input) return false

    const normalized = input.toLowerCase().startsWith('nostr:') ? input.slice(6) : input
    const cachedMatch = messages.find(message => {
      if (!message?.id || message.source === 'system') return false
      return normalized.startsWith('note1') || normalized.startsWith('nevent1')
        ? message.id === normalized
        : false
    })

    if (cachedMatch) {
      handleFocusMessage(cachedMatch)
      return true
    }

    const fetched = await resolveNostrReference(normalized)
    if (fetched) {
      handleFocusMessage(fetched)
      return true
    }

    addSystemMessage(`Could not resolve ${input} from relays.`)
    return false
  }

  const clearFocusedThread = () => {
    setFocusedMessageId(null)
    setReplyTarget(null)
  }

  const handleReply = () => {
    if (!activeMenuMessage) return
    setReplyTarget(activeMenuMessage)
    closePostMenu()
  }

  const handleToggleBlock = () => {
    if (!activeMenuMessage?.pubkey) return
    toggleBlockedPubkey(activeMenuMessage.pubkey)
    if (focusedMessage?.pubkey && focusedMessage.pubkey === activeMenuMessage.pubkey) {
      clearFocusedThread()
    }
    closePostMenu()
  }

  const handleReport = async () => {
    if (!activeMenuMessage) return
    await reportMessage(activeMenuMessage)
    closePostMenu()
  }

  const handleCopyPubkey = async () => {
    if (!activeMenuMessage?.pubkey) return
    await copyText(activeMenuMessage.pubkey)
    closePostMenu()
  }

  const handleCopyEventId = async () => {
    if (!activeMenuMessage?.id) return
    await copyText(activeMenuMessage.id)
    closePostMenu()
  }

  const handleOpenNjump = () => {
    if (!activeMenuMessage?.id) return
    window.open(`https://njump.me/${activeMenuMessage.id}`, '_blank', 'noopener,noreferrer')
    closePostMenu()
  }

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

  if (!identity && !showAccountMenu) {
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
            showSwarmToggle={showSwarm}
            onToggleSwarm={() => setShowSwarm(value => !value)}
            onToggleFullscreen={toggleFullscreen}
            fullscreenActive={isFullscreen}
          />
        </div>
        <div
          className="main-stage"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ '--pane-index': paneIndex }}
        >
          <div className="channel-list">
          <ChannelList
            activeChannel={activeChannel}
            setActiveChannel={setActiveChannel}
            peers={peers}
            follows={followEntries}
            onOpenFollow={handleOpenFollow}
          />
          </div>
          <div
            className="feed-shell"
            style={{ '--composer-height': `${composerHeight}px` }}
          >
              <MessageFeed
                messages={messages}
                activeChannel={activeChannel}
                follows={follows}
                blockedPubkeys={blockedPubkeys}
                selfPubkey={identity?.nostrPubkey}
                onContextMenu={openPostMenu}
                focusedMessageId={focusedMessageId}
                onResolveNostrLink={handleResolveNostrLink}
                onFocusMessage={handleFocusMessage}
                onClearFocusedThread={clearFocusedThread}
              />
            <CommandInput
              onSubmit={publish}
              expanded={composerExpanded}
              replyTarget={replyTarget}
              onClearReplyTarget={() => setReplyTarget(null)}
              onHeightChange={setComposerHeight}
              publishWarnings={publishWarnings}
            />
          </div>
          <div className={`swarm-panel overlay ${showSwarm ? 'visible' : ''}`}>
            <SwarmPanel swarmEvents={swarmEvents} stats={stats} seeding={seeding} />
          </div>
        </div>
        <div className="mobile-nav-bar">
          <MobileNav activePane={activePane} onSelect={setActivePane} />
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
      {postMenu ? (
        <PostContextMenu
          message={activeMenuMessage}
          x={postMenu.x}
          y={postMenu.y}
          isBlocked={activeMenuBlocked}
          onClose={closePostMenu}
          onReply={handleReply}
          onToggleBlock={handleToggleBlock}
          onReport={handleReport}
          onCopyPubkey={handleCopyPubkey}
          onCopyEventId={handleCopyEventId}
          onOpenNjump={handleOpenNjump}
        />
      ) : null}
    </>
  )
}
