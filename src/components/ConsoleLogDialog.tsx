import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom'
import { useConsoleEntries } from '../hooks/useConsoleLog'
import {
  clearEntries,
  countLevels,
  filterEntries,
  formatEntries,
  LOG_LIMIT,
  type LevelFilter,
  type LogLevel,
} from '../utils/consoleLog'

const FILTERS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'issues', label: 'Issues' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'log', label: 'Logs' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
]

/** Row accent per level — MUI palette keys, so both themes stay legible. */
const LEVEL_COLOR: Record<LogLevel, string> = {
  error: 'error.main',
  warn: 'warning.main',
  info: 'info.main',
  debug: 'text.disabled',
  log: 'text.secondary',
}

/** hh:mm:ss.mmm in local time — matches how dev tools stamp a row. */
function stamp(time: number): string {
  const d = new Date(time)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Clipboard with a fallback: `navigator.clipboard` needs a secure context,
 * which a phone hitting a LAN dev server over plain http does not have. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * The dev-tools Console tab, in a dialog. Reads the ring captured by
 * `utils/consoleLog` so runtime errors are readable on a phone, where no
 * dev tools exist. Full-screen on small viewports (the messages are wide),
 * a normal dialog on desktop.
 */
export default function ConsoleLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useConsoleEntries()
  const [filter, setFilter] = useState<LevelFilter>('all')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  // Follow new output like a terminal, but stop fighting the user the moment
  // they scroll up to read something.
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const counts = useMemo(() => countLevels(entries), [entries])
  const shown = useMemo(() => filterEntries(entries, filter, query), [entries, filter, query])

  useEffect(() => {
    if (!open || !follow) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [open, follow, shown])

  useEffect(() => {
    if (copied === 'idle') return
    const id = setTimeout(() => setCopied('idle'), 1600)
    return () => clearTimeout(id)
  }, [copied])

  const handleCopy = async () => {
    // The environment line is what makes a pasted log useful in a bug report.
    const header = `${navigator.userAgent}\n${window.location.href}\n`
    setCopied((await copyText(`${header}\n${formatEntries(shown)}`)) ? 'ok' : 'fail')
  }

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24
    setFollow(atBottom)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { height: fullScreen ? '100%' : '80vh' } } }}
    >
      {/* The test contract lives on a wrapper rather than the Dialog paper —
          MUI v9's typed `slotProps` rejects unknown data-* props. */}
      <Box
        data-testid="console-log-dialog"
        data-count={shown.length}
        data-total={entries.length}
        data-filter={filter}
        data-follow={follow ? 'yes' : 'no'}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: 0,
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <Typography component="span" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Console
          </Typography>
          <Chip
            size="small"
            color={counts.error ? 'error' : 'default'}
            variant={counts.error ? 'filled' : 'outlined'}
            label={`${counts.error} err`}
            data-testid="console-log-count-error"
          />
          <Chip
            size="small"
            color={counts.warn ? 'warning' : 'default'}
            variant={counts.warn ? 'filled' : 'outlined'}
            label={`${counts.warn} warn`}
            data-testid="console-log-count-warn"
          />
          <IconButton onClick={onClose} data-testid="console-log-close" aria-label="Close console">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Stack spacing={1} sx={{ px: { xs: 1.5, sm: 3 }, pb: 1 }}>
          <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filter}
              onChange={(_, value: LevelFilter | null) => value && setFilter(value)}
              data-testid="console-log-filters"
              sx={{ flexWrap: 'nowrap' }}
            >
              {FILTERS.map((item) => (
                <ToggleButton
                  key={item.value}
                  value={item.value}
                  data-testid={`console-log-filter-${item.value}`}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {item.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{
                htmlInput: { 'data-testid': 'console-log-search' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Tooltip title={follow ? 'Following new output' : 'Jump to newest'}>
              <IconButton
                color={follow ? 'primary' : 'default'}
                onClick={() => setFollow(true)}
                data-testid="console-log-follow"
                aria-label="Jump to newest"
              >
                <VerticalAlignBottomIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Copy shown messages">
              <IconButton onClick={handleCopy} data-testid="console-log-copy" aria-label="Copy console">
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear captured messages">
              <IconButton
                onClick={() => clearEntries()}
                data-testid="console-log-clear"
                aria-label="Clear console"
              >
                <DeleteSweepIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <DialogContent
          ref={listRef}
          onScroll={onScroll}
          dividers
          sx={{ p: 0, bgcolor: 'background.default' }}
          data-testid="console-log-list"
        >
          {shown.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }} data-testid="console-log-empty">
              <Typography variant="body2" color="text.secondary">
                {entries.length === 0
                  ? 'Nothing logged yet. Console output and uncaught errors from this session show up here.'
                  : 'No messages match the current filter.'}
              </Typography>
            </Box>
          ) : (
            shown.map((entry) => (
              <Box
                key={entry.id}
                data-testid="console-log-entry"
                data-level={entry.level}
                data-repeat={entry.count}
                sx={{
                  display: 'flex',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  borderLeft: 3,
                  borderColor: LEVEL_COLOR[entry.level],
                  borderBottom: 1,
                  borderBottomColor: 'divider',
                  bgcolor:
                    entry.level === 'error'
                      ? 'action.hover'
                      : entry.level === 'warn'
                        ? 'action.selected'
                        : 'transparent',
                }}
              >
                <Typography
                  component="span"
                  variant="caption"
                  color="text.disabled"
                  sx={{
                    fontFamily: 'monospace',
                    flexShrink: 0,
                    display: { xs: 'none', sm: 'block' },
                  }}
                >
                  {stamp(entry.time)}
                </Typography>
                <Typography
                  component="pre"
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: { xs: 11, sm: 12.5 },
                    m: 0,
                    flexGrow: 1,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color:
                      entry.level === 'error' || entry.level === 'warn'
                        ? LEVEL_COLOR[entry.level]
                        : 'text.primary',
                  }}
                >
                  {entry.text}
                </Typography>
                {entry.count > 1 && (
                  <Chip
                    size="small"
                    label={`x${entry.count}`}
                    sx={{ flexShrink: 0, height: 18, fontSize: 10 }}
                  />
                )}
              </Box>
            ))
          )}
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            {copied === 'ok'
              ? 'Copied to clipboard'
              : copied === 'fail'
                ? 'Copy failed — select the text instead'
                : `${shown.length} of ${entries.length} shown (last ${LOG_LIMIT} kept)`}
          </Typography>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
