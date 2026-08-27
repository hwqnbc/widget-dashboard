/**
 * Is this event target somewhere the user is typing?
 *
 * Widgets that bind keyboard controls listen on `window`, so they see every
 * keystroke on the dashboard — including the ones meant for the Notes widget's
 * textarea. Any handler that claims keys must ignore events aimed at an
 * editable element, or typing a note starts flying a drone.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}
