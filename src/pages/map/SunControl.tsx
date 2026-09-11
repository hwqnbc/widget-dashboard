import { Chip, IconButton, Slider, Stack, TextField, Tooltip, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import RestoreIcon from '@mui/icons-material/Restore'
import { sunDate, sunPosition } from './terminatorModel'

/** 0–24 fractional hours → "hh:mm". */
function hourLabel(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const MARKS = [0, 6, 12, 18, 24].map((value) => ({ value, label: String(value) }))

/** Today as a local ISO calendar day. */
function todayIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`
}

/** Season quick-jumps: this year's (approximate) equinoxes and solstices —
 * where the shadow contrast is at its extremes. */
function seasonJumps(): { id: string; label: string; iso: string }[] {
  const year = new Date().getFullYear()
  return [
    { id: 'today', label: 'Today', iso: todayIso() },
    { id: 'mar', label: 'Mar 20', iso: `${year}-03-20` },
    { id: 'jun', label: 'Jun 21', iso: `${year}-06-21` },
    { id: 'sep', label: 'Sep 22', iso: `${year}-09-22` },
    { id: 'dec', label: 'Dec 21', iso: `${year}-12-21` },
  ]
}

/**
 * Tool-strip controls for the sun tool: the time-of-day slider driving the
 * scene lighting, a day-sweep play/pause, a "now" reset, and a pure-math
 * azimuth/elevation readout for the current view focus.
 */
export default function SunControl({
  hour,
  onHour,
  day,
  onDay,
  anim,
  onAnim,
  lon,
  lat,
}: {
  /** Local wall-clock time of day, fractional hours 0–24. */
  hour: number
  onHour: (hour: number) => void
  /** Local ISO calendar day the sun stands on (season comparisons). */
  day: string
  onDay: (iso: string) => void
  /** Day-sweep animation running. */
  anim: boolean
  onAnim: (on: boolean) => void
  /** View focus the readout is computed for (render-computed contract lon/lat). */
  lon: number
  lat: number
}) {
  const sun = sunPosition(sunDate(hour, day), lon, lat)
  const nowHour = () => {
    const n = new Date()
    return Math.round((n.getHours() + n.getMinutes() / 60) * 4) / 4
  }
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Slider
        size="small"
        min={0}
        max={24}
        step={0.25}
        marks={MARKS}
        value={hour}
        onChange={(_, v) => {
          onAnim(false) // grabbing the slider takes over from the sweep
          if (typeof v === 'number') onHour(v)
        }}
        valueLabelDisplay="auto"
        valueLabelFormat={hourLabel}
        aria-label="Time of day"
        data-testid="map-sun-slider"
        sx={{ width: { xs: 140, sm: 200 }, mx: 1 }}
      />
      <TextField
        size="small"
        type="date"
        label="Date"
        value={day}
        onChange={(e) => onDay(e.target.value || todayIso())}
        sx={{ width: 150 }}
        slotProps={{
          htmlInput: { 'data-testid': 'map-sun-day' },
          inputLabel: { shrink: true },
        }}
      />
      {seasonJumps().map((s) => (
        <Chip
          key={s.id}
          size="small"
          label={s.label}
          data-testid="map-sun-season"
          data-id={s.id}
          color={day === s.iso ? 'primary' : 'default'}
          onClick={() => onDay(s.iso)}
        />
      ))}
      {anim ? (
        <Tooltip title="Pause the day sweep">
          <IconButton size="small" data-testid="map-sun-pause" aria-label="Pause the day sweep" onClick={() => onAnim(false)}>
            <PauseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Sweep through the day">
          <IconButton size="small" data-testid="map-sun-play" aria-label="Sweep through the day" onClick={() => onAnim(true)}>
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Back to the current time">
        <IconButton
          size="small"
          data-testid="map-sun-now"
          aria-label="Back to the current time"
          onClick={() => {
            onAnim(false)
            onHour(nowHour())
            onDay(todayIso())
          }}
        >
          <RestoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" data-testid="map-sun-info">
        {hourLabel(hour)}
        {' · '}
        {sun.elevation >= 0
          ? `az ${Math.round(sun.azimuth)}° · el ${Math.round(sun.elevation)}°`
          : 'sun below horizon'}
      </Typography>
    </Stack>
  )
}
