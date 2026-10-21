import { useEffect, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { Button, Card, Notice } from "../components/ui";
import { navigate } from "../lib/hooks";
import { claimInvite } from "../lib/invites";
import { joinTeam, keyringTeams } from "../lib/rooms";
import { useSession } from "../lib/session";

export function Join({ secret }: { secret: string }) {
  const { identity, name, keyring } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ teamId: string; teamName: string; by: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Claiming uses the invite up, so do it exactly once.
    if (started.current) return;
    started.current = true;
    sessionStorage.removeItem("securecollab.pendingJoin");
    claimInvite(secret)
      .then((invite) => {
        if (!keyringTeams(keyring.doc).has(invite.teamId)) {
          joinTeam(keyring.doc, identity, name, invite.teamId, { ...invite.team, joinedAt: Date.now() });
        }
        setJoined({ teamId: invite.teamId, teamName: invite.team.name, by: invite.invitedBy });
        // Replace the invite address so the used secret leaves the history.
        location.replace(`#/t/${invite.teamId}`);
      })
      .catch((err: Error) => setError(err.message));
  }, [secret, identity, name, keyring]);

  return (
    <Layout crumbs={[{ label: "Teams", href: "#/" }, { label: "Join" }]}>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : joined ? (
        <Card title={`Welcome to ${joined.teamName}`}>
          <p>{joined.by} invited you. You now have access to the team's documents.</p>
          <Button variant="primary" onClick={() => navigate(`#/t/${joined.teamId}`)}>
            Open team
          </Button>
        </Card>
      ) : (
        <p className="muted">Opening invite…</p>
      )}
    </Layout>
  );
}
