import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, Button, IconButton, Tooltip, alpha } from '@mui/material'
import { useTheme } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { useSeatColor } from '../../../features/avatars/useSeatAvatars'
import { usePresentation } from '../../fullscreen/presentation'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import VirtualJoystick from '../droneSim/VirtualJoystick'
import type { AirframeId } from './airframes'
import { coerceAirframe } from './airframes'
import type { AssistLevel } from './assists'
import { coerceAssist } from './assists'
import { DEFAULT_ISLAND_SEED, buildIsland } from './islandLayout'
import IslandScene, { FOG_FAR } from './IslandScene'
import PlaneRig from './PlaneRig'
import type { RigRefs } from './PlaneRig'
import { createWingSim } from './wingSim'
import { WING_KEYS, createWingInput } from './wingInput'
import WingSettingsPanel from './WingSettingsPanel'

const coerceSeed = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const coerceBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)

/**
 * Wing Flyer body — the lazy three.js chunk. Owns the one shared sim object
 * and input state (refs, so a stick drag or key press causes zero React
 * renders — lesson #29), the DOM controls and the persisted settings; the
 * canvas side (PlaneRig) steps the physics every frame.
 */
export default function WingFlyerBody({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const worldSeed = useWidgetField(id, 'worldSeed', DEFAULT_ISLAND_SEED, coerceSeed)
  const airframe = useWidgetField<AirframeId>(id, 'airframe', 'trainer', coerceAirframe)
  const assist = useWidgetField<AssistLevel>(id, 'assist', 'trainer', coerceAssist)
  const invertPitch = useWidgetField(id, 'invertPitch', false, coerceBool)
  const island = useMemo(() => buildIsland(worldSeed), [worldSeed])
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE
  const color = useSeatColor('toy')
  const { fullscreen } = usePresentation()

  const sim = useRef(createWingSim()).current
  const input = useRef(createWingInput()).current
  // Canvas props lag a frame (lesson #48) — the rig reads live refs.
  const airframeRef = useRef(airframe)
  const levelRef = useRef(assist)
  const invertRef = useRef(invertPitch)
  const hudRef = useRef<HTMLDivElement>(null)
  const hudTextRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (airframeRef.current !== airframe) sim.resetRequested = true
    airframeRef.current = airframe
    levelRef.current = assist
    invertRef.current = invertPitch
  }, [airframe, assist, invertPitch, sim])
  const refs = useMemo<RigRefs>(
    () => ({ sim, input, airframe: airframeRef, level: levelRef, invertPitch: invertRef, hud: hudRef, hudText: hudTextRef }),
    [sim, input],
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const patch = useCallback((data: Record<string, unknown>) => dispatch(updateWidgetData({ id, data })), [dispatch, id])

  // Live root height drives touch-control sizing (lesson #53).
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootH, setRootH] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setRootH(Math.round(entries[0].contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keyboard: window-level, guarded so typing in Notes is never stolen.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!WING_KEYS.has(e.code) || isTypingTarget(e.target) || settingsOpen) return
      e.preventDefault()
      if (e.code === 'Space') {
        if (!e.repeat) input.panic = true
        return
      }
      input.keys.add(e.code)
    }
    const up = (e: KeyboardEvent) => input.keys.delete(e.code)
    const clear = () => input.keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [input, settingsOpen])

  const onLeft = useCallback(
    (x: number, y: number) => {
      input.touchLeftX = x
      input.throttle.current = y
    },
    [input],
  )
  const onRight = useCallback(
    (x: number, y: number) => {
      input.touchRightX = x
      input.touchRightY = y
    },
    [input],
  )

  const stickMax = fullscreen ? 140 : 88
  const stickSize = rootH > 0 ? Math.round(Math.min(stickMax, Math.max(72, rootH * 0.28))) : stickMax
  const inset = fullscreen ? 16 : 0
  const chip = {
    color: '#fff',
    bgcolor: alpha('#000', 0.35),
    '&:hover': { bgcolor: alpha('#000', 0.5) },
  }

  return (
    <Box
      ref={rootRef}
      className="widget-no-drag"
      data-testid="wingflyer-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      data-airframe={airframe}
      data-assist={assist}
      data-invert-pitch={invertPitch ? 'on' : 'off'}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        position: 'relative',
        height: '100%',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: palette.sky,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Box data-testid="wingflyer-canvas" sx={{ position: 'absolute', inset: 0 }}>
        <Canvas frameloop="always" dpr={[1, 1.75]} camera={{ fov: 60, near: 0.2, far: FOG_FAR + 60 }}>
          <IslandScene spec={island} palette={palette} />
          <PlaneRig refs={refs} island={island} color={color} airframe={airframe} />
        </Canvas>
      </Box>

      {/* HUD: top-centre, clear of the thumbs. */}
      <Box
        ref={hudRef}
        data-testid="wingflyer-hud"
        sx={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          px: 1.25,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.35),
          fontFamily: 'monospace',
          fontSize: 13,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <Box ref={hudTextRef} component="span" sx={{ color: '#fff' }}>
          SPD — · ALT — · THR —
        </Box>
      </Box>

      <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5 }}>
        <Tooltip title="Reset">
          <IconButton size="small" data-testid="wingflyer-reset" sx={chip} onClick={() => (sim.resetRequested = true)}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings">
          <IconButton size="small" data-testid="wingflyer-settings" sx={chip} onClick={() => setSettingsOpen(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Button
        data-testid="wingflyer-panic"
        variant="contained"
        color="warning"
        size="small"
        onPointerDown={(e) => {
          e.stopPropagation()
          input.panic = true
        }}
        sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: inset + 10,
          minWidth: 0,
          px: 1.5,
          fontWeight: 700,
          letterSpacing: 1,
          touchAction: 'none',
        }}
      >
        PANIC
      </Button>

      <VirtualJoystick
        size={stickSize}
        label="THR · RUD"
        testId="wingflyer-joystick-left"
        onChange={onLeft}
        latchY
        latchRef={input.throttle}
        sx={{ position: 'absolute', left: inset, bottom: inset }}
      />
      <VirtualJoystick
        size={stickSize}
        label="PITCH · ROLL"
        testId="wingflyer-joystick-right"
        onChange={onRight}
        sx={{ position: 'absolute', right: inset, bottom: inset }}
      />

      <WingSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        airframe={airframe}
        assist={assist}
        invertPitch={invertPitch}
        onChange={patch}
      />
    </Box>
  )
}
