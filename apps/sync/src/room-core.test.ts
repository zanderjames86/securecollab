import { describe, expect, it } from "vitest";
import { HISTORY_PAGE, type ServerMessage } from "@securecollab/protocol";
import { MemoryLog, RoomCore, type Peer } from "./room-core";

class FakePeer implements Peer {
  inbox: ServerMessage[] = [];
  send(m: ServerMessage) {
    this.inbox.push(m);
  }
}

const up = (id: string, d: string) => JSON.stringify({ t: "up", id, d });

describe("RoomCore", () => {
  it("stores, acknowledges and relays an update to others only", () => {
    const room = new RoomCore(new MemoryLog());
    const a = new FakePeer();
    const b = new FakePeer();
    room.handle(up("x1", "AAAA"), a, [b]);
    expect(a.inbox).toEqual([{ t: "ack", id: "x1", s: 1 }]);
    expect(b.inbox).toEqual([{ t: "up", s: 1, d: "AAAA" }]);
  });

  it("replays history after a given sequence", () => {
    const room = new RoomCore(new MemoryLog());
    const a = new FakePeer();
    room.handle(up("1", "AAAA"), a, []);
    room.handle(up("2", "BBBB"), a, []);
    const late = new FakePeer();
    room.handle(JSON.stringify({ t: "sync", since: 1 }), late, []);
    expect(late.inbox).toEqual([{ t: "hist", items: [{ s: 2, d: "BBBB" }], done: true }]);
  });

  it("pages long histories", () => {
    const room = new RoomCore(new MemoryLog());
    const a = new FakePeer();
    for (let i = 0; i < HISTORY_PAGE + 3; i++) room.handle(up(String(i), "AAAA"), a, []);
    const late = new FakePeer();
    room.handle(JSON.stringify({ t: "sync", since: 0 }), late, []);
    const pages = late.inbox.filter((m) => m.t === "hist");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ done: false });
    expect(pages[1]).toMatchObject({ done: true });
    expect(pages.flatMap((p) => (p.t === "hist" ? p.items : []))).toHaveLength(HISTORY_PAGE + 3);
  });

  it("relays presence without storing it", () => {
    const log = new MemoryLog();
    const room = new RoomCore(log);
    const a = new FakePeer();
    const b = new FakePeer();
    room.handle(JSON.stringify({ t: "aw", d: "CCCC" }), a, [b]);
    expect(b.inbox).toEqual([{ t: "aw", d: "CCCC" }]);
    expect(log.after(0, 10)).toEqual([]);
  });

  it("rejects malformed or non-base64 input", () => {
    const room = new RoomCore(new MemoryLog());
    const a = new FakePeer();
    room.handle("not json", a, []);
    room.handle(up("1", "has spaces!"), a, []);
    room.handle(JSON.stringify({ t: "nope" }), a, []);
    expect(a.inbox.map((m) => m.t)).toEqual(["err", "err", "err"]);
  });
});
