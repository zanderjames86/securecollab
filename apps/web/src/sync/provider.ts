/**
 * EncryptedProvider: keeps a Yjs document in sync through the relay server.
 *
 * Every local change is encrypted with the room key and signed by the user
 * before it leaves the device. Every remote change is signature-checked and
 * decrypted before it is applied. The server sees only ciphertext.
 */
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import {
  fromB64,
  openEnvelope,
  randomId,
  sealEnvelope,
  toB64,
  type Identity,
} from "@securecollab/crypto";
import type { ClientMessage, ServerMessage, StoredUpdate } from "@securecollab/protocol";

export type ConnectionStatus = "connecting" | "online" | "offline";

/** Minimal WebSocket surface, so tests can plug in an in-memory socket. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface ProviderOptions {
  /** Base URL ending in "/api/room/" (ws: or wss:). */
  baseUrl: string;
  roomId: string;
  key: Uint8Array;
  identity: Identity;
  doc: Y.Doc;
  /** Optional allow-list check; updates from other authors are ignored. */
  isTrustedAuthor?: (authorId: string) => boolean;
  createSocket?: (url: string) => SocketLike;
  /** Defaults to true; set false for rooms without live cursors. */
  presence?: boolean;
}

export interface RemoteChange {
  author: string;
  seq: number;
}

type Events = {
  status: (status: ConnectionStatus) => void;
  synced: () => void;
  change: (change: RemoteChange) => void;
  rejected: (info: { seq: number; reason: string }) => void;
};

const OPEN = 1;

export class EncryptedProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly roomId: string;
  status: ConnectionStatus = "connecting";
  synced = false;
  /** Number of local edits not yet confirmed as stored by the server. */
  get unsavedCount(): number {
    return this.pending.size;
  }

  private readonly opts: ProviderOptions;
  private socket: SocketLike | null = null;
  private lastSeq = 0;
  private readonly pending = new Map<string, string>();
  private readonly listeners: { [K in keyof Events]: Set<Events[K]> } = {
    status: new Set(),
    synced: new Set(),
    change: new Set(),
    rejected: new Set(),
  };
  private retryDelay = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(opts: ProviderOptions) {
    this.opts = opts;
    this.doc = opts.doc;
    this.roomId = opts.roomId;
    this.awareness = new Awareness(opts.doc);
    this.doc.on("update", this.onDocUpdate);
    if (opts.presence !== false) this.awareness.on("update", this.onAwarenessUpdate);
    this.connect();
  }

  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<Events[K]>) => void)(...args);
  }

  private ctx(kind: "update" | "presence"): string {
    return `room:${this.roomId}/${kind}`;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private connect(): void {
    if (this.destroyed) return;
    this.setStatus("connecting");
    const url = this.opts.baseUrl + this.roomId;
    const socket = this.opts.createSocket
      ? this.opts.createSocket(url)
      : (new WebSocket(url) as unknown as SocketLike);
    this.socket = socket;

    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.retryDelay = 1000;
      this.setStatus("online");
      this.send({ t: "sync", since: this.lastSeq });
      for (const [id, d] of this.pending) this.send({ t: "up", id, d });
      if (this.opts.presence !== false && this.awareness.getLocalState() !== null) {
        this.broadcastPresence([this.doc.clientID]);
      }
    };
    socket.onmessage = (ev) => {
      if (socket !== this.socket || typeof ev.data !== "string") return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.setStatus("offline");
      const others = [...this.awareness.getStates().keys()].filter((c) => c !== this.doc.clientID);
      removeAwarenessStates(this.awareness, others, this);
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // onclose follows and handles reconnection
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.retryTimer) return;
    const jitter = Math.random() * 500;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, this.retryDelay + jitter);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  /** Reconnect immediately (for example when the phone comes back online). */
  reconnectNow(): void {
    if (this.status === "online" || this.destroyed) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }

  private send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "hist":
        for (const item of msg.items) this.applyRemote(item);
        if (msg.done && !this.synced) {
          this.synced = true;
          this.emit("synced");
        }
        return;
      case "up":
        this.applyRemote({ s: msg.s, d: msg.d });
        return;
      case "ack":
        this.pending.delete(msg.id);
        if (msg.s > this.lastSeq) this.lastSeq = msg.s;
        return;
      case "aw":
        this.applyPresence(msg.d);
        return;
      case "err":
        console.warn(`[sync ${this.roomId}] server error: ${msg.m}`);
        return;
    }
  }

  private applyRemote(item: StoredUpdate): void {
    if (item.s <= this.lastSeq) return;
    this.lastSeq = item.s;
    try {
      const opened = openEnvelope(fromB64(item.d), this.opts.key, this.ctx("update"));
      if (this.opts.isTrustedAuthor && !this.opts.isTrustedAuthor(opened.author)) {
        this.emit("rejected", { seq: item.s, reason: "author is not a member" });
        return;
      }
      Y.applyUpdate(this.doc, opened.payload, this);
      this.emit("change", { author: opened.author, seq: item.s });
    } catch (err) {
      this.emit("rejected", { seq: item.s, reason: (err as Error).message });
    }
  }

  private applyPresence(d: string): void {
    try {
      const opened = openEnvelope(fromB64(d), this.opts.key, this.ctx("presence"));
      if (this.opts.isTrustedAuthor && !this.opts.isTrustedAuthor(opened.author)) return;
      applyAwarenessUpdate(this.awareness, opened.payload, this);
    } catch {
      // ignore unreadable presence
    }
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return;
    const d = toB64(sealEnvelope(update, this.opts.key, this.opts.identity, this.ctx("update")));
    const id = randomId();
    this.pending.set(id, d);
    this.send({ t: "up", id, d });
  };

  private readonly onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    const clients = [...changes.added, ...changes.updated, ...changes.removed];
    this.broadcastPresence(clients);
  };

  private broadcastPresence(clients: number[]): void {
    const payload = encodeAwarenessUpdate(this.awareness, clients);
    const d = toB64(sealEnvelope(payload, this.opts.key, this.opts.identity, this.ctx("presence")));
    this.send({ t: "aw", d });
  }

  destroy(): void {
    if (this.destroyed) return;
    // Tell others we left (the awareness listener broadcasts the removal).
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.destroy();
    const s = this.socket;
    this.socket = null;
    s?.close();
  }
}
