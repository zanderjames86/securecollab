import {
  HISTORY_PAGE,
  MAX_ENVELOPE_CHARS,
  type ClientMessage,
  type ServerMessage,
  type StoredUpdate,
} from "@securecollab/protocol";

/** Storage the room needs; backed by Durable Object SQLite in production. */
export interface UpdateLog {
  append(data: string): number;
  after(since: number, limit: number): StoredUpdate[];
}

/** A connected client, as the room sees it. */
export interface Peer {
  send(message: ServerMessage): void;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Room logic, independent of Cloudflare so it can be unit tested.
 * The room never decrypts anything: it orders, stores and relays.
 */
export class RoomCore {
  constructor(private readonly log: UpdateLog) {}

  handle(raw: string, from: Peer, others: Iterable<Peer>): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      from.send({ t: "err", m: "malformed message" });
      return;
    }
    switch (msg?.t) {
      case "sync":
        this.sendHistory(from, msg.since);
        return;
      case "up": {
        if (!this.validEnvelope(msg.d) || typeof msg.id !== "string" || msg.id.length > 64) {
          from.send({ t: "err", m: "invalid update" });
          return;
        }
        const s = this.log.append(msg.d);
        from.send({ t: "ack", id: msg.id, s });
        for (const peer of others) peer.send({ t: "up", s, d: msg.d });
        return;
      }
      case "aw":
        if (!this.validEnvelope(msg.d)) {
          from.send({ t: "err", m: "invalid presence" });
          return;
        }
        for (const peer of others) peer.send({ t: "aw", d: msg.d });
        return;
      default:
        from.send({ t: "err", m: "unknown message type" });
    }
  }

  private sendHistory(to: Peer, since: unknown): void {
    let cursor = typeof since === "number" && Number.isInteger(since) && since >= 0 ? since : 0;
    for (;;) {
      const items = this.log.after(cursor, HISTORY_PAGE);
      const done = items.length < HISTORY_PAGE;
      to.send({ t: "hist", items, done });
      if (done) return;
      cursor = items[items.length - 1]!.s;
    }
  }

  private validEnvelope(d: unknown): d is string {
    return typeof d === "string" && d.length > 0 && d.length <= MAX_ENVELOPE_CHARS && B64URL.test(d);
  }
}

/** In-memory log, used in tests and local experiments. */
export class MemoryLog implements UpdateLog {
  private items: StoredUpdate[] = [];
  append(data: string): number {
    const s = this.items.length + 1;
    this.items.push({ s, d: data });
    return s;
  }
  after(since: number, limit: number): StoredUpdate[] {
    return this.items.filter((u) => u.s > since).slice(0, limit);
  }
}
