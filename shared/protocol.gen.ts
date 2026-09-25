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
  mode: 'share' | 'pdf' | null;
  pdf: PdfState | null;
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
  mode: 'share' | 'pdf';
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

export interface ServerEvents {
  batch: BatchEvent;
  correction: CorrectionEvent;
  screen_update: ScreenUpdateEvent;
  chat: ChatEvent;
  reaction: ReactionEvent;
}

export type ProtocolError = 'bad_payload' | 'unknown_event' | 'rate_limited' | 'busy' | 'not_owner' | 'too_far' | 'unknown_screen' | 'livekit_disabled';

export const CLIENT_EVENTS = ["move","media_state","livekit_token","screen_claim","screen_release","pdf_open","pdf_page","chat_send","react"] as const;
export const SERVER_EVENTS = ["batch","correction","screen_update","chat","reaction"] as const;
