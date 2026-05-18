# Terminal Client — Mobile & Media Enhancements Design

**Date:** 2026-05-18  
**Status:** Approved

## Context

The existing `apps/terminal-client` is a 3-column fixed-grid IRC-style Nostr client built for desktop. This spec adds responsive layout for phone and tablet, touch gesture support (swipe navigation, long press context menu), and media attachment (image/video) in the composer.

## Approach

CSS media queries drive all layout switching — no JS viewport hooks, no conditional component trees. Touch gestures are layered on top via a single `useSwipe` hook and `touchstart` timers on message rows. The existing `PostContextMenu` and `publish()` logic are reused without modification.

## Responsive Layout

Four breakpoints via `@media`:

| Breakpoint | Layout |
|---|---|
| `≥1024px` | Current 3-column grid unchanged: channels 150px \| feed \| swarm 280px |
| `768–1023px` (tablet landscape) | 3-column, tighter: channels 120px \| feed \| swarm 220px |
| `600–767px` (tablet portrait) | 2-column: channels 120px \| feed. Swarm hidden; toggle button in StatusBar shows/hides swarm as overlay |
| `<600px` (phone) | Single active pane. `MobileNav` bottom bar (40px) switches panes |

Phone pane state: `'feed' | 'swarm' | 'channels'`, default `'feed'`. The three panes are rendered in a flex row and translated with `transform: translateX` based on active pane index — no JS animation library.

## Gestures

### Swipe (phone)

`src/hooks/useSwipe.js` — a hook that accepts `{ onSwipeLeft, onSwipeRight }` callbacks.

- `touchstart`: records `startX`, `startY`
- `touchend`: if `|ΔX| > 50px` AND `|ΔY| < 40px`, fires the appropriate callback
- Returns `{ onTouchStart, onTouchEnd }` spread onto the pane wrapper div

Pane cycling: swipe left → next pane (feed → swarm → channels → feed), swipe right → previous.

### Long Press (all touch devices)

Applied to each message row in `MessageFeed`. On `touchstart`:
- Store touch coords (`clientX`, `clientY`)
- Start `setTimeout(500ms)` — on fire, call `openPostMenu(message, { clientX, clientY, preventDefault: noop })`
- Call `navigator.vibrate?.(10)` for haptic feedback

On `touchmove` (delta > 10px) or `touchend` before 500ms: `clearTimeout`.

The existing `PostContextMenu` handles viewport-edge clamping (`Math.min/max` against `window.innerWidth/Height`) — no changes needed.

### MobileNav

`src/components/MobileNav.jsx` — rendered only on phone (`display: none` above 600px via CSS).

- Fixed 40px bottom bar, full width, `background: var(--bg2)`, `border-top: 1px solid var(--border)`
- Three buttons: `[# feed]` `[≡ channels]` `[◈ swarm]`
- Active button: `color: var(--green)`, others `color: var(--text-dim)`
- Clicking a button sets `activePane` in `App.jsx`

Feed content gets `padding-bottom: 40px` on phone to avoid overlap.

## Media Attachments

### Composer Changes (`CommandInput.jsx`)

A `[+]` text button sits left of the `>` prompt. Clicking it triggers a hidden `<input type="file" accept="image/*,video/*" capture="environment" multiple>` (max 3 files). `capture="environment"` opens the rear camera on mobile; on desktop it falls back to file picker.

**Preview strip:** Rendered above the input line when files are selected. Height: 56px. Each file shows:
- Image: 48×48px thumbnail (`URL.createObjectURL`)
- Video: icon + filename (truncated to 20 chars)
- `×` button removes that file

The existing `onHeightChange` callback reports `36 + (files.length > 0 ? 56 : 0)` so `App.jsx` adjusts the composer grid row.

**On submit:** `files` array passed to `publish(text, files)`. The existing `publish()` logic reads `ArrayBuffer`, creates `mediaFiles`, seeds via WebTorrent. The resulting magnet URI renders as a `└─ 📦` sub-line in `MessageFeed` — no changes needed there.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/terminal-client/src/App.jsx` | Modify | Add breakpoint CSS, pane state, `useSwipe`, `MobileNav` render |
| `apps/terminal-client/src/hooks/useSwipe.js` | Create | Touch swipe detection hook |
| `apps/terminal-client/src/components/MobileNav.jsx` | Create | Phone bottom navigation bar |
| `apps/terminal-client/src/components/CommandInput.jsx` | Modify | `[+]` button, hidden file input, preview strip, height reporting |
| `apps/terminal-client/src/components/MessageFeed.jsx` | Modify | Long press handlers on message rows |
| `apps/terminal-client/src/components/StatusBar.jsx` | Modify | Swarm toggle button for tablet portrait |

## Verification

1. Desktop (≥1024px): 3-column layout unchanged
2. Tablet landscape (768–1023px): columns tighten to 120px / 1fr / 220px
3. Tablet portrait (600–767px): swarm hidden, toggle button in status bar shows/hides it
4. Phone portrait (<600px): single pane, MobileNav visible, swipe left/right switches panes
5. Phone landscape: same single-pane with MobileNav
6. Long press on any message → PostContextMenu opens at touch coords
7. `[+]` button → file picker opens, images show thumbnail, video shows filename
8. Submit with media → magnet sub-line appears in message feed
9. `capture="environment"` prompts camera on mobile browser
