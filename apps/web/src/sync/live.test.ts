/**
 * Live test against a running sync server (local `wrangler dev` or a deployment).
 * Run with: SC_LIVE_URL=http://localhost:8787 npx vitest run --root apps/web live
 */
import { beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as Y from "yjs";
import {
  createIdentity,
  createInvite,
  decryptJson,
  encryptJson,
  inviteFromSecret,
  newKey,
  randomId,
  ready,
  type Identity,
} from "@securecollab/crypto";
import { EncryptedProvider, type SocketLike } from "./provider";

const base = process.env.SC_LIVE_URL;

const waitFor = async (check: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

function client(roomId: string, key: Uint8Array, identity: Identity) {
  const doc = new Y.Doc();
  const provider = new EncryptedProvider({
    baseUrl: base!.replace(/^http/, "ws") + "/api/room/",
    roomId,
    key,
    identity,
    doc,
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  });
  return { doc, provider, text: doc.getText("t") };
}

describe.skipIf(!base)("live sync server", () => {
  beforeAll(async () => {
    await ready();
  });

  it("syncs, persists and replays through the real server", async () => {
    const roomId = randomId();
    const key = newKey();
    const a = client(roomId, key, createIdentity());
    const b = client(roomId, key, createIdentity());
    await waitFor(() => a.provider.synced && b.provider.synced);
    a.text.insert(0, "hello from A");
    await waitFor(() => b.text.toString() === "hello from A");
    b.text.insert(b.text.length, ", reply from B");
    await waitFor(() => a.text.toString() === "hello from A, reply from B");
    await waitFor(() => a.provider.unsavedCount === 0 && b.provider.unsavedCount === 0);
    a.provider.destroy();
    b.provider.destroy();

    const late = client(roomId, key, createIdentity());
    await waitFor(() => late.provider.synced);
    expect(late.text.toString()).toBe("hello from A, reply from B");
    late.provider.destroy();
  });

  it("stores an invite once and lets it be claimed exactly once", async () => {
    const invite = createInvite();
    const payload = encryptJson({ teamName: "Study team" }, invite.key, "invite");
    const put = await fetch(`${base}/api/invite/${invite.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(put.status).toBe(201);

    const joiner = inviteFromSecret(invite.secret);
    const claim = await fetch(`${base}/api/invite/${joiner.id}/claim`, { method: "POST" });
    expect(claim.status).toBe(200);
    const body = (await claim.json()) as { payload: string };
    expect(decryptJson(body.payload, joiner.key, "invite")).toEqual({ teamName: "Study team" });

    const again = await fetch(`${base}/api/invite/${joiner.id}/claim`, { method: "POST" });
    expect(again.status).toBe(404);
  });

  it("rejects malformed room ids", async () => {
    const res = await fetch(`${base}/api/room/not-a-valid-id`);
    expect(res.status).toBe(400);
  });
});
