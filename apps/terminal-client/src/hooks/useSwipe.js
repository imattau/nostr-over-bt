import { useRef } from 'react'

function shouldIgnoreTouchTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('input, textarea, button, a, [role="button"], [data-swipe-ignore="true"]'))
}

export function useSwipe({ onSwipeLeft, onSwipeRight }) {
  const startRef = useRef(null)

  const onTouchStart = (event) => {
    const touch = event.changedTouches?.[0]
    if (!touch || shouldIgnoreTouchTarget(event.target)) return
    startRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event) => {
    if (!startRef.current) return
    const touch = event.changedTouches?.[0]
    if (!touch) {
      startRef.current = null
      return
    }

    const dx = touch.clientX - startRef.current.x
    const dy = touch.clientY - startRef.current.y
    startRef.current = null

    if (Math.abs(dx) < 50 || Math.abs(dy) > 40) return
    if (dx < 0) {
      onSwipeLeft?.()
    } else {
      onSwipeRight?.()
    }
  }

  return { onTouchStart, onTouchEnd }
}
