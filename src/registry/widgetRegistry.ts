import type { ComponentType } from 'react'
import type { WidgetType } from '../features/widgets/types'
import ClockWidget from '../components/widgets/ClockWidget'
import RoundClockWidget from '../components/widgets/RoundClockWidget'
import CounterWidget from '../components/widgets/CounterWidget'
import NotesWidget from '../components/widgets/NotesWidget'
import ImageToggleWidget from '../components/widgets/ImageToggleWidget'
import AvatarActionsWidget from '../components/widgets/AvatarActionsWidget'
import TicTacToeWidget from '../components/widgets/TicTacToeWidget'
import Connect4Widget from '../components/widgets/Connect4Widget'
import OthelloWidget from '../components/widgets/OthelloWidget'
import MemoryWidget from '../components/widgets/MemoryWidget'
import ArcheryWidget from '../components/widgets/ArcheryWidget'
import DroneSimWidget from '../components/widgets/droneSim/DroneSimWidget'
import DroneStrikeWidget from '../components/widgets/droneStrike/DroneStrikeWidget'
import TankBattleWidget from '../components/widgets/tankBattle/TankBattleWidget'
import ModelViewerWidget from '../components/widgets/modelViewer/ModelViewerWidget'
import MazeRunnerWidget from '../components/widgets/mazeRunner/MazeRunnerWidget'

/** Props every widget component receives. */
export interface WidgetProps {
  id: string
}

/** Maps a widget type to the component that renders it. */
export const widgetComponents: Record<WidgetType, ComponentType<WidgetProps>> = {
  clock: ClockWidget,
  roundClock: RoundClockWidget,
  counter: CounterWidget,
  notes: NotesWidget,
  imageToggle: ImageToggleWidget,
  avatarActions: AvatarActionsWidget,
  ticTacToe: TicTacToeWidget,
  connect4: Connect4Widget,
  othello: OthelloWidget,
  memory: MemoryWidget,
  archery: ArcheryWidget,
  droneSim: DroneSimWidget,
  droneStrike: DroneStrikeWidget,
  tankBattle: TankBattleWidget,
  modelViewer: ModelViewerWidget,
  mazeRunner: MazeRunnerWidget,
}
