import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3001);
const ROOM_CODE_DIGITS = 5;
const MAX_PLAYERS = 40;

type Phase = 'lobby' | 'matchups' | 'playing';
type MatchStatus = 'ready' | 'countdown' | 'playing' | 'complete';

type ThreeHexagonState = {
  phase: 'placing' | 'moving' | 'won';
  board: Array<string | null>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  winningLine?: number[];
  resultRevealAt?: number;
  lastMoveByPlayer: Record<string, { from: number; to: number } | null>;
  lastAction: string;
};

type ThreeHexagonAction =
  | { kind: 'place'; to: number }
  | { kind: 'move'; from: number; to: number };

type FourStarState = {
  phase: 'placing' | 'moving' | 'won';
  board: Array<string | null>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  winningLine?: number[];
  resultRevealAt?: number;
  lastMoveByPlayer: Record<string, { from: number; to: number } | null>;
  lastAction: string;
};

type FourStarAction =
  | { kind: 'place'; to: number }
  | { kind: 'move'; from: number; to: number };

type BoxesState = {
  phase: 'playing' | 'won';
  edges: Array<string | null>;
  boxes: Array<string | null>;
  scores: Record<string, number>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  lastCompletedBoxes?: number[];
  lastAction: string;
};

type BoxesAction = { kind: 'draw'; edge: number };

type NeverTouchState = {
  phase: 'playing' | 'won';
  board: Array<string | null>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  lastPlacedIndex?: number;
  lastAction: string;
};

type NeverTouchAction = { kind: 'place'; to: number };

type SpiralState = {
  phase: 'playing' | 'won';
  counters: number[];
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  lastMovedCounter?: number;
  lastMove?: { counter: number; from: number; to: number; steps: number };
  lastAction: string;
};

type SpiralAction = { kind: 'move'; counter: number; steps: number };

type HexState = {
  phase: 'playing' | 'won';
  board: Array<string | null>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  winningPath?: number[];
  resultRevealAt?: number;
  lastPlacedIndex?: number;
  lastAction: string;
};

type HexAction = { kind: 'place'; to: number };

type FactorGameState = {
  phase: 'playing' | 'won' | 'tied';
  board: Array<string | null>;
  scores: Record<string, number>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  lastSelectedNumber?: number;
  lastScoredFactors: number[];
  lastSelectingPlayerId?: string;
  lastForfeitNumber?: number;
  rematchNumber: number;
  lastAction: string;
};

type FactorGameAction = { kind: 'select'; number: number };

type HedronState = {
  phase: 'playing' | 'won';
  walls: Array<string | null>;
  rooms: Array<string | null>;
  scores: Record<string, number>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  lastWallIndex?: number;
  lastClaimedRooms: number[];
  lastSelectingPlayerId?: string;
  lastAction: string;
};

type HedronAction = { kind: 'select-wall'; wall: number };


type MultiState = {
  phase: 'opening-first' | 'opening-second' | 'normal' | 'bonus-first' | 'bonus-second' | 'won' | 'tied';
  cells: Array<string | null>;
  largeBoards: Array<string | null>;
  tokenValues: [number | null, number | null];
  startingPlayerId: string;
  xPlayerId: string;
  oPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  winnerId?: string;
  winningLine?: number[];
  resultRevealAt?: number;
  lastProduct?: number;
  lastClaimedCells: number[];
  lastResolvedBoards: number[];
  bonusOriginalTokens?: [number, number];
  rematchNumber: number;
  lastAction: string;
};

type MultiAction = { kind: 'move-token'; token: 0 | 1; factor: number };


type UltimateTttState = {
  phase: 'playing' | 'won' | 'tied';
  cells: Array<string | null>;
  localBoards: Array<string | 'draw' | null>;
  startingPlayerId: string;
  xPlayerId: string;
  oPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  forcedBoard: number | null;
  winnerId?: string;
  winningLine?: number[];
  resultRevealAt?: number;
  lastPlacedIndex?: number;
  lastResolvedBoard?: number;
  rematchNumber: number;
  lastAction: string;
};

type UltimateTttAction = { kind: 'place'; index: number };


type LuckyThirteenState = {
  phase: 'playing' | 'won' | 'tied';
  values: Array<number | null>;
  owners: Array<string | null>;
  startingPlayerId: string;
  turnPlayerId: string;
  turnNumber: number;
  turnDeadline: number;
  rolledValue: number;
  winnerId?: string;
  winningLine?: number[];
  resultRevealAt?: number;
  lastPlacedIndex?: number;
  rematchNumber: number;
  lastAction: string;
};

type LuckyThirteenAction = { kind: 'place'; index: number };

type CrayWeather = 'good' | 'bad';

type CraypotsPlayerState = {
  cash: number;
  boats: number;
  pots: number;
  shallow: number;
  deep: number;
  placementLocked: boolean;
  shopLocked: boolean;
  lastIncome: number;
  destroyedDeep: number;
  boughtBoats: number;
  boughtPots: number;
};

type CraypotsState = {
  phase: 'placing' | 'weather' | 'shopping' | 'won' | 'tied';
  day: number;
  startingPlayerId: string;
  previousWeather: CrayWeather;
  weatherRoll?: number;
  weather?: CrayWeather;
  phaseDeadline: number;
  revealUntil?: number;
  players: Record<string, CraypotsPlayerState>;
  winnerId?: string;
  resultRevealAt?: number;
  rematchNumber: number;
  lastAction: string;
};

type CraypotsAction =
  | { kind: 'place-pots'; deep: number }
  | { kind: 'shop'; boats: number; pots: number; sellBoats?: number };

type Player = {
  id: string;
  name: string;
  normalizedName: string;
  deviceId: string;
  resumeToken: string;
  isHost: boolean;
  connected: boolean;
  points: number;
  isBot: boolean;
};

type PrecisionResult = {
  score: number;
  secondary: number;
  display: string;
  rounds: number[];
  submittedAt: number;
};

type PrecisionProgress = {
  round: number;
  label: string;
  value?: number;
};

type PrecisionState = {
  phase: 'playing' | 'results';
  gameId: string;
  seed: number;
  targets?: number[];
  results: Record<string, PrecisionResult>;
  progress: Record<string, PrecisionProgress>;
  winnerId?: string;
  resultRevealAt?: number;
};

type Match = {
  id: string;
  courtIndex: number;
  playerIds: [string, string];
  status: MatchStatus;
  startsAt?: number;
  winnerId?: string;
  startingPlayerId?: string;
  threeHexagon?: ThreeHexagonState;
  fourStar?: FourStarState;
  boxes?: BoxesState;
  neverTouch?: NeverTouchState;
  spiral?: SpiralState;
  hex?: HexState;
  factorGame?: FactorGameState;
  hedron?: HedronState;
  multi?: MultiState;
  ultimateTtt?: UltimateTttState;
  luckyThirteen?: LuckyThirteenState;
  craypots?: CraypotsState;
  precision?: PrecisionState;
  disconnectPause?: { playerId: string; graceUntil: number };
};

type Court = {
  index: number;
  activeMatch?: Match;
  waiting: string[];
};

type Room = {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  kickedNames: Set<string>;
  selectedGameId: string;
  phase: Phase;
  courts: Court[];
  hostParticipating: boolean;
  hostExitAfterMatch: boolean;
  turnSeconds: number;
  starterHistory: Map<string, string>;
  hexHorizontalHistory: Map<string, string>;
  lateJoinQueue: string[];
  currentChampionId?: string;
};

type ClientContext = {
  roomCode?: string;
  playerId?: string;
  deviceId?: string;
};

type ClientMessage =
  | { type: 'host-room'; name: string; deviceId: string }
  | { type: 'join-room'; name: string; roomCode: string; deviceId: string }
  | { type: 'resume'; roomCode: string; playerId: string; resumeToken: string; deviceId: string }
  | { type: 'select-game'; gameId: string }
  | { type: 'set-turn-seconds'; seconds: number }
  | { type: 'kick-player'; playerId: string }
  | { type: 'prepare-matchups' }
  | { type: 'begin-matchups' }
  | { type: 'resolve-match'; matchId: string; winnerId: string }
  | { type: 'precision-progress'; matchId: string; round: number; label: string; value?: number }
  | { type: 'precision-result'; matchId: string; score: number; secondary?: number; display: string; rounds?: number[] }
  | { type: 'three-hexagon-move'; matchId: string; action: ThreeHexagonAction }
  | { type: 'four-star-move'; matchId: string; action: FourStarAction }
  | { type: 'boxes-move'; matchId: string; action: BoxesAction }
  | { type: 'never-touch-move'; matchId: string; action: NeverTouchAction }
  | { type: 'spiral-move'; matchId: string; action: SpiralAction }
  | { type: 'hex-move'; matchId: string; action: HexAction }
  | { type: 'factor-game-move'; matchId: string; action: FactorGameAction }
  | { type: 'hedron-move'; matchId: string; action: HedronAction }
  | { type: 'multi-move'; matchId: string; action: MultiAction }
  | { type: 'ultimate-ttt-move'; matchId: string; action: UltimateTttAction }
  | { type: 'lucky-thirteen-move'; matchId: string; action: LuckyThirteenAction }
  | { type: 'craypots-move'; matchId: string; action: CraypotsAction }
  | { type: 'return-lobby' }
  | { type: 'ping'; sentAt: number };

const rooms = new Map<string, Room>();
const contexts = new WeakMap<WebSocket, ClientContext>();
const socketsByPlayer = new Map<string, WebSocket>();
const activeDevices = new Map<string, WebSocket>();

function normaliseName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function cleanName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 22);
}

function makeRoomCode() {
  const min = 10 ** (ROOM_CODE_DIGITS - 1);
  const range = 9 * min;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(min + Math.floor(Math.random() * range));
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to create a room code.');
}

function defaultTurnSeconds(gameId: string) {
  if (gameId === 'craypots') return 30;
  if (gameId === 'lights-out' || gameId === 'time-stop') return 10;
  return gameId === 'factor-game' || gameId === 'multi' ? 20 : 10;
}

function clampTurnSeconds(value: number) {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(120, Math.round(value)));
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function publicState(room: Room) {
  const players = [...room.players.values()].map(({ normalizedName, deviceId, resumeToken, ...p }) => p);
  return {
    type: 'room-state',
    room: {
      code: room.code,
      hostId: room.hostId,
      selectedGameId: room.selectedGameId,
      phase: room.phase,
      hostParticipating: room.hostParticipating,
      turnSeconds: room.turnSeconds,
      serverTime: Date.now(),
      lateJoinQueue: [...room.lateJoinQueue],
      currentChampionId: room.currentChampionId,
      players,
      courts: room.courts,
    },
  };
}

function broadcastRoom(room: Room) {
  const state = publicState(room);
  for (const player of room.players.values()) {
    const ws = socketsByPlayer.get(player.id);
    if (ws) send(ws, state);
  }
}

function getRoomFor(ws: WebSocket) {
  const ctx = contexts.get(ws);
  if (!ctx?.roomCode || !ctx.playerId) return undefined;
  const room = rooms.get(ctx.roomCode);
  if (!room) return undefined;
  return { ctx, room };
}

function requireHost(ws: WebSocket) {
  const result = getRoomFor(ws);
  if (!result) return undefined;
  if (result.room.hostId !== result.ctx.playerId) {
    send(ws, { type: 'error', code: 'host-only', message: 'Only the host can do that.' });
    return undefined;
  }
  return result;
}

function rejectDuplicateDevice(ws: WebSocket, deviceId: string) {
  const existing = activeDevices.get(deviceId);
  if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
    send(ws, {
      type: 'error',
      code: 'duplicate-device',
      message: 'This device is already logged into Minute to Win It. Close the other game tab first.',
    });
    return true;
  }
  return false;
}

function attachPlayer(ws: WebSocket, room: Room, player: Player) {
  player.connected = true;
  for (const court of room.courts) {
    const match = court.activeMatch;
    if (match?.disconnectPause?.playerId === player.id) match.disconnectPause = undefined;
  }
  contexts.set(ws, { roomCode: room.code, playerId: player.id, deviceId: player.deviceId });
  socketsByPlayer.set(player.id, ws);
  activeDevices.set(player.deviceId, ws);
  send(ws, {
    type: 'joined',
    roomCode: room.code,
    playerId: player.id,
    resumeToken: player.resumeToken,
    isHost: player.isHost,
  });
  broadcastRoom(room);
}

function createPlayer(name: string, deviceId: string, isHost: boolean): Player {
  const clean = cleanName(name);
  return {
    id: randomUUID(),
    name: clean,
    normalizedName: normaliseName(clean),
    deviceId,
    resumeToken: randomUUID(),
    isHost,
    connected: true,
    points: 0,
    isBot: false,
  };
}

function createPracticeBot(): Player {
  return {
    id: randomUUID(),
    name: 'Minute Bot',
    normalizedName: 'minute bot',
    deviceId: `minute-practice-bot-${randomUUID()}`,
    resumeToken: '',
    isHost: false,
    connected: true,
    points: 0,
    isBot: true,
  };
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeMatch(courtIndex: number, a: string, b: string, status: MatchStatus = 'ready'): Match {
  return { id: randomUUID(), courtIndex, playerIds: [a, b], status };
}

function starterIdentity(room: Room, playerId: string) {
  const player = room.players.get(playerId);
  // The solo-practice bot is recreated after returning to the lobby, so give it a
  // stable identity for first-turn history instead of using its temporary UUID.
  return player?.isBot ? 'practice-bot' : playerId;
}

function starterPairKey(room: Room, playerIds: [string, string]) {
  return playerIds.map((id) => starterIdentity(room, id)).sort().join('::');
}

function chooseStartingPlayer(room: Room, match: Match) {
  if (match.startingPlayerId && match.playerIds.includes(match.startingPlayerId)) {
    return match.startingPlayerId;
  }

  const [a, b] = match.playerIds;
  const pairKey = starterPairKey(room, match.playerIds);
  const previousStarterIdentity = room.starterHistory.get(pairKey);

  let startingPlayerId: string;
  if (!previousStarterIdentity) {
    // First meeting: random starter. Every later meeting between this same pair
    // alternates automatically from whoever started their previous meeting.
    startingPlayerId = Math.random() < 0.5 ? a : b;
  } else {
    startingPlayerId = starterIdentity(room, a) === previousStarterIdentity ? b : a;
  }

  match.startingPlayerId = startingPlayerId;
  room.starterHistory.set(pairKey, starterIdentity(room, startingPlayerId));
  return startingPlayerId;
}

function prepareCourts(room: Room) {
  room.hostExitAfterMatch = false;
  const host = room.players.get(room.hostId);
  if (!host?.connected) throw new Error('The host must be connected to create matchups.');

  // Practice bots exist only for the special host-alone test path.
  for (const [id, player] of room.players) {
    if (player.isBot) room.players.delete(id);
  }

  const students = [...room.players.values()].filter((p) => !p.isHost && !p.isBot && p.connected);
  let participants: Player[];

  if (students.length === 0) {
    const bot = createPracticeBot();
    room.players.set(bot.id, bot);
    room.hostParticipating = true;
    participants = [host, bot];
  } else {
    room.hostParticipating = students.length % 2 === 1;
    participants = room.hostParticipating ? [...students, host] : students;
  }

  const order = shuffled(participants.map((p) => p.id));
  room.courts = [];
  for (let i = 0; i < order.length; i += 2) {
    const courtIndex = i / 2;
    room.courts.push({
      index: courtIndex,
      activeMatch: makeMatch(courtIndex, order[i], order[i + 1], 'ready'),
      waiting: [],
    });
  }
  room.phase = 'matchups';
}

const THREE_HEX_EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 3],
  [2, 5], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6],
];

const THREE_HEX_LINES: number[][] = [
  // Only the three genuinely straight routes through the centre count as wins.
  // The two outer three-node paths bend at the middle-left / middle-right nodes
  // and are movement rails only, not winning lines.
  [2, 3, 4], // horizontal
  [0, 3, 6], // top-left to bottom-right
  [1, 3, 5], // top-right to bottom-left
];

function otherPlayer(match: Match, playerId: string) {
  return match.playerIds[0] === playerId ? match.playerIds[1] : match.playerIds[0];
}

function threeHexNeighbours(index: number) {
  const result: number[] = [];
  for (const [a, b] of THREE_HEX_EDGES) {
    if (a === index) result.push(b);
    else if (b === index) result.push(a);
  }
  return result;
}

function threeHexPhysicalActions(match: Match, playerId: string): ThreeHexagonAction[] {
  const state = match.threeHexagon;
  if (!state || state.phase === 'won') return [];
  if (state.phase === 'placing') {
    return state.board.flatMap((owner, index) => owner === null ? [{ kind: 'place' as const, to: index }] : []);
  }
  const actions: ThreeHexagonAction[] = [];
  state.board.forEach((owner, from) => {
    if (owner !== playerId) return;
    for (const to of threeHexNeighbours(from)) {
      if (state.board[to] === null) actions.push({ kind: 'move', from, to });
    }
  });
  return actions;
}

function isThreeHexReverse(action: ThreeHexagonAction, previous: { from: number; to: number } | null | undefined) {
  return !!previous && action.kind === 'move' && action.from === previous.to && action.to === previous.from;
}

function threeHexLegalActions(match: Match, playerId: string): ThreeHexagonAction[] {
  const state = match.threeHexagon;
  const physical = threeHexPhysicalActions(match, playerId);
  if (!state || state.phase !== 'moving' || !physical.length) return physical;

  const previous = state.lastMoveByPlayer[playerId];
  if (!previous) return physical;

  // Only the exact immediate reversal of this player's previous slide is
  // blocked. The same counter may move again on the next turn as long as it
  // continues to a different connected empty space instead of shuttling A↔B.
  return physical.filter((action) => !isThreeHexReverse(action, previous));
}

function threeHexAutoActions(match: Match, playerId: string): ThreeHexagonAction[] {
  // Bots/timeouts follow the same anti-stall rule as human players: any legal
  // move is allowed except the exact immediate reversal of the previous slide.
  return threeHexLegalActions(match, playerId);
}

function threeHexWinningLine(board: Array<string | null>, playerId: string) {
  return THREE_HEX_LINES.find((line) => line.every((index) => board[index] === playerId));
}

function sameThreeHexAction(a: ThreeHexagonAction, b: ThreeHexagonAction) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'place' && b.kind === 'place') return a.to === b.to;
  return a.kind === 'move' && b.kind === 'move' && a.from === b.from && a.to === b.to;
}

function findLiveMatch(room: Room, matchId: string) {
  const court = room.courts.find((candidate) => candidate.activeMatch?.id === matchId);
  const match = court?.activeMatch;
  return court && match ? { court, match } : undefined;
}

function finishThreeHexagon(room: Room, court: Court, match: Match, winnerId: string, winningLine: number[]) {
  const state = match.threeHexagon;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningLine = winningLine;
  state.resultRevealAt = Date.now() + 2000;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} made three in a straight line!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.threeHexagon?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved by the host returning to the lobby.
    }
  }, 4200);
}

function scheduleThreeHexTurn(room: Room, court: Court, match: Match) {
  const state = match.threeHexagon;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;

  // Preserve the original Three Hexagon rule: if there is physically no legal
  // slide, that player simply misses the turn.
  const physical = threeHexPhysicalActions(match, state.turnPlayerId);
  const legal = threeHexLegalActions(match, state.turnPlayerId);
  if (state.phase === 'moving' && physical.length === 0) {
    const blocked = room.players.get(state.turnPlayerId)?.name || 'Player';
    state.turnPlayerId = otherPlayer(match, state.turnPlayerId);
    state.turnNumber += 1;
    state.lastAction = `${blocked} had no legal slide, so the turn was skipped.`;
    state.turnDeadline = Date.now() + room.turnSeconds * 1000;
    broadcastRoom(room);
    scheduleThreeHexTurn(room, court, match);
    return;
  }
  // If only the immediate backwards repeat is available, skip this turn rather
  // than allowing an endless shuttle. This does not change the physical
  // no-move rule above; it is an anti-repetition restriction.
  if (state.phase === 'moving' && legal.length === 0) {
    const blocked = room.players.get(state.turnPlayerId)?.name || 'Player';
    state.turnPlayerId = otherPlayer(match, state.turnPlayerId);
    state.turnNumber += 1;
    state.lastAction = `${blocked} could only move straight back to the previous space, so the turn was skipped.`;
    state.turnDeadline = Date.now() + room.turnSeconds * 1000;
    broadcastRoom(room);
    scheduleThreeHexTurn(room, court, match);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(550, room.turnSeconds * 180), Math.max(650, room.turnSeconds * 1000 - 300));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.threeHexagon;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const options = threeHexAutoActions(live.match, scheduledPlayer);
      if (!options.length) return;
      const choice = options[Math.floor(Math.random() * options.length)];
      applyThreeHexAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.threeHexagon;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const options = threeHexAutoActions(live.match, scheduledPlayer);
    if (!options.length) {
      scheduleThreeHexTurn(room, live.court, live.match);
      return;
    }
    const choice = options[Math.floor(Math.random() * options.length)];
    applyThreeHexAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyThreeHexAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: ThreeHexagonAction,
  source: 'player' | 'timeout' | 'bot',
) {
  const state = match.threeHexagon;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('Three Hexagon is not currently accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');

  const legal = threeHexLegalActions(match, playerId);
  if (!legal.some((candidate) => sameThreeHexAction(candidate, action))) throw new Error('That is not a legal Three Hexagon move.');

  if (action.kind === 'place') {
    state.board[action.to] = playerId;
  } else {
    state.board[action.from] = null;
    state.board[action.to] = playerId;
    state.lastMoveByPlayer[playerId] = { from: action.from, to: action.to };
  }

  const playerName = room.players.get(playerId)?.name || 'Player';
  const sourceText = source === 'timeout' ? 'Time expired — the server made a legal non-reversing move.' : source === 'bot' ? `${playerName} made a move.` : `${playerName} moved.`;
  state.lastAction = sourceText;

  const winningLine = threeHexWinningLine(state.board, playerId);
  if (winningLine) {
    finishThreeHexagon(room, court, match, playerId, winningLine);
    return;
  }

  if (state.phase === 'placing' && state.board.filter(Boolean).length === 6) state.phase = 'moving';
  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleThreeHexTurn(room, court, match);
}

function startThreeHexagon(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.threeHexagon = {
    phase: 'placing',
    board: Array(7).fill(null),
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastMoveByPlayer: { [match.playerIds[0]]: null, [match.playerIds[1]]: null },
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Place one counter.`,
  };
  scheduleThreeHexTurn(room, court, match);
}

const FOUR_STAR_EDGES: Array<[number, number]> = [
  [0, 2], [0, 3],
  [1, 2], [2, 3], [3, 4],
  [1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 7],
  [5, 6], [6, 7],
  [5, 8], [5, 9], [6, 9], [6, 10], [7, 10], [7, 11],
  [8, 9], [9, 10], [10, 11],
  [9, 12], [10, 12],
];

const FOUR_STAR_LINES: number[][] = [
  [1, 2, 3, 4],     // upper horizontal
  [8, 9, 10, 11],   // lower horizontal
  [0, 2, 5, 8],     // apex down-left
  [0, 3, 7, 11],    // apex down-right
  [1, 5, 9, 12],    // left edge down to bottom apex
  [4, 7, 10, 12],   // right edge down to bottom apex
];

function fourStarNeighbours(index: number) {
  const result: number[] = [];
  for (const [a, b] of FOUR_STAR_EDGES) {
    if (a === index) result.push(b);
    else if (b === index) result.push(a);
  }
  return result;
}

function fourStarPhysicalActions(match: Match, playerId: string): FourStarAction[] {
  const state = match.fourStar;
  if (!state || state.phase === 'won') return [];
  if (state.phase === 'placing') {
    return state.board.flatMap((owner, index) => owner === null ? [{ kind: 'place' as const, to: index }] : []);
  }
  const actions: FourStarAction[] = [];
  state.board.forEach((owner, from) => {
    if (owner !== playerId) return;
    for (const to of fourStarNeighbours(from)) {
      if (state.board[to] === null) actions.push({ kind: 'move', from, to });
    }
  });
  return actions;
}

function isFourStarReverse(action: FourStarAction, previous: { from: number; to: number } | null | undefined) {
  return !!previous && action.kind === 'move' && action.from === previous.to && action.to === previous.from;
}

function fourStarLegalActions(match: Match, playerId: string): FourStarAction[] {
  const state = match.fourStar;
  const physical = fourStarPhysicalActions(match, playerId);
  if (!state || state.phase !== 'moving' || !physical.length) return physical;
  const previous = state.lastMoveByPlayer[playerId];
  if (!previous) return physical;

  // Only block the exact A→B then B→A shuttle. Moving that same counter from
  // B→C on the player's next turn is perfectly legal, even if other counters
  // could also move.
  return physical.filter((action) => !isFourStarReverse(action, previous));
}

function fourStarAutoActions(match: Match, playerId: string): FourStarAction[] {
  return fourStarLegalActions(match, playerId);
}

function fourStarWinningLine(board: Array<string | null>, playerId: string) {
  return FOUR_STAR_LINES.find((line) => line.every((index) => board[index] === playerId));
}

function sameFourStarAction(a: FourStarAction, b: FourStarAction) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'place' && b.kind === 'place') return a.to === b.to;
  return a.kind === 'move' && b.kind === 'move' && a.from === b.from && a.to === b.to;
}

function finishFourStar(room: Room, court: Court, match: Match, winnerId: string, winningLine: number[]) {
  const state = match.fourStar;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningLine = winningLine;
  state.resultRevealAt = Date.now() + 2000;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} made four counters in a straight line!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.fourStar?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved by the host returning to the lobby.
    }
  }, 4200);
}

function scheduleFourStarTurn(room: Room, court: Court, match: Match) {
  const state = match.fourStar;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;

  const physical = fourStarPhysicalActions(match, state.turnPlayerId);
  const legal = fourStarLegalActions(match, state.turnPlayerId);
  if (state.phase === 'moving' && physical.length === 0) {
    const blocked = room.players.get(state.turnPlayerId)?.name || 'Player';
    state.turnPlayerId = otherPlayer(match, state.turnPlayerId);
    state.turnNumber += 1;
    state.lastAction = `${blocked} had no legal slide, so the turn was skipped.`;
    state.turnDeadline = Date.now() + room.turnSeconds * 1000;
    broadcastRoom(room);
    setTimeout(() => scheduleFourStarTurn(room, court, match), 80);
    return;
  }
  if (state.phase === 'moving' && legal.length === 0) {
    const blocked = room.players.get(state.turnPlayerId)?.name || 'Player';
    state.turnPlayerId = otherPlayer(match, state.turnPlayerId);
    state.turnNumber += 1;
    state.lastAction = `${blocked} could only reverse the previous move, so the turn was skipped.`;
    state.turnDeadline = Date.now() + room.turnSeconds * 1000;
    broadcastRoom(room);
    setTimeout(() => scheduleFourStarTurn(room, court, match), 80);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(550, room.turnSeconds * 180), Math.max(650, room.turnSeconds * 1000 - 300));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.fourStar;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const options = fourStarAutoActions(live.match, scheduledPlayer);
      if (!options.length) return;
      const choice = options[Math.floor(Math.random() * options.length)];
      applyFourStarAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.fourStar;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const options = fourStarAutoActions(live.match, scheduledPlayer);
    if (!options.length) {
      scheduleFourStarTurn(room, live.court, live.match);
      return;
    }
    const choice = options[Math.floor(Math.random() * options.length)];
    applyFourStarAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyFourStarAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: FourStarAction,
  source: 'player' | 'timeout' | 'bot',
) {
  const state = match.fourStar;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('Four Star is not currently accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');

  const legal = fourStarLegalActions(match, playerId);
  if (!legal.some((candidate) => sameFourStarAction(candidate, action))) throw new Error('That is not a legal Four Star move.');

  if (action.kind === 'place') {
    state.board[action.to] = playerId;
  } else {
    state.board[action.from] = null;
    state.board[action.to] = playerId;
    state.lastMoveByPlayer[playerId] = { from: action.from, to: action.to };
  }

  const playerName = room.players.get(playerId)?.name || 'Player';
  state.lastAction = source === 'timeout'
    ? 'Time expired — the server made a legal non-reversing move.'
    : source === 'bot'
      ? `${playerName} made a move.`
      : `${playerName} moved.`;

  const winningLine = fourStarWinningLine(state.board, playerId);
  if (winningLine) {
    finishFourStar(room, court, match, playerId, winningLine);
    return;
  }

  if (state.phase === 'placing' && state.board.filter(Boolean).length === 8) state.phase = 'moving';
  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleFourStarTurn(room, court, match);
}

function startFourStar(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.fourStar = {
    phase: 'placing',
    board: Array(13).fill(null),
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastMoveByPlayer: { [match.playerIds[0]]: null, [match.playerIds[1]]: null },
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Place one counter.`,
  };
  scheduleFourStarTurn(room, court, match);
}

const BOXES_SQUARES: number[][] = [
  [0, 3, 12, 13], [1, 4, 13, 14], [2, 5, 14, 15],
  [3, 6, 16, 17], [4, 7, 17, 18], [5, 8, 18, 19],
  [6, 9, 20, 21], [7, 10, 21, 22], [8, 11, 22, 23],
];

function boxesLegalActions(match: Match): BoxesAction[] {
  const state = match.boxes;
  if (!state || state.phase === 'won') return [];
  return state.edges.flatMap((owner, edge) => owner === null ? [{ kind: 'draw' as const, edge }] : []);
}

function sameBoxesAction(a: BoxesAction, b: BoxesAction) {
  return a.kind === b.kind && a.edge === b.edge;
}

function boxesCompletionCountIfDrawn(state: BoxesState, edge: number) {
  let count = 0;
  for (let boxIndex = 0; boxIndex < BOXES_SQUARES.length; boxIndex++) {
    if (state.boxes[boxIndex]) continue;
    const squareEdges = BOXES_SQUARES[boxIndex];
    if (!squareEdges.includes(edge)) continue;
    if (squareEdges.every((candidate) => candidate === edge || state.edges[candidate] !== null)) count += 1;
  }
  return count;
}

function chooseBoxesAutoAction(match: Match) {
  const state = match.boxes;
  const legal = boxesLegalActions(match);
  if (!state || !legal.length) return undefined;
  // Take a box when one is immediately available; otherwise choose randomly.
  const scored = legal.map((action) => ({ action, completes: boxesCompletionCountIfDrawn(state, action.edge) }));
  const best = Math.max(...scored.map((candidate) => candidate.completes));
  const pool = best > 0 ? scored.filter((candidate) => candidate.completes === best) : scored;
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function finishBoxes(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.boxes;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.turnDeadline = 0;
  const a = match.playerIds[0];
  const b = match.playerIds[1];
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} wins ${state.scores[winnerId] ?? 0}-${state.scores[winnerId === a ? b : a] ?? 0}!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.boxes?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved by the host returning to the lobby.
    }
  }, 1800);
}

function scheduleBoxesTurn(room: Room, court: Court, match: Match) {
  const state = match.boxes;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;
  const legal = boxesLegalActions(match);
  if (!legal.length) return;

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 190), Math.max(750, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.boxes;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseBoxesAutoAction(live.match);
      if (choice) applyBoxesAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.boxes;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const choice = chooseBoxesAutoAction(live.match);
    if (choice) applyBoxesAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyBoxesAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: BoxesAction,
  source: 'player' | 'timeout' | 'bot',
) {
  const state = match.boxes;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('Boxes is not currently accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');
  if (!boxesLegalActions(match).some((candidate) => sameBoxesAction(candidate, action))) throw new Error('That line has already been drawn.');

  state.edges[action.edge] = playerId;
  const completed: number[] = [];
  for (let boxIndex = 0; boxIndex < BOXES_SQUARES.length; boxIndex++) {
    if (state.boxes[boxIndex]) continue;
    if (BOXES_SQUARES[boxIndex].every((edge) => state.edges[edge] !== null)) {
      state.boxes[boxIndex] = playerId;
      completed.push(boxIndex);
    }
  }
  state.lastCompletedBoxes = completed;
  if (completed.length) state.scores[playerId] = (state.scores[playerId] || 0) + completed.length;

  const playerName = room.players.get(playerId)?.name || 'Player';
  if (source === 'timeout') {
    state.lastAction = completed.length
      ? `Time expired — the automatic line completed ${completed.length === 2 ? 'two boxes' : 'a box'}, so ${playerName} goes again.`
      : 'Time expired — a random legal line was drawn.';
  } else if (source === 'bot') {
    state.lastAction = completed.length
      ? `${playerName} completed ${completed.length === 2 ? 'two boxes' : 'a box'} and gets another go.`
      : `${playerName} drew a line.`;
  } else {
    state.lastAction = completed.length
      ? `${playerName} completed ${completed.length === 2 ? 'two boxes' : 'a box'} and gets another go!`
      : `${playerName} drew a line.`;
  }

  if (state.boxes.every(Boolean)) {
    const [a, b] = match.playerIds;
    const winnerId = (state.scores[a] || 0) > (state.scores[b] || 0) ? a : b;
    finishBoxes(room, court, match, winnerId);
    return;
  }

  if (!completed.length) state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleBoxesTurn(room, court, match);
}

function startBoxes(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.boxes = {
    phase: 'playing',
    edges: Array(24).fill(null),
    boxes: Array(9).fill(null),
    scores: { [match.playerIds[0]]: 0, [match.playerIds[1]]: 0 },
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastCompletedBoxes: [],
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Join two neighbouring dots.`,
  };
  scheduleBoxesTurn(room, court, match);
}

const NEVER_TOUCH_SIZE = 4;

function neverTouchNeighbours(index: number) {
  const row = Math.floor(index / NEVER_TOUCH_SIZE);
  const col = index % NEVER_TOUCH_SIZE;
  const neighbours: number[] = [];
  if (row > 0) neighbours.push(index - NEVER_TOUCH_SIZE);
  if (row < NEVER_TOUCH_SIZE - 1) neighbours.push(index + NEVER_TOUCH_SIZE);
  if (col > 0) neighbours.push(index - 1);
  if (col < NEVER_TOUCH_SIZE - 1) neighbours.push(index + 1);
  return neighbours;
}

function neverTouchLegalActions(match: Match, playerId: string): NeverTouchAction[] {
  const state = match.neverTouch;
  if (!state || state.phase === 'won') return [];
  return state.board.flatMap((owner, index) => {
    if (owner !== null) return [];
    const touchesOwn = neverTouchNeighbours(index).some((neighbour) => state.board[neighbour] === playerId);
    return touchesOwn ? [] : [{ kind: 'place' as const, to: index }];
  });
}

function sameNeverTouchAction(a: NeverTouchAction, b: NeverTouchAction) {
  return a.kind === b.kind && a.to === b.to;
}

function chooseNeverTouchBotAction(match: Match, playerId: string) {
  const state = match.neverTouch;
  const legal = neverTouchLegalActions(match, playerId);
  if (!state || !legal.length) return undefined;

  // Prefer moves that leave the opponent with fewer legal placements. Ties are
  // random so the practice bot is useful without becoming perfectly predictable.
  const opponentId = otherPlayer(match, playerId);
  const scored = legal.map((action) => {
    const previous = state.board[action.to];
    state.board[action.to] = playerId;
    const opponentOptions = neverTouchLegalActions(match, opponentId).length;
    state.board[action.to] = previous;
    return { action, opponentOptions };
  });
  const best = Math.min(...scored.map((candidate) => candidate.opponentOptions));
  const pool = scored.filter((candidate) => candidate.opponentOptions === best);
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function finishNeverTouch(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.neverTouch;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.turnDeadline = 0;
  const loserId = otherPlayer(match, winnerId);
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} made the last legal mark. ${room.players.get(loserId)?.name || 'Opponent'} has no legal square.`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.neverTouch?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved by the host returning to the lobby.
    }
  }, 1800);
}

function scheduleNeverTouchTurn(room: Room, court: Court, match: Match) {
  const state = match.neverTouch;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;

  const legal = neverTouchLegalActions(match, state.turnPlayerId);
  if (!legal.length) {
    finishNeverTouch(room, court, match, otherPlayer(match, state.turnPlayerId));
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 190), Math.max(750, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.neverTouch;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseNeverTouchBotAction(live.match, scheduledPlayer);
      if (choice) applyNeverTouchAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.neverTouch;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const legalNow = neverTouchLegalActions(live.match, scheduledPlayer);
    if (!legalNow.length) {
      finishNeverTouch(room, live.court, live.match, otherPlayer(live.match, scheduledPlayer));
      return;
    }
    // Timeouts deliberately make a random legal choice, matching the room-wide
    // Dodeca-Gems rule that running out of decision time cannot be a strategy.
    const choice = legalNow[Math.floor(Math.random() * legalNow.length)];
    applyNeverTouchAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyNeverTouchAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: NeverTouchAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.neverTouch;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('That Never Touch match is not playable.');
  if (state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
  const legal = neverTouchLegalActions(match, playerId);
  if (!legal.some((candidate) => sameNeverTouchAction(candidate, action))) {
    throw new Error('That square is not legal. Your own marks may not share an edge.');
  }

  state.board[action.to] = playerId;
  state.lastPlacedIndex = action.to;
  const playerName = room.players.get(playerId)?.name || 'Player';
  const opponentId = otherPlayer(match, playerId);
  const opponentLegal = neverTouchLegalActions(match, opponentId);

  if (!opponentLegal.length) {
    state.lastAction = source === 'timeout'
      ? `Time expired — a legal mark was placed automatically. ${playerName} made the last legal mark!`
      : `${playerName} made the last legal mark!`;
    finishNeverTouch(room, court, match, playerId);
    return;
  }

  state.turnPlayerId = opponentId;
  state.turnNumber += 1;
  state.lastAction = source === 'timeout'
    ? `Time expired — a legal square was chosen automatically for ${playerName}.`
    : source === 'bot'
      ? `${playerName} placed a mark.`
      : `${playerName} placed a mark.`;
  scheduleNeverTouchTurn(room, court, match);
}

function startNeverTouch(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.neverTouch = {
    phase: 'playing',
    board: Array(NEVER_TOUCH_SIZE * NEVER_TOUCH_SIZE).fill(null),
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first as X. Choose any square.`,
  };
  scheduleNeverTouchTurn(room, court, match);
}

const SPIRAL_FINISH = 18;
const SPIRAL_STARTS = [0, 5, 10, 14];

function spiralLegalActions(match: Match): SpiralAction[] {
  const state = match.spiral;
  if (!state || state.phase === 'won') return [];
  const actions: SpiralAction[] = [];
  for (let counter = 0; counter < state.counters.length; counter++) {
    const from = state.counters[counter];
    if (from >= SPIRAL_FINISH) continue;
    for (let steps = 1; steps <= 3; steps++) {
      const to = from + steps;
      if (to > SPIRAL_FINISH) continue;
      const blocked = state.counters.some((position, otherCounter) => {
        if (otherCounter === counter || position >= SPIRAL_FINISH) return false;
        return position > from && position <= to;
      });
      if (!blocked) actions.push({ kind: 'move', counter, steps });
    }
  }
  return actions;
}

function sameSpiralAction(a: SpiralAction, b: SpiralAction) {
  return a.kind === b.kind && a.counter === b.counter && a.steps === b.steps;
}

function chooseSpiralBotAction(match: Match) {
  const state = match.spiral;
  const legal = spiralLegalActions(match);
  if (!state || !legal.length) return undefined;
  // Keep solo tests moving: prefer progress and sliding a counter into HOME,
  // while retaining a little variety between equally strong moves.
  const scored = legal.map((action) => {
    const to = state.counters[action.counter] + action.steps;
    const finishBonus = to === SPIRAL_FINISH ? 6 : 0;
    return { action, score: action.steps + finishBonus };
  });
  const best = Math.max(...scored.map((candidate) => candidate.score));
  const pool = scored.filter((candidate) => candidate.score === best);
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function finishSpiral(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.spiral;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} slid the final counter into HOME!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.spiral?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved if the host returned to the lobby.
    }
  }, 1800);
}

function scheduleSpiralTurn(room: Room, court: Court, match: Match) {
  const state = match.spiral;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;
  const legal = spiralLegalActions(match);
  // With forward-only movement the leading unfinished counter can always move,
  // so an unfinished Spiral position should never be a stalemate.
  if (!legal.length) {
    const unfinished = state.counters.some((position) => position < SPIRAL_FINISH);
    if (!unfinished) {
      finishSpiral(room, court, match, otherPlayer(match, state.turnPlayerId));
      return;
    }
    throw new Error('Spiral reached an invalid blocked position.');
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 180), Math.max(750, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.spiral;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseSpiralBotAction(live.match);
      if (choice) applySpiralAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.spiral;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const legalNow = spiralLegalActions(live.match);
    if (!legalNow.length) return;
    const choice = legalNow[Math.floor(Math.random() * legalNow.length)];
    applySpiralAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applySpiralAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: SpiralAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.spiral;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('That Spiral match is not playable.');
  if (state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
  const legal = spiralLegalActions(match);
  if (!legal.some((candidate) => sameSpiralAction(candidate, action))) {
    throw new Error('That Spiral move is not legal. Counters cannot land on, jump over or pass another counter.');
  }

  const from = state.counters[action.counter];
  const to = from + action.steps;
  state.counters[action.counter] = to;
  state.lastMovedCounter = action.counter;
  state.lastMove = { counter: action.counter, from, to, steps: action.steps };
  const playerName = room.players.get(playerId)?.name || 'Player';
  const counterName = `Counter ${action.counter + 1}`;
  const destination = to === SPIRAL_FINISH ? 'HOME' : `${action.steps} spot${action.steps === 1 ? '' : 's'}`;
  state.lastAction = source === 'timeout'
    ? `Time expired — ${counterName} moved ${destination} automatically.`
    : source === 'bot'
      ? `${playerName} moved ${counterName} ${destination}.`
      : `${playerName} moved ${counterName} ${destination}.`;

  if (state.counters.every((position) => position >= SPIRAL_FINISH)) {
    finishSpiral(room, court, match, playerId);
    return;
  }

  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleSpiralTurn(room, court, match);
}

function startSpiral(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.spiral = {
    phase: 'playing',
    counters: [...SPIRAL_STARTS],
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Move any counter 1, 2 or 3 spots toward HOME.`,
  };
  scheduleSpiralTurn(room, court, match);
}


const HEX_SIZE = 11;

function hexNeighbours(index: number) {
  const row = Math.floor(index / HEX_SIZE);
  const col = index % HEX_SIZE;
  const neighbours: number[] = [];
  const offsets = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
  for (const [dr, dc] of offsets) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < HEX_SIZE && c >= 0 && c < HEX_SIZE) neighbours.push(r * HEX_SIZE + c);
  }
  return neighbours;
}

function hexLegalActions(match: Match): HexAction[] {
  const state = match.hex;
  if (!state || state.phase === 'won') return [];
  return state.board.flatMap((owner, index) => owner === null ? [{ kind: 'place' as const, to: index }] : []);
}

function sameHexAction(a: HexAction, b: HexAction) {
  return a.kind === b.kind && a.to === b.to;
}

function hexWinningPath(match: Match, playerId: string) {
  const state = match.hex;
  if (!state) return undefined;
  const playerIndex = match.playerIds.indexOf(playerId);
  if (playerIndex < 0) return undefined;

  const starts: number[] = [];
  const isGoal = (index: number) => {
    const row = Math.floor(index / HEX_SIZE);
    const col = index % HEX_SIZE;
    return playerIndex === 0 ? col === HEX_SIZE - 1 : row === HEX_SIZE - 1;
  };

  if (playerIndex === 0) {
    for (let row = 0; row < HEX_SIZE; row++) {
      const index = row * HEX_SIZE;
      if (state.board[index] === playerId) starts.push(index);
    }
  } else {
    for (let col = 0; col < HEX_SIZE; col++) {
      if (state.board[col] === playerId) starts.push(col);
    }
  }

  const queue = [...starts];
  const previous = new Map<number, number | null>();
  for (const start of starts) previous.set(start, null);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (isGoal(current)) {
      const path: number[] = [];
      let cursor: number | null | undefined = current;
      while (cursor !== null && cursor !== undefined) {
        path.push(cursor);
        cursor = previous.get(cursor);
      }
      return path.reverse();
    }
    for (const next of hexNeighbours(current)) {
      if (state.board[next] !== playerId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  return undefined;
}

function hexImmediateWinningMove(match: Match, playerId: string) {
  const state = match.hex;
  if (!state) return undefined;
  for (const action of hexLegalActions(match)) {
    state.board[action.to] = playerId;
    const wins = Boolean(hexWinningPath(match, playerId));
    state.board[action.to] = null;
    if (wins) return action;
  }
  return undefined;
}

function chooseHexBotAction(match: Match, playerId: string) {
  const state = match.hex;
  const legal = hexLegalActions(match);
  if (!state || !legal.length) return undefined;

  const immediate = hexImmediateWinningMove(match, playerId);
  if (immediate) return immediate;
  const opponentId = otherPlayer(match, playerId);
  const block = hexImmediateWinningMove(match, opponentId);
  if (block) return block;

  // Prefer cells that extend the bot's chain, interfere with the opponent, and
  // remain near the useful central lanes. Random tie-breaking keeps practice fun.
  const playerIndex = match.playerIds.indexOf(playerId);
  const scored = legal.map((action) => {
    const row = Math.floor(action.to / HEX_SIZE);
    const col = action.to % HEX_SIZE;
    const neighbours = hexNeighbours(action.to);
    const ownAdj = neighbours.filter((i) => state.board[i] === playerId).length;
    const oppAdj = neighbours.filter((i) => state.board[i] === opponentId).length;
    const centre = 5 - Math.abs(row - 5) * .35 - Math.abs(col - 5) * .35;
    const axis = playerIndex === 0 ? (5 - Math.abs(row - 5)) * .18 : (5 - Math.abs(col - 5)) * .18;
    return { action, score: ownAdj * 4 + oppAdj * 2.2 + centre + axis + Math.random() * .6 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.action;
}

function finishHex(room: Room, court: Court, match: Match, winnerId: string, path: number[]) {
  const state = match.hex;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningPath = path;
  state.resultRevealAt = Date.now() + 2000;
  state.turnDeadline = 0;
  const playerIndex = match.playerIds.indexOf(winnerId);
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} completed a ${playerIndex === 0 ? 'left-to-right' : 'top-to-bottom'} chain!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.hex?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved if the host returned to the lobby.
    }
  }, 4200);
}

function scheduleHexTurn(room: Room, court: Court, match: Match) {
  const state = match.hex;
  if (!state || state.phase === 'won' || match.status !== 'playing') return;
  const legal = hexLegalActions(match);
  if (!legal.length) {
    // A completely filled Hex board always has a connecting player. This is a
    // defensive fallback only; it ensures Dodeca-Gems never records a draw.
    const aPath = hexWinningPath(match, match.playerIds[0]);
    const bPath = hexWinningPath(match, match.playerIds[1]);
    if (aPath) finishHex(room, court, match, match.playerIds[0], aPath);
    else if (bPath) finishHex(room, court, match, match.playerIds[1], bPath);
    else finishHex(room, court, match, otherPlayer(match, state.turnPlayerId), []);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 175), Math.max(800, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.hex;
      if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseHexBotAction(live.match, scheduledPlayer);
      if (choice) applyHexAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.hex;
    if (!live || !current || current.phase === 'won' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const legalNow = hexLegalActions(live.match);
    if (!legalNow.length) return;
    const choice = legalNow[Math.floor(Math.random() * legalNow.length)];
    applyHexAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyHexAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: HexAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.hex;
  if (!state || state.phase === 'won' || match.status !== 'playing') throw new Error('That Hex match is not playable.');
  if (state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
  if (!hexLegalActions(match).some((candidate) => sameHexAction(candidate, action))) throw new Error('That mini-hexagon has already been claimed.');

  state.board[action.to] = playerId;
  state.lastPlacedIndex = action.to;
  const playerName = room.players.get(playerId)?.name || 'Player';
  const path = hexWinningPath(match, playerId);
  state.lastAction = source === 'timeout'
    ? `Time expired — an empty mini-hexagon was claimed automatically for ${playerName}.`
    : `${playerName} claimed a mini-hexagon.`;
  if (path) {
    finishHex(room, court, match, playerId, path);
    return;
  }

  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleHexTurn(room, court, match);
}

function startHex(room: Room, court: Court, match: Match) {
  // Hex sides are separate from first-turn fairness. The first time a pair meets,
  // the match's current Player 1 is cyan / LEFT↔RIGHT. Every later meeting swaps
  // which player gets that side, so repeated opponents alternate cyan and pink.
  const pairKey = starterPairKey(room, match.playerIds);
  const previousHorizontalIdentity = room.hexHorizontalHistory.get(pairKey);
  const [a, b] = match.playerIds;
  let horizontalPlayerId = a;
  if (previousHorizontalIdentity) {
    horizontalPlayerId = starterIdentity(room, a) === previousHorizontalIdentity ? b : a;
  }
  const verticalPlayerId = horizontalPlayerId === a ? b : a;
  match.playerIds = [horizontalPlayerId, verticalPlayerId];
  room.hexHorizontalHistory.set(pairKey, starterIdentity(room, horizontalPlayerId));

  const startingPlayerId = chooseStartingPlayer(room, match);
  const playerIndex = match.playerIds.indexOf(startingPlayerId);
  match.hex = {
    phase: 'playing',
    board: Array(HEX_SIZE * HEX_SIZE).fill(null),
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    winningPath: [],
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. ${playerIndex === 0 ? 'Connect LEFT to RIGHT.' : 'Connect TOP to BOTTOM.'}`,
  };
  scheduleHexTurn(room, court, match);
}

const FACTOR_MAX = 49;

function factorAvailableProperFactors(state: FactorGameState, number: number) {
  const factors: number[] = [];
  for (let candidate = 1; candidate < number; candidate++) {
    if (number % candidate === 0 && state.board[candidate - 1] === null) factors.push(candidate);
  }
  return factors;
}

function factorLegalScoringActions(match: Match): FactorGameAction[] {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing') return [];
  const actions: FactorGameAction[] = [];
  for (let number = 1; number <= FACTOR_MAX; number++) {
    if (state.board[number - 1] !== null) continue;
    if (factorAvailableProperFactors(state, number).length) actions.push({ kind: 'select', number });
  }
  return actions;
}

function chooseFactorBotAction(match: Match, playerId: string) {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing') return undefined;

  const available: FactorGameAction[] = [];
  for (let number = 1; number <= FACTOR_MAX; number++) {
    if (state.board[number - 1] === null) available.push({ kind: 'select', number });
  }
  if (!available.length) return undefined;

  const legal = factorLegalScoringActions(match);
  if (!legal.length) return available[Math.floor(Math.random() * available.length)];

  // Gem Bot is intentionally beatable in Factor Game. It still understands the
  // scoring rule, but it does not calculate the strongest move every turn.
  // Occasionally it makes a completely human-style choice, which can include a
  // number with no remaining factors and therefore cost it the turn.
  if (Math.random() < 0.12) {
    return available[Math.floor(Math.random() * available.length)];
  }

  const opponentId = otherPlayer(match, playerId);
  const myScore = state.scores[playerId] || 0;
  const opponentScore = state.scores[opponentId] || 0;
  const ranked = legal.map((action) => {
    const factors = factorAvailableProperFactors(state, action.number);
    const factorTotal = factors.reduce((sum, value) => sum + value, 0);
    const immediateMargin = action.number - factorTotal;
    const projectedMargin = (myScore + action.number) - (opponentScore + factorTotal);
    return { action, score: immediateMargin * 1.5 + projectedMargin * .2 };
  });
  ranked.sort((a, b) => b.score - a.score);

  const roll = Math.random();
  let pool: typeof ranked;
  if (roll < 0.48) {
    // Usually notice one of the better moves, but not necessarily the very best.
    pool = ranked.slice(0, Math.min(3, ranked.length));
  } else if (roll < 0.82) {
    // Often settle for a merely reasonable move from the better half of the board.
    pool = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
  } else {
    // Sometimes choose any scoring move, even when a much stronger option exists.
    pool = ranked;
  }
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function finishFactorGame(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing') return;
  const loserId = otherPlayer(match, winnerId);
  state.phase = 'won';
  state.winnerId = winnerId;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} wins ${state.scores[winnerId] || 0}-${state.scores[loserId] || 0}!`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.factorGame?.winnerId !== winnerId) return;
    try {
      resolveMatch(room, expectedMatchId, winnerId);
    } catch {
      // Match may already have been resolved if the host returned to the lobby.
    }
  }, 2200);
}

function restartTiedFactorGame(room: Room, court: Court, match: Match) {
  const state = match.factorGame;
  if (!state || state.phase !== 'tied' || match.status !== 'playing') return;
  const nextStarter = otherPlayer(match, state.startingPlayerId);
  const nextRematch = state.rematchNumber + 1;
  match.factorGame = {
    phase: 'playing',
    board: Array(FACTOR_MAX).fill(null),
    scores: { [match.playerIds[0]]: 0, [match.playerIds[1]]: 0 },
    startingPlayerId: nextStarter,
    turnPlayerId: nextStarter,
    turnNumber: 1,
    turnDeadline: 0,
    lastScoredFactors: [],
    rematchNumber: nextRematch,
    lastAction: `Scores were tied, so a fresh Factor Game begins. ${room.players.get(nextStarter)?.name || 'Player'} goes first.`,
  };
  scheduleFactorTurn(room, court, match);
}

function finishOrTieFactorGame(room: Room, court: Court, match: Match) {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing') return;
  const [a, b] = match.playerIds;
  const scoreA = state.scores[a] || 0;
  const scoreB = state.scores[b] || 0;
  if (scoreA > scoreB) {
    finishFactorGame(room, court, match, a);
    return;
  }
  if (scoreB > scoreA) {
    finishFactorGame(room, court, match, b);
    return;
  }

  // The supplied sheet specifies that the highest score wins but does not give
  // a tie-break rule. Keep King-of-the-Court moving without changing scoring:
  // show the tie briefly, then replay a fresh board with the other player first.
  state.phase = 'tied';
  state.turnDeadline = 0;
  state.lastAction = `Scores tied at ${scoreA}-${scoreB}. Starting a quick rematch…`;
  broadcastRoom(room);
  const expectedMatchId = match.id;
  const expectedRematch = state.rematchNumber;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.factorGame?.phase !== 'tied' || live.match.factorGame.rematchNumber !== expectedRematch) return;
    restartTiedFactorGame(room, live.court, live.match);
  }, 2000);
}

function scheduleFactorTurn(room: Room, court: Court, match: Match) {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') return;
  const legal = factorLegalScoringActions(match);
  if (!legal.length) {
    finishOrTieFactorGame(room, court, match);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 180), Math.max(800, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.factorGame;
      if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseFactorBotAction(live.match, scheduledPlayer);
      if (choice) applyFactorAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.factorGame;
    if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;

    // Factor Game timeout penalty: do not rescue a slow player with a strong scoring move.
    // Always take the lowest-numbered tile still on the board. If that tile has no
    // remaining proper factors, applyFactorAction will correctly award 0 and forfeit
    // the turn.
    const lowestRemainingIndex = current.board.findIndex((owner) => owner === null);
    if (lowestRemainingIndex < 0) {
      finishOrTieFactorGame(room, live.court, live.match);
      return;
    }
    const choice: FactorGameAction = { kind: 'select', number: lowestRemainingIndex + 1 };
    applyFactorAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyFactorAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: FactorGameAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.factorGame;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') throw new Error('That Factor Game match is not playable.');
  if (state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
  const number = Math.round(Number(action.number));
  if (!Number.isInteger(number) || number < 1 || number > FACTOR_MAX) throw new Error('Choose a number from 1 to 49.');
  if (state.board[number - 1] !== null) throw new Error('That number has already been removed from play.');

  const opponentId = otherPlayer(match, playerId);
  const factors = factorAvailableProperFactors(state, number);
  const playerName = room.players.get(playerId)?.name || 'Player';

  if (!factors.length) {
    // Authentic sheet rule: choosing a number with no remaining factor forfeits
    // the turn and scores 0. The unscored number stays available on the board.
    state.lastSelectedNumber = undefined;
    state.lastScoredFactors = [];
    state.lastSelectingPlayerId = playerId;
    state.lastForfeitNumber = number;
    state.lastAction = source === 'timeout'
      ? `Time expired — ${number}, the lowest remaining number, was selected automatically. It has no remaining factors, so ${playerName} scores 0 and forfeits the turn.`
      : `${playerName} chose ${number}, but it has no remaining factor — turn forfeited for 0 points.`;
    state.turnPlayerId = opponentId;
    state.turnNumber += 1;
    scheduleFactorTurn(room, court, match);
    return;
  }

  state.board[number - 1] = playerId;
  for (const factor of factors) state.board[factor - 1] = opponentId;
  const factorTotal = factors.reduce((sum, value) => sum + value, 0);
  state.scores[playerId] = (state.scores[playerId] || 0) + number;
  state.scores[opponentId] = (state.scores[opponentId] || 0) + factorTotal;
  state.lastSelectedNumber = number;
  state.lastScoredFactors = factors;
  state.lastSelectingPlayerId = playerId;
  state.lastForfeitNumber = undefined;
  state.lastAction = source === 'timeout'
    ? `Time expired — ${number}, the lowest remaining number, was selected automatically. ${playerName} scores ${number}; the opponent scores ${factorTotal} from ${factors.join(', ')}.`
    : `${playerName} takes ${number}; the opponent collects ${factors.join(', ')} for ${factorTotal} point${factorTotal === 1 ? '' : 's'}.`;

  if (!factorLegalScoringActions(match).length) {
    finishOrTieFactorGame(room, court, match);
    return;
  }

  state.turnPlayerId = opponentId;
  state.turnNumber += 1;
  scheduleFactorTurn(room, court, match);
}

function startFactorGame(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.factorGame = {
    phase: 'playing',
    board: Array(FACTOR_MAX).fill(null),
    scores: { [match.playerIds[0]]: 0, [match.playerIds[1]]: 0 },
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastScoredFactors: [],
    rematchNumber: 0,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Choose a number with at least one factor still available.`,
  };
  scheduleFactorTurn(room, court, match);
}

const HEDRON_ROOM_DEFS = [
  { value: 5, walls: [0, 6, 11, 10, 5] },
  { value: 9, walls: [4, 5, 12, 13, 9] },
  { value: 15, walls: [1, 7, 18, 19, 6] },
  { value: 19, walls: [3, 9, 14, 15, 8] },
  { value: 11, walls: [2, 8, 16, 17, 7] },
  { value: 13, walls: [10, 20, 29, 24, 12] },
  { value: 21, walls: [11, 19, 21, 25, 20] },
  { value: 17, walls: [24, 28, 23, 14, 13] },
  { value: 7, walls: [18, 17, 22, 26, 21] },
  { value: 3, walls: [27, 22, 16, 15, 23] },
  { value: 1, walls: [25, 26, 27, 28, 29] },
] as const;
const HEDRON_WALL_COUNT = 30;

function hedronLegalActions(match: Match): HedronAction[] {
  const state = match.hedron;
  if (!state || state.phase !== 'playing') return [];
  const actions: HedronAction[] = [];
  for (let wall = 0; wall < state.walls.length; wall++) {
    if (state.walls[wall] === null) actions.push({ kind: 'select-wall', wall });
  }
  return actions;
}

function hedronRoomsTouchingWall(wall: number) {
  const result: number[] = [];
  HEDRON_ROOM_DEFS.forEach((room, index) => {
    if ((room.walls as readonly number[]).includes(wall)) result.push(index);
  });
  return result;
}

function chooseHedronBotAction(match: Match, playerId: string): HedronAction | undefined {
  const state = match.hedron;
  if (!state) return undefined;
  const legal = hedronLegalActions(match);
  if (!legal.length) return undefined;

  // Hedron's Gem Bot is intentionally classroom-friendly rather than optimal.
  // Most turns are genuinely random; sometimes it notices a valuable room that
  // is close to being secured. This keeps solo testing useful without making the
  // practice opponent feel unbeatable.
  if (Math.random() < 0.58) return legal[Math.floor(Math.random() * legal.length)];

  const scored = legal.map((action) => {
    let score = Math.random() * 5;
    for (const roomIndex of hedronRoomsTouchingWall(action.wall)) {
      if (state.rooms[roomIndex]) continue;
      const room = HEDRON_ROOM_DEFS[roomIndex];
      const ownBefore = room.walls.filter((wall) => state.walls[wall] === playerId).length;
      const opponentBefore = room.walls.filter((wall) => state.walls[wall] !== null && state.walls[wall] !== playerId).length;
      const ownAfter = ownBefore + 1;
      if (ownAfter >= 3) score += room.value * 4;
      else score += room.value * (0.18 + ownAfter * 0.08);
      if (opponentBefore >= 2) score += room.value * 0.22;
    }
    return { action, score };
  }).sort((a, b) => b.score - a.score);

  const pool = scored.slice(0, Math.min(4, scored.length));
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function finishHedron(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.hedron;
  if (!state || state.phase !== 'playing') return;
  const loserId = otherPlayer(match, winnerId);
  state.phase = 'won';
  state.winnerId = winnerId;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} wins ${state.scores[winnerId] || 0}-${state.scores[loserId] || 0}!`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.hedron?.winnerId !== winnerId) return;
    if (live.match.status === 'playing') resolveMatch(room, expectedMatchId, winnerId);
  }, 2200);
}

function scheduleHedronTurn(room: Room, court: Court, match: Match) {
  const state = match.hedron;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') return;
  const legal = hedronLegalActions(match);
  if (!legal.length) {
    // Every Hedron room has five walls, so a fully selected board cannot leave
    // any room tied. This is a defensive fallback in case the game reaches the
    // end of the wall list before the early all-rooms-secured condition fires.
    const a = match.playerIds[0];
    const b = match.playerIds[1];
    const winnerId = (state.scores[a] || 0) > (state.scores[b] || 0) ? a : b;
    finishHedron(room, court, match, winnerId);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(700, room.turnSeconds * 190), Math.max(850, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.hedron;
      if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const choice = chooseHedronBotAction(live.match, scheduledPlayer);
      if (choice) applyHedronAction(room, live.court, live.match, scheduledPlayer, choice, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.hedron;
    if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const legalNow = hedronLegalActions(live.match);
    if (!legalNow.length) return;
    const choice = legalNow[Math.floor(Math.random() * legalNow.length)];
    applyHedronAction(room, live.court, live.match, scheduledPlayer, choice, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyHedronAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: HedronAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.hedron;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') throw new Error('That Hedron match is not playable.');
  if (state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
  const wall = Math.round(Number(action.wall));
  if (!Number.isInteger(wall) || wall < 0 || wall >= HEDRON_WALL_COUNT) throw new Error('Choose one of the walls on the Hedron board.');
  if (state.walls[wall] !== null) throw new Error('That wall has already been selected.');

  state.walls[wall] = playerId;
  state.lastWallIndex = wall;
  state.lastSelectingPlayerId = playerId;
  state.lastClaimedRooms = [];

  for (const roomIndex of hedronRoomsTouchingWall(wall)) {
    if (state.rooms[roomIndex]) continue;
    const roomDef = HEDRON_ROOM_DEFS[roomIndex];
    const ownedWalls = roomDef.walls.filter((roomWall) => state.walls[roomWall] === playerId).length;
    // Every printed room has five walls. Reaching three means the opponent can
    // never finish with more walls, so the room is permanently secured.
    if (ownedWalls >= 3) {
      state.rooms[roomIndex] = playerId;
      state.scores[playerId] = (state.scores[playerId] || 0) + roomDef.value;
      state.lastClaimedRooms.push(roomIndex);
    }
  }

  const playerName = room.players.get(playerId)?.name || 'Player';
  if (state.lastClaimedRooms.length) {
    const claimedValues = state.lastClaimedRooms.map((index) => HEDRON_ROOM_DEFS[index].value);
    const points = claimedValues.reduce((sum, value) => sum + value, 0);
    state.lastAction = source === 'timeout'
      ? `Time expired — a wall was selected automatically. ${playerName} secured room${claimedValues.length === 1 ? '' : 's'} ${claimedValues.join(', ')} for ${points} point${points === 1 ? '' : 's'}.`
      : `${playerName} secured room${claimedValues.length === 1 ? '' : 's'} ${claimedValues.join(', ')} for ${points} point${points === 1 ? '' : 's'}!`;
  } else {
    state.lastAction = source === 'timeout'
      ? `Time expired — an available wall was selected automatically for ${playerName}.`
      : `${playerName} selected a wall.`;
  }

  if (state.rooms.every(Boolean)) {
    const a = match.playerIds[0];
    const b = match.playerIds[1];
    const winnerId = (state.scores[a] || 0) > (state.scores[b] || 0) ? a : b;
    finishHedron(room, court, match, winnerId);
    return;
  }

  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleHedronTurn(room, court, match);
}

function startHedron(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  match.hedron = {
    phase: 'playing',
    walls: Array(HEDRON_WALL_COUNT).fill(null),
    rooms: Array(HEDRON_ROOM_DEFS.length).fill(null),
    scores: { [match.playerIds[0]]: 0, [match.playerIds[1]]: 0 },
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastClaimedRooms: [],
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. Select any unclaimed wall.`,
  };
  scheduleHedronTurn(room, court, match);
}

const MULTI_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function multiProductForCell(index: number) {
  const largeBoard = Math.floor(index / 9);
  const localCell = index % 9;
  return (largeBoard + 1) * (localCell + 1);
}

function multiClaimableCellsForProduct(state: MultiState, product: number) {
  const cells: number[] = [];
  for (let index = 0; index < 81; index++) {
    const largeBoard = Math.floor(index / 9);
    if (state.largeBoards[largeBoard] !== null) continue;
    if (state.cells[index] !== null) continue;
    if (multiProductForCell(index) === product) cells.push(index);
  }
  return cells;
}

function multiLocalWinningLine(state: MultiState, largeBoard: number, playerId: string) {
  const start = largeBoard * 9;
  return MULTI_LINES.find((line) => line.every((local) => state.cells[start + local] === playerId));
}

function multiGlobalWinningLine(state: MultiState, playerId: string) {
  return MULTI_LINES.find((line) => line.every((largeBoard) => {
    const owner = state.largeBoards[largeBoard];
    return owner === playerId || owner === 'wild';
  }));
}

function sameMultiAction(a: MultiAction, b: MultiAction) {
  return a.kind === b.kind && a.token === b.token && a.factor === b.factor;
}

function multiLegalActions(match: Match): MultiAction[] {
  const state = match.multi;
  if (!state || ['won', 'tied'].includes(state.phase)) return [];
  const actions: MultiAction[] = [];
  const [a, b] = state.tokenValues;

  if (state.phase === 'opening-first') {
    for (let factor = 1; factor <= 9; factor++) {
      if (multiClaimableCellsForProduct(state, factor).length) actions.push({ kind: 'move-token', token: 0, factor });
    }
    return actions;
  }

  if (state.phase === 'opening-second') {
    if (!a) return [];
    for (let factor = 1; factor <= 9; factor++) {
      if (multiClaimableCellsForProduct(state, a * factor).length) actions.push({ kind: 'move-token', token: 1, factor });
    }
    return actions;
  }

  if (state.phase === 'normal') {
    if (!a || !b) return [];
    for (let factor = 1; factor <= 9; factor++) {
      if (factor !== a && multiClaimableCellsForProduct(state, factor * b).length) actions.push({ kind: 'move-token', token: 0, factor });
      if (factor !== b && multiClaimableCellsForProduct(state, a * factor).length) actions.push({ kind: 'move-token', token: 1, factor });
    }
    return actions;
  }

  if (state.phase === 'bonus-first') {
    const original = state.bonusOriginalTokens;
    if (!original) return [];
    for (let factor = 1; factor <= 9; factor++) {
      if (factor === original[0]) continue;
      let hasSecondChoice = false;
      for (let second = 1; second <= 9; second++) {
        if (second === original[1]) continue;
        if (multiClaimableCellsForProduct(state, factor * second).length) {
          hasSecondChoice = true;
          break;
        }
      }
      if (hasSecondChoice) actions.push({ kind: 'move-token', token: 0, factor });
    }
    return actions;
  }

  if (state.phase === 'bonus-second') {
    const original = state.bonusOriginalTokens;
    if (!original || !a) return [];
    for (let factor = 1; factor <= 9; factor++) {
      if (factor === original[1]) continue;
      if (multiClaimableCellsForProduct(state, a * factor).length) actions.push({ kind: 'move-token', token: 1, factor });
    }
  }
  return actions;
}

function multiActionScore(match: Match, playerId: string, action: MultiAction) {
  const state = match.multi;
  if (!state) return 0;
  const tokens: [number | null, number | null] = [...state.tokenValues] as [number | null, number | null];
  tokens[action.token] = action.factor;
  let product: number | undefined;
  if (state.phase === 'opening-first') product = action.factor;
  else if (tokens[0] && tokens[1] && state.phase !== 'bonus-first') product = tokens[0] * tokens[1];
  if (!product) return Math.random() * 2;

  const claimable = multiClaimableCellsForProduct(state, product);
  let score = claimable.length * 2 + Math.random() * 4;
  for (const index of claimable) {
    const board = Math.floor(index / 9);
    const local = index % 9;
    const start = board * 9;
    for (const line of MULTI_LINES.filter((line) => line.includes(local))) {
      const own = line.filter((cell) => state.cells[start + cell] === playerId).length;
      const empty = line.filter((cell) => state.cells[start + cell] === null).length;
      if (own === 2 && empty === 1) score += 18;
      else if (own === 1 && empty >= 1) score += 2;
    }
  }
  return score;
}

function chooseMultiBotAction(match: Match, playerId: string): MultiAction | undefined {
  const legal = multiLegalActions(match);
  if (!legal.length) return undefined;
  // Keep Gem Bot useful for testing but beatable: most choices come from the
  // whole legal set, while some turns notice an obvious local-board opportunity.
  if (Math.random() < 0.62) return legal[Math.floor(Math.random() * legal.length)];
  const ranked = legal
    .map((action) => ({ action, score: multiActionScore(match, playerId, action) }))
    .sort((x, y) => y.score - x.score);
  const pool = ranked.slice(0, Math.min(4, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function resetMultiState(room: Room, match: Match, startingPlayerId: string, rematchNumber: number) {
  match.multi = {
    // Digital opening: Token A begins fixed at 1. The first player only has to
    // choose Token B, so the opening product is immediately easy to understand
    // (for example 1 × 7 = 7). From the next turn onward either token may move.
    phase: 'opening-second',
    cells: Array(81).fill(null),
    largeBoards: Array(9).fill(null),
    tokenValues: [1, null],
    startingPlayerId,
    xPlayerId: startingPlayerId,
    oPlayerId: otherPlayer(match, startingPlayerId),
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    lastClaimedCells: [],
    lastResolvedBoards: [],
    rematchNumber,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} is X and goes first. Token A starts locked on 1 — choose a number for Token B.`,
  };
}

function finishMulti(room: Room, court: Court, match: Match, winnerId: string, winningLine: number[]) {
  const state = match.multi;
  if (!state || state.phase === 'won') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningLine = winningLine;
  state.resultRevealAt = Date.now() + 1800;
  state.turnDeadline = 0;
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} won three large squares in a row!`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.multi?.winnerId !== winnerId) return;
    if (live.match.status === 'playing') resolveMatch(room, expectedMatchId, winnerId);
  }, 3900);
}

function tieAndRestartMulti(room: Room, court: Court, match: Match) {
  const state = match.multi;
  if (!state || state.phase === 'won' || state.phase === 'tied') return;
  state.phase = 'tied';
  state.turnDeadline = 0;
  state.lastAction = 'All nine large squares are resolved with no overall three-in-a-row. A fresh board will start with the other player as X.';
  broadcastRoom(room);
  const previousStarter = state.startingPlayerId;
  const nextRematch = state.rematchNumber + 1;
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.status !== 'playing' || live.match.multi?.phase !== 'tied') return;
    resetMultiState(room, live.match, otherPlayer(live.match, previousStarter), nextRematch);
    scheduleMultiTurn(room, live.court, live.match);
  }, 2300);
}

function claimMultiProduct(room: Room, court: Court, match: Match, playerId: string, product: number) {
  const state = match.multi;
  if (!state) return false;
  const claimable = multiClaimableCellsForProduct(state, product);
  if (!claimable.length) return false;

  state.lastProduct = product;
  state.lastClaimedCells = [...claimable];
  state.lastResolvedBoards = [];
  for (const index of claimable) state.cells[index] = playerId;

  const touchedBoards = [...new Set(claimable.map((index) => Math.floor(index / 9)))];
  for (const board of touchedBoards) {
    if (state.largeBoards[board] !== null) continue;
    if (multiLocalWinningLine(state, board, playerId)) {
      state.largeBoards[board] = playerId;
      state.lastResolvedBoards.push(board);
      continue;
    }
    const start = board * 9;
    const full = Array.from({ length: 9 }, (_, local) => state.cells[start + local]).every(Boolean);
    if (full) {
      state.largeBoards[board] = 'wild';
      state.lastResolvedBoards.push(board);
    }
  }

  const currentLine = multiGlobalWinningLine(state, playerId);
  const opponentId = otherPlayer(match, playerId);
  const opponentLine = multiGlobalWinningLine(state, opponentId);
  if (currentLine || opponentLine) {
    // A newly wild square can theoretically finish a line for both players at
    // once. The source sheet does not specify that edge case; the player whose
    // move created the final wild square gets priority in the digital version.
    const winnerId = currentLine ? playerId : opponentId;
    const line = currentLine || opponentLine!;
    finishMulti(room, court, match, winnerId, line);
    return true;
  }

  if (state.largeBoards.every(Boolean)) {
    tieAndRestartMulti(room, court, match);
    return true;
  }
  return false;
}

function scheduleMultiTurn(room: Room, court: Court, match: Match) {
  const state = match.multi;
  if (!state || ['won', 'tied'].includes(state.phase) || match.status !== 'playing') return;

  let legal = multiLegalActions(match);
  if (state.phase === 'normal' && !legal.length) {
    const blockedId = state.turnPlayerId;
    const opponentId = otherPlayer(match, blockedId);
    const [a, b] = state.tokenValues;
    if (!a || !b) return;
    state.phase = 'bonus-first';
    state.bonusOriginalTokens = [a, b];
    state.turnPlayerId = opponentId;
    state.turnNumber += 1;
    state.lastAction = `${room.players.get(blockedId)?.name || 'Player'} had no move that could claim an unclaimed multiplication square, so the turn is lost. ${room.players.get(opponentId)?.name || 'The opponent'} may reposition BOTH factor tokens.`;
    legal = multiLegalActions(match);
    if (!legal.length) {
      tieAndRestartMulti(room, court, match);
      return;
    }
  }

  if (!legal.length) {
    tieAndRestartMulti(room, court, match);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(700, room.turnSeconds * 190), Math.max(850, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.multi;
      if (!live || !current || ['won', 'tied'].includes(current.phase) || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const action = chooseMultiBotAction(live.match, scheduledPlayer);
      if (action) applyMultiAction(room, live.court, live.match, scheduledPlayer, action, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.multi;
    if (!live || !current || ['won', 'tied'].includes(current.phase) || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const options = multiLegalActions(live.match);
    if (!options.length) {
      scheduleMultiTurn(room, live.court, live.match);
      return;
    }
    const action = options[Math.floor(Math.random() * options.length)];
    applyMultiAction(room, live.court, live.match, scheduledPlayer, action, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyMultiAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: MultiAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.multi;
  if (!state || ['won', 'tied'].includes(state.phase) || match.status !== 'playing') throw new Error('That Multi match is not accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');
  const factor = Math.round(Number(action.factor));
  const token = Number(action.token) as 0 | 1;
  if ((token !== 0 && token !== 1) || factor < 1 || factor > 9) throw new Error('Choose a factor from 1 to 9.');
  const normalized: MultiAction = { kind: 'move-token', token, factor };
  const legal = multiLegalActions(match);
  if (!legal.some((candidate) => sameMultiAction(candidate, normalized))) throw new Error('That factor-token move cannot claim an available square. Choose another move.');

  const previousPhase = state.phase;
  const playerName = room.players.get(playerId)?.name || 'Player';
  state.tokenValues[token] = factor;

  if (previousPhase === 'bonus-first') {
    state.phase = 'bonus-second';
    state.turnNumber += 1;
    state.lastAction = source === 'timeout'
      ? `Time expired — Token A moved automatically to ${factor}. ${playerName} must now reposition Token B.`
      : `${playerName} moved Token A to ${factor}. Now move Token B to a new number.`;
    scheduleMultiTurn(room, court, match);
    return;
  }

  let product = factor;
  if (previousPhase !== 'opening-first') {
    const [a, b] = state.tokenValues;
    if (!a || !b) throw new Error('Both factor tokens must be on the board before a product can be claimed.');
    product = a * b;
  }

  const claimedBefore = multiClaimableCellsForProduct(state, product).length;
  const ended = claimMultiProduct(room, court, match, playerId, product);
  if (ended) return;

  const claimText = `${claimedBefore} multiplication square${claimedBefore === 1 ? '' : 's'}`;
  if (state.lastResolvedBoards.length) {
    const labels = state.lastResolvedBoards.map((board) => {
      const owner = state.largeBoards[board];
      return owner === 'wild' ? `${board + 1} (WILD)` : String(board + 1);
    });
    state.lastAction = `${playerName} made ${product} and claimed ${claimText}. Large square${labels.length === 1 ? '' : 's'} ${labels.join(', ')} ${labels.length === 1 ? 'was' : 'were'} resolved!`;
  } else {
    state.lastAction = source === 'timeout'
      ? `Time expired — a legal factor move was made automatically. ${playerName} made ${product} and claimed ${claimText}.`
      : source === 'bot'
        ? `${playerName} made ${product} and claimed ${claimText}.`
        : `${playerName} made ${product} and claimed ${claimText}.`;
  }

  if (previousPhase === 'opening-first') state.phase = 'opening-second';
  else state.phase = 'normal';
  state.bonusOriginalTokens = undefined;
  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  scheduleMultiTurn(room, court, match);
}

function startMulti(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  resetMultiState(room, match, startingPlayerId, 0);
  scheduleMultiTurn(room, court, match);
}


function ultimateBoardAvailable(state: UltimateTttState, board: number) {
  if (board < 0 || board > 8 || state.localBoards[board] !== null) return false;
  const start = board * 9;
  return state.cells.slice(start, start + 9).some((owner) => owner === null);
}

function ultimateLocalWinningLine(state: UltimateTttState, board: number, playerId: string) {
  const start = board * 9;
  return MULTI_LINES.find((line) => line.every((cell) => state.cells[start + cell] === playerId));
}

function ultimateGlobalWinningLine(state: UltimateTttState, playerId: string) {
  return MULTI_LINES.find((line) => line.every((board) => {
    const owner = state.localBoards[board];
    return owner === playerId || owner === 'draw';
  }));
}

function ultimateBoardWinCounts(state: UltimateTttState) {
  return {
    x: state.localBoards.filter((owner) => owner === state.xPlayerId).length,
    o: state.localBoards.filter((owner) => owner === state.oPlayerId).length,
  };
}

function ultimateLegalActions(match: Match): UltimateTttAction[] {
  const state = match.ultimateTtt;
  if (!state || state.phase !== 'playing') return [];
  const boards = state.forcedBoard !== null && ultimateBoardAvailable(state, state.forcedBoard)
    ? [state.forcedBoard]
    : Array.from({ length: 9 }, (_, board) => board).filter((board) => ultimateBoardAvailable(state, board));
  const actions: UltimateTttAction[] = [];
  for (const board of boards) {
    const start = board * 9;
    for (let local = 0; local < 9; local++) {
      if (state.cells[start + local] === null) actions.push({ kind: 'place', index: start + local });
    }
  }
  return actions;
}

function sameUltimateAction(a: UltimateTttAction, b: UltimateTttAction) {
  return a.kind === b.kind && a.index === b.index;
}

function ultimateActionScore(match: Match, playerId: string, action: UltimateTttAction) {
  const state = match.ultimateTtt;
  if (!state) return 0;
  const index = action.index;
  const board = Math.floor(index / 9);
  const local = index % 9;
  const opponentId = otherPlayer(match, playerId);
  let score = Math.random() * 4;

  state.cells[index] = playerId;
  const winsLocal = Boolean(ultimateLocalWinningLine(state, board, playerId));
  state.cells[index] = null;
  if (winsLocal) {
    score += 28;
    const previousOwner = state.localBoards[board];
    state.localBoards[board] = playerId;
    if (ultimateGlobalWinningLine(state, playerId)) score += 120;
    state.localBoards[board] = previousOwner;
  }

  state.cells[index] = opponentId;
  if (ultimateLocalWinningLine(state, board, opponentId)) score += 12;
  state.cells[index] = null;

  if (local === 4) score += 3;
  else if ([0, 2, 6, 8].includes(local)) score += 1.2;
  return score;
}

function chooseUltimateBotAction(match: Match, playerId: string) {
  const legal = ultimateLegalActions(match);
  if (!legal.length) return undefined;
  if (Math.random() < 0.56) return legal[Math.floor(Math.random() * legal.length)];
  const ranked = legal
    .map((action) => ({ action, score: ultimateActionScore(match, playerId, action) }))
    .sort((a, b) => b.score - a.score);
  const pool = ranked.slice(0, Math.min(3, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)]?.action;
}

function resetUltimateState(room: Room, match: Match, startingPlayerId: string, rematchNumber: number) {
  match.ultimateTtt = {
    phase: 'playing',
    cells: Array(81).fill(null),
    localBoards: Array(9).fill(null),
    startingPlayerId,
    xPlayerId: startingPlayerId,
    oPlayerId: otherPlayer(match, startingPlayerId),
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    forcedBoard: null,
    rematchNumber,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} is X and goes first. Choose any empty square on the global board.`,
  };
}

function finishUltimate(room: Room, court: Court, match: Match, winnerId: string, winningLine: number[] = [], actionText?: string) {
  const state = match.ultimateTtt;
  if (!state || state.phase !== 'playing') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningLine = winningLine;
  state.resultRevealAt = Date.now() + 1800;
  state.turnDeadline = 0;
  state.lastAction = actionText || `${room.players.get(winnerId)?.name || 'Player'} won three local boards in a row!`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.ultimateTtt?.winnerId !== winnerId) return;
    if (live.match.status === 'playing') resolveMatch(room, expectedMatchId, winnerId);
  }, 3900);
}

function tieAndRestartUltimate(room: Room, court: Court, match: Match) {
  const state = match.ultimateTtt;
  if (!state || state.phase !== 'playing') return;
  state.phase = 'tied';
  state.turnDeadline = 0;
  state.forcedBoard = null;
  state.lastAction = 'All nine local boards are closed, and the number of local-board wins is tied. A fresh board will start with the other player as X.';
  broadcastRoom(room);

  const previousStarter = state.startingPlayerId;
  const nextRematch = state.rematchNumber + 1;
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.status !== 'playing' || live.match.ultimateTtt?.phase !== 'tied') return;
    resetUltimateState(room, live.match, otherPlayer(live.match, previousStarter), nextRematch);
    scheduleUltimateTurn(room, live.court, live.match);
  }, 2300);
}

function scheduleUltimateTurn(room: Room, court: Court, match: Match) {
  const state = match.ultimateTtt;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') return;
  const legal = ultimateLegalActions(match);
  if (!legal.length) {
    const counts = ultimateBoardWinCounts(state);
    if (counts.x > counts.o) {
      finishUltimate(room, court, match, state.xPlayerId, [], `${room.players.get(state.xPlayerId)?.name || 'Player X'} wins Ultimate TTT by winning more local boards (${counts.x} to ${counts.o}).`);
    } else if (counts.o > counts.x) {
      finishUltimate(room, court, match, state.oPlayerId, [], `${room.players.get(state.oPlayerId)?.name || 'Player O'} wins Ultimate TTT by winning more local boards (${counts.o} to ${counts.x}).`);
    } else {
      tieAndRestartUltimate(room, court, match);
    }
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(700, room.turnSeconds * 190), Math.max(850, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.ultimateTtt;
      if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const action = chooseUltimateBotAction(live.match, scheduledPlayer);
      if (action) applyUltimateAction(room, live.court, live.match, scheduledPlayer, action, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.ultimateTtt;
    if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const options = ultimateLegalActions(live.match);
    if (!options.length) {
      const counts = ultimateBoardWinCounts(current);
      if (counts.x > counts.o) {
        finishUltimate(room, live.court, live.match, current.xPlayerId, [], `${room.players.get(current.xPlayerId)?.name || 'Player X'} wins Ultimate TTT by winning more local boards (${counts.x} to ${counts.o}).`);
      } else if (counts.o > counts.x) {
        finishUltimate(room, live.court, live.match, current.oPlayerId, [], `${room.players.get(current.oPlayerId)?.name || 'Player O'} wins Ultimate TTT by winning more local boards (${counts.o} to ${counts.x}).`);
      } else {
        tieAndRestartUltimate(room, live.court, live.match);
      }
      return;
    }
    const action = options[Math.floor(Math.random() * options.length)];
    applyUltimateAction(room, live.court, live.match, scheduledPlayer, action, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyUltimateAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: UltimateTttAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.ultimateTtt;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') throw new Error('That Ultimate Tic-Tac-Toe match is not accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');
  const index = Math.round(Number(action.index));
  if (index < 0 || index >= 81) throw new Error('Choose an empty Ultimate Tic-Tac-Toe square.');
  const normalized: UltimateTttAction = { kind: 'place', index };
  const legal = ultimateLegalActions(match);
  if (!legal.some((candidate) => sameUltimateAction(candidate, normalized))) {
    if (state.forcedBoard !== null && ultimateBoardAvailable(state, state.forcedBoard)) {
      throw new Error(`Your opponent sent you to local board ${state.forcedBoard + 1}. Choose an empty square there.`);
    }
    throw new Error('Choose an empty square on any local board that is still available.');
  }

  const board = Math.floor(index / 9);
  const local = index % 9;
  const playerName = room.players.get(playerId)?.name || 'Player';
  const opponentId = otherPlayer(match, playerId);
  state.cells[index] = playerId;
  state.lastPlacedIndex = index;
  state.lastResolvedBoard = undefined;

  const localLine = ultimateLocalWinningLine(state, board, playerId);
  if (localLine) {
    state.localBoards[board] = playerId;
    state.lastResolvedBoard = board;
  } else {
    const start = board * 9;
    const full = state.cells.slice(start, start + 9).every(Boolean);
    if (full) {
      state.localBoards[board] = 'draw';
      state.lastResolvedBoard = board;
    }
  }

  const playerGlobalLine = ultimateGlobalWinningLine(state, playerId);
  const opponentGlobalLine = state.localBoards[board] === 'draw'
    ? ultimateGlobalWinningLine(state, opponentId)
    : undefined;
  if (playerGlobalLine || opponentGlobalLine) {
    if (playerGlobalLine && opponentGlobalLine) {
      finishUltimate(room, court, match, playerId, playerGlobalLine, `${playerName} turned local board ${board + 1} into a wild board, and that completed an overall line. ${playerName} wins the match.`);
    } else if (playerGlobalLine) {
      finishUltimate(room, court, match, playerId, playerGlobalLine);
    } else if (opponentGlobalLine) {
      finishUltimate(room, court, match, opponentId, opponentGlobalLine, `${room.players.get(opponentId)?.name || 'Player'} wins the overall board thanks to the new wild local board.`);
    }
    return;
  }

  if (state.localBoards.every((owner) => owner !== null)) {
    const counts = ultimateBoardWinCounts(state);
    if (counts.x > counts.o) {
      finishUltimate(room, court, match, state.xPlayerId, [], `${room.players.get(state.xPlayerId)?.name || 'Player X'} wins Ultimate TTT by winning more local boards (${counts.x} to ${counts.o}).`);
    } else if (counts.o > counts.x) {
      finishUltimate(room, court, match, state.oPlayerId, [], `${room.players.get(state.oPlayerId)?.name || 'Player O'} wins Ultimate TTT by winning more local boards (${counts.o} to ${counts.x}).`);
    } else {
      tieAndRestartUltimate(room, court, match);
    }
    return;
  }

  state.forcedBoard = ultimateBoardAvailable(state, local) ? local : null;
  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;

  const targetText = state.forcedBoard === null
    ? 'The destination board is already closed, so the opponent may choose any open local board.'
    : `The opponent must now play in local board ${state.forcedBoard + 1}.`;
  const resolution = state.localBoards[board] === playerId
    ? ` ${playerName} won local board ${board + 1}.`
    : state.localBoards[board] === 'draw'
      ? ` Local board ${board + 1} filled up and became wild for both X and O.`
      : '';
  state.lastAction = source === 'timeout'
    ? `Time expired — an available square was selected automatically for ${playerName}.${resolution} ${targetText}`
    : `${playerName} played in local board ${board + 1}, square ${local + 1}.${resolution} ${targetText}`;
  scheduleUltimateTurn(room, court, match);
}

function startUltimateTtt(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  resetUltimateState(room, match, startingPlayerId, 0);
  scheduleUltimateTurn(room, court, match);
}

const LUCKY_THIRTEEN_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= 1; col++) {
      const start = row * 4 + col;
      lines.push([start, start + 1, start + 2]);
    }
  }
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row <= 1; row++) {
      const start = row * 4 + col;
      lines.push([start, start + 4, start + 8]);
    }
  }
  for (let row = 0; row <= 1; row++) {
    for (let col = 0; col <= 1; col++) {
      const start = row * 4 + col;
      lines.push([start, start + 5, start + 10]);
    }
  }
  for (let row = 0; row <= 1; row++) {
    for (let col = 2; col < 4; col++) {
      const start = row * 4 + col;
      lines.push([start, start + 3, start + 6]);
    }
  }
  return lines;
})();

function rollLuckyThirteenDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function luckyThirteenWinningLine(state: LuckyThirteenState, placedIndex?: number) {
  return LUCKY_THIRTEEN_LINES.find((line) => {
    if (placedIndex !== undefined && !line.includes(placedIndex)) return false;
    const values = line.map((index) => state.values[index]);
    return values.every((value) => value !== null) && values.reduce((sum, value) => sum + Number(value), 0) === 13;
  });
}

function luckyThirteenLegalActions(match: Match): LuckyThirteenAction[] {
  const state = match.luckyThirteen;
  if (!state || state.phase !== 'playing') return [];
  return state.values.flatMap((value, index) => value === null ? [{ kind: 'place' as const, index }] : []);
}

function chooseLuckyThirteenBotAction(match: Match) {
  const state = match.luckyThirteen;
  if (!state) return undefined;
  const legal = luckyThirteenLegalActions(match);
  if (!legal.length) return undefined;
  const wins = legal.filter((action) => {
    state.values[action.index] = state.rolledValue;
    const winning = Boolean(luckyThirteenWinningLine(state, action.index));
    state.values[action.index] = null;
    return winning;
  });
  if (wins.length && Math.random() < 0.8) return wins[Math.floor(Math.random() * wins.length)];

  // Prefer a move that creates useful two-number partial lines, but keep the bot
  // intentionally imperfect so students can still beat it.
  if (Math.random() < 0.5) return legal[Math.floor(Math.random() * legal.length)];
  const ranked = legal.map((action) => {
    state.values[action.index] = state.rolledValue;
    let score = Math.random() * 3;
    for (const line of LUCKY_THIRTEEN_LINES) {
      if (!line.includes(action.index)) continue;
      const numbers = line.map((index) => state.values[index]).filter((value): value is number => value !== null);
      if (numbers.length === 2) {
        const need = 13 - numbers[0] - numbers[1];
        if (need >= 1 && need <= 6) score += 3;
      }
    }
    state.values[action.index] = null;
    return { action, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[Math.floor(Math.random() * Math.min(3, ranked.length))]?.action;
}

function resetLuckyThirteenState(room: Room, match: Match, startingPlayerId: string, rematchNumber: number) {
  match.luckyThirteen = {
    phase: 'playing',
    values: Array(16).fill(null),
    owners: Array(16).fill(null),
    startingPlayerId,
    turnPlayerId: startingPlayerId,
    turnNumber: 1,
    turnDeadline: 0,
    rolledValue: rollLuckyThirteenDie(),
    rematchNumber,
    lastAction: `${room.players.get(startingPlayerId)?.name || 'Player'} goes first. The die has been rolled — place that number anywhere on the grid.`,
  };
}

function finishLuckyThirteen(room: Room, court: Court, match: Match, winnerId: string, winningLine: number[]) {
  const state = match.luckyThirteen;
  if (!state || state.phase !== 'playing') return;
  state.phase = 'won';
  state.winnerId = winnerId;
  state.winningLine = winningLine;
  state.turnDeadline = 0;
  state.resultRevealAt = Date.now() + 2000;
  const equation = winningLine.map((index) => state.values[index]).join(' + ');
  state.lastAction = `Lucky Thirteen found — watch the highlighted numbers: ${equation} = 13.`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.luckyThirteen?.winnerId !== winnerId) return;
    if (live.match.status === 'playing') resolveMatch(room, expectedMatchId, winnerId);
  }, 4600);
}

function tieAndRestartLuckyThirteen(room: Room, court: Court, match: Match) {
  const state = match.luckyThirteen;
  if (!state || state.phase !== 'playing') return;
  state.phase = 'tied';
  state.turnDeadline = 0;
  state.lastAction = 'The 4 × 4 grid is full and nobody made 13. A fresh grid will start with the other player going first.';
  broadcastRoom(room);

  const previousStarter = state.startingPlayerId;
  const nextRematch = state.rematchNumber + 1;
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.status !== 'playing' || live.match.luckyThirteen?.phase !== 'tied') return;
    resetLuckyThirteenState(room, live.match, otherPlayer(live.match, previousStarter), nextRematch);
    scheduleLuckyThirteenTurn(room, live.court, live.match);
  }, 2300);
}

function scheduleLuckyThirteenTurn(room: Room, court: Court, match: Match) {
  const state = match.luckyThirteen;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') return;
  const legal = luckyThirteenLegalActions(match);
  if (!legal.length) {
    tieAndRestartLuckyThirteen(room, court, match);
    return;
  }

  state.turnDeadline = Date.now() + room.turnSeconds * 1000;
  const scheduledTurn = state.turnNumber;
  const scheduledPlayer = state.turnPlayerId;
  broadcastRoom(room);

  const player = room.players.get(scheduledPlayer);
  if (player?.isBot) {
    const botDelay = Math.min(Math.max(700, room.turnSeconds * 180), Math.max(850, room.turnSeconds * 1000 - 350));
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      const current = live?.match.luckyThirteen;
      if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
      const action = chooseLuckyThirteenBotAction(live.match);
      if (action) applyLuckyThirteenAction(room, live.court, live.match, scheduledPlayer, action, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, match.id);
    const current = live?.match.luckyThirteen;
    if (!live || !current || current.phase !== 'playing' || current.turnNumber !== scheduledTurn || current.turnPlayerId !== scheduledPlayer) return;
    const options = luckyThirteenLegalActions(live.match);
    if (!options.length) {
      tieAndRestartLuckyThirteen(room, live.court, live.match);
      return;
    }
    const action = options[Math.floor(Math.random() * options.length)];
    applyLuckyThirteenAction(room, live.court, live.match, scheduledPlayer, action, 'timeout');
  }, room.turnSeconds * 1000 + 40);
}

function applyLuckyThirteenAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: LuckyThirteenAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.luckyThirteen;
  if (!state || state.phase !== 'playing' || match.status !== 'playing') throw new Error('That Lucky Thirteen match is not accepting moves.');
  if (state.turnPlayerId !== playerId) throw new Error('Wait for your turn.');
  const index = Math.round(Number(action.index));
  if (index < 0 || index >= 16 || state.values[index] !== null) throw new Error('Choose an empty Lucky Thirteen square.');

  const playerName = room.players.get(playerId)?.name || 'Player';
  const placedValue = state.rolledValue;
  state.values[index] = placedValue;
  state.owners[index] = playerId;
  state.lastPlacedIndex = index;

  const winningLine = luckyThirteenWinningLine(state, index);
  if (winningLine) {
    finishLuckyThirteen(room, court, match, playerId, winningLine);
    return;
  }

  if (state.values.every((value) => value !== null)) {
    tieAndRestartLuckyThirteen(room, court, match);
    return;
  }

  state.turnPlayerId = otherPlayer(match, playerId);
  state.turnNumber += 1;
  state.rolledValue = rollLuckyThirteenDie();
  const nextName = room.players.get(state.turnPlayerId)?.name || 'Opponent';
  state.lastAction = source === 'timeout'
    ? `Time expired — ${placedValue} was placed automatically for ${playerName}. ${nextName} rolled ${state.rolledValue}.`
    : `${playerName} placed ${placedValue}. ${nextName} rolled ${state.rolledValue}.`;
  scheduleLuckyThirteenTurn(room, court, match);
}

function startLuckyThirteen(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  resetLuckyThirteenState(room, match, startingPlayerId, 0);
  scheduleLuckyThirteenTurn(room, court, match);
}

function makeCraypotsPlayerState(): CraypotsPlayerState {
  return {
    cash: 50,
    boats: 2,
    pots: 5,
    shallow: 0,
    deep: 0,
    placementLocked: false,
    shopLocked: false,
    lastIncome: 0,
    destroyedDeep: 0,
    boughtBoats: 0,
    boughtPots: 0,
  };
}

function resetCraypotsState(room: Room, match: Match, startingPlayerId: string, rematchNumber: number) {
  match.craypots = {
    phase: 'placing',
    day: 1,
    startingPlayerId,
    previousWeather: 'good',
    phaseDeadline: 0,
    players: {
      [match.playerIds[0]]: makeCraypotsPlayerState(),
      [match.playerIds[1]]: makeCraypotsPlayerState(),
    },
    rematchNumber,
    lastAction: 'Day 1 — choose how many pots to place in shallow water and deep water before the weather is revealed.',
  };
}

function craypotsAllLocked(state: CraypotsState, match: Match, key: 'placementLocked' | 'shopLocked') {
  return match.playerIds.every((playerId) => Boolean(state.players[playerId]?.[key]));
}

function chooseCraypotsBotPlacement(match: Match, playerId: string) {
  const state = match.craypots;
  const player = state?.players[playerId];
  if (!state || !player || player.pots <= 0) return 0;
  const roll = Math.random();
  const ratio = roll < 0.12 ? 0 : roll < 0.24 ? 1 : 0.28 + Math.random() * 0.42;
  return Math.max(0, Math.min(player.pots, Math.round(player.pots * ratio)));
}

function craypotsAssetValue(player: CraypotsPlayerState | undefined) {
  if (!player) return 0;
  return player.cash + player.boats * 100 + player.pots * 5;
}

function craypotsRecoverySaleAvailable(player: CraypotsPlayerState | undefined) {
  return Boolean(player && player.pots === 0 && player.cash < 5 && player.boats > 1);
}

function chooseCraypotsBotShop(match: Match, playerId: string) {
  const state = match.craypots;
  const player = state?.players[playerId];
  if (!state || !player) return { boats: 0, pots: 0, sellBoats: 0 };
  if (craypotsRecoverySaleAvailable(player)) {
    const sellBoats = 1;
    const cash = player.cash + 50;
    const capacity = Math.max(0, (player.boats - sellBoats) * 10 - player.pots);
    const pots = Math.max(1, Math.min(capacity, Math.floor(cash / 5), 8));
    return { boats: 0, pots, sellBoats };
  }
  let cash = player.cash;
  let boats = 0;
  let pots = 0;
  let capacity = player.boats * 10 - player.pots;

  // Gem Bot is intentionally solid but not optimal. It usually reinvests, but
  // sometimes banks its money or buys fewer pots than it could.
  if (capacity <= 2 && cash >= 100 && Math.random() < 0.72) {
    boats += 1;
    cash -= 100;
    capacity += 10;
  }
  if (cash >= 100 && Math.random() < 0.13) {
    boats += 1;
    cash -= 100;
    capacity += 10;
  }
  const affordablePots = Math.min(capacity, Math.floor(cash / 5));
  if (affordablePots > 0) {
    const fraction = Math.random() < 0.18 ? Math.random() * 0.35 : 0.55 + Math.random() * 0.45;
    pots = Math.max(0, Math.min(affordablePots, Math.floor(affordablePots * fraction)));
  }
  return { boats, pots, sellBoats: 0 };
}

function lockCraypotsPlacement(room: Room, court: Court, match: Match, playerId: string, deep: number, source: 'player' | 'bot' | 'timeout') {
  const state = match.craypots;
  const player = state?.players[playerId];
  if (!state || !player || state.phase !== 'placing' || match.status !== 'playing') return;
  if (player.placementLocked) return;
  const deepCount = Math.max(0, Math.min(player.pots, Math.round(deep)));
  player.deep = deepCount;
  player.shallow = player.pots - deepCount;
  player.placementLocked = true;
  const name = room.players.get(playerId)?.name || 'Player';
  state.lastAction = source === 'timeout'
    ? `${name} ran out of time, so their ${player.pots} pots were allocated automatically.`
    : `${name} has locked in their pot locations for Day ${state.day}.`;
  broadcastRoom(room);
  if (craypotsAllLocked(state, match, 'placementLocked')) revealCraypotsWeather(room, court, match);
}

function revealCraypotsWeather(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || state.phase !== 'placing' || match.status !== 'playing') return;
  const roll = 1 + Math.floor(Math.random() * 6);
  const weather: CrayWeather = roll <= 3 ? 'good' : roll === 4 ? state.previousWeather : 'bad';
  state.phase = 'weather';
  state.phaseDeadline = 0;
  state.weatherRoll = roll;
  state.weather = weather;
  state.previousWeather = weather;
  state.revealUntil = Date.now() + 2800;

  for (const playerId of match.playerIds) {
    const player = state.players[playerId];
    if (!player) continue;
    const income = weather === 'good'
      ? player.shallow * 3 + player.deep * 8
      : player.shallow * 5;
    player.lastIncome = income;
    player.destroyedDeep = weather === 'bad' ? player.deep : 0;
    player.cash += income;
    if (weather === 'bad') player.pots = Math.max(0, player.pots - player.deep);
  }

  const weatherCopy = weather === 'good'
    ? 'Good Weather! Shallow pots earn $3 each and deep pots earn $8 each.'
    : 'Bad Weather! Shallow pots earn $5 each and every deep-water pot is destroyed.';
  state.lastAction = `Weather die: ${roll}. ${weatherCopy}`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.status !== 'playing' || live.match.craypots?.phase !== 'weather') return;
    const current = live.match.craypots;
    if (!current) return;
    if (current.day >= 10) finishCraypotsDayTen(room, live.court, live.match);
    else startCraypotsShopping(room, live.court, live.match);
  }, 5000);
}

function startCraypotsPlacement(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') return;
  state.phase = 'placing';
  state.weatherRoll = undefined;
  state.weather = undefined;
  state.revealUntil = undefined;
  state.phaseDeadline = Date.now() + room.turnSeconds * 1000;
  for (const playerId of match.playerIds) {
    const player = state.players[playerId];
    if (!player) continue;
    player.shallow = 0;
    player.deep = 0;
    player.placementLocked = false;
    player.shopLocked = false;
    player.lastIncome = 0;
    player.destroyedDeep = 0;
    player.boughtBoats = 0;
    player.boughtPots = 0;
  }
  state.lastAction = `Day ${state.day} — both players are choosing their shallow-water and deep-water pots.`;
  broadcastRoom(room);

  const scheduledDay = state.day;
  const expectedMatchId = match.id;
  for (const playerId of match.playerIds) {
    if (!room.players.get(playerId)?.isBot) continue;
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 170), Math.max(800, room.turnSeconds * 1000 - 450));
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const current = live?.match.craypots;
      if (!live || !current || current.phase !== 'placing' || current.day !== scheduledDay || current.players[playerId]?.placementLocked) return;
      lockCraypotsPlacement(room, live.court, live.match, playerId, chooseCraypotsBotPlacement(live.match, playerId), 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    const current = live?.match.craypots;
    if (!live || !current || current.phase !== 'placing' || current.day !== scheduledDay) return;
    for (const playerId of live.match.playerIds) {
      const player = current.players[playerId];
      if (!player?.placementLocked) lockCraypotsPlacement(room, live.court, live.match, playerId, Math.floor(Math.random() * (player.pots + 1)), 'timeout');
    }
  }, room.turnSeconds * 1000 + 40);
}

function lockCraypotsShop(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  boats: number,
  pots: number,
  sellBoats: number,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.craypots;
  const player = state?.players[playerId];
  if (!state || !player || state.phase !== 'shopping' || match.status !== 'playing') return;
  if (player.shopLocked) return;
  const boatCount = Math.max(0, Math.round(boats));
  const potCount = Math.max(0, Math.round(pots));
  const sellCount = Math.max(0, Math.round(sellBoats));
  if (boatCount > 0 && sellCount > 0) throw new Error('Buy or sell boats in one market visit, not both at once.');
  if (sellCount > 0) {
    if (!craypotsRecoverySaleAvailable(player)) throw new Error('Boat sales are only available as a recovery option when you have 0 pots and less than $5 cash.');
    if (sellCount >= player.boats) throw new Error('You must keep at least one boat.');
  }

  const saleCredit = sellCount * 50;
  const purchaseCost = boatCount * 100 + potCount * 5;
  const availableCash = player.cash + saleCredit;
  const resultingBoats = player.boats - sellCount + boatCount;
  const resultingPots = player.pots + potCount;
  if (purchaseCost > availableCash) throw new Error('That purchase costs more cash than you have after any boat sale.');
  if (resultingBoats < 1) throw new Error('You must keep at least one boat.');
  if (resultingPots > resultingBoats * 10) throw new Error('You need more boat capacity. Each boat can carry at most 10 pots.');

  player.cash = availableCash - purchaseCost;
  player.boats = resultingBoats;
  player.pots = resultingPots;
  player.boughtBoats = boatCount;
  player.boughtPots = potCount;
  player.shopLocked = true;
  const name = room.players.get(playerId)?.name || 'Player';
  state.lastAction = source === 'timeout'
    ? `${name} ran out of shopping time and banked their cash.`
    : sellCount
      ? `${name} sold ${sellCount} spare boat${sellCount === 1 ? '' : 's'} for $${saleCredit}${potCount ? ` and bought ${potCount} pot${potCount === 1 ? '' : 's'}` : ''}.`
      : boatCount || potCount
        ? `${name} bought ${boatCount ? `${boatCount} boat${boatCount === 1 ? '' : 's'}` : ''}${boatCount && potCount ? ' and ' : ''}${potCount ? `${potCount} pot${potCount === 1 ? '' : 's'}` : ''}.`
        : `${name} banked their cash and bought nothing this day.`;
  broadcastRoom(room);
  if (craypotsAllLocked(state, match, 'shopLocked')) advanceCraypotsDay(room, court, match);
}

function startCraypotsShopping(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') return;
  state.phase = 'shopping';
  state.phaseDeadline = Date.now() + room.turnSeconds * 1000;
  for (const playerId of match.playerIds) {
    const player = state.players[playerId];
    if (!player) continue;
    player.shopLocked = false;
    player.boughtBoats = 0;
    player.boughtPots = 0;
  }
  state.lastAction = `Day ${state.day} harbour market — buy more pots and boats, or bank your cash.`;
  broadcastRoom(room);

  const scheduledDay = state.day;
  const expectedMatchId = match.id;
  for (const playerId of match.playerIds) {
    if (!room.players.get(playerId)?.isBot) continue;
    const botDelay = Math.min(Math.max(650, room.turnSeconds * 170), Math.max(800, room.turnSeconds * 1000 - 450));
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const current = live?.match.craypots;
      if (!live || !current || current.phase !== 'shopping' || current.day !== scheduledDay || current.players[playerId]?.shopLocked) return;
      const choice = chooseCraypotsBotShop(live.match, playerId);
      lockCraypotsShop(room, live.court, live.match, playerId, choice.boats, choice.pots, choice.sellBoats ?? 0, 'bot');
    }, botDelay);
  }

  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    const current = live?.match.craypots;
    if (!live || !current || current.phase !== 'shopping' || current.day !== scheduledDay) return;
    for (const playerId of live.match.playerIds) {
      if (!current.players[playerId]?.shopLocked) lockCraypotsShop(room, live.court, live.match, playerId, 0, 0, 0, 'timeout');
    }
  }, room.turnSeconds * 1000 + 40);
}

function advanceCraypotsDay(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || state.phase !== 'shopping' || match.status !== 'playing') return;
  state.day += 1;
  startCraypotsPlacement(room, court, match);
}

function finishCraypots(room: Room, court: Court, match: Match, winnerId: string) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') return;
  state.phase = 'won';
  state.phaseDeadline = 0;
  state.winnerId = winnerId;
  state.resultRevealAt = Date.now() + 1600;
  const winner = state.players[winnerId];
  const loserId = otherPlayer(match, winnerId);
  const loser = state.players[loserId];
  const winnerAssets = craypotsAssetValue(winner);
  const loserAssets = craypotsAssetValue(loser);
  state.lastAction = `${room.players.get(winnerId)?.name || 'Player'} wins Craypots with $${winnerAssets} in total assets (cash + boats + pots)${loser ? `, ahead by $${Math.max(0, winnerAssets - loserAssets)}` : ''}!`;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.craypots?.winnerId !== winnerId) return;
    if (live.match.status === 'playing') resolveMatch(room, expectedMatchId, winnerId);
  }, 3900);
}

function tieAndRestartCraypots(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') return;
  state.phase = 'tied';
  state.phaseDeadline = 0;
  state.lastAction = 'Day 10 ended in an exact total-asset tie. A fresh Craypots match will begin so the court can produce a winner.';
  broadcastRoom(room);

  const previousStarter = state.startingPlayerId;
  const nextRematch = state.rematchNumber + 1;
  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.status !== 'playing' || live.match.craypots?.phase !== 'tied') return;
    resetCraypotsState(room, live.match, otherPlayer(live.match, previousStarter), nextRematch);
    startCraypotsPlacement(room, live.court, live.match);
  }, 2400);
}

function finishCraypotsDayTen(room: Room, court: Court, match: Match) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') return;
  const [aId, bId] = match.playerIds;
  const aAssets = craypotsAssetValue(state.players[aId]);
  const bAssets = craypotsAssetValue(state.players[bId]);
  if (aAssets === bAssets) tieAndRestartCraypots(room, court, match);
  else finishCraypots(room, court, match, aAssets > bAssets ? aId : bId);
}

function applyCraypotsAction(
  room: Room,
  court: Court,
  match: Match,
  playerId: string,
  action: CraypotsAction,
  source: 'player' | 'bot' | 'timeout',
) {
  const state = match.craypots;
  if (!state || match.status !== 'playing') throw new Error('That Craypots match is not accepting decisions.');
  const player = state.players[playerId];
  if (!player) throw new Error('You are not part of this Craypots match.');
  if (action.kind === 'place-pots') {
    if (state.phase !== 'placing') throw new Error('Pot placement is not open right now.');
    if (player.placementLocked) throw new Error('Your pot placement is already locked for this day.');
    const deep = Math.round(Number(action.deep));
    if (!Number.isFinite(deep) || deep < 0 || deep > player.pots) throw new Error(`Choose between 0 and ${player.pots} deep-water pots.`);
    lockCraypotsPlacement(room, court, match, playerId, deep, source);
    return;
  }
  if (action.kind === 'shop') {
    if (state.phase !== 'shopping') throw new Error('The harbour market is not open right now.');
    if (player.shopLocked) throw new Error('Your shopping decision is already locked for this day.');
    const boats = Math.round(Number(action.boats));
    const pots = Math.round(Number(action.pots));
    const sellBoats = Math.round(Number(action.sellBoats ?? 0));
    if (!Number.isFinite(boats) || !Number.isFinite(pots) || !Number.isFinite(sellBoats) || boats < 0 || pots < 0 || sellBoats < 0) throw new Error('Choose a valid number of boats and pots.');
    lockCraypotsShop(room, court, match, playerId, boats, pots, sellBoats, source);
    return;
  }
  throw new Error('Unknown Craypots action.');
}

function startCraypots(room: Room, court: Court, match: Match) {
  const startingPlayerId = chooseStartingPlayer(room, match);
  resetCraypotsState(room, match, startingPlayerId, 0);
  startCraypotsPlacement(room, court, match);
}


function isPrecisionGame(gameId: string) {
  return gameId === 'lights-out' || gameId === 'time-stop' || gameId === 'shrink-ring' || gameId === 'parry' || gameId === 'blind-beat' || gameId === 'overpour' || gameId === 'charge-shot' || gameId === 'stack';
}

function seededUnit(seed: number, index: number) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) / 0x100000000;
}

function makeTimeStopTargets(seed: number) {
  const targets: number[] = [];
  for (let i = 0; i < 3; i++) {
    const value = 3 + seededUnit(seed, i) * 11.99;
    targets.push(Math.round(value * 100) / 100);
  }
  return targets;
}

function completePrecisionIfReady(room: Room, court: Court, match: Match) {
  const state = match.precision;
  if (!state || state.phase !== 'playing') return;
  const [a, b] = match.playerIds;
  const ra = state.results[a];
  const rb = state.results[b];
  if (!ra || !rb) return;

  let winnerId: string;
  const higherScoreWins = state.gameId === 'shrink-ring' || state.gameId === 'parry' || state.gameId === 'overpour' || state.gameId === 'charge-shot' || state.gameId === 'stack';
  if (ra.score !== rb.score) winnerId = higherScoreWins ? (ra.score > rb.score ? a : b) : (ra.score < rb.score ? a : b);
  else if (ra.secondary !== rb.secondary) winnerId = ra.secondary < rb.secondary ? a : b;
  else winnerId = Math.random() < 0.5 ? a : b;

  state.phase = 'results';
  state.winnerId = winnerId;
  state.resultRevealAt = Date.now() + 5000;
  match.winnerId = winnerId;
  broadcastRoom(room);

  const expectedMatchId = match.id;
  setTimeout(() => {
    const live = findLiveMatch(room, expectedMatchId);
    if (!live || live.match.precision?.winnerId !== winnerId) return;
    try { resolveMatch(room, expectedMatchId, winnerId); } catch { /* already resolved */ }
  }, 5000);
}

function submitPrecisionResult(room: Room, court: Court, match: Match, playerId: string, raw: any) {
  const state = match.precision;
  if (!state || match.status !== 'playing' || state.phase !== 'playing') throw new Error('That precision match is not accepting results.');
  if (!match.playerIds.includes(playerId)) throw new Error('You are not part of that match.');
  if (state.results[playerId]) return;

  const score = Number(raw.score);
  const secondary = Number(raw.secondary ?? 0);
  if (!Number.isFinite(score) || score < 0 || score > 120000) throw new Error('Invalid precision score.');
  if (!Number.isFinite(secondary) || secondary < 0 || secondary > 120000) throw new Error('Invalid precision tie-break score.');
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.slice(0, 20).map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 120000)
    : [];
  if (state.gameId === 'shrink-ring') {
    if (score > 300 || secondary > 54000) throw new Error('Invalid Shrink Ring score.');
    if (rounds.length !== 3 || rounds.some((value: number) => value > 100)) throw new Error('Invalid Shrink Ring ring scores.');
  }
  if (state.gameId === 'parry') {
    if (score > 1000 || secondary > 30000) throw new Error('Invalid Parry score.');
    if (rounds.length !== 10 || rounds.some((value: number) => value > 100)) throw new Error('Invalid Parry encounter scores.');
    const roundTotal = rounds.reduce((total: number, value: number) => total + value, 0);
    if (Math.abs(roundTotal - score) > 0.001) throw new Error('Parry total does not match encounter scores.');
  }
  if (state.gameId === 'blind-beat') {
    if (score > 2000 || secondary > 750) throw new Error('Invalid Blind Beat score.');
    if (rounds.length !== 16 || rounds.some((value: number) => value > 750)) throw new Error('Invalid Blind Beat timing data.');
  }
  if (state.gameId === 'overpour') {
    if (score > 500 || secondary > 50000) throw new Error('Invalid Overpour score.');
    if (rounds.length !== 5 || rounds.some((value: number) => value > 100)) throw new Error('Invalid Overpour pour scores.');
    const roundTotal = rounds.reduce((total: number, value: number) => total + value, 0);
    if (Math.abs(roundTotal - score) > 0.001) throw new Error('Overpour total does not match pour scores.');
  }
  if (state.gameId === 'charge-shot') {
    if (score > 500 || secondary > 50000) throw new Error('Invalid Charge Shot score.');
    if (rounds.length !== 5 || rounds.some((value: number) => value > 100)) throw new Error('Invalid Charge Shot round scores.');
    const roundTotal = rounds.reduce((total: number, value: number) => total + value, 0);
    if (Math.abs(roundTotal - score) > 0.001) throw new Error('Charge Shot total does not match round scores.');
  }
  if (state.gameId === 'stack') {
    if (score > 800 || secondary > 10000) throw new Error('Invalid Stack score.');
    if (rounds.length !== 8 || rounds.some((value: number) => value > 100)) throw new Error('Invalid Stack drop scores.');
    const roundTotal = rounds.reduce((total: number, value: number) => total + value, 0);
    if (Math.abs(roundTotal - score) > 0.001) throw new Error('Stack total does not match drop scores.');
  }
  state.results[playerId] = {
    score,
    secondary,
    display: String(raw.display ?? '').slice(0, 64),
    rounds,
    submittedAt: Date.now(),
  };
  state.progress[playerId] = { round: rounds.length, label: 'FINISHED', value: score };
  broadcastRoom(room);
  completePrecisionIfReady(room, court, match);
}

function startPrecision(room: Room, court: Court, match: Match) {
  const seed = Math.floor(Math.random() * 0x7fffffff);
  match.precision = {
    phase: 'playing',
    gameId: room.selectedGameId,
    seed,
    targets: room.selectedGameId === 'time-stop' ? makeTimeStopTargets(seed) : undefined,
    results: {},
    progress: {},
  };
  broadcastRoom(room);

  // Time Stop must never be able to hold a court indefinitely. The client
  // auto-times each target at 20 seconds; this server watchdog is a second
  // line of defence for suspended/throttled tabs or a client that stops
  // advancing while its WebSocket remains connected.
  if (room.selectedGameId === 'time-stop') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'time-stop') return;
      const targets = state.targets?.length === 3 ? state.targets : [7.43, 9.18, 12.05];
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        const rounds = targets.map((target) => Math.round(Math.abs(20 - target) * 1000));
        const score = rounds.reduce((total, value) => total + value, 0);
        const secondary = Math.max(...rounds);
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score,
            secondary,
            display: `${(score / 1000).toFixed(2)} s total error · server timeout`,
            rounds,
          });
        } catch { /* match may have resolved while the watchdog was running */ }
      }
    }, 80000);
  }

  // Blind Beat advances on an absolute local beat clock. If a browser is
  // backgrounded and its animation/timers are heavily throttled, force a safe
  // worst-case result so one inactive student cannot hold a court indefinitely.
  if (room.selectedGameId === 'blind-beat') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'blind-beat') return;
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score: 750,
            secondary: 750,
            display: '750 ms avg · server timeout',
            rounds: Array.from({ length: 16 }, () => 750),
          });
        } catch { /* match may have resolved while watchdog was running */ }
      }
    }, 32000);
  }

  // Overpour advances every round even if a player never presses the pour
  // control. This server watchdog covers a suspended/throttled tab so a phone
  // cannot leave the court waiting indefinitely.
  if (room.selectedGameId === 'overpour') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'overpour') return;
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score: 0,
            secondary: 50000,
            display: '0 / 500 pts · server timeout',
            rounds: [0, 0, 0, 0, 0],
          });
        } catch { /* match may have resolved while the watchdog was running */ }
      }
    }, 45000);
  }

  // Charge Shot self-advances if a player never starts charging and auto-fires
  // at full power. This watchdog protects against a suspended/throttled tab.
  if (room.selectedGameId === 'charge-shot') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'charge-shot') return;
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score: 0,
            secondary: 50000,
            display: '0 / 500 pts · server timeout',
            rounds: [0, 0, 0, 0, 0],
          });
        } catch { /* match may have resolved while watchdog was running */ }
      }
    }, 45000);
  }

  // Stack gives each of eight moving blocks a six-second local drop window.
  // This watchdog protects against a suspended/throttled browser so an inactive
  // device cannot leave a court waiting indefinitely.
  if (room.selectedGameId === 'stack') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'stack') return;
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score: 0,
            secondary: 10000,
            display: '0 / 800 pts · server timeout',
            rounds: Array.from({ length: 8 }, () => 0),
          });
        } catch { /* match may have resolved while the watchdog was running */ }
      }
    }, 60000);
  }

  // Parry is also completely self-advancing, but a suspended browser can
  // throttle JavaScript timers. Force any missing result after 42 seconds so
  // no student can hold a court by backgrounding the tab or refusing input.
  if (room.selectedGameId === 'parry') {
    const expectedMatchId = match.id;
    setTimeout(() => {
      const live = findLiveMatch(room, expectedMatchId);
      const state = live?.match.precision;
      if (!live || !state || state.phase !== 'playing' || state.gameId !== 'parry') return;
      for (const playerId of live.match.playerIds) {
        if (state.results[playerId]) continue;
        try {
          submitPrecisionResult(room, live.court, live.match, playerId, {
            score: 0,
            secondary: 30000,
            display: '0 / 1000 pts · server timeout',
            rounds: Array.from({ length: 10 }, () => 0),
          });
        } catch { /* match may have resolved while the watchdog was running */ }
      }
    }, 42000);
  }

  const botId = match.playerIds.find((id) => room.players.get(id)?.isBot);
  if (botId) {
    const delay = room.selectedGameId === 'time-stop' ? 6200 : room.selectedGameId === 'shrink-ring' ? 7600 : room.selectedGameId === 'parry' ? 12500 : room.selectedGameId === 'blind-beat' ? 23500 : room.selectedGameId === 'overpour' ? 11500 : room.selectedGameId === 'charge-shot' ? 12500 : room.selectedGameId === 'stack' ? 14500 : 4800;
    setTimeout(() => {
      const live = findLiveMatch(room, match.id);
      if (!live?.match.precision || live.match.precision.phase !== 'playing' || live.match.precision.results[botId]) return;
      if (room.selectedGameId === 'lights-out') {
        const score = Math.round(245 + Math.random() * 115);
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary: score,
          display: `${(score / 1000).toFixed(3)} s median`,
          rounds: Array.from({ length: 5 }, () => Math.round(score - 25 + Math.random() * 50)),
        });
      } else if (room.selectedGameId === 'shrink-ring') {
        const rounds = Array.from({ length: 3 }, () => Math.random() < 0.18 ? 0 : Math.round(58 + Math.random() * 39));
        const score = rounds.reduce((total, value) => total + value, 0);
        const hits = rounds.filter((value) => value > 0).length;
        const secondary = rounds.reduce((total, value) => total + (value > 0 ? (100 - value) * 35 : 9000), 0);
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} / 300 pts · ${hits}/3 hits`,
          rounds,
        });
      } else if (room.selectedGameId === 'parry') {
        const rounds = Array.from({ length: 10 }, () => Math.random() < 0.16 ? 0 : Math.round(72 + Math.random() * 29));
        const score = rounds.reduce((total, value) => total + value, 0);
        const mistakes = rounds.filter((value) => value === 0).length;
        const secondary = rounds.reduce((total, value) => total + (value > 0 ? Math.round((100 - value) * 4.5 + 85) : 2000), 0);
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} / 1000 pts · ${mistakes} mistake${mistakes === 1 ? '' : 's'}`,
          rounds,
        });
      } else if (room.selectedGameId === 'overpour') {
        const rounds = Array.from({ length: 5 }, () => Math.random() < 0.10 ? Math.round(35 + Math.random() * 30) : Math.round(72 + Math.random() * 29));
        const score = rounds.reduce((total, value) => total + value, 0);
        const totalErrorPct = rounds.reduce((total, value) => total + Math.max(0, (100 - value) / 4), 0);
        const secondary = Math.round(totalErrorPct * 100);
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} / 500 pts · ${(totalErrorPct / 5).toFixed(1)}% avg error`,
          rounds,
        });
      } else if (room.selectedGameId === 'charge-shot') {
        const rounds = Array.from({ length: 5 }, () => Math.random() < 0.10 ? Math.round(35 + Math.random() * 35) : Math.round(70 + Math.random() * 31));
        const score = rounds.reduce((total, value) => total + value, 0);
        const totalError = rounds.reduce((total, value) => total + Math.max(0, (100 - value) / 4), 0);
        const secondary = Math.round(totalError * 100);
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} / 500 pts · ${(totalError / 5).toFixed(1)} avg miss`,
          rounds,
        });
      } else if (room.selectedGameId === 'stack') {
        const rounds: number[] = [];
        let alive = true;
        for (let i = 0; i < 8; i++) {
          if (!alive) { rounds.push(0); continue; }
          const miss = Math.random() < (0.01 + i * 0.007);
          if (miss) { rounds.push(0); alive = false; continue; }
          const floor = Math.max(64, 82 - i * 2);
          rounds.push(Math.round(floor + Math.random() * (101 - floor)));
        }
        const score = rounds.reduce((total, value) => total + value, 0);
        const secondary = Math.round(rounds.reduce((total, value) => total + (100 - value), 0) * 12.5);
        const placed = rounds.filter((value) => value > 0).length;
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} / 800 pts · ${placed}/8 blocks`,
          rounds,
        });
      } else if (room.selectedGameId === 'blind-beat') {
        const rounds = Array.from({ length: 16 }, () => Math.round(70 + Math.random() * 180));
        // Occasionally give Minute Bot a genuine missed hidden beat so solo
        // testing remains competitive without making the bot superhuman.
        if (Math.random() < 0.28) rounds[Math.floor(Math.random() * rounds.length)] = 750;
        const score = Math.round(rounds.reduce((total, value) => total + value, 0) / rounds.length);
        const secondary = Math.max(...rounds);
        const hits = rounds.filter((value) => value < 750).length;
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary,
          display: `${score} ms avg · ${hits}/16 beats`,
          rounds,
        });
      } else {
        const score = Math.round((120 + Math.random() * 480) / 10) * 10;
        submitPrecisionResult(room, live.court, live.match, botId, {
          score,
          secondary: Math.round(score * 0.55),
          display: `${(score / 1000).toFixed(2)} s total error`,
          rounds: [Math.round(score * 0.3), Math.round(score * 0.35), Math.round(score * 0.35)],
        });
      }
    }, delay);
  }
}

function scheduleMatchStart(room: Room, court: Court, match: Match) {
  match.status = 'countdown';
  match.startsAt = Date.now() + 3000;
  broadcastRoom(room);
  setTimeout(() => {
    const current = court.activeMatch;
    if (!current || current.id !== match.id || current.status !== 'countdown') return;
    current.status = 'playing';
    current.startsAt = undefined;
    room.phase = 'playing';
    if (isPrecisionGame(room.selectedGameId)) {
      startPrecision(room, court, current);
    } else if (room.selectedGameId === 'three-hexagon') {
      startThreeHexagon(room, court, current);
    } else if (room.selectedGameId === 'four-star') {
      startFourStar(room, court, current);
    } else if (room.selectedGameId === 'boxes') {
      startBoxes(room, court, current);
    } else if (room.selectedGameId === 'never-touch') {
      startNeverTouch(room, court, current);
    } else if (room.selectedGameId === 'spiral') {
      startSpiral(room, court, current);
    } else if (room.selectedGameId === 'hex') {
      startHex(room, court, current);
    } else if (room.selectedGameId === 'factor-game') {
      startFactorGame(room, court, current);
    } else if (room.selectedGameId === 'hedron') {
      startHedron(room, court, current);
    } else if (room.selectedGameId === 'multi') {
      startMulti(room, court, current);
    } else if (room.selectedGameId === 'ultimate-tic-tac-toe') {
      startUltimateTtt(room, court, current);
    } else if (room.selectedGameId === 'lucky-thirteen') {
      startLuckyThirteen(room, court, current);
    } else if (room.selectedGameId === 'craypots') {
      startCraypots(room, court, current);
    } else {
      broadcastRoom(room);
    }
  }, 3000);
}

function beginInitialMatches(room: Room) {
  room.phase = 'playing';
  for (const court of room.courts) {
    if (court.activeMatch?.status === 'ready') scheduleMatchStart(room, court, court.activeMatch);
  }
}

function tryStartWaitingMatches(room: Room) {
  for (const court of room.courts) {
    if (!court.activeMatch && court.waiting.length >= 2) {
      const a = court.waiting.shift()!;
      const b = court.waiting.shift()!;
      const match = makeMatch(court.index, a, b, 'countdown');
      court.activeMatch = match;
      scheduleMatchStart(room, court, match);
    }
  }
}

function queueLateJoiner(room: Room, playerId: string) {
  if (!room.lateJoinQueue.includes(playerId)) room.lateJoinQueue.push(playerId);
}

function takeNextConnectedLateJoiner(room: Room) {
  for (let i = 0; i < room.lateJoinQueue.length; i++) {
    const playerId = room.lateJoinQueue[i];
    const player = room.players.get(playerId);
    if (!player || player.isHost || player.isBot) {
      room.lateJoinQueue.splice(i, 1);
      i -= 1;
      continue;
    }
    if (!player.connected) continue;
    room.lateJoinQueue.splice(i, 1);
    return playerId;
  }
  return undefined;
}

function playerActiveMatch(room: Room, playerId: string) {
  return room.courts.find((court) => court.activeMatch?.playerIds.includes(playerId));
}

function playerWaitingCourt(room: Room, playerId: string) {
  return room.courts.find((court) => court.waiting.includes(playerId));
}

function reindexCourts(room: Room) {
  room.courts.forEach((court, index) => {
    court.index = index;
    if (court.activeMatch) court.activeMatch.courtIndex = index;
  });
}

function createNewLowestHostMatch(room: Room, latePlayerId: string) {
  const court: Court = {
    index: 0,
    activeMatch: makeMatch(0, room.hostId, latePlayerId, 'ready'),
    waiting: [],
  };
  room.courts.unshift(court);
  reindexCourts(room);
  room.hostParticipating = true;

  if (room.phase === 'playing' && court.activeMatch) {
    scheduleMatchStart(room, court, court.activeMatch);
  }
}

function replaceWaitingHostWithLateJoiner(room: Room, latePlayerId: string) {
  const court = playerWaitingCourt(room, room.hostId);
  if (!court) return false;
  const hostIndex = court.waiting.indexOf(room.hostId);
  if (hostIndex < 0) return false;
  court.waiting[hostIndex] = latePlayerId;
  room.hostParticipating = false;
  tryStartWaitingMatches(room);
  return true;
}

function integrateLateJoiners(room: Room) {
  if (room.phase === 'lobby') return;

  // Late students never interrupt a live/ready host match. They spectate until
  // the teacher's current match reaches a clean boundary. If the teacher is
  // already waiting between matches, that waiting position is safe to hand over.
  while (true) {
    if (room.hostParticipating) {
      if (playerActiveMatch(room, room.hostId)) return;

      const replacement = takeNextConnectedLateJoiner(room);
      if (!replacement) return;
      if (replaceWaitingHostWithLateJoiner(room, replacement)) {
        // The host is now free. If another late student is already queued, the
        // next loop can create a fresh lowest-ranked Host vs Student match.
        continue;
      }

      // Defensive recovery: if the host is marked as participating but is no
      // longer on any court, treat them as a spectator and reconcile normally.
      room.hostParticipating = false;
      room.lateJoinQueue.unshift(replacement);
      continue;
    }

    const latePlayerId = takeNextConnectedLateJoiner(room);
    if (!latePlayerId) return;

    // With an even number of active students the teacher is spectating. The next
    // late student therefore pairs with the teacher on a brand-new lowest desk.
    createNewLowestHostMatch(room, latePlayerId);
    return;
  }
}


function rebalanceHostAfterRemoval(room: Room) {
  const host = room.players.get(room.hostId);
  if (!host?.connected || room.phase === 'lobby') return;
  const connectedStudents = [...room.players.values()].filter((p) => !p.isHost && !p.isBot && p.connected);
  const shouldHostParticipate = connectedStudents.length % 2 === 1;

  if (shouldHostParticipate) {
    room.hostExitAfterMatch = false;
    if (room.hostParticipating) return;
    room.hostParticipating = true;
    if (!playerActiveMatch(room, room.hostId) && !playerWaitingCourt(room, room.hostId) && room.courts.length) {
      room.courts[0].waiting.push(room.hostId);
    }
    return;
  }

  if (!room.hostParticipating) return;
  const active = playerActiveMatch(room, room.hostId);
  if (active) {
    room.hostExitAfterMatch = true;
    return;
  }

  for (const court of room.courts) court.waiting = court.waiting.filter((id) => id !== room.hostId);
  room.hostParticipating = false;
  room.hostExitAfterMatch = false;
}

function kickPlayerFromRoom(room: Room, targetId: string) {
  const target = room.players.get(targetId);
  if (!target || target.isHost || target.isBot) return;

  room.kickedNames.add(target.normalizedName);
  const targetSocket = socketsByPlayer.get(target.id);
  if (targetSocket) {
    send(targetSocket, {
      type: 'kicked',
      bannedName: target.name,
      roomCode: room.code,
      message: `The host removed you from room ${room.code}. The name “${target.name}” is now banned in this room. Choose a different name before rejoining.`,
    });
    targetSocket.close(4001, 'Removed by host');
  }

  room.lateJoinQueue = room.lateJoinQueue.filter((id) => id !== target.id);
  for (const court of room.courts) court.waiting = court.waiting.filter((id) => id !== target.id);

  if (room.phase === 'matchups') {
    room.players.delete(target.id);
    socketsByPlayer.delete(target.id);
    // Before the first games begin, rebuild the ready courts from the remaining
    // class so nobody inherits a forfeit or an empty desk.
    prepareCourts(room);
    return;
  }

  const activeCourt = room.courts.find((court) => court.activeMatch?.playerIds.includes(target.id));
  if (activeCourt?.activeMatch) {
    const match = activeCourt.activeMatch;
    const opponentId = match.playerIds.find((id) => id !== target.id);
    activeCourt.activeMatch = undefined;
    if (opponentId && room.players.has(opponentId)) {
      const lastCourt = Math.max(0, room.courts.length - 1);
      const opponent = room.players.get(opponentId);
      if (opponent) opponent.points += 1;
      if (activeCourt.index === lastCourt) room.currentChampionId = opponentId;
      const destination = Math.min(lastCourt, activeCourt.index + 1);
      if (!room.courts[destination].waiting.includes(opponentId)) room.courts[destination].waiting.push(opponentId);
    }
  }

  if (room.currentChampionId === target.id) room.currentChampionId = undefined;
  room.players.delete(target.id);
  socketsByPlayer.delete(target.id);
  rebalanceHostAfterRemoval(room);
  tryStartWaitingMatches(room);
  integrateLateJoiners(room);
}

function resolveMatch(room: Room, matchId: string, winnerId: string) {
  const court = room.courts.find((c) => c.activeMatch?.id === matchId);
  const match = court?.activeMatch;
  if (!court || !match || match.status !== 'playing') throw new Error('That match is not currently playable.');
  if (!match.playerIds.includes(winnerId)) throw new Error('The selected winner is not in that match.');

  const loserId = match.playerIds.find((id) => id !== winnerId)!;
  match.status = 'complete';
  match.winnerId = winnerId;

  const lastCourt = room.courts.length - 1;
  const winner = room.players.get(winnerId);
  if (winner) winner.points += 1;
  if (court.index === lastCourt) room.currentChampionId = winnerId;

  // Solo practice is a special case. If a real student joins while Host vs Gem
  // Bot is running, let the practice match finish, remove the bot, then start the
  // real Host vs Student court.
  const botId = match.playerIds.find((id) => room.players.get(id)?.isBot);
  if (botId) {
    const latePlayerId = takeNextConnectedLateJoiner(room);
    if (latePlayerId) {
      court.activeMatch = undefined;
      court.waiting = court.waiting.filter((id) => id !== botId);
      room.players.delete(botId);
      room.hostParticipating = true;
      const nextMatch = makeMatch(court.index, room.hostId, latePlayerId, 'ready');
      court.activeMatch = nextMatch;
      scheduleMatchStart(room, court, nextMatch);
      broadcastRoom(room);
      return;
    }
  }

  const winnerDestination = Math.min(lastCourt, court.index + 1);
  const loserDestination = Math.max(0, court.index - 1);

  // If the teacher is currently part of the King-of-the-Court rotation and a
  // late student is waiting, the late student takes the teacher's *position* at
  // this match boundary. Points remain attached to the teacher's own Player
  // record; the late student's score remains the zero they joined with.
  const hostReplacementId = match.playerIds.includes(room.hostId)
    ? takeNextConnectedLateJoiner(room)
    : undefined;

  court.activeMatch = undefined;

  const routePlayer = (playerId: string, destination: number) => {
    if (playerId === room.hostId && hostReplacementId) {
      room.courts[destination].waiting.push(hostReplacementId);
      room.hostParticipating = false;
      room.hostExitAfterMatch = false;
      return;
    }
    if (playerId === room.hostId && room.hostExitAfterMatch) {
      room.hostParticipating = false;
      room.hostExitAfterMatch = false;
      return;
    }
    room.courts[destination].waiting.push(playerId);
  };

  routePlayer(winnerId, winnerDestination);
  routePlayer(loserId, loserDestination);

  tryStartWaitingMatches(room);
  integrateLateJoiners(room);
  broadcastRoom(room);
}

function resetToLobby(room: Room) {
  room.phase = 'lobby';
  room.courts = [];
  room.hostParticipating = false;
  room.hostExitAfterMatch = false;
  room.lateJoinQueue = [];
  room.currentChampionId = undefined;
  for (const [id, player] of room.players) {
    if (player.isBot) room.players.delete(id);
    else player.points = 0;
  }
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[Minute to Win It] WebSocket server listening on ws://localhost:${PORT}`);

// Transport-level heartbeat copied from the proven Dodeca-Gems reconnect
// pattern. It detects half-open mobile/tablet sockets after Wi-Fi changes or
// browser backgrounding. Browsers answer WebSocket ping frames automatically.
const socketAlive = new WeakMap<WebSocket, boolean>();
const transportHeartbeat = setInterval(() => {
  for (const client of (wss as any).clients as Set<WebSocket>) {
    if (socketAlive.get(client) === false) {
      (client as any).terminate();
      continue;
    }
    socketAlive.set(client, false);
    try { (client as any).ping(); } catch { (client as any).terminate(); }
  }
}, 7000);
transportHeartbeat.unref?.();
(wss as any).on('close', () => clearInterval(transportHeartbeat));

wss.on('connection', (ws) => {
  contexts.set(ws, {});
  socketAlive.set(ws, true);
  (ws as any).on('pong', () => socketAlive.set(ws, true));
  send(ws, { type: 'connected', serverTime: Date.now() });

  ws.on('message', (raw) => {
    // Any traffic proves this socket is alive even if a proxy/browser delays a
    // control-frame pong. This is useful on iPadOS and congested school Wi-Fi.
    socketAlive.set(ws, true);
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(ws, { type: 'error', code: 'bad-json', message: 'Invalid message received.' });
      return;
    }

    try {
      if (msg.type === 'ping') {
        send(ws, { type: 'pong', sentAt: msg.sentAt, serverTime: Date.now() });
        return;
      }

      if (msg.type === 'host-room') {
        const name = cleanName(msg.name);
        if (!name) throw new Error('Enter a name first.');
        if (!msg.deviceId) throw new Error('Device ID is missing.');
        if (rejectDuplicateDevice(ws, msg.deviceId)) return;

        const code = makeRoomCode();
        const host = createPlayer(name, msg.deviceId, true);
        const room: Room = {
          code,
          hostId: host.id,
          players: new Map([[host.id, host]]),
          kickedNames: new Set(),
          selectedGameId: 'lights-out',
          phase: 'lobby',
          courts: [],
          hostParticipating: false,
          hostExitAfterMatch: false,
          turnSeconds: defaultTurnSeconds('lights-out'),
          starterHistory: new Map(),
          hexHorizontalHistory: new Map(),
          lateJoinQueue: [],
          currentChampionId: undefined,
        };
        rooms.set(code, room);
        attachPlayer(ws, room, host);
        return;
      }

      if (msg.type === 'join-room') {
        const roomCode = msg.roomCode.trim();
        if (!/^\d{5}$/.test(roomCode)) throw new Error('Enter the five-digit room code.');
        const room = rooms.get(roomCode);
        if (!room) throw new Error('Room not found. Check the five-digit room code.');
        if (room.players.size >= MAX_PLAYERS) throw new Error('This room already has 40 players.');
        if (rejectDuplicateDevice(ws, msg.deviceId)) return;

        const name = cleanName(msg.name);
        const normalized = normaliseName(name);
        if (!name) throw new Error('Enter a name first.');
        if (room.kickedNames.has(normalized)) throw new Error('That player name is banned in this room because the host removed it. Choose a different name before rejoining.');
        if ([...room.players.values()].some((p) => p.normalizedName === normalized)) {
          send(ws, { type: 'error', code: 'duplicate-name', message: 'That name is already in the room. Use a different name.' });
          return;
        }

        const player = createPlayer(name, msg.deviceId, false);
        room.players.set(player.id, player);
        if (room.phase !== 'lobby') queueLateJoiner(room, player.id);
        attachPlayer(ws, room, player);
        if (room.phase !== 'lobby') {
          integrateLateJoiners(room);
          broadcastRoom(room);
        }
        return;
      }

      if (msg.type === 'resume') {
        const room = rooms.get(msg.roomCode.toUpperCase());
        const player = room?.players.get(msg.playerId);
        if (!room || !player || player.resumeToken !== msg.resumeToken || player.deviceId !== msg.deviceId) {
          send(ws, { type: 'resume-failed' });
          return;
        }
        const existing = socketsByPlayer.get(player.id);
        if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) existing.close(4002, 'Reconnected elsewhere');
        attachPlayer(ws, room, player);
        if (room.phase !== 'lobby' && room.lateJoinQueue.includes(player.id)) {
          integrateLateJoiners(room);
          broadcastRoom(room);
        }
        return;
      }

      if (msg.type === 'select-game') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        if (room.phase !== 'lobby') throw new Error('Return to the lobby before changing games.');
        room.selectedGameId = String(msg.gameId).slice(0, 64);
        room.turnSeconds = defaultTurnSeconds(room.selectedGameId);
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'set-turn-seconds') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        if (room.phase !== 'lobby') throw new Error('Turn timing can only be changed in the lobby.');
        room.turnSeconds = clampTurnSeconds(Number(msg.seconds));
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'kick-player') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        kickPlayerFromRoom(room, msg.playerId);
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'prepare-matchups') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        if (room.phase !== 'lobby') throw new Error('Matchups are already active.');
        prepareCourts(room);
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'begin-matchups') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        if (room.phase !== 'matchups') throw new Error('Prepare the matchups first.');
        beginInitialMatches(room);
        return;
      }

      if (msg.type === 'resolve-match') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        resolveMatch(room, msg.matchId, msg.winnerId);
        return;
      }

      if (msg.type === 'precision-progress') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !live.match.precision || live.match.status !== 'playing') throw new Error('That precision match is not active.');
        if (!live.match.playerIds.includes(ctx.playerId!)) throw new Error('You are not part of that match.');
        if (live.match.precision.phase !== 'playing' || live.match.precision.results[ctx.playerId!]) return;
        live.match.precision.progress[ctx.playerId!] = {
          round: Math.max(0, Math.min(20, Math.round(Number(msg.round) || 0))),
          label: String(msg.label ?? '').slice(0, 40),
          value: Number.isFinite(Number(msg.value)) ? Number(msg.value) : undefined,
        };
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'precision-result') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live) throw new Error('That match is no longer active.');
        if (!isPrecisionGame(room.selectedGameId)) throw new Error('That result belongs to a different mini-game.');
        submitPrecisionResult(room, live.court, live.match, ctx.playerId!, msg);
        return;
      }

      if (msg.type === 'three-hexagon-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'three-hexagon') throw new Error('That move belongs to a different mini-game.');
        applyThreeHexAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'four-star-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'four-star') throw new Error('That move belongs to a different mini-game.');
        applyFourStarAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'boxes-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'boxes') throw new Error('That move belongs to a different mini-game.');
        applyBoxesAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'never-touch-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'never-touch') throw new Error('That move belongs to a different mini-game.');
        applyNeverTouchAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'spiral-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'spiral') throw new Error('That move belongs to a different mini-game.');
        applySpiralAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'hex-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'hex') throw new Error('That move belongs to a different mini-game.');
        applyHexAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'factor-game-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'factor-game') throw new Error('That move belongs to a different mini-game.');
        applyFactorAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'hedron-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'hedron') throw new Error('That move belongs to a different mini-game.');
        applyHedronAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'multi-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'multi') throw new Error('That move belongs to a different mini-game.');
        applyMultiAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'ultimate-ttt-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'ultimate-tic-tac-toe') throw new Error('That move belongs to a different mini-game.');
        applyUltimateAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }


      if (msg.type === 'lucky-thirteen-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'lucky-thirteen') throw new Error('That move belongs to a different mini-game.');
        applyLuckyThirteenAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }


      if (msg.type === 'craypots-move') {
        const result = getRoomFor(ws);
        if (!result) throw new Error('You are not connected to a room.');
        const { room, ctx } = result;
        const live = findLiveMatch(room, String(msg.matchId));
        if (!live || !ctx.playerId || !live.match.playerIds.includes(ctx.playerId)) throw new Error('You are not playing in that match.');
        if (room.selectedGameId !== 'craypots') throw new Error('That decision belongs to a different mini-game.');
        applyCraypotsAction(room, live.court, live.match, ctx.playerId, msg.action, 'player');
        return;
      }

      if (msg.type === 'return-lobby') {
        const { room } = requireHost(ws) ?? {};
        if (!room) return;
        resetToLobby(room);
        broadcastRoom(room);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      send(ws, { type: 'error', code: 'request-failed', message });
    }
  });

  ws.on('close', () => {
    const ctx = contexts.get(ws);
    if (ctx?.deviceId && activeDevices.get(ctx.deviceId) === ws) activeDevices.delete(ctx.deviceId);
    if (!ctx?.roomCode || !ctx.playerId) return;

    // A reconnect replaces the old socket. The old socket's close event can
    // arrive AFTER attachPlayer() has already installed the replacement. Only
    // the currently-authoritative socket may mark the player offline. Without
    // this guard, a genuinely reconnected phone/iPad can randomly appear
    // disconnected and start the 20-second forfeit countdown.
    if (socketsByPlayer.get(ctx.playerId) !== ws) return;

    socketsByPlayer.delete(ctx.playerId);
    const room = rooms.get(ctx.roomCode);
    const player = room?.players.get(ctx.playerId);
    if (room && player) {
      player.connected = false;
      const court = room.courts.find((candidate) => candidate.activeMatch?.playerIds.includes(player.id));
      const match = court?.activeMatch;
      if (court && match && match.status === 'playing' && !player.isBot) {
        const graceUntil = Date.now() + 20000;
        match.disconnectPause = { playerId: player.id, graceUntil };
        const expectedMatchId = match.id;
        setTimeout(() => {
          const live = findLiveMatch(room, expectedMatchId);
          const disconnected = room.players.get(player.id);
          if (!live || disconnected?.connected || live.match.disconnectPause?.playerId !== player.id) return;
          const opponentId = live.match.playerIds.find((id) => id !== player.id);
          if (!opponentId) return;
          live.match.disconnectPause = undefined;
          try { resolveMatch(room, expectedMatchId, opponentId); } catch { /* match already moved */ }
        }, 20100);
      }
      broadcastRoom(room);
    }
  });
});
