/**
 * Wire protocol between browsers and the sync server.
 *
 * The server only ever sees opaque, encrypted, signed envelopes ("d", base64).
 * It stores them in order and relays them; it cannot read or alter them
 * without every client detecting it.
 */

/** Largest single envelope the server accepts (base64 characters). */
export const MAX_ENVELOPE_CHARS = 2_000_000;
/** History is sent to a joining client in pages of this many updates. */
export const HISTORY_PAGE = 500;
/** Invites expire after this long if unclaimed. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Largest encrypted invite payload (base64 characters). */
export const MAX_INVITE_CHARS = 16_000;

/** Room and invite ids: 16 random bytes, URL-safe base64 (22 chars). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type ClientMessage =
  /** Ask for every stored update after sequence number `since`. */
  | { t: "sync"; since: number }
  /** Store and relay an encrypted update; `id` is echoed in the ack. */
  | { t: "up"; id: string; d: string }
  /** Relay an encrypted presence (cursor, name) update; not stored. */
  | { t: "aw"; d: string };

export type ServerMessage =
  /** A page of stored history. `done` marks the last page. */
  | { t: "hist"; items: StoredUpdate[]; done: boolean }
  /** A live update from another client. */
  | { t: "up"; s: number; d: string }
  /** Confirms an update from this client was stored as sequence `s`. */
  | { t: "ack"; id: string; s: number }
  /** Presence from another client. */
  | { t: "aw"; d: string }
  | { t: "err"; m: string };

export interface StoredUpdate {
  s: number;
  d: string;
}

export interface InvitePutBody {
  payload: string;
}

export interface InviteClaimResponse {
  payload: string;
}
