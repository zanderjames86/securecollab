import { useEffect, useState } from "react";
import { keyringTeams, openDocument, openTeam, teamDocs, type DocInfo, type OpenRoom, type TeamRef } from "./rooms";
import { useYMapValue } from "./hooks";
import { useSession } from "./session";

/** Opens a team room for as long as the component is mounted. */
export function useTeam(teamId: string): { ref: TeamRef | undefined; team: OpenRoom | null } {
  const { identity, keyring } = useSession();
  const ref = useYMapValue(keyringTeams(keyring.doc), teamId);
  const [team, setTeam] = useState<OpenRoom | null>(null);
  const key = ref?.key;
  useEffect(() => {
    if (!ref) return;
    const room = openTeam(teamId, ref, identity);
    setTeam(room);
    return () => {
      setTeam(null);
      room.release();
    };
    // Re-open only if the team or its key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, key, identity]);
  return { ref, team };
}

/** Opens a document room once its entry is known in the team. */
export function useDocumentRoom(team: OpenRoom | null, docId: string): { info: DocInfo | undefined; room: OpenRoom | null } {
  const { identity } = useSession();
  const info = useYMapValue(team ? teamDocs(team.doc) : null, docId);
  const [room, setRoom] = useState<OpenRoom | null>(null);
  const key = info?.key;
  useEffect(() => {
    if (!info) return;
    const r = openDocument(docId, info, identity);
    setRoom(r);
    return () => {
      setRoom(null);
      r.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, key, identity]);
  return { info, room };
}
