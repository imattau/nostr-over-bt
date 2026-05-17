import { useState, useEffect, useCallback, useRef } from 'react'
import {
  TransportManager,
  IdentityManager,
  HybridTransport,
  NostrTransport,
  BitTorrentTransport,
  ProfileManager,
  WoTManager,
  FeedManager
} from 'nostr-over-bt'
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'

const AUTH_MODE_KEY = 'terminal_auth_mode'
const NOSTR_SECRET_KEY = 'terminal_nostr_nsec'
const TRANSPORT_SECRET_KEY = 'terminal_transport_nsec'
const PROFILE_CACHE_KEY = 'terminal_profile_cache_v1'
const FOLLOW_CACHE_PREFIX = 'terminal_follow_cache_v1'

function uniquePush(values, nextValue) {
  if (!nextValue) return values
  return values.includes(nextValue) ? values : [...values, nextValue]
}

function normalizePubkey(pubkey) {
  if (!pubkey) return null
  try {
    return nip19.npubEncode(pubkey)
  } catch {
    return pubkey
  }
}

function profileDisplayName(profile, fallback) {
  if (!profile) return fallback
  return profile.display_name || profile.name || fallback
}

function parseMagnetInfoHash(magnetUri) {
  if (!magnetUri) return null
  const match = magnetUri.match(/[?&]xt=urn:btih:([^&]+)/i)
  return match ? match[1] : null
}

function isExtensionAvailable() {
  return Boolean(window.nostr?.getPublicKey && window.nostr?.signEvent)
}

function decodeSecretInput(value) {
  const input = value.trim()
  if (!input) return null

  if (input.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(input)
      return typeof decoded.data === 'string' ? decoded.data : null
    } catch {
      return null
    }
  }

  if (/^[0-9a-fA-F]{64}$/.test(input)) {
    return input
  }

  return null
}

function followStorageKey(nostrPubkey) {
  return nostrPubkey ? `${FOLLOW_CACHE_PREFIX}:${nostrPubkey}` : FOLLOW_CACHE_PREFIX
}

function loadPersistedFollows(nostrPubkey) {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(followStorageKey(nostrPubkey))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function savePersistedFollows(nostrPubkey, follows) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(followStorageKey(nostrPubkey), JSON.stringify(Array.from(follows)))
  } catch {
    // ignore persistence failures
  }
}

export function useNostrBT() {
  const [status, setStatus] = useState('initializing')
  const [messages, setMessages] = useState([])
  const [peers, setPeers] = useState([])
  const [stats, setStats] = useState({
    dhtNodes: 0,
    uploadSpeed: 0,
    downloadSpeed: 0,
    peerCount: 0
  })
  const [swarmEvents, setSwarmEvents] = useState([])
  const [identity, setIdentity] = useState(null)
  const [activeChannel, setActiveChannel] = useState('global')
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [follows, setFollows] = useState(new Set())
  const [seeding, setSeeding] = useState([])
  const [authMode, setAuthMode] = useState(() => localStorage.getItem(AUTH_MODE_KEY))
  const [authError, setAuthError] = useState('')
  const [extensionAvailable, setExtensionAvailable] = useState(false)

  const managerRef = useRef(null)
  const hybridRef = useRef(null)
  const subscriptionRef = useRef(null)
  const intervalRef = useRef(null)
  const signEventRef = useRef(async () => {
    throw new Error('Not authenticated')
  })
  const isMounted = useRef(false)
  const extensionPollRef = useRef(null)

  const logSwarmEvent = useCallback((msg, type = 'info') => {
    if (!isMounted.current) return
    const time = new Date().toTimeString().slice(0, 8)
    setSwarmEvents(prev => [...prev, { time, msg, type }].slice(-100))
  }, [])

  const addSeeding = useCallback((value) => {
    if (!value) return
    setSeeding(prev => uniquePush(prev, value))
  }, [])

  const resetSessionState = useCallback(() => {
    setMessages([])
    setPeers([])
    setStats({
      dhtNodes: 0,
      uploadSpeed: 0,
      downloadSpeed: 0,
      peerCount: 0
    })
    setSwarmEvents([])
    setIdentity(null)
    setComposerExpanded(false)
    setFollows(new Set())
    setSeeding([])
    setStatus('locked')
  }, [])

  const teardownSession = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (subscriptionRef.current?.close) {
      subscriptionRef.current.close()
    }
    subscriptionRef.current = null

    if (hybridRef.current) {
      hybridRef.current.disconnect()
    }
    hybridRef.current = null

    managerRef.current = null
    signEventRef.current = async () => {
      throw new Error('Not authenticated')
    }
  }, [])

  const refreshExtensionAvailability = useCallback(() => {
    const available = isExtensionAvailable()
    setExtensionAvailable(available)
    return available
  }, [])

  const addOrUpdateMessage = useCallback((event, sourceHint, magnetUri = null, authorOverride = null) => {
    const fallbackAuthor = normalizePubkey(event.pubkey) || 'system'
    const hasBT = Boolean(event.tags?.some(tag => tag[0] === 'bt') || event.content?.startsWith('magnet:'))
    const source = sourceHint === 'hybrid'
      ? 'hybrid'
      : hasBT
        ? 'bt'
        : 'relay'

    setMessages(prev => {
      const nextMessage = {
        id: event.id,
        author: authorOverride || fallbackAuthor,
        pubkey: event.pubkey,
        content: event.content,
        source,
        ts: event.created_at,
        hasBT,
        magnetUri: magnetUri || event.tags?.find(tag => tag[0] === 'bt')?.[1] || null
      }

      const existingIndex = prev.findIndex(message => message.id === event.id)
      if (existingIndex !== -1) {
        const next = [...prev]
        const existing = next[existingIndex]
        next[existingIndex] = {
          ...existing,
          ...nextMessage,
          source: existing.source === 'hybrid' || sourceHint === 'hybrid'
            ? 'hybrid'
            : source
        }
        return next
      }

      return [...prev, nextMessage]
        .sort((a, b) => a.ts - b.ts)
        .slice(-500)
    })
  }, [])

  const refreshDisplayName = useCallback((pubkey, profile) => {
    if (!pubkey) return
    const fallbackAuthor = normalizePubkey(pubkey) || pubkey.slice(0, 8)
    const displayName = profileDisplayName(profile, fallbackAuthor)

    setMessages(prev => prev.map(message => {
      if (message.pubkey !== pubkey || message.source === 'system') return message
      return {
        ...message,
        author: displayName
      }
    }))
  }, [])

  useEffect(() => {
    if (!identity?.nostrPubkey) return
    savePersistedFollows(identity.nostrPubkey, follows)
  }, [follows, identity])

  const startSession = useCallback(async ({
    mode,
    nostrSecretHex = null,
    transportSecretHex = null
  }) => {
    if (!isMounted.current) return

    const switchingFromExistingSession = Boolean(identity)
    teardownSession()
    setAuthError('')
    setStatus('initializing')
    resetSessionState()
    setStatus('initializing')

    try {
      let resolvedNostrPubkey
      let signingSecretHex = nostrSecretHex
      let resolvedTransportSecretHex = transportSecretHex

      if (mode === 'nip07') {
        if (!isExtensionAvailable()) {
          throw new Error('No NIP-07 browser extension detected.')
        }

        resolvedNostrPubkey = await window.nostr.getPublicKey()

        if (!resolvedTransportSecretHex) {
          resolvedTransportSecretHex = localStorage.getItem(TRANSPORT_SECRET_KEY)
        }
        if (!resolvedTransportSecretHex) {
          resolvedTransportSecretHex = Buffer.from(generateSecretKey()).toString('hex')
        }

        localStorage.setItem(TRANSPORT_SECRET_KEY, resolvedTransportSecretHex)
        localStorage.setItem(AUTH_MODE_KEY, 'nip07')
        localStorage.removeItem(NOSTR_SECRET_KEY)

        signEventRef.current = async (template) => {
          if (!window.nostr?.signEvent) {
            throw new Error('No NIP-07 browser extension detected.')
          }
          return await window.nostr.signEvent(template)
        }
      } else if (mode === 'nsec') {
        if (!signingSecretHex) {
          throw new Error('Missing Nostr secret.')
        }

        resolvedNostrPubkey = getPublicKey(Buffer.from(signingSecretHex, 'hex'))
        resolvedTransportSecretHex = signingSecretHex
        localStorage.setItem(AUTH_MODE_KEY, 'nsec')
        localStorage.setItem(NOSTR_SECRET_KEY, signingSecretHex)
        localStorage.setItem(TRANSPORT_SECRET_KEY, resolvedTransportSecretHex)

        signEventRef.current = async (template) => finalizeEvent(template, Buffer.from(signingSecretHex, 'hex'))
      } else {
        throw new Error(`Unsupported auth mode: ${mode}`)
      }

      const identityManager = IdentityManager.fromNostrSecretKey(resolvedTransportSecretHex)
      identityManager.setNostrPubkey(resolvedNostrPubkey)
      const transportPubkey = identityManager.getPublicKey()

      if (!isMounted.current) return
      setIdentity({
        nostrPubkey: resolvedNostrPubkey,
        transportPubkey,
        pubkey: resolvedNostrPubkey,
        p2p: transportPubkey
      })
      setAuthMode(mode)

      const bt = new BitTorrentTransport({
        dht: false,
        announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz']
      })

      bt.client.on('peer', (addr) => {
        logSwarmEvent(`peer connected: ${addr}`, 'success')
      })

      bt.client.on('torrent', (torrent) => {
        const infoHash = torrent.infoHash || parseMagnetInfoHash(torrent.magnetURI)
        if (infoHash) addSeeding(infoHash)
        logSwarmEvent(`seeding ${infoHash ? infoHash.slice(0, 12) : torrent.name}`, 'info')
      })

      const nostr = new NostrTransport(['wss://relay.damus.io', 'wss://nos.lol'])
      const profileManager = new ProfileManager(nostr, {
        onProfile: refreshDisplayName,
        storageKey: PROFILE_CACHE_KEY
      })
      const hybrid = new HybridTransport(nostr, bt)
      hybridRef.current = hybrid

      const wot = new WoTManager(nostr)
      const feed = new FeedManager(bt, identityManager)
      managerRef.current = new TransportManager(hybrid, {
        wotManager: wot,
        feedManager: feed
      })

      const cachedFollows = loadPersistedFollows(resolvedNostrPubkey)
      for (const pk of cachedFollows) {
        wot.addFollow(pk, 1)
      }
      setFollows(new Set(cachedFollows))

      wot.refreshFollows(resolvedNostrPubkey)
        .then(() => {
          if (!isMounted.current) return
          const discovered = Array.from(wot.follows.keys()).filter(pk => pk !== resolvedNostrPubkey)
          setFollows(prev => new Set([...prev, ...discovered]))
        })
        .catch((err) => {
          logSwarmEvent(`wot refresh failed: ${err.message}`, 'warning')
        })

      const onEvent = (event) => {
        if (!isMounted.current) return

        if (managerRef.current) {
          Promise.resolve(managerRef.current.handleIncomingEvent(event))
            .then((magnetUri) => {
              if (!magnetUri || !isMounted.current) return
              addSeeding(parseMagnetInfoHash(magnetUri))
              logSwarmEvent(`seeding ${event.id.slice(0, 12)}`, 'success')
            })
            .catch((err) => {
              logSwarmEvent(`seed fail: ${err.message}`, 'error')
            })
        }

        addOrUpdateMessage(
          event,
          undefined,
          null,
          profileDisplayName(profileManager.cache.get(event.pubkey), normalizePubkey(event.pubkey) || 'system')
        )
        profileManager.fetchProfile(event.pubkey)
      }

      try {
        await hybrid.connect()
        if (!isMounted.current) return
        setStatus('online')
        logSwarmEvent('hybrid transport online', 'success')
        subscriptionRef.current = nostr.subscribe({ kinds: [1], limit: 50 }, onEvent)
      } catch (err) {
        if (!isMounted.current) return
        setStatus('error')
        logSwarmEvent(`connect failed: ${err.message}`, 'error')
        throw err
      }

      intervalRef.current = setInterval(() => {
        if (!isMounted.current) return

        const dht = bt.getDHT()
        const peerCount = bt.client.torrents.reduce((acc, torrent) => acc + (torrent.numPeers || 0), 0)
        const uploadSpeed = Math.round((bt.client.uploadSpeed || 0) / 1024)
        const downloadSpeed = Math.round((bt.client.downloadSpeed || 0) / 1024)
        const dhtNodes = dht?.nodes?.length || 0

        setStats({
          dhtNodes,
          uploadSpeed,
          downloadSpeed,
          peerCount
        })
      }, 2000)

      return true
    } catch (err) {
      if (!isMounted.current) return false
      setAuthError(err.message)
      if (!switchingFromExistingSession) {
        setAuthMode(null)
      }
      setStatus('locked')
      teardownSession()
      return false
    }
  }, [
    addOrUpdateMessage,
    addSeeding,
    logSwarmEvent,
    refreshDisplayName,
    resetSessionState,
    teardownSession
  ])

  const connectWithNsec = useCallback(async (input) => {
    const secretHex = decodeSecretInput(input)
    if (!secretHex) {
      setAuthError('Enter a valid `nsec1...` or 64-character hex secret.')
      return false
    }

    return await startSession({
      mode: 'nsec',
      nostrSecretHex: secretHex,
      transportSecretHex: secretHex
    })
  }, [startSession])

  const connectWithExtension = useCallback(async () => {
    if (!isExtensionAvailable()) {
      setAuthError('No NIP-07 browser extension detected.')
      return false
    }

    return await startSession({ mode: 'nip07' })
  }, [startSession])

  const logout = useCallback(() => {
    teardownSession()
    localStorage.removeItem(AUTH_MODE_KEY)
    localStorage.removeItem(NOSTR_SECRET_KEY)
    localStorage.removeItem(TRANSPORT_SECRET_KEY)
    setAuthMode(null)
    setAuthError('')
    resetSessionState()
  }, [resetSessionState, teardownSession])

  useEffect(() => {
    isMounted.current = true
    refreshExtensionAvailability()
    extensionPollRef.current = setInterval(() => {
      if (!isMounted.current) return
      refreshExtensionAvailability()
    }, 1000)

    const savedMode = localStorage.getItem(AUTH_MODE_KEY)
    const savedSecret = localStorage.getItem(NOSTR_SECRET_KEY)
    const savedTransportSecret = localStorage.getItem(TRANSPORT_SECRET_KEY)

    const restore = async () => {
      if (savedMode === 'nsec' && savedSecret) {
        await startSession({
          mode: 'nsec',
          nostrSecretHex: savedSecret,
          transportSecretHex: savedTransportSecret || savedSecret
        })
        return
      }

      if (savedMode === 'nip07') {
        if (isExtensionAvailable()) {
          await startSession({
            mode: 'nip07',
            transportSecretHex: savedTransportSecret || null
          })
          return
        }

        setAuthError('NIP-07 extension not found. Use an nsec key instead.')
      }

      setStatus('locked')
    }

    restore()

    return () => {
      isMounted.current = false
      if (extensionPollRef.current) {
        clearInterval(extensionPollRef.current)
        extensionPollRef.current = null
      }
      teardownSession()
    }
  }, [refreshExtensionAvailability, startSession, teardownSession])

  const addSystemMessage = useCallback((content) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      author: 'system',
      pubkey: null,
      content,
      source: 'system',
      ts: Math.floor(Date.now() / 1000),
      hasBT: false,
      magnetUri: null
    }])
  }, [])

  const publish = useCallback(async (input, files = []) => {
    if (!managerRef.current) return
    if (status !== 'online') {
      setAuthError('Connect with an nsec key or browser extension first.')
      return
    }

    const trimmed = input.trim()
    const mediaFiles = []
    for (const file of files) {
      if (!file?.arrayBuffer || !file?.name) continue
      const buffer = await file.arrayBuffer()
      mediaFiles.push({ buffer: Buffer.from(buffer), filename: file.name })
    }

    if (!trimmed && mediaFiles.length === 0) return

    if (trimmed.startsWith('/')) {
      if (mediaFiles.length > 0) {
        setAuthError('Media attachments are only supported with regular messages.')
        return
      }

      const [cmd, ...args] = trimmed.split(' ')
      const arg = args.join(' ').trim()

      if (cmd === '/help') {
        addSystemMessage('/follow <npub>\n/relay <add|list>\n/peers\n/clear\n/expand\n/shrink\n/help')
        return
      }

      if (cmd === '/clear') {
        setMessages([])
        return
      }

      if (cmd === '/expand') {
        setComposerExpanded(true)
        addSystemMessage('Composer expanded. Use Shift+Enter for a newline.')
        return
      }

      if (cmd === '/shrink') {
        setComposerExpanded(false)
        addSystemMessage('Composer collapsed.')
        return
      }

      if (cmd === '/peers') {
        addSystemMessage(`Connected peers: ${peers.length > 0 ? peers.join(', ') : 'none'}`)
        return
      }

      if (cmd === '/relay') {
        if (args[0] === 'list') {
          const relays = managerRef.current.transport?.nostr?.relays || ['wss://relay.damus.io', 'wss://nos.lol']
          addSystemMessage(`Relays: ${relays.join(', ')}`)
          return
        }

        if (args[0] === 'add' && arg) {
          managerRef.current.transport?.nostr?.addRelay(arg)
          addSystemMessage(`Relay added: ${arg}`)
          logSwarmEvent(`relay added: ${arg}`, 'success')
          return
        }

        addSystemMessage('Usage: /relay list | /relay add <url>')
        return
      }

      if (cmd === '/follow') {
        logSwarmEvent(`following: ${arg.slice(0, 12)}...`)
        try {
          let targetPk = arg

          if (arg.startsWith('npub1')) {
            const decoded = nip19.decode(arg)
            targetPk = decoded.data
          }

          managerRef.current.wotManager.addFollow(targetPk, 1)
          setFollows(prev => {
            const next = new Set(prev)
            next.add(targetPk)
            if (identity?.nostrPubkey) {
              savePersistedFollows(identity.nostrPubkey, next)
            }
            return next
          })

          const contacts = Array.from(managerRef.current.wotManager.follows.keys())
          const contactEvent = await signEventRef.current({
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            content: '',
            tags: contacts.map(pk => ['p', pk])
          })

          await managerRef.current.publish(contactEvent)

          const tpk = await managerRef.current.resolveTransportKey(targetPk)
          if (tpk) {
            setPeers(prev => uniquePush(prev, tpk))
            logSwarmEvent(`resolved p2p: ${tpk.slice(0, 12)}...`, 'success')
            await managerRef.current.bootstrapWoTP2P(tpk, targetPk)
            logSwarmEvent('p2p graph expanded', 'success')
          } else {
            logSwarmEvent(`no p2p addr for ${targetPk.slice(0, 8)}`, 'warning')
          }
        } catch (err) {
          logSwarmEvent(`follow failed: ${err.message}`, 'error')
        }
        return
      }

      addSystemMessage(`Unknown command: ${cmd}. Type /help for commands.`)
      return
    }

    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: trimmed,
      tags: []
    }
    const signedEvent = await signEventRef.current(eventTemplate)

    setMessages(prev => [...prev, {
      id: signedEvent.id,
      author: normalizePubkey(signedEvent.pubkey) || 'me',
      pubkey: signedEvent.pubkey,
      content: trimmed,
      source: 'hybrid',
      ts: signedEvent.created_at,
      hasBT: true,
      files: files.map(file => file.name),
      magnetUri: null
    }]
      .sort((a, b) => a.ts - b.ts)
      .slice(-500))

    try {
      const result = await managerRef.current.publish(signedEvent, mediaFiles)
      if (result?.magnetUri) {
        addSeeding(parseMagnetInfoHash(result.magnetUri))
        logSwarmEvent(`published ${signedEvent.id.slice(0, 12)}`, 'success')
      }
    } catch (err) {
      logSwarmEvent(`publish failed: ${err.message}`, 'error')
    }
  }, [addSeeding, identity, logSwarmEvent, peers, status])

  return {
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
    follows,
    seeding,
    publish,
    connectWithNsec,
    connectWithExtension,
    logout
  }
}
