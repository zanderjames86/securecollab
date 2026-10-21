import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Avatar, Button, LinkButton, Notice, StatusPill, WhatsAppIcon } from "../components/ui";
import { DocEditor, usePresence } from "../editor/DocEditor";
import { useProviderState, useYMapValue } from "../lib/hooks";
import { teamDocs, teamMeta } from "../lib/rooms";
import { useSession } from "../lib/session";
import { copyText, documentMessage, whatsappUrl } from "../lib/share";
import { useDocumentRoom, useTeam } from "../lib/useRoom";

export function DocumentScreen({ teamId, docId }: { teamId: string; docId: string }) {
  const { identity, name } = useSession();
  const { ref, team } = useTeam(teamId);
  const teamState = useProviderState(team?.provider);
  const { info, room } = useDocumentRoom(team, docId);
  const state = useProviderState(room?.provider);
  const teamName = (useYMapValue(team ? teamMeta(team.doc) : null, "name") as string | undefined) ?? ref?.name ?? "Team";
  const people = usePresence(room);
  const [rejected, setRejected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState(info?.title ?? "");

  useEffect(() => setTitle(info?.title ?? ""), [info?.title]);

  useEffect(() => {
    if (!room) return;
    return room.provider.on("rejected", () => setRejected((n) => n + 1));
  }, [room]);

  const crumbs = [
    { label: "Teams", href: "#/" },
    { label: teamName, href: `#/t/${teamId}` },
    { label: info?.title ?? "Document" },
  ];

  if (!ref) {
    return (
      <Layout crumbs={crumbs}>
        <Notice tone="warn">You're not a member of this team.</Notice>
      </Layout>
    );
  }
  if (!info) {
    return (
      <Layout crumbs={crumbs}>
        <p className="muted">{teamState.synced ? "This document doesn't exist or was removed." : "Opening…"}</p>
      </Layout>
    );
  }

  function saveTitle() {
    const t = title.trim();
    if (!team || !info || !t || t === info.title) return setTitle(info?.title ?? "");
    teamDocs(team.doc).set(docId, { ...info, title: t });
  }

  const link = `${location.origin}/#/t/${teamId}/d/${docId}`;

  return (
    <Layout crumbs={crumbs} right={<StatusPill state={state} />} wide>
      <div className="doc-head">
        <input
          className="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Document title"
        />
        <div className="doc-tools">
          <div className="presence" aria-label="People here now">
            {people.map((p) => (
              <Avatar key={p.id} id={p.id} name={p.name} size={28} />
            ))}
          </div>
          <LinkButton variant="whatsapp" href={whatsappUrl(documentMessage(info.title, link))} external>
            <WhatsAppIcon /> Share
          </LinkButton>
          <Button onClick={async () => setCopied(await copyText(link))}>{copied ? "Copied" : "Copy link"}</Button>
        </div>
      </div>
      <p className="hint">The link only works for team members. Content never leaves this app unencrypted.</p>
      {rejected > 0 && (
        <Notice tone="danger">
          {rejected} change{rejected > 1 ? "s" : ""} failed verification and {rejected > 1 ? "were" : "was"} ignored.
          They were damaged or not signed by a valid key.
        </Notice>
      )}
      {room && state.synced ? (
        <DocEditor room={room} user={{ id: identity.id, name }} />
      ) : (
        <p className="muted">{state.status === "offline" ? "Offline. Waiting for a connection…" : "Decrypting…"}</p>
      )}
    </Layout>
  );
}
