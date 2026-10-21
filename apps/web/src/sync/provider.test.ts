import { beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createIdentity, newKey, ready, type Identity } from "@securecollab/crypto";
import type { ServerMessage } from "@securecollab/protocol";
import { MemoryLog, RoomCore, type Peer } from "../../../sync/src/room-core";
import { EncryptedProvider, type SocketLike } from "./provider";

/** In-memory relay that behaves like the real server, with switchable network. */
class FakeServer {
  readonly core = new RoomCore(new MemoryLog());
  readonly sockets = new Set<FakeSocket>();
  /** Everything the server ever received, to prove it only sees ciphertext. */
  readonly seen: string[] = [];
  online = true;

  connect = (_url: string): SocketLike => {
    const sock = new FakeSocket(this);
    queueMicrotask(() => {
      if (!this.online) {
        sock.readyState = 3;
        sock.onclose?.({});
        return;
      }
      this.sockets.add(sock);
      sock.readyState = 1;
      sock.onopen?.({});
    });
    return sock;
  };

  receive(from: FakeSocket, raw: string): void {
    this.seen.push(raw);
    const others = [...this.sockets].filter((s) => s !== from).map(asPeer);
    this.core.handle(raw, asPeer(from), others);
  }

  dropAll(): void {
    for (const s of [...this.sockets]) s.serverClose();
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: SocketLike["onopen"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  onmessage: SocketLike["onmessage"] = null;
  constructor(private readonly server: FakeServer) {}
  send(data: string): void {
    if (this.readyState !== 1) throw new Error("socket not open");
    const server = this.server;
    queueMicrotask(() => server.receive(this, data));
  }
  /** Called by the server to deliver a message to this client. */
  sendFromServer(m: ServerMessage): void {
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(m) }));
  }
  close(): void {
    this.serverClose();
  }
  serverClose(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.server.sockets.delete(this);
    queueMicrotask(() => this.onclose?.({}));
  }
}
/** RoomCore talks to Peers; route its replies back down the right socket. */
function asPeer(sock: FakeSocket): Peer {
  return { send: (m) => sock.sendFromServer(m) };
}

const flush = async (rounds = 20) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

function client(server: FakeServer, roomId: string, key: Uint8Array, identity: Identity, trusted?: Set<string>) {
  const doc = new Y.Doc();
  const provider = new EncryptedProvider({
    baseUrl: "ws://test/api/room/",
    roomId,
    key,
    identity,
    doc,
    createSocket: server.connect,
    isTrustedAuthor: trusted ? (id) => trusted.has(id) : undefined,
  });
  return { doc, provider, text: doc.getText("t") };
}

beforeAll(async () => {
  await ready();
});

describe("EncryptedProvider", () => {
  it("syncs two editors live and the server sees no plaintext", async () => {
    const server = new FakeServer();
    const key = newKey();
    const a = client(server, "room-a", key, createIdentity());
    const b = client(server, "room-a", key, createIdentity());
    await flush();
    a.text.insert(0, "Secret findings: corrosion at frame 12");
    await flush();
    expect(b.text.toString()).toBe("Secret findings: corrosion at frame 12");
    expect(server.seen.join("\n")).not.toContain("corrosion");
    expect(a.provider.unsavedCount).toBe(0);
    a.provider.destroy();
    b.provider.destroy();
  });

  it("replays history to a late joiner and attributes the author", async () => {
    const server = new FakeServer();
    const key = newKey();
    const alice = createIdentity();
    const a = client(server, "room-b", key, alice);
    await flush();
    a.text.insert(0, "Rev 1.0 draft");
    await flush();

    const b = client(server, "room-b", key, createIdentity());
    const authors: string[] = [];
    b.provider.on("change", (c) => authors.push(c.author));
    let synced = false;
    b.provider.on("synced", () => (synced = true));
    await flush();
    expect(synced).toBe(true);
    expect(b.text.toString()).toBe("Rev 1.0 draft");
    expect(authors).toEqual([alice.id]);
    a.provider.destroy();
    b.provider.destroy();
  });

  it("queues edits while offline and delivers them after reconnecting", async () => {
    const server = new FakeServer();
    const key = newKey();
    const a = client(server, "room-c", key, createIdentity());
    const b = client(server, "room-c", key, createIdentity());
    await flush();

    server.online = false;
    server.dropAll();
    await flush();
    expect(a.provider.status).toBe("offline");
    a.text.insert(0, "written on a bad connection");
    expect(a.provider.unsavedCount).toBe(1);

    server.online = true;
    a.provider.reconnectNow();
    b.provider.reconnectNow();
    await flush(40);
    expect(b.text.toString()).toBe("written on a bad connection");
    expect(a.provider.unsavedCount).toBe(0);
    a.provider.destroy();
    b.provider.destroy();
  });

  it("ignores edits from people who are not trusted members", async () => {
    const server = new FakeServer();
    const key = newKey();
    const owner = createIdentity();
    const outsider = createIdentity();
    const trusted = new Set([owner.id]);
    const o = client(server, "room-d", key, owner, trusted);
    const x = client(server, "room-d", key, outsider);
    const rejected: string[] = [];
    o.provider.on("rejected", (r) => rejected.push(r.reason));
    await flush();
    x.text.insert(0, "sneaky edit");
    await flush();
    expect(o.text.toString()).toBe("");
    expect(rejected).toEqual(["author is not a member"]);
    o.provider.destroy();
    x.provider.destroy();
  });

  it("rejects updates encrypted with the wrong key", async () => {
    const server = new FakeServer();
    const a = client(server, "room-e", newKey(), createIdentity());
    const b = client(server, "room-e", newKey(), createIdentity());
    const rejected: string[] = [];
    b.provider.on("rejected", (r) => rejected.push(r.reason));
    await flush();
    a.text.insert(0, "x");
    await flush();
    expect(b.text.toString()).toBe("");
    expect(rejected[0]).toMatch(/decryption failed/);
    a.provider.destroy();
    b.provider.destroy();
  });

  it("shares presence between editors", async () => {
    const server = new FakeServer();
    const key = newKey();
    const a = client(server, "room-f", key, createIdentity());
    const b = client(server, "room-f", key, createIdentity());
    await flush();
    a.provider.awareness.setLocalStateField("user", { name: "Ali" });
    await flush();
    const names = [...b.provider.awareness.getStates().values()]
      .map((s) => (s as { user?: { name: string } }).user?.name)
      .filter(Boolean);
    expect(names).toContain("Ali");
    a.provider.destroy();
    b.provider.destroy();
  });
});
