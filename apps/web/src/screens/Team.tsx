import { useState, type FormEvent } from "react";
import { fingerprint, fromB64 } from "@securecollab/crypto";
import { Layout } from "../components/Layout";
import { Avatar, Button, Card, Field, LinkButton, Notice, StatusPill, WhatsAppIcon } from "../components/ui";
import { navigate, useProviderState, useYMap, useYMapValue } from "../lib/hooks";
import { createInviteLink } from "../lib/invites";
import { createDocument, teamDocs, teamMembers, teamMeta, type TeamRef } from "../lib/rooms";
import { useSession } from "../lib/session";
import { copyText, formatDate, inviteMessage, whatsappUrl } from "../lib/share";
import { useTeam } from "../lib/useRoom";

export function Team({ teamId }: { teamId: string }) {
  const { identity, name } = useSession();
  const { ref, team } = useTeam(teamId);
  const state = useProviderState(team?.provider);
  const meta = team ? teamMeta(team.doc) : null;
  const teamName = (useYMapValue(meta, "name") as string | undefined) ?? ref?.name ?? "Team";
  const members = useYMap(team ? teamMembers(team.doc) : null);
  const docs = useYMap(team ? teamDocs(team.doc) : null);
  const me = members.find(([id]) => id === identity.id)?.[1];
  const isOwner = me?.role === "owner";
  const nameOf = (id: string) => members.find(([m]) => m === id)?.[1].name ?? "Former member";

  const [newTitle, setNewTitle] = useState("");

  if (!ref) {
    return (
      <Layout crumbs={[{ label: "Teams", href: "#/" }, { label: "Not found" }]}>
        <Notice tone="warn">This team isn't in your account. Ask its owner for an invite link.</Notice>
      </Layout>
    );
  }

  function addDoc(e: FormEvent) {
    e.preventDefault();
    if (!team) return;
    const id = createDocument(team.doc, identity, newTitle);
    setNewTitle("");
    navigate(`#/t/${teamId}/d/${id}`);
  }

  const sortedDocs = [...docs].sort((a, b) => b[1].createdAt - a[1].createdAt);
  const sortedMembers = [...members].sort((a, b) =>
    a[1].role === b[1].role ? a[1].name.localeCompare(b[1].name) : a[1].role === "owner" ? -1 : 1,
  );

  return (
    <Layout crumbs={[{ label: "Teams", href: "#/" }, { label: teamName }]} right={<StatusPill state={state} />}>
      <h1 className="page-title">{teamName}</h1>
      <p className="lede">
        {members.length} {members.length === 1 ? "member" : "members"} · you are {isOwner ? "the owner" : "a member"}
      </p>

      <div className="grid">
        <Card title="Documents">
          {sortedDocs.length === 0 ? (
            <p className="muted">{state.synced ? "No documents yet." : "Loading…"}</p>
          ) : (
            <ul className="list">
              {sortedDocs.map(([id, d]) => (
                <li key={id}>
                  <a className="list-row" href={`#/t/${teamId}/d/${id}`}>
                    <span className="doc-icon" aria-hidden="true" />
                    <span className="list-main">
                      <span className="list-title">{d.title}</span>
                      <span className="list-meta">
                        {nameOf(d.createdBy)} · {formatDate(d.createdAt)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <form className="inline-form" onSubmit={addDoc}>
            <input
              className="field-input"
              placeholder="New document title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              aria-label="New document title"
            />
            <Button variant="primary" type="submit" disabled={!team}>
              Create
            </Button>
          </form>
        </Card>

        <div className="stack">
          <Card title="Members">
            <ul className="list">
              {sortedMembers.map(([id, m]) => (
                <li key={id} className="list-row static">
                  <Avatar id={id} name={m.name} />
                  <span className="list-main">
                    <span className="list-title">
                      {m.name}
                      {id === identity.id && <span className="tag">you</span>}
                      {m.role === "owner" && <span className="tag tag-strong">owner</span>}
                    </span>
                    <span className="list-meta mono" title="Compare in person to confirm this is really them">
                      {fingerprint(fromB64(id))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {isOwner ? (
            <InviteCard teamId={teamId} teamRef={ref} teamName={teamName} inviterName={name} />
          ) : (
            <Card title="Invites">
              <p className="muted">Only the team owner can invite new members.</p>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}

function InviteCard({
  teamId,
  teamRef: ref,
  teamName,
  inviterName,
}: {
  teamId: string;
  teamRef: TeamRef;
  teamName: string;
  inviterName: string;
}) {
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ link: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const { link } = await createInviteLink(teamId, { ...ref, name: teamName }, inviterName, label.trim() || undefined);
      setResult({ link, label: label.trim() });
      setCopied(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Invite someone">
      {result ? (
        <div className="stack">
          <Notice>
            Send this link to {result.label || "one person"} in a <strong>private</strong> chat. It works once and expires in 7 days.
          </Notice>
          <code className="link-box">{result.link}</code>
          <div className="row">
            <LinkButton variant="whatsapp" href={whatsappUrl(inviteMessage(teamName, result.link, result.label || undefined))} external>
              <WhatsAppIcon /> Send on WhatsApp
            </LinkButton>
            <Button onClick={async () => setCopied(await copyText(result.link))}>{copied ? "Copied" : "Copy link"}</Button>
          </div>
          <Button variant="ghost" onClick={() => { setResult(null); setLabel(""); }}>
            Invite another person
          </Button>
        </div>
      ) : (
        <div className="stack">
          <Field label="Who is it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sara" />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button variant="primary" onClick={make} disabled={busy}>
            {busy ? "Creating…" : "Create invite link"}
          </Button>
        </div>
      )}
    </Card>
  );
}
