import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, Button, IconButton, Tooltip, alpha } from '@mui/material'
import { useTheme } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import VideocamIcon from '@mui/icons-material/Videocam'
import ListAltIcon from '@mui/icons-material/ListAlt'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { useAppDispatch, useAppSelector } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { recordWingChain, recordWingMission, resetGameRecords, selectWingFlyerRecords } from '../../../features/records/recordsSlice'
import ConfirmDialog from '../ConfirmDialog'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { useSeatAvatarId, useSeatColor } from '../../../features/avatars/useSeatAvatars'
import { avatarVisualById } from '../../../registry/avatarRegistry'
import NavigationIcon from '@mui/icons-material/Navigation'
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
import type { ObjectiveSnapshot, RigRefs } from './PlaneRig'
import ObjectiveChip from './ObjectiveChip'
import { FLY_OUT_DIST } from './objective'
import type { LandingHint } from './objective'
import type { PlayMode } from './missions'
import { coerceMode, isMission, missionChecklist, missionIndex, missionUnlocked, nextMission } from './missions'
import MissionMenu from './MissionMenu'
import ScorecardPanel from './ScorecardPanel'
import type { MissionSnapshot } from './ScorecardPanel'

/** The landing hint words — short enough for a young reader. */
function hintWords(h: LandingHint, assist: AssistLevel): string {
  switch (h) {
    case 'lineup':
      return 'Line up with the hoops'
    case 'follow':
      return assist === 'trainer' ? 'Let go — it follows the hoops' : 'Push forward, follow the hoops'
    case 'low':
      return assist === 'trainer' ? 'Let go — it lands itself' : 'Ease back, touch down'
    default:
      return ''
  }
}
import { createWingSim, setMode } from './wingSim'
import type { Phase, StartKind, WingSim } from './wingSim'
import { AIRFRAMES } from './airframes'
import AirfieldProps from './AirfieldProps'
import { WING_KEYS, createWingInput } from './wingInput'
import WingSettingsPanel from './WingSettingsPanel'
import WingHelpDialog from './WingHelpDialog'
import type { WingView } from './views'
import { DEFAULT_VIEW, coerceView } from './views'
import { createWingSound } from './wingSound'

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
  const view = useWidgetField<WingView>(id, 'view', 'chase', coerceView)
  const fpvLevel = useWidgetField(id, 'fpvLevel', true, coerceBool)
  const helpSeen = useWidgetField(id, 'helpSeen', false, coerceBool)
  const soundOn = useWidgetField(id, 'sound', false, coerceBool)
  const hintsOn = useWidgetField(id, 'landingHints', true, coerceBool)
  const mode = useWidgetField<PlayMode>(id, 'mission', 'first', coerceMode)
  const unlockAll = useWidgetField(id, 'unlockAll', false, coerceBool)
  const records = useAppSelector(selectWingFlyerRecords)
  const island = useMemo(() => buildIsland(worldSeed), [worldSeed])
  const themeMode = useTheme().palette.mode
  const palette = themeMode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE
  const color = useSeatColor('toy')
  // The pilot is Player 1 (seat 'toy'); its Model3D is resolved here because
  // redux doesn't cross into the <Canvas> root (the Drone Sim pattern).
  const OperatorModel = avatarVisualById[useSeatAvatarId('toy')].Model3D
  const { fullscreen } = usePresentation()

  // The sim is created with the persisted mode so the rig's first reset
  // already flies it (the mode's wind, the Trainer trims).
  const simRef = useRef<WingSim | null>(null)
  if (simRef.current === null) {
    simRef.current = createWingSim()
    setMode(simRef.current, mode)
  }
  const sim = simRef.current
  const input = useRef(createWingInput()).current
  const sound = useRef(createWingSound()).current
  useEffect(() => {
    sound.setEnabled(soundOn)
    return () => sound.setEnabled(false)
  }, [sound, soundOn])
  // Canvas props lag a frame (lesson #48) — the rig reads live refs.
  const airframeRef = useRef(airframe)
  const levelRef = useRef(assist)
  const invertRef = useRef(invertPitch)
  const viewRef = useRef(view)
  const fpvLevelRef = useRef(fpvLevel)
  const bankSymbolRef = useRef<HTMLDivElement>(null)
  const edgeWarnRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const hudTextRef = useRef<HTMLDivElement>(null)
  const homeArrowRef = useRef<HTMLDivElement>(null)
  const homeTextRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('preflight')
  const [start, setStart] = useState<StartKind>('hand')
  const onPhaseRef = useRef((p: Phase, st: StartKind) => {
    setPhase(p)
    setStart(st)
  })
  const [objective, setObjective] = useState<ObjectiveSnapshot>({
    takeoff: false,
    flyout: false,
    back: false,
    land: false,
    runway: false,
    sink: 0,
    completed: 0,
    hoopsPassed: 0,
    hoopsScored: 0,
    hoopsTotal: 6,
  })
  const onObjectiveRef = useRef((o: ObjectiveSnapshot) => setObjective(o))
  const [mission, setMission] = useState<MissionSnapshot>({
    mode,
    outcome: 'flying',
    fail: null,
    motorOut: false,
    score: 0,
    stars: 0,
    badge: 'acro',
    chain: 0,
    bestChain: 0,
    chainBreak: null,
    landing: null,
  })
  const lastOutcome = useRef<MissionSnapshot['outcome']>('flying')
  const onMissionRef = useRef((m: MissionSnapshot) => {
    setMission(m)
    // The run just resolved: a judged mission landing / a finished chain
    // goes to the app-level records (once — the outcome flips once per run).
    if (m.outcome !== 'flying' && lastOutcome.current === 'flying') {
      if (m.outcome === 'done' && isMission(m.mode)) {
        dispatch(recordWingMission({ key: m.mode, stars: m.stars, score: m.score, assist: m.badge }))
      } else if (m.mode === 'touchgo') {
        dispatch(recordWingChain({ chain: m.bestChain }))
      }
    }
    lastOutcome.current = m.outcome
  })
  const objDistRef = useRef<HTMLSpanElement>(null)
  const hintElRef = useRef<HTMLDivElement>(null)
  const hintTextRef = useRef((h: LandingHint) => hintWords(h, assist))
  const hintsOnRef = useRef(hintsOn)
  useEffect(() => {
    hintTextRef.current = (h) => hintWords(h, assist)
    hintsOnRef.current = hintsOn
  }, [assist, hintsOn])
  // A mode change (menu pick, Next) restarts in the hand under the new rules.
  useEffect(() => {
    if (sim.mode !== mode) {
      setMode(sim, mode)
      sim.resetRequested = 'hand'
    }
  }, [mode, sim])
  useEffect(() => {
    if (airframeRef.current !== airframe) sim.resetRequested = 'hand'
    airframeRef.current = airframe
    levelRef.current = assist
    invertRef.current = invertPitch
    viewRef.current = view
    fpvLevelRef.current = fpvLevel
  }, [airframe, assist, invertPitch, view, fpvLevel, sim])
  const refs = useMemo<RigRefs>(
    () => ({
      sim,
      input,
      airframe: airframeRef,
      level: levelRef,
      invertPitch: invertRef,
      hud: hudRef,
      hudText: hudTextRef,
      homeArrow: homeArrowRef,
      homeText: homeTextRef,
      onPhase: onPhaseRef,
      onObjective: onObjectiveRef,
      onMission: onMissionRef,
      objectiveDist: objDistRef,
      hintEl: hintElRef,
      hintText: hintTextRef,
      hintsOn: hintsOnRef,
      view: viewRef,
      sound,
      fpvLevel: fpvLevelRef,
      bankSymbol: bankSymbolRef,
      edgeWarn: edgeWarnRef,
    }),
    [sim, input, sound],
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen)
  const [resetConfirm, setResetConfirm] = useState(false)
  // The start screen: open on mount (it is where the stars live), on the
  // scorecard's Menu button and the list button; a pick starts that mode.
  const [menuOpen, setMenuOpen] = useState(true)
  const pickMode = useCallback(
    (m: PlayMode) => {
      setMenuOpen(false)
      if (m === mode) {
        sim.resetRequested = 'hand'
      } else {
        dispatch(updateWidgetData({ id, data: { mission: m } }))
      }
    },
    [dispatch, id, mode, sim],
  )
  const next = isMission(mode) ? nextMission(mode) : null
  const nextOpen = next !== null && missionUnlocked(missionIndex(next), records.stars, unlockAll)
  const showScorecard = mode !== 'free' && mission.outcome !== 'flying' && (phase === 'landed' || phase === 'preflight')
  const steps = missionChecklist(mission, objective, { passed: objective.hoopsPassed, inPlay: objective.hoopsTotal })
  const patch = useCallback(
    (data: Record<string, unknown>) => {
      // Switching plane also switches to its natural camera.
      const af = coerceAirframe(data.airframe)
      dispatch(updateWidgetData({ id, data: af ? { ...data, view: DEFAULT_VIEW[af] } : data }))
    },
    [dispatch, id],
  )
  const closeHelp = useCallback(() => {
    setHelpOpen(false)
    if (!helpSeen) dispatch(updateWidgetData({ id, data: { helpSeen: true } }))
  }, [dispatch, helpSeen, id])

  // --- Auto-pause (docs/wing-flyer.md §11: a plane can't stop) ---------------
  // Scrolling the widget away, switching tab/app, a dialog, or a fullscreen
  // toggle pauses an airborne flight; resume is a tap + 3-2-1 countdown.
  const [paused, setPaused] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const pause = useCallback(() => {
    if (sim.phase !== 'flying' || sim.paused) return
    sim.paused = true
    input.keys.clear()
    setCountdown(0)
    setPaused(true)
  }, [sim, input])
  const resume = useCallback(() => setCountdown(3), [])
  useEffect(() => {
    if (countdown <= 0) return
    const t = window.setTimeout(() => {
      if (countdown === 1) {
        sim.paused = false
        setPaused(false)
      }
      setCountdown(countdown - 1)
    }, 600)
    return () => window.clearTimeout(t)
  }, [countdown, sim])
  useEffect(() => {
    const onVis = () => document.hidden && pause()
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [pause])
  useEffect(() => {
    if (settingsOpen || helpOpen || menuOpen) pause()
  }, [settingsOpen, helpOpen, menuOpen, pause])
  const fsSeen = useRef(fullscreen)
  useEffect(() => {
    if (fsSeen.current !== fullscreen) pause()
    fsSeen.current = fullscreen
  }, [fullscreen, pause])

  // Live root height drives touch-control sizing (lesson #53); the same
  // element's visibility drives the scrolled-away auto-pause.
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootH, setRootH] = useState(0)
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setRootH(Math.round(entries[0].contentRect.height)))
    ro.observe(el)
    const io = new IntersectionObserver(
      ([e]) => {
        const shown = e.intersectionRatio >= 0.3
        setOnScreen(shown)
        if (!shown) pause()
      },
      { threshold: [0.3] },
    )
    io.observe(el)
    return () => {
      ro.disconnect()
      io.disconnect()
    }
  }, [pause])

  // Keyboard: window-level, guarded so typing in Notes is never stolen.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!WING_KEYS.has(e.code) || isTypingTarget(e.target) || settingsOpen || helpOpen || menuOpen) return
      e.preventDefault()
      if (e.code === 'Space') {
        if (!e.repeat) input.panic = true
        return
      }
      if (e.code === 'Enter') {
        // Enter = Launch from the hand (preflight only).
        if (!e.repeat && sim.phase === 'preflight') sim.launchRequested = true
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
  }, [input, sim, settingsOpen, helpOpen, menuOpen])

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
      data-phase={phase}
      data-view={view}
      data-fpv-level={fpvLevel ? 'on' : 'off'}
      data-paused={paused ? 'true' : 'false'}
      data-help-seen={helpSeen ? 'on' : 'off'}
      data-sound={soundOn ? 'on' : 'off'}
      data-landing-hints={hintsOn ? 'on' : 'off'}
      data-mission={mode}
      data-unlock-all={unlockAll ? 'on' : 'off'}
      data-menu={menuOpen ? 'open' : 'closed'}
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
        <Canvas
          // Battery: stop continuous rendering while paused or scrolled away
          // (nothing moves then; 'demand' still repaints on resize).
          frameloop={paused || !onScreen ? 'demand' : 'always'}
          dpr={[1, 1.75]}
          camera={{ fov: 60, near: 0.2, far: FOG_FAR + 60 }}
        >
          <IslandScene spec={island} palette={palette} />
          <AirfieldProps operatorModel={OperatorModel} sim={sim} mode={mode} />
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

      {/* Home arrow: points at the runway, relative to the nose. */}
      <Box
        data-testid="wingflyer-home"
        sx={{
          position: 'absolute',
          top: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.75,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.3),
          color: '#ffd54f',
          fontFamily: 'monospace',
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        <Box ref={homeArrowRef} sx={{ display: 'grid', placeItems: 'center', transition: 'transform 150ms linear' }}>
          <NavigationIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box ref={homeTextRef} component="span">
          —
        </Box>
      </Box>

      {/* The standing goal: Take off ▸ Fly out ▸ Land (objective.ts). */}
      <ObjectiveChip
        steps={steps}
        distRef={objDistRef}
        flyOutDist={FLY_OUT_DIST}
        hoops={objective.hoopsScored > 0 && objective.hoopsTotal > 0 ? { passed: objective.hoopsPassed, total: objective.hoopsTotal } : null}
        count={mode === 'free' ? objective.completed : 0}
      />
      <Box
        ref={hintElRef}
        data-testid="wingflyer-hint"
        sx={{
          display: 'none',
          position: 'absolute',
          top: 86,
          left: '50%',
          transform: 'translateX(-50%)',
          px: 1,
          py: 0.2,
          borderRadius: 1,
          bgcolor: alpha('#1565c0', 0.75),
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      />

      {/* FPV: a bank symbol at the centre (the level horizon hides the bank). */}
      {view === 'fpv' && phase !== 'preflight' && (
        <Box
          ref={bankSymbolRef}
          data-testid="wingflyer-bank-symbol"
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 64,
            height: 2,
            bgcolor: alpha('#ffd54f', 0.9),
            pointerEvents: 'none',
            '&::after': {
              content: '""',
              position: 'absolute',
              left: '50%',
              top: -4,
              width: 10,
              height: 10,
              ml: '-5px',
              borderRadius: '50%',
              border: '2px solid',
              borderColor: alpha('#ffd54f', 0.9),
            },
          }}
        />
      )}

      <Box
        ref={edgeWarnRef}
        data-testid="wingflyer-edge-warn"
        sx={{
          display: 'none',
          position: 'absolute',
          top: 68,
          left: '50%',
          transform: 'translateX(-50%)',
          px: 1,
          borderRadius: 1,
          bgcolor: alpha('#d32f2f', 0.8),
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
          pointerEvents: 'none',
        }}
      >
        TURN BACK
      </Box>

      {paused && !settingsOpen && !helpOpen && !menuOpen && (
        <Box
          data-testid="wingflyer-paused"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => countdown === 0 && resume()}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha('#000', 0.35),
            color: '#fff',
            fontWeight: 700,
            fontSize: countdown > 0 ? 48 : 18,
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          {countdown > 0 ? countdown : 'Paused — tap to continue'}
        </Box>
      )}

      {menuOpen && <MissionMenu mode={mode} records={records} unlockAll={unlockAll} onPick={pickMode} />}

      {/* Start / landed controls — or the scorecard once a mission run resolved. */}
      {showScorecard && !menuOpen && (
        <Box sx={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%, -50%)' }}>
          <ScorecardPanel
            run={mission}
            recordBestChain={records.bestChain}
            nextOpen={nextOpen}
            onRetry={() => (sim.resetRequested = start)}
            onNext={() => next && pickMode(next)}
            onMenu={() => setMenuOpen(true)}
          />
        </Box>
      )}
      {(phase === 'preflight' || phase === 'landed') && !showScorecard && !menuOpen && (
        <Box
          data-testid="wingflyer-start-panel"
          sx={{
            position: 'absolute',
            left: '50%',
            top: '42%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {phase === 'landed' && (
            <Box
              data-testid="wingflyer-landed-banner"
              data-objective-complete={objective.land ? 'true' : 'false'}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
                bgcolor: alpha('#000', 0.45),
                color: '#fff',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {objective.land
                ? objective.sink < 0.6
                  ? 'Butter! Goal complete'
                  : 'Nice landing! Goal complete'
                : 'Landed!'}
              <Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
                {objective.land
                  ? `${objective.sink.toFixed(1)} m/s · ${objective.runway ? '✓ on the runway' : 'on the grass'}`
                  : objective.takeoff && !objective.flyout
                    ? `Fly out ${FLY_OUT_DIST} m and come back to complete the goal`
                    : 'Come back to the runway to complete the goal'}
              </Box>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {phase === 'preflight' && start === 'hand' ? (
              <Button
                data-testid="wingflyer-launch"
                variant="contained"
                onClick={() => (sim.launchRequested = true)}
                sx={{ fontWeight: 700, letterSpacing: 1 }}
              >
                Launch
              </Button>
            ) : (
              <Button
                data-testid="wingflyer-hand-launch"
                variant="contained"
                onClick={() => (sim.resetRequested = 'hand')}
                sx={{ fontWeight: 700 }}
              >
                Hand launch
              </Button>
            )}
            {AIRFRAMES[airframe].wheels && (
              <Button
                data-testid="wingflyer-runway"
                variant="contained"
                color="secondary"
                onClick={() => (sim.resetRequested = 'runway')}
                sx={{ fontWeight: 700 }}
              >
                Runway
              </Button>
            )}
          </Box>
        </Box>
      )}

      <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5 }}>
        <Tooltip title="Missions">
          <IconButton size="small" data-testid="wingflyer-menu-open" sx={chip} onClick={() => setMenuOpen(true)}>
            <ListAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset">
          <IconButton size="small" data-testid="wingflyer-reset" sx={chip} onClick={() => (sim.resetRequested = 'hand')}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Camera">
          <IconButton
            size="small"
            data-testid="wingflyer-view"
            sx={chip}
            onClick={() => patch({ view: view === 'chase' ? 'fpv' : 'chase' })}
          >
            <VideocamIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="How to fly">
          <IconButton size="small" data-testid="wingflyer-help" sx={chip} onClick={() => setHelpOpen(true)}>
            <HelpOutlineIcon fontSize="small" />
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
        key={assist === 'trainer' ? 'auto' : 'thr'}
        size={stickSize}
        label={assist === 'trainer' ? 'AUTO · RUD' : 'THR · RUD'}
        testId="wingflyer-joystick-left"
        onChange={onLeft}
        latchY={assist !== 'trainer'}
        lockY={assist === 'trainer'}
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
        view={view}
        fpvLevel={fpvLevel}
        sound={soundOn}
        landingHints={hintsOn}
        unlockAll={unlockAll}
        onChange={patch}
        onResetRecords={() => setResetConfirm(true)}
      />
      <ConfirmDialog
        open={resetConfirm}
        title="Clear mission stars?"
        message="This clears every mission's stars, badges and the best touch-and-go chain on this device, and locks the missions again."
        confirmLabel="Clear stars"
        cancelLabel="Keep them"
        onConfirm={() => {
          setResetConfirm(false)
          dispatch(resetGameRecords('wingFlyer'))
        }}
        onCancel={() => setResetConfirm(false)}
      />
      <WingHelpDialog open={helpOpen} onClose={closeHelp} assist={assist} />
    </Box>
  )
}
