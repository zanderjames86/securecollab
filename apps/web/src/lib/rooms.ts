/**
 * Rooms are encrypted Yjs documents synced through the relay. Three kinds:
 *  - keyring: private to one person; lists their teams and team keys
 *  - team: shared by a team; members, roles and the document list
 *  - document: the content of one document
 */
import * as Y from "yjs";
import {
  deriveKey,
  fromB64,
  newKey,
  randomId,
  toB64,
  type Identity,
} from "@securecollab/crypto";
import { EncryptedProvider } from "../sync/provider";

export interface OpenRoom {
  doc: Y.Doc;
  provider: EncryptedProvider;
}

interface Entry extends OpenRoom {
  refs: number;
}

const rooms = new Map<string, Entry>();

export function socketBase(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/room/`;
}

/** Open (or reuse) a room. Call the returned release() when done. */
export function acquireRoom(
  roomId: string,
  key: Uint8Array,
  identity: Identity,
  options: { trustOnlySelf?: boolean; presence?: boolean } = {},
): OpenRoom & { release: () => void } {
  let entry = rooms.get(roomId);
  if (!entry) {
    const doc = new Y.Doc();
    const provider = new EncryptedProvider({
      baseUrl: socketBase(),
      roomId,
      key,
      identity,
      doc,
      presence: options.presence,
      isTrustedAuthor: options.trustOnlySelf ? (author) => author === identity.id : undefined,
    });
    entry = { doc, provider, refs: 0 };
    rooms.set(roomId, entry);
  }
  entry.refs++;
  let released = false;
  const e = entry;
  return {
    doc: e.doc,
    provider: e.provider,
    release: () => {
      if (released) return;
      released = true;
      e.refs--;
      if (e.refs <= 0) {
        // Keep briefly in case the user navigates straight back, and never
        // close a room that still has edits the server has not confirmed.
        const tryClose = () => {
          if (e.refs > 0 || rooms.get(roomId) !== e) return;
          if (e.provider.unsavedCount > 0) {
            setTimeout(tryClose, 5000);
            return;
          }
          e.provider.destroy();
          e.doc.destroy();
          rooms.delete(roomId);
        };
        setTimeout(tryClose, 5000);
      }
    },
  };
}

/** Close everything, for example when the app locks. */
export function closeAllRooms(): void {
  for (const [id, e] of rooms) {
    e.provider.destroy();
    e.doc.destroy();
    rooms.delete(id);
  }
}

export function reconnectAllRooms(): void {
  for (const e of rooms.values()) e.provider.reconnectNow();
}

export function unsavedTotal(): number {
  let n = 0;
  for (const e of rooms.values()) n += e.provider.unsavedCount;
  return n;
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export type Role = "owner" | "member";

export interface TeamRef {
  name: string;
  key: string;
  joinedAt: number;
}

export interface MemberInfo {
  name: string;
  boxPublicKey: string;
  role: Role;
  joinedAt: number;
}

export interface DocInfo {
  title: string;
  key: string;
  createdBy: string;
  createdAt: number;
}

export interface TeamMeta {
  name?: string;
  createdAt?: number;
  owner?: string;
}

export const keyringTeams = (doc: Y.Doc) => doc.getMap<TeamRef>("teams");
export const keyringProfile = (doc: Y.Doc) => doc.getMap<string>("profile");
export const teamMeta = (doc: Y.Doc) => doc.getMap<unknown>("meta");
export const teamMembers = (doc: Y.Doc) => doc.getMap<MemberInfo>("members");
export const teamDocs = (doc: Y.Doc) => doc.getMap<DocInfo>("docs");

// ---------------------------------------------------------------------------
// Keyring
// ---------------------------------------------------------------------------

/** The keyring room id and key are derived from the seed, so a recovery code restores everything. */
export function keyringRoomFor(identity: Identity): { roomId: string; key: Uint8Array } {
  return {
    roomId: toB64(deriveKey(identity.seed, "keyring/room").slice(0, 16)),
    key: deriveKey(identity.seed, "keyring/key"),
  };
}

export function openKeyring(identity: Identity) {
  const { roomId, key } = keyringRoomFor(identity);
  return acquireRoom(roomId, key, identity, { trustOnlySelf: true, presence: false });
}

// ---------------------------------------------------------------------------
// Teams and documents
// ---------------------------------------------------------------------------

export function openTeam(teamId: string, ref: TeamRef, identity: Identity) {
  return acquireRoom(teamId, fromB64(ref.key), identity, { presence: false });
}

export function createTeam(keyring: Y.Doc, identity: Identity, myName: string, teamName: string): string {
  const teamId = randomId();
  const ref: TeamRef = { name: teamName, key: toB64(newKey()), joinedAt: Date.now() };
  const team = openTeam(teamId, ref, identity);
  team.doc.transact(() => {
    teamMeta(team.doc).set("name", teamName);
    teamMeta(team.doc).set("createdAt", Date.now());
    teamMeta(team.doc).set("owner", identity.id);
    teamMembers(team.doc).set(identity.id, {
      name: myName,
      boxPublicKey: toB64(identity.boxPublicKey),
      role: "owner",
      joinedAt: Date.now(),
    });
  });
  keyringTeams(keyring).set(teamId, ref);
  team.release();
  return teamId;
}

export function joinTeam(
  keyring: Y.Doc,
  identity: Identity,
  myName: string,
  teamId: string,
  ref: TeamRef,
): void {
  keyringTeams(keyring).set(teamId, ref);
  const team = openTeam(teamId, ref, identity);
  const addSelf = () => {
    const members = teamMembers(team.doc);
    if (!members.has(identity.id)) {
      members.set(identity.id, {
        name: myName,
        boxPublicKey: toB64(identity.boxPublicKey),
        role: "member",
        joinedAt: Date.now(),
      });
    }
    team.release();
  };
  if (team.provider.synced) addSelf();
  else {
    const off = team.provider.on("synced", () => {
      off();
      addSelf();
    });
  }
}

export function createDocument(team: Y.Doc, identity: Identity, title: string): string {
  const docId = randomId();
  teamDocs(team).set(docId, {
    title: title.trim() || "Untitled document",
    key: toB64(newKey()),
    createdBy: identity.id,
    createdAt: Date.now(),
  });
  return docId;
}

export function openDocument(docId: string, info: DocInfo, identity: Identity) {
  return acquireRoom(docId, fromB64(info.key), identity, { presence: true });
}
