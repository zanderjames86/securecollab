import {
  createInvite,
  decryptJson,
  encryptJson,
  fromB64,
  inviteFromSecret,
  toB64,
} from "@securecollab/crypto";
import type { InviteClaimResponse } from "@securecollab/protocol";
import type { TeamRef } from "./rooms";

export interface InvitePayload {
  v: 1;
  teamId: string;
  team: TeamRef;
  invitedBy: string;
  label?: string;
}

const AD = "securecollab/invite/v1";

/**
 * Creates a single-use invite link. The secret lives only in the link's
 * fragment (#...), which browsers never send to any server.
 */
export async function createInviteLink(
  teamId: string,
  team: TeamRef,
  invitedBy: string,
  label?: string,
): Promise<{ link: string; expires: number }> {
  const invite = createInvite();
  const payload: InvitePayload = { v: 1, teamId, team, invitedBy, label };
  const res = await fetch(`/api/invite/${invite.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: encryptJson(payload, invite.key, AD) }),
  });
  if (!res.ok) throw new Error(`Could not create invite (${res.status})`);
  const { expires } = (await res.json()) as { expires: number };
  return { link: `${location.origin}/#/join/${toB64(invite.secret)}`, expires };
}

/** Claims (and thereby uses up) an invite. */
export async function claimInvite(secretB64: string): Promise<InvitePayload> {
  let secret: Uint8Array;
  try {
    secret = fromB64(secretB64);
  } catch {
    throw new Error("This invite link is damaged. Ask for a new one.");
  }
  if (secret.length !== 32) throw new Error("This invite link is damaged. Ask for a new one.");
  const invite = inviteFromSecret(secret);
  const res = await fetch(`/api/invite/${invite.id}/claim`, { method: "POST" });
  if (res.status === 404) {
    throw new Error("This invite was already used or has expired. Ask the team owner for a new link.");
  }
  if (!res.ok) throw new Error(`Could not open invite (${res.status})`);
  const body = (await res.json()) as InviteClaimResponse;
  return decryptJson<InvitePayload>(body.payload, invite.key, AD);
}
