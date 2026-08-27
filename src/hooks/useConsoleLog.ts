import { useSyncExternalStore } from 'react'
import { getEntries, getIssueCount, subscribe, type LogEntry } from '../utils/consoleLog'

/**
 * Live view of the captured console ring. Only for mounted viewers — the
 * store notifies on a 150 ms coalescing timer, so a chatty page re-renders
 * the subscriber a handful of times a second at most.
 */
export function useConsoleEntries(): LogEntry[] {
  return useSyncExternalStore(subscribe, getEntries)
}

/**
 * warn+error count only. The snapshot is a number, so React bails out of the
 * re-render unless it actually changed — the always-mounted app-bar badge
 * must not re-render the whole page tree on every `console.log`.
 */
export function useConsoleIssueCount(): number {
  return useSyncExternalStore(subscribe, getIssueCount)
}
