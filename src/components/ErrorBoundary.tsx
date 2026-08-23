import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'

interface ErrorBoundaryState {
  error: Error | null
}

/** A failed dynamic import — almost always a stale deploy (hashed chunk
 * gone) or a connection hiccup, not an app bug. */
function isChunkLoadError(error: Error): boolean {
  return /Importing a module script failed|dynamically imported module|Loading chunk|Failed to fetch/i.test(
    error.message,
  )
}

/**
 * Catches render/lifecycle errors below it (class component — the only way)
 * and shows a recoverable card instead of unmounting the app into a blank
 * page. Because redux-persist rehydrates on every load, a crash caused by
 * poisoned persisted state is PERMANENT without an escape hatch — so beside
 * "Try again" there's "Reset map data", which drops the persisted `map`
 * slice (the newest, most complex state) and reloads.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  private resetMapData = () => {
    try {
      const raw = localStorage.getItem('persist:testsite')
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>
        delete parsed.map
        localStorage.setItem('persist:testsite', JSON.stringify(parsed))
      }
    } catch {
      /* storage unavailable — reload alone may still help */
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunkError = isChunkLoadError(error)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240, p: 2 }}>
        <Card variant="outlined" sx={{ maxWidth: 560 }} data-testid="error-boundary">
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              {chunkError ? 'The page failed to load' : 'Something went wrong'}
            </Typography>
            <Alert severity="error" sx={{ mb: 2, wordBreak: 'break-word' }}>
              {error.name}: {error.message}
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {chunkError
                ? 'A new version of the app was likely deployed while an old page was still cached, or the connection hiccuped. Reloading fetches the current version.'
                : 'Try again re-renders the page. If it keeps crashing, the saved map data may be the cause — Reset map data clears it (pins, drawings, routes, bookmarks and the saved viewport) and reloads.'}
            </Typography>
            <Stack direction="row" spacing={1}>
              {chunkError ? (
                <Button
                  variant="contained"
                  data-testid="error-boundary-reload"
                  onClick={() => window.location.reload()}
                >
                  Reload page
                </Button>
              ) : (
                <Button
                  variant="contained"
                  data-testid="error-boundary-retry"
                  onClick={() => this.setState({ error: null })}
                >
                  Try again
                </Button>
              )}
              <Button
                color="warning"
                data-testid="error-boundary-reset-map"
                onClick={this.resetMapData}
              >
                Reset map data
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }
}
