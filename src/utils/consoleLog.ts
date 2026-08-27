/**
 * In-app console capture — the store behind the app-bar Console viewer.
 *
 * A phone browser has no dev tools, so a runtime error there is invisible:
 * the page just misbehaves. This module patches `console.*` (and the two
 * window-level error channels) once at startup and keeps the last
 * `LOG_LIMIT` messages in a ring buffer that any React tree can subscribe
 * to, so the same output dev tools would show can be read in a dialog on
 * the device itself.
 *
 * Everything below the install seam is pure and free of DOM/React, so the
 * e2e suite can unit-check formatting, the ring, dedupe and filtering
 * without a browser.
 */

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  /** Monotonic id — stable React key across ring evictions. */
  id: number
  level: LogLevel
  /** Formatted, already-truncated one-string rendering of the call's args. */
  text: string
  /** Epoch ms of the most recent occurrence. */
  time: number
  /** Repeat counter — identical consecutive messages collapse into one row. */
  count: number
}

export interface LevelCounts {
  log: number
  info: number
  warn: number
  error: number
  debug: number
  /** warn + error — what the app-bar badge shows. */
  issues: number
}

/** Ring capacity. A runaway per-frame log must not grow the heap. */
export const LOG_LIMIT = 500
/** Per-entry text cap — one giant object dump can't blow up the dialog. */
export const TEXT_LIMIT = 4000
const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug']

// ---------------------------------------------------------------- formatting

/** `<div#root.a.b>` for DOM nodes, without holding on to the node. */
function describeNode(value: object): string | null {
  const el = value as {
    nodeType?: number
    nodeName?: string
    id?: string
    className?: unknown
  }
  if (typeof el.nodeType !== 'number' || typeof el.nodeName !== 'string') return null
  const name = el.nodeName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).join('.')}`
      : ''
  return `<${name}${id}${cls}>`
}

/** Depth- and cycle-safe rendering of one value. Never throws. */
function stringifyValue(value: unknown, depth: number, seen: Set<object>): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  const type = typeof value
  // Top-level strings print bare (as dev tools do); nested ones get quoted.
  if (type === 'string') return depth === 0 ? (value as string) : JSON.stringify(value)
  if (type === 'number' || type === 'boolean') return String(value)
  if (type === 'bigint') return `${String(value)}n`
  if (type === 'symbol') return String(value)
  if (type === 'function') {
    const fn = value as { name?: string }
    return `f ${fn.name || 'anonymous'}()`
  }
  const obj = value as object
  if (seen.has(obj)) return '[Circular]'
  if (value instanceof Error) {
    // Every engine that has a stack starts it with "Name: message"; without
    // one (some mobile paths) fall back to the pair.
    return value.stack ? String(value.stack) : `${value.name}: ${value.message}`
  }
  const node = describeNode(obj)
  if (node) return node
  if (depth >= 3) return Array.isArray(value) ? '[...]' : '{...}'
  seen.add(obj)
  try {
    if (Array.isArray(value)) {
      const parts = value.slice(0, 20).map((item) => stringifyValue(item, depth + 1, seen))
      if (value.length > 20) parts.push(`... ${value.length - 20} more`)
      return `[${parts.join(', ')}]`
    }
    if (value instanceof Map) {
      return `Map(${value.size}) ${stringifyValue([...value.entries()], depth + 1, seen)}`
    }
    if (value instanceof Set) return `Set(${value.size}) ${stringifyValue([...value], depth + 1, seen)}`
    const entries: string[] = []
    for (const key of Object.keys(obj).slice(0, 30)) {
      let rendered: string
      try {
        rendered = stringifyValue((obj as Record<string, unknown>)[key], depth + 1, seen)
      } catch {
        rendered = '[getter threw]' // property getters can blow up on read
      }
      entries.push(`${key}: ${rendered}`)
    }
    const ctor = obj.constructor
    const name = ctor && ctor.name && ctor.name !== 'Object' ? `${ctor.name} ` : ''
    return `${name}{${entries.length ? ` ${entries.join(', ')} ` : ''}}`
  } catch {
    return '[unserializable]'
  } finally {
    seen.delete(obj)
  }
}

/** Join one console call's arguments the way dev tools would, then cap it. */
export function formatArgs(args: unknown[]): string {
  const text = args.map((arg) => stringifyValue(arg, 0, new Set())).join(' ')
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}... (${text.length} chars)` : text
}

// --------------------------------------------------------------------- store

let buffer: LogEntry[] = []
let nextId = 1
let version = 0
let issueCount = 0
let snapshot: LogEntry[] = []
let snapshotVersion = -1
const listeners = new Set<() => void>()
let notifyTimer: ReturnType<typeof setTimeout> | null = null

/** Coalesce notifications: a per-frame logger must not drive per-frame renders. */
function scheduleNotify() {
  if (notifyTimer != null) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    for (const listener of listeners) listener()
  }, 150)
}

/** Append one message (or bump the repeat count of an identical last one). */
export function recordLog(level: LogLevel, args: unknown[], now = Date.now()): void {
  const text = formatArgs(args)
  const last = buffer[buffer.length - 1]
  if (last && last.level === level && last.text === text) {
    // New object, not a mutation — subscribers compare entries by identity.
    buffer[buffer.length - 1] = { ...last, count: last.count + 1, time: now }
  } else {
    buffer.push({ id: nextId++, level, text, time: now, count: 1 })
    if (buffer.length > LOG_LIMIT) buffer.shift()
  }
  if (level === 'warn' || level === 'error') issueCount++
  version++
  scheduleNotify()
}

/** Cached immutable view of the ring — identity is stable between changes,
 * which is what `useSyncExternalStore` needs to avoid an infinite loop. */
export function getEntries(): LogEntry[] {
  if (snapshotVersion !== version) {
    snapshot = buffer.slice()
    snapshotVersion = version
  }
  return snapshot
}

/** warn+error messages recorded this session (reset by `clearEntries`). A
 * plain number, so the app-bar badge re-renders only when it actually moves. */
export function getIssueCount(): number {
  return issueCount
}

export function clearEntries(): void {
  buffer = []
  issueCount = 0
  version++
  scheduleNotify()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Per-level tally of a set of entries (a collapsed repeat counts once — a
 * row is a row). */
export function countLevels(entries: LogEntry[]): LevelCounts {
  const counts: LevelCounts = {
    log: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
    issues: 0,
  }
  for (const entry of entries) counts[entry.level]++
  counts.issues = counts.warn + counts.error
  return counts
}

export type LevelFilter = 'all' | 'issues' | LogLevel

/** Dialog filter: by level bucket, then by case-insensitive substring. */
export function filterEntries(entries: LogEntry[], level: LevelFilter, query: string): LogEntry[] {
  const needle = query.trim().toLowerCase()
  return entries.filter((entry) => {
    const levelOk =
      level === 'all'
        ? true
        : level === 'issues'
          ? entry.level === 'warn' || entry.level === 'error'
          : entry.level === level
    if (!levelOk) return false
    return !needle || entry.text.toLowerCase().includes(needle)
  })
}

/** Plain-text export — what the Copy button puts on the clipboard. */
export function formatEntries(entries: LogEntry[]): string {
  return entries
    .map((entry) => {
      const time = new Date(entry.time).toISOString().slice(11, 23)
      const repeat = entry.count > 1 ? ` (x${entry.count})` : ''
      return `[${time}] ${entry.level.toUpperCase()}${repeat}: ${entry.text}`
    })
    .join('\n')
}

// ------------------------------------------------------------------- install

let installed = false

/**
 * Patch `console.*`, uncaught errors and unhandled promise rejections into
 * the ring. Idempotent, and the original console methods are still called —
 * real dev tools keep behaving exactly as before.
 */
export function installConsoleCapture(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  for (const level of LEVELS) {
    const original = console[level] as ((...args: unknown[]) => void) | undefined
    console[level] = (...args: unknown[]) => {
      try {
        recordLog(level, args)
      } catch {
        /* capture must never break the caller's logging */
      }
      original?.apply(console, args)
    }
  }

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as {
        src?: string
        href?: string
        tagName?: string
      } | null
      if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
        // Resource failures (script/img/css) fire on the element itself and
        // carry no `error` object — the message would otherwise be empty.
        const tag = target.tagName?.toLowerCase() ?? 'resource'
        recordLog('error', [`Failed to load ${tag}: ${target.src ?? target.href}`])
        return
      }
      const where = event.filename ? `(${event.filename}:${event.lineno}:${event.colno})` : ''
      recordLog('error', ['Uncaught', event.error ?? event.message, where])
    },
    true, // capture phase — resource errors don't bubble
  )

  window.addEventListener('unhandledrejection', (event) => {
    recordLog('error', ['Unhandled promise rejection:', event.reason])
  })
}
