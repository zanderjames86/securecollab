/**
 * SecureCollab sync server (Cloudflare Worker + Durable Objects).
 *
 * Zero-knowledge by construction: it receives only encrypted, signed
 * envelopes and opaque encrypted invite payloads. It holds no keys and
 * never decrypts anything.
 */
import { DurableObject } from "cloudflare:workers";
import {
  ID_PATTERN,
  INVITE_TTL_MS,
  MAX_INVITE_CHARS,
  type InvitePutBody,
  type ServerMessage,
  type StoredUpdate,
} from "@securecollab/protocol";
import { RoomCore, type Peer, type UpdateLog } from "./room-core";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  INVITES: DurableObjectNamespace<InviteStore>;
  ASSETS: Fetcher;
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

    if (parts[0] !== "api") return env.ASSETS.fetch(request);

    if (parts[1] === "health") return json({ ok: true });

    if (parts[1] === "room" && parts.length === 3) {
      const roomId = parts[2]!;
      if (!ID_PATTERN.test(roomId)) return json({ error: "bad room id" }, 400);
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "expected websocket" }, 426);
      }
      return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(request);
    }

    if (parts[1] === "invite" && parts[2] && ID_PATTERN.test(parts[2])) {
      return env.INVITES.get(env.INVITES.idFromName("invites")).fetch(request);
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/** One Durable Object per document (or team, or keyring). */
export class Room extends DurableObject<Env> {
  private readonly core: RoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS updates (s INTEGER PRIMARY KEY AUTOINCREMENT, d TEXT NOT NULL, at INTEGER NOT NULL)",
    );
    const log: UpdateLog = {
      append(d: string): number {
        const row = sql
          .exec<{ s: number }>("INSERT INTO updates (d, at) VALUES (?, ?) RETURNING s", d, Date.now())
          .one();
        return row.s;
      },
      after(since: number, limit: number): StoredUpdate[] {
        return sql
          .exec<{ s: number; d: string }>(
            "SELECT s, d FROM updates WHERE s > ? ORDER BY s LIMIT ?",
            since,
            limit,
          )
          .toArray()
          .map((r) => ({ s: r.s, d: r.d }));
      },
    };
    this.core = new RoomCore(log);
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    // Hibernation API: idle rooms cost nothing while sockets stay open.
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      ws.send(JSON.stringify({ t: "err", m: "text frames only" } satisfies ServerMessage));
      return;
    }
    const others = this.ctx.getWebSockets().filter((s) => s !== ws).map(peerOf);
    this.core.handle(message, peerOf(ws), others);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      // already closed
    }
  }

  async webSocketError(): Promise<void> {
    // The client reconnects on its own; nothing to clean up.
  }
}

function peerOf(ws: WebSocket): Peer {
  return {
    send(message: ServerMessage) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        // socket closed mid-broadcast; it will resync on reconnect
      }
    },
  };
}

/**
 * Single-use, expiring invite mailbox. Payloads are encrypted with a key
 * that only exists in the invite link's fragment, so the server cannot read them.
 */
export class InviteStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    sql.exec("DELETE FROM invites WHERE expires < ?", now);

    const parts = new URL(request.url).pathname.split("/").filter(Boolean); // api, invite, id, [claim]
    const id = parts[2]!;
    const action = parts[3];

    if (request.method === "PUT" && !action) {
      let body: InvitePutBody;
      try {
        body = (await request.json()) as InvitePutBody;
      } catch {
        return json({ error: "bad body" }, 400);
      }
      if (
        typeof body?.payload !== "string" ||
        body.payload.length > MAX_INVITE_CHARS ||
        !/^[A-Za-z0-9_-]+$/.test(body.payload)
      ) {
        return json({ error: "bad payload" }, 400);
      }
      const exists = sql.exec("SELECT 1 FROM invites WHERE id = ?", id).toArray().length > 0;
      if (exists) return json({ error: "invite exists" }, 409);
      sql.exec("INSERT INTO invites (id, payload, expires) VALUES (?, ?, ?)", id, body.payload, now + INVITE_TTL_MS);
      return json({ ok: true, expires: now + INVITE_TTL_MS }, 201);
    }

    if (request.method === "POST" && action === "claim") {
      const rows = sql
        .exec<{ payload: string }>("DELETE FROM invites WHERE id = ? RETURNING payload", id)
        .toArray();
      if (rows.length === 0) return json({ error: "invite not found, already used, or expired" }, 404);
      return json({ payload: rows[0]!.payload });
    }

    if (request.method === "DELETE" && !action) {
      sql.exec("DELETE FROM invites WHERE id = ?", id);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  }
}
