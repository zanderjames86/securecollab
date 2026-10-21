import { useState, type FormEvent } from "react";
import { Layout } from "../components/Layout";
import { Button, Card, Field, StatusPill } from "../components/ui";
import { useProviderState, useYMap, navigate } from "../lib/hooks";
import { createTeam, keyringTeams } from "../lib/rooms";
import { useSession } from "../lib/session";
import { formatDate } from "../lib/share";

export function Home() {
  const { identity, name, keyring } = useSession();
  const teams = useYMap(keyringTeams(keyring.doc));
  const state = useProviderState(keyring.provider);
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return;
    const id = createTeam(keyring.doc, identity, name, teamName.trim());
    setTeamName("");
    setCreating(false);
    navigate(`#/t/${id}`);
  }

  const sorted = [...teams].sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <Layout crumbs={[{ label: "Teams" }]} right={<StatusPill state={state} />}>
      <h1 className="page-title">Your teams</h1>
      <p className="lede">Each team has its own members, documents and encryption keys. Office work and club work stay fully separate.</p>

      {!state.synced && teams.length === 0 ? (
        <p className="muted">Loading your teams…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <p>You're not in any team yet. Create one, or open an invite link someone sent you.</p>
        </Card>
      ) : (
        <ul className="tiles">
          {sorted.map(([id, t]) => (
            <li key={id}>
              <a className="tile" href={`#/t/${id}`}>
                <span className="tile-title">{t.name}</span>
                <span className="tile-meta">Joined {formatDate(t.joinedAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <Card title="New team">
          <form className="stack" onSubmit={submit}>
            <Field label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Corrosion Study Group" autoFocus />
            <div className="row">
              <Button variant="primary" type="submit" disabled={!teamName.trim()}>
                Create team
              </Button>
              <Button variant="ghost" type="button" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New team
        </Button>
      )}
    </Layout>
  );
}
