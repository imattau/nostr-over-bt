# Terminal Client Mobile & Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add responsive layout (phone/tablet/desktop), swipe navigation, long-press context menu, and image/video attachment with thumbnail preview to `apps/terminal-client`.

**Architecture:** CSS media queries drive all layout changes — four breakpoints, no JS viewport detection. A new `useSwipe` hook handles touch gesture detection. Long press reuses the existing `openPostMenu` via touch timers on a new `MessageRow` component. `CommandInput` gains a `[+]` button with a hidden file input and object-URL thumbnails for images.

**Tech Stack:** React 18, plain CSS (existing), `URL.createObjectURL`, `navigator.vibrate`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/terminal-client/src/hooks/useSwipe.js` | Create | Detects horizontal touch swipes, fires left/right callbacks |
| `apps/terminal-client/src/components/MobileNav.jsx` | Create | 40px bottom nav bar for phone — feed / swarm / channels |
| `apps/terminal-client/src/App.jsx` | Modify | Responsive CSS breakpoints, phone pane state, swarm overlay for tablet |
| `apps/terminal-client/src/components/StatusBar.jsx` | Modify | Swarm toggle button (tablet portrait only) |
| `apps/terminal-client/src/components/MessageFeed.jsx` | Modify | Extract `MessageRow`, add `useLongPress` for touch context menu |
| `apps/terminal-client/src/components/CommandInput.jsx` | Modify | `[+]` button, hidden file input, image thumbnail chips |

---

## Task 1: `useSwipe` hook

**Files:**
- Create: `apps/terminal-client/src/hooks/useSwipe.js`

- [ ] **Step 1: Create `useSwipe.js`**

```js
import { useRef } from 'react'

export function useSwipe({ onSwipeLeft, onSwipeRight }) {
  const startRef = useRef(null)

  const onTouchStart = (e) => {
    const t = e.changedTouches?.[0]
    if (!t) return
    startRef.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e) => {
    if (!startRef.current) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - startRef.current.x
    const dy = t.clientY - startRef.current.y
    startRef.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > 40) return
    if (dx < 0) onSwipeLeft?.()
    else onSwipeRight?.()
  }

  return { onTouchStart, onTouchEnd }
}
```

- [ ] **Step 2: Verify the file exists**

```bash
ls apps/terminal-client/src/hooks/
```

Expected: `useNostrBT.js  useSwipe.js`

- [ ] **Step 3: Commit**

```bash
git -C apps/terminal-client add src/hooks/useSwipe.js
git -C apps/terminal-client commit -m "feat: add useSwipe touch gesture hook"
```

---

## Task 2: `MobileNav` component

**Files:**
- Create: `apps/terminal-client/src/components/MobileNav.jsx`

- [ ] **Step 1: Create `MobileNav.jsx`**

```jsx
const PANES = ['feed', 'swarm', 'channels']

const LABELS = { feed: '# feed', swarm: '◈ swarm', channels: '≡ channels' }

const CSS = `
  .mobile-nav {
    display: flex;
    background: var(--bg2);
    border-top: 1px solid var(--border);
    height: 40px;
  }
  .mobile-nav-btn {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-family: var(--font);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }
  .mobile-nav-btn.active {
    color: var(--green);
  }
  .mobile-nav-btn:hover:not(.active) {
    color: var(--text);
  }
`

export default function MobileNav({ activePane, onSelect }) {
  return (
    <>
      <style>{CSS}</style>
      <nav className="mobile-nav">
        {PANES.map(pane => (
          <button
            key={pane}
            type="button"
            className={`mobile-nav-btn ${activePane === pane ? 'active' : ''}`}
            onClick={() => onSelect(pane)}
          >
            {LABELS[pane]}
          </button>
        ))}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git -C apps/terminal-client add src/components/MobileNav.jsx
git -C apps/terminal-client commit -m "feat: add MobileNav phone bottom tab bar"
```

---

## Task 3: `App.jsx` — responsive layout + pane switching

**Files:**
- Modify: `apps/terminal-client/src/App.jsx`

This task adds:
1. Four CSS breakpoints in the `CSS` string
2. `activePane` state for phone single-pane view
3. `showSwarm` state for tablet portrait overlay
4. `useSwipe` applied to the pane wrapper
5. `MobileNav` rendered inside `.app`

- [ ] **Step 1: Add imports at the top of `App.jsx`**

After the existing imports add:

```js
import { useSwipe } from './hooks/useSwipe.js'
import MobileNav from './components/MobileNav.jsx'
```

- [ ] **Step 2: Replace the CSS string — add responsive rules**

Append the following to the end of the `CSS` constant (inside the backtick template, before the closing backtick):

```css

  /* tablet landscape: tighter columns */
  @media (min-width: 768px) and (max-width: 1023px) {
    .app {
      grid-template-columns: 120px minmax(0, 1fr) 220px;
    }
  }

  /* tablet portrait: 2-column, swarm hidden */
  @media (min-width: 600px) and (max-width: 767px) {
    .app {
      grid-template-columns: 120px minmax(0, 1fr);
      grid-template-areas:
        'status status'
        'channels feed';
    }
    .swarm-panel {
      display: none;
    }
    .swarm-overlay {
      position: fixed;
      top: 28px;
      right: 0;
      width: 280px;
      height: calc(100% - 28px);
      z-index: 10;
      border-left: 1px solid var(--border);
      background: var(--bg);
    }
  }

  /* phone: single pane with bottom nav */
  @media (max-width: 599px) {
    .app {
      grid-template-rows: 28px minmax(0, 1fr) 40px;
      grid-template-columns: 1fr;
      grid-template-areas:
        'status'
        'active-pane'
        'mobile-nav';
    }
    .channel-list,
    .feed-shell,
    .swarm-panel {
      grid-area: active-pane;
      border: none;
      min-width: 0;
    }
    .mobile-nav-bar {
      grid-area: mobile-nav;
    }
    .feed {
      padding-bottom: 0;
    }
  }
```

- [ ] **Step 3: Add `activePane` and `showSwarm` state inside `App()`**

After the existing `useState` declarations (after `const [composerHeight, setComposerHeight] = useState(36)`), add:

```js
const [activePane, setActivePane] = useState('feed')
const [showSwarm, setShowSwarm] = useState(false)
```

- [ ] **Step 4: Add swipe handlers inside `App()`**

After the state declarations, add:

```js
const PANES = ['feed', 'swarm', 'channels']

const { onTouchStart, onTouchEnd } = useSwipe({
  onSwipeLeft: () => {
    const idx = PANES.indexOf(activePane)
    if (idx < PANES.length - 1) setActivePane(PANES[idx + 1])
  },
  onSwipeRight: () => {
    const idx = PANES.indexOf(activePane)
    if (idx > 0) setActivePane(PANES[idx - 1])
  }
})
```

- [ ] **Step 5: Add pane visibility helpers inside `App()`**

```js
const paneStyle = (paneName) => ({
  display: activePane === paneName ? undefined : 'none'
})
```

This will be applied only on phone via CSS; on larger screens all panes are visible. We apply inline `display:none` only when `activePane !== paneName`, but we need it to be a no-op on desktop. Use a CSS custom property approach — add the style but let the media query override. Actually, the safest approach is to conditionally apply based on a window width check... but that breaks SSR and requires a listener. Instead, we'll use a CSS class.

Replace the `paneStyle` helper with a class-based approach. Add these CSS rules to the `CSS` string (inside the `@media (max-width: 599px)` block, after the existing rules):

```css
    .pane-hidden { display: none !important; }
```

Then replace the `paneStyle` helper with:

```js
const paneHidden = (paneName) => activePane !== paneName ? 'pane-hidden' : ''
```

And wrap with a state check so it only applies on phone:

```js
const [isPhone, setIsPhone] = useState(() => window.innerWidth < 600)

useEffect(() => {
  const mq = window.matchMedia('(max-width: 599px)')
  const handler = (e) => setIsPhone(e.matches)
  mq.addEventListener('change', handler)
  setIsPhone(mq.matches)
  return () => mq.removeEventListener('change', handler)
}, [])

const paneClass = (paneName) => isPhone && activePane !== paneName ? 'pane-hidden' : ''
```

- [ ] **Step 6: Update the JSX return — add touch handlers, pane classes, MobileNav, swarm overlay**

Find the `<div className="app">` block and update it. The full updated JSX (replacing from `<div className="app">` to `</div>` of the app div) is:

```jsx
<div
  className="app"
  onTouchStart={onTouchStart}
  onTouchEnd={onTouchEnd}
>
  <div className="status-bar">
    <StatusBar
      status={status}
      identity={identity}
      stats={stats}
      activeChannel={activeChannel}
      onLogout={logout}
      onAccountSwitch={() => setShowAccountMenu(true)}
      showSwarmToggle={showSwarm}
      onToggleSwarm={() => setShowSwarm(s => !s)}
    />
  </div>
  <div className={`channel-list ${paneClass('channels')}`}>
    <ChannelList
      activeChannel={activeChannel}
      setActiveChannel={setActiveChannel}
      peers={peers}
    />
  </div>
  <div
    className={`feed-shell ${paneClass('feed')}`}
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
  <div className={`swarm-panel ${paneClass('swarm')}`}>
    <SwarmPanel swarmEvents={swarmEvents} stats={stats} seeding={seeding} />
  </div>
  {showSwarm ? (
    <div className="swarm-overlay">
      <SwarmPanel swarmEvents={swarmEvents} stats={stats} seeding={seeding} />
    </div>
  ) : null}
  <div className="mobile-nav-bar">
    <MobileNav activePane={activePane} onSelect={setActivePane} />
  </div>
</div>
```

Note: `.mobile-nav-bar` is `display: none` on desktop/tablet by default. Add to the CSS string (outside media queries):

```css
  .mobile-nav-bar {
    display: none;
  }
  .swarm-overlay {
    display: none;
  }
```

And inside `@media (max-width: 599px)`:
```css
    .mobile-nav-bar { display: block; }
```

And inside `@media (min-width: 600px) and (max-width: 767px)`:
```css
    .swarm-overlay { display: block; }
```

- [ ] **Step 7: Start dev server and verify at desktop width**

```bash
cd apps/terminal-client && npm run dev
```

Open `http://localhost:5173` at full width. Confirm 3-column layout still works, no regressions.

- [ ] **Step 8: Verify responsive breakpoints in browser**

Use browser DevTools device emulation:
- Set to 900px wide → 3-column tighter (120px | 1fr | 220px)
- Set to 700px wide → 2-column (120px | 1fr), swarm hidden
- Set to 375px wide (iPhone) → single pane, MobileNav visible at bottom
- Tap MobileNav buttons → pane switches
- Swipe left/right → pane switches

- [ ] **Step 9: Commit**

```bash
git -C apps/terminal-client add src/App.jsx
git -C apps/terminal-client commit -m "feat: add responsive layout breakpoints and phone pane switching"
```

---

## Task 4: `StatusBar.jsx` — swarm toggle button

**Files:**
- Modify: `apps/terminal-client/src/components/StatusBar.jsx`

The swarm toggle button appears only on tablet portrait (600–767px). It's hidden via CSS on other sizes.

- [ ] **Step 1: Add CSS for the swarm toggle button**

In `StatusBar.jsx`, append to the `CSS` string:

```css
  .swarm-toggle {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    display: none;
  }
  .swarm-toggle.active {
    color: var(--blue);
    border-color: var(--blue);
  }
  .swarm-toggle:hover {
    color: var(--text);
    border-color: var(--blue);
  }
  @media (min-width: 600px) and (max-width: 767px) {
    .swarm-toggle { display: inline-block; }
  }
```

- [ ] **Step 2: Add `showSwarmToggle` and `onToggleSwarm` props to `StatusBar`**

Update the function signature:

```jsx
export default function StatusBar({ status, identity, stats, activeChannel, onLogout, onAccountSwitch, showSwarmToggle, onToggleSwarm }) {
```

- [ ] **Step 3: Add the toggle button to the JSX**

Inside the `.statusbar` div, after the `<span className="channel">` span, add:

```jsx
{onToggleSwarm ? (
  <button
    type="button"
    className={`swarm-toggle ${showSwarmToggle ? 'active' : ''}`}
    onClick={onToggleSwarm}
  >
    {showSwarmToggle ? 'hide swarm' : 'swarm'}
  </button>
) : null}
```

- [ ] **Step 4: Verify in browser at 700px width**

With DevTools at 700px: a `swarm` button appears in the status bar. Clicking it shows/hides the swarm overlay on the right side. Verify it's invisible at 375px and 1200px.

- [ ] **Step 5: Commit**

```bash
git -C apps/terminal-client add src/components/StatusBar.jsx
git -C apps/terminal-client commit -m "feat: add swarm toggle button to StatusBar for tablet portrait"
```

---

## Task 5: `MessageFeed.jsx` — long press context menu

**Files:**
- Modify: `apps/terminal-client/src/components/MessageFeed.jsx`

Long press (500ms, cancels on move >10px) calls `onContextMenu` with the touch coordinates. Applied to both flat feed rows and thread nodes. Uses a `useLongPress` hook defined at the top of the file, and a new `MessageRow` component extracted from the existing inline map.

- [ ] **Step 1: Add `useLongPress` hook at the top of `MessageFeed.jsx`**

After the imports, before `const CSS`, add:

```js
function useLongPress(callback, delay = 500, moveThreshold = 10) {
  const timerRef = useRef(null)
  const startRef = useRef(null)

  const onTouchStart = (e) => {
    const t = e.changedTouches?.[0]
    if (!t) return
    startRef.current = { x: t.clientX, y: t.clientY }
    timerRef.current = setTimeout(() => {
      navigator.vibrate?.(10)
      callback({ clientX: startRef.current?.x, clientY: startRef.current?.y })
    }, delay)
  }

  const onTouchMove = (e) => {
    if (!startRef.current) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = Math.abs(t.clientX - startRef.current.x)
    const dy = Math.abs(t.clientY - startRef.current.y)
    if (dx > moveThreshold || dy > moveThreshold) {
      clearTimeout(timerRef.current)
      startRef.current = null
    }
  }

  const onTouchEnd = () => {
    clearTimeout(timerRef.current)
    startRef.current = null
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}
```

- [ ] **Step 2: Create `MessageRow` component**

After `useLongPress`, before `function ThreadNode`, add a `MessageRow` component that wraps the existing inline row JSX and adds long press:

```jsx
function MessageRow({ message, onContextMenu, onFocusMessage }) {
  const longPress = useLongPress((coords) => {
    if (!onContextMenu || message.source === 'system') return
    onContextMenu(message, { ...coords, preventDefault: () => {} })
  })

  return (
    <div
      onClick={() => onFocusMessage?.(message)}
      onContextMenu={(e) => onContextMenu?.(message, e)}
      {...longPress}
    >
      <div className="msg-row">
        <span className="msg-time">{formatTime(message.ts)}</span>
        <span className={`msg-author ${message.source}`}>
          &lt;{message.author?.slice(0, 16)}&gt;
        </span>
        <span className={`msg-content ${message.source === 'system' ? 'system' : ''}`}>
          {renderLinkedContent(message.content)}
        </span>
        {message.source !== 'system' && (
          <span className={`msg-badge badge-${message.source}`}>
            [{message.source}]
          </span>
        )}
      </div>
      {message.magnetUri && (
        <div className="msg-magnet">
          └─ 📦{' '}
          <a
            href={message.magnetUri}
            className="msg-link"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {message.magnetUri}
          </a>
        </div>
      )}
      {message.files && message.files.length > 0 ? (
        <div className="msg-files">
          {message.files.map(file => (
            <span key={file} className="msg-file">└─ {file}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Update `ThreadNode` to use `useLongPress`**

Replace the existing `ThreadNode` component with:

```jsx
function ThreadNode({ message, depth, onFocusMessage, onContextMenu }) {
  const longPress = useLongPress((coords) => {
    if (!onContextMenu || message.source === 'system') return
    onContextMenu(message, { ...coords, preventDefault: () => {} })
  })

  return (
    <div className={`thread-node depth-${Math.min(depth, 5)}`}>
      <div
        className="msg-row"
        onClick={() => onFocusMessage?.(message)}
        onContextMenu={(e) => onContextMenu?.(message, e)}
        {...longPress}
      >
        <span className="msg-time">{formatTime(message.ts)}</span>
        <span className={`msg-author ${message.source}`}>
          &lt;{message.author?.slice(0, 16)}&gt;
        </span>
        <span className={`msg-content ${message.source === 'system' ? 'system' : ''}`}>
          {renderLinkedContent(message.content)}
        </span>
        {message.source !== 'system' && (
          <span className={`msg-badge badge-${message.source}`}>
            [{message.source}]
          </span>
        )}
      </div>
      {message.magnetUri && (
        <div className="msg-magnet">
          └─ 📦{' '}
          <a
            href={message.magnetUri}
            className="msg-link"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {message.magnetUri}
          </a>
        </div>
      )}
      {message.files && message.files.length > 0 ? (
        <div className="msg-files">
          {message.files.map(file => (
            <span key={file} className="msg-file">└─ {file}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Replace inline map rows with `<MessageRow>`**

In the `MessageFeed` component return, find the flat feed `.map()`:

```jsx
filtered.map(message => (
  <div
    key={message.id}
    onClick={() => onFocusMessage?.(message)}
    onContextMenu={(event) => onContextMenu?.(message, event)}
  >
    <div className="msg-row">
    ...
    </div>
    {/* magnet, files */}
  </div>
))
```

Replace with:

```jsx
filtered.map(message => (
  <MessageRow
    key={message.id}
    message={message}
    onContextMenu={onContextMenu}
    onFocusMessage={onFocusMessage}
  />
))
```

- [ ] **Step 5: Verify long press in mobile emulation**

In DevTools with iPhone emulation, touch-and-hold on any message for ~500ms. The `PostContextMenu` should appear at the touch coordinates. Verify that a short tap still focuses the message thread (no false positives).

- [ ] **Step 6: Commit**

```bash
git -C apps/terminal-client add src/components/MessageFeed.jsx
git -C apps/terminal-client commit -m "feat: add long press context menu to message rows"
```

---

## Task 6: `CommandInput.jsx` — file picker + image thumbnails

**Files:**
- Modify: `apps/terminal-client/src/components/CommandInput.jsx`

Adds a `[+]` button left of the `>` prompt. Clicking opens a hidden `<input type="file" accept="image/*,video/*" capture="environment" multiple>`. Image attachments show a 48×48 thumbnail via `URL.createObjectURL`. Object URLs are revoked on file removal and on submit.

**Important:** The existing `attachedFiles` state is `File[]` and `addFiles`/`removeFile`/`clearFiles` already exist. We extend this to track preview URLs alongside files using a `useRef` Map.

- [ ] **Step 1: Add CSS for `[+]` button and image thumbnail**

Append to the `CSS` string in `CommandInput.jsx`:

```css
  .cmd-attach-btn {
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-family: var(--font);
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    align-self: flex-start;
    padding-top: 8px;
    line-height: 1;
  }
  .cmd-attach-btn:hover {
    color: var(--green);
  }
  .cmd-thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid var(--border);
    display: block;
  }
```

- [ ] **Step 2: Add `fileInputRef` and `previewUrlsRef`**

Inside `CommandInput`, after the existing `useRef` declarations (`inputRef`, `wrapRef`, `dragDepthRef`), add:

```js
const fileInputRef = useRef(null)
const previewUrlsRef = useRef(new Map())
```

- [ ] **Step 3: Replace `addFiles`, `removeFile`, and `clearFiles` with URL-tracking versions**

Replace the three existing functions:

```js
const addFiles = (incomingFiles) => {
  const filtered = Array.from(incomingFiles).filter(
    f => f.type.startsWith('image/') || f.type.startsWith('video/')
  )
  setAttachedFiles(prev => {
    const combined = dedupeFiles([...prev, ...filtered]).slice(0, 3)
    for (const f of combined) {
      if (!previewUrlsRef.current.has(f) && f.type.startsWith('image/')) {
        previewUrlsRef.current.set(f, URL.createObjectURL(f))
      }
    }
    return combined
  })
}

const removeFile = (index) => {
  setAttachedFiles(prev => {
    const toRemove = prev[index]
    if (toRemove) {
      const url = previewUrlsRef.current.get(toRemove)
      if (url) {
        URL.revokeObjectURL(url)
        previewUrlsRef.current.delete(toRemove)
      }
    }
    return prev.filter((_, i) => i !== index)
  })
}

const clearFiles = () => {
  for (const url of previewUrlsRef.current.values()) {
    URL.revokeObjectURL(url)
  }
  previewUrlsRef.current.clear()
  setAttachedFiles([])
}
```

- [ ] **Step 4: Update chip rendering to show image thumbnails**

Find the `attachedFiles.map` in the JSX that renders `.cmd-chip` divs. Replace it:

```jsx
{attachedFiles.map((file, index) => {
  const previewUrl = previewUrlsRef.current.get(file)
  return (
    <div
      className="cmd-chip"
      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" className="cmd-thumb" />
      ) : null}
      <span title={file.name}>{file.name}</span>
      <button
        type="button"
        onClick={() => removeFile(index)}
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
    </div>
  )
})}
```

- [ ] **Step 5: Add the `[+]` button and hidden file input to JSX**

In the `CommandInput` return, find the outer `<div className="cmd-input-wrap">`. The current structure is:

```jsx
<div ref={wrapRef} className={...} onClick={...} onDragEnter={...} ...>
  {isDragging ? <div className="cmd-drop-cover">...</div> : null}
  <span className="cmd-prompt">{'>'}</span>
  <div className="cmd-input-stack">
```

Insert the `[+]` button and hidden file input between the drag cover and the prompt:

```jsx
{isDragging ? <div className="cmd-drop-cover">drop to attach</div> : null}
<button
  type="button"
  className="cmd-attach-btn"
  onClick={() => fileInputRef.current?.click()}
  aria-label="Attach file"
>
  [+]
</button>
<input
  ref={fileInputRef}
  type="file"
  accept="image/*,video/*"
  capture="environment"
  multiple
  style={{ display: 'none' }}
  onChange={(e) => {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }}
/>
<span className="cmd-prompt">{'>'}</span>
```

- [ ] **Step 6: Start dev server and verify**

```bash
cd apps/terminal-client && npm run dev
```

1. Click `[+]` → file picker opens (or camera on mobile)
2. Select an image → 48×48 thumbnail appears in the chip, filename shown beside it
3. Select a video → chip shows filename only (no thumbnail)
4. Click `×` on a chip → file removed, object URL revoked (check DevTools Memory tab for no leaks)
5. Submit with image → existing BT seeding fires, magnet sub-line appears in feed
6. Max 3 files: selecting a 4th is silently dropped by `slice(0, 3)`
7. Drag-and-drop still works (existing behaviour preserved)

- [ ] **Step 7: Commit**

```bash
git -C apps/terminal-client add src/components/CommandInput.jsx
git -C apps/terminal-client commit -m "feat: add file picker button and image thumbnail previews to composer"
```

---

## Self-Review

**Spec coverage:**
- ✅ Desktop ≥1024px unchanged
- ✅ Tablet landscape 768–1023px: tighter columns (Task 3)
- ✅ Tablet portrait 600–767px: 2-column + swarm overlay toggle (Tasks 3, 4)
- ✅ Phone <600px: single pane + MobileNav (Tasks 1, 2, 3)
- ✅ Swipe left/right on phone (Tasks 1, 3)
- ✅ Long press → PostContextMenu (Task 5)
- ✅ `navigator.vibrate(10)` haptic (Task 5)
- ✅ `[+]` button + `<input type="file" accept="image/*,video/*" capture="environment">` (Task 6)
- ✅ Image thumbnail 48px (Task 6)
- ✅ Video: filename only (Task 6 — `f.type.startsWith('image/')` guard)
- ✅ Max 3 files via `slice(0, 3)` (Task 6)
- ✅ Object URL cleanup on remove + submit (Task 6)
- ✅ Files passed to existing `publish()` → BT seeding → magnet sub-line (no changes needed to hook)

**Type consistency:** `onContextMenu(message, event)` signature used consistently in `MessageRow`, `ThreadNode`, and `App.jsx`. `useSwipe` returns `{ onTouchStart, onTouchEnd }` used directly in Task 3. `paneClass(paneName)` returns a string className fragment used in all three pane divs.
