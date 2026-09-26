// AUTO-GENERATED from shared/protocol.json by client/scripts/gen-protocol.mjs. Do not edit.
/* eslint-disable */
export const PROTOCOL_VERSION = 1;

export const Anim = {"idle":0,"walk":1,"run":2,"sit":3} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];

export const Emoji = {"thumbsUp":1,"laugh":2,"heart":3,"clap":4,"raiseHand":5} as const;
export type Emoji = (typeof Emoji)[keyof typeof Emoji];

export type PlayerTuple = [x: number, y: number, z: number, rotY: number, anim: number];

export type BatchEntry = [id: string, x: number, y: number, z: number, rotY: number, anim: number];

export interface PresenceMeta {
  name: string;
  color: string;
  zone: string | null;
  muted: boolean;
  cam: boolean;
  online_at: number;
}

export interface PdfState {
  url: string;
  name: string;
  page: number;
  pages: number;
}

export interface ScreenState {
  id: string;
  owner: string | null;
  mode: 'share' | 'pdf' | 'browser' | null;
  pdf: PdfState | null;
  url: string | null;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  scope: 'global' | 'zone';
  zone: string | null;
  text: string;
  ts: number;
}

export interface PlayerSnapshot {
  id: string;
  s: PlayerTuple;
}

export interface BoardStroke {
  id: string;
  boardId: string;
  from: string;
  points: number[];
  color: string;
  width: number;
}

export interface Sticker {
  id: string;
  boardId: string;
  url: string;
  x: number;
  y: number;
  rot: number;
  from: string;
}

export interface PropState {
  id: string;
  jammed: boolean;
  lastItem: string | null;
  lastBuyer: string | null;
}

export interface PropFx {
  id: string;
  propId: string;
  by: string;
  action: string;
  outcome: string;
  item: string | null;
  variant: number;
  t: number;
}

export interface Toss {
  id: string;
  by: string;
  origin: number[];
  vel: number[];
  t: number;
  flight: number;
  land: number[];
  hit: 'bin' | 'player' | null;
  target: string | null;
  points: number;
}

export interface Score {
  id: string;
  name: string;
  color: string;
  points: number;
  shots: number;
  bonks: number;
  drillMs: number | null;
  medals: number;
}

export interface DrillEntry {
  id: string;
  name: string;
  ms: number;
}

export interface DrillState {
  active: boolean;
  by: string | null;
  byName: string | null;
  startedAt: number;
  endsAt: number;
  cooldownUntil: number;
  evacuated: DrillEntry[];
}

export interface Jello {
  deskId: string;
  by: string;
}

export interface PongState {
  id: string;
  a: string | null;
  b: string | null;
  pa: number;
  pb: number;
  ball: number[];
  sa: number;
  sb: number;
  status: 'idle' | 'point' | 'playing' | 'won';
  winner: string | null;
  t: number;
}

export interface Dart {
  id: string;
  boardId: string;
  by: string;
  u: number;
  v: number;
  points: number;
  ring: string;
}

export interface Annotation {
  id: string;
  screenId: string;
  by: string;
  ctx: string;
  tool: 'pen' | 'highlight' | 'rect' | 'arrow';
  color: string;
  width: number;
  points: number[];
}

export interface AnnotSettings {
  screenId: string;
  locked: boolean;
  spotlight: number[] | null;
  ctx: string;
}

export interface JoinParams {
  playerId: string;
  name: string;
  color: string;
  auth?: string;
}

export interface JoinReply {
  self: string;
  players: PlayerSnapshot[];
  screens: ScreenState[];
  chat: ChatMessage[];
  boards: BoardStroke[];
  stickers: Sticker[];
  props: PropState[];
  scores: Score[];
  drill: DrillState;
  jellos: Jello[];
  pongs: PongState[];
  darts: Dart[];
  annotations: Annotation[];
  annotSettings: AnnotSettings[];
  serverTime: number;
}

export type JoinError = 'bad_params' | 'full' | 'unauthorized';

export interface MovePayload {
  s: number[];
}

export interface MediaStatePayload {
  muted: boolean;
  cam: boolean;
}

export interface LivekitTokenPayload {}
export interface LivekitTokenReply {
  token: string;
  url: string | null;
  room: string;
}

export interface ScreenClaimPayload {
  screenId: string;
  mode: 'share' | 'pdf' | 'browser';
  url?: string;
}
export interface ScreenClaimReply {
  screen: ScreenState;
}

export interface ScreenReleasePayload {
  screenId: string;
}

export interface PdfOpenPayload {
  screenId: string;
  url: string;
  name: string;
  pages: number;
}

export interface PdfPagePayload {
  screenId: string;
  page: number;
}

export interface ChatSendPayload {
  scope: 'global' | 'zone';
  text: string;
}

export interface ReactPayload {
  emoji: number;
}

export interface BoardStrokePayload {
  boardId: string;
  points: number[];
  color: string;
  width: number;
}

export interface BoardClearPayload {
  boardId: string;
}

export interface StickerAddPayload {
  boardId: string;
  url: string;
  x: number;
  y: number;
  rot: number;
}

export interface StickerRemovePayload {
  boardId: string;
  stickerId: string;
}

export interface PropUsePayload {
  propId: string;
  action: 'buy' | 'kick' | 'use';
  item?: string;
}
export interface PropUseReply {
  prop: PropState | null;
}

export interface TossPayload {
  origin: number[];
  vel: number[];
}

export interface AlarmPullPayload {
  propId: string;
}

export interface PrankPayload {
  deskId: string;
}

export interface BrowserTokenPayload {
  screenId: string;
}
export interface BrowserTokenReply {
  token: string;
  control: boolean;
}

export interface PongJoinPayload {
  tableId: string;
}
export interface PongJoinReply {
  side: 'a' | 'b';
}

export interface PongLeavePayload {
  tableId: string;
}

export interface PongPaddlePayload {
  tableId: string;
  x: number;
}

export interface DartThrowPayload {
  boardId: string;
  u: number;
  v: number;
}

export interface DartsClearPayload {
  boardId: string;
}

export interface NotePayload {
  propId: string;
  midi: number;
}

export interface AnnotStrokePayload {
  screenId: string;
  ctx: string;
  tool: 'pen' | 'highlight' | 'rect' | 'arrow';
  color: string;
  width: number;
  points: number[];
}

export interface AnnotUndoPayload {
  screenId: string;
}

export interface AnnotClearPayload {
  screenId: string;
  all: boolean;
}

export interface AnnotLaserPayload {
  screenId: string;
  x: number;
  y: number;
}

export interface AnnotSettingsPayload {
  screenId: string;
  locked: boolean;
  spotlight: number[] | null;
  ctx: string;
}

export interface ClientEvents {
  move: { payload: MovePayload; reply: null };
  media_state: { payload: MediaStatePayload; reply: null };
  livekit_token: { payload: LivekitTokenPayload; reply: LivekitTokenReply };
  screen_claim: { payload: ScreenClaimPayload; reply: ScreenClaimReply };
  screen_release: { payload: ScreenReleasePayload; reply: null };
  pdf_open: { payload: PdfOpenPayload; reply: null };
  pdf_page: { payload: PdfPagePayload; reply: null };
  chat_send: { payload: ChatSendPayload; reply: null };
  react: { payload: ReactPayload; reply: null };
  board_stroke: { payload: BoardStrokePayload; reply: null };
  board_clear: { payload: BoardClearPayload; reply: null };
  sticker_add: { payload: StickerAddPayload; reply: null };
  sticker_remove: { payload: StickerRemovePayload; reply: null };
  prop_use: { payload: PropUsePayload; reply: PropUseReply };
  toss: { payload: TossPayload; reply: null };
  alarm_pull: { payload: AlarmPullPayload; reply: null };
  prank: { payload: PrankPayload; reply: null };
  browser_token: { payload: BrowserTokenPayload; reply: BrowserTokenReply };
  pong_join: { payload: PongJoinPayload; reply: PongJoinReply };
  pong_leave: { payload: PongLeavePayload; reply: null };
  pong_paddle: { payload: PongPaddlePayload; reply: null };
  dart_throw: { payload: DartThrowPayload; reply: null };
  darts_clear: { payload: DartsClearPayload; reply: null };
  note: { payload: NotePayload; reply: null };
  annot_stroke: { payload: AnnotStrokePayload; reply: null };
  annot_undo: { payload: AnnotUndoPayload; reply: null };
  annot_clear: { payload: AnnotClearPayload; reply: null };
  annot_laser: { payload: AnnotLaserPayload; reply: null };
  annot_settings: { payload: AnnotSettingsPayload; reply: null };
}

export interface BatchEvent {
  t: number;
  p: BatchEntry[];
}

export interface CorrectionEvent {
  s: PlayerTuple;
}

export interface ScreenUpdateEvent {
  screen: ScreenState;
}

export interface ChatEvent {
  msg: ChatMessage;
}

export interface ReactionEvent {
  id: string;
  emoji: number;
}

export interface BoardStrokeEvent {
  stroke: BoardStroke;
}

export interface BoardClearEvent {
  boardId: string;
}

export interface StickerUpdateEvent {
  boardId: string;
  stickers: Sticker[];
}

export interface PropEventEvent {
  prop: PropState | null;
  fx: PropFx;
}

export interface TossEvent {
  toss: Toss;
}

export interface ScoresEvent {
  scores: Score[];
}

export interface DrillEvent {
  drill: DrillState;
}

export interface DeskUpdateEvent {
  deskId: string;
  jello: boolean;
  by: string | null;
}

export interface PongStateEvent {
  pong: PongState;
}

export interface DartEvent {
  dart: Dart;
  from: number[];
}

export interface DartsClearEvent {
  boardId: string;
}

export interface NoteEvent {
  id: string;
  propId: string;
  midi: number;
}

export interface AnnotStrokeEvent {
  stroke: Annotation;
}

export interface AnnotRemoveEvent {
  screenId: string;
  ids: string[];
}

export interface AnnotLaserEvent {
  screenId: string;
  id: string;
  x: number;
  y: number;
}

export interface AnnotSettingsEvent {
  settings: AnnotSettings;
}

export interface ServerEvents {
  batch: BatchEvent;
  correction: CorrectionEvent;
  screen_update: ScreenUpdateEvent;
  chat: ChatEvent;
  reaction: ReactionEvent;
  board_stroke: BoardStrokeEvent;
  board_clear: BoardClearEvent;
  sticker_update: StickerUpdateEvent;
  prop_event: PropEventEvent;
  toss: TossEvent;
  scores: ScoresEvent;
  drill: DrillEvent;
  desk_update: DeskUpdateEvent;
  pong_state: PongStateEvent;
  dart: DartEvent;
  darts_clear: DartsClearEvent;
  note: NoteEvent;
  annot_stroke: AnnotStrokeEvent;
  annot_remove: AnnotRemoveEvent;
  annot_laser: AnnotLaserEvent;
  annot_settings: AnnotSettingsEvent;
}

export type ProtocolError = 'bad_payload' | 'unknown_event' | 'rate_limited' | 'busy' | 'not_owner' | 'too_far' | 'unknown_screen' | 'unknown_prop' | 'livekit_disabled' | 'cooldown' | 'locked';

export const CLIENT_EVENTS = ["move","media_state","livekit_token","screen_claim","screen_release","pdf_open","pdf_page","chat_send","react","board_stroke","board_clear","sticker_add","sticker_remove","prop_use","toss","alarm_pull","prank","browser_token","pong_join","pong_leave","pong_paddle","dart_throw","darts_clear","note","annot_stroke","annot_undo","annot_clear","annot_laser","annot_settings"] as const;
export const SERVER_EVENTS = ["batch","correction","screen_update","chat","reaction","board_stroke","board_clear","sticker_update","prop_event","toss","scores","drill","desk_update","pong_state","dart","darts_clear","note","annot_stroke","annot_remove","annot_laser","annot_settings"] as const;
