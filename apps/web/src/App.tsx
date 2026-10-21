import { useCallback, useEffect, useMemo, useState } from "react";
import type { Identity } from "@securecollab/crypto";
import { AUTO_LOCK_MINUTES } from "./lib/config";
import { navigate, useHash, useYMapValue } from "./lib/hooks";
import { closeAllRooms, keyringProfile, openKeyring, reconnectAllRooms, unsavedTotal, type OpenRoom } from "./lib/rooms";
import { SessionContext, type Session } from "./lib/session";
import { loadVault, updateVaultName } from "./lib/vault";
import { CreateAccount, Restore, Unlock, Welcome } from "./screens/Onboarding";
import { Home } from "./screens/Home";
import { Team } from "./screens/Team";
import { DocumentScreen } from "./screens/Document";
import { Join } from "./screens/Join";
import { Settings } from "./screens/Settings";

const PENDING_JOIN = "securecollab.pendingJoin";

type Phase = "welcome" | "create" | "restore" | "locked";

export function App() {
  const hash = useHash();
  const [vault, setVault] = useState(loadVault);
  const [phase, setPhase] = useState<Phase>(() => (vault ? "locked" : "welcome"));
  const [unlocked, setUnlocked] = useState<{ identity: Identity; name: string } | null>(null);
  const [pendingJoin, setPendingJoin] = useState(() => sessionStorage.getItem(PENDING_JOIN));

  // Remember an invite opened before signing in, then strip it from the address bar.
  const joinSecret = hash.match(/^#\/join\/([A-Za-z0-9_-]+)$/)?.[1];
  useEffect(() => {
    if (joinSecret && !unlocked) {
      sessionStorage.setItem(PENDING_JOIN, joinSecret);
      setPendingJoin(joinSecret);
      history.replaceState(null, "", location.pathname);
    }
  }, [joinSecret, unlocked]);

  const onUnlocked = useCallback((identity: Identity, name: string) => {
    setUnlocked({ identity, name });
    const pending = sessionStorage.getItem(PENDING_JOIN);
    if (pending) navigate(`#/join/${pending}`);
  }, []);

  const lock = useCallback(() => {
    if (unsavedTotal() > 0 && !confirm("Some edits haven't reached the server yet and will be lost. Lock anyway?")) return;
    closeAllRooms();
    setUnlocked(null);
    setVault(loadVault());
    setPhase("locked");
  }, []);

  if (unlocked) return <UnlockedApp identity={unlocked.identity} initialName={unlocked.name} lock={lock} hash={hash} />;

  const joining = Boolean(pendingJoin);
  switch (phase) {
    case "create":
      return <CreateAccount onDone={onUnlocked} onBack={() => setPhase(vault ? "locked" : "welcome")} />;
    case "restore":
      return <Restore onDone={onUnlocked} onBack={() => setPhase(vault ? "locked" : "welcome")} />;
    case "locked":
      if (vault) return <Unlock vault={vault} onDone={onUnlocked} onRestore={() => setPhase("restore")} />;
      return <Welcome joining={joining} onCreate={() => setPhase("create")} onRestore={() => setPhase("restore")} />;
    default:
      return <Welcome joining={joining} onCreate={() => setPhase("create")} onRestore={() => setPhase("restore")} />;
  }
}

function UnlockedApp({ identity, initialName, lock, hash }: { identity: Identity; initialName: string; lock: () => void; hash: string }) {
  const [keyring, setKeyring] = useState<OpenRoom | null>(null);

  useEffect(() => {
    const room = openKeyring(identity);
    setKeyring(room);
    return () => room.release();
  }, [identity]);

  // Name: stored (encrypted) in the keyring so it follows the account to new devices.
  const profileName = useYMapValue(keyring ? keyringProfile(keyring.doc) : null, "name");
  useEffect(() => {
    if (!keyring) return;
    const profile = keyringProfile(keyring.doc);
    const settle = () => {
      if (initialName && profile.get("name") !== initialName) profile.set("name", initialName);
    };
    if (keyring.provider.synced) settle();
    else return keyring.provider.on("synced", settle);
  }, [keyring, initialName]);
  const name = profileName || initialName || "Member";
  useEffect(() => {
    if (profileName) updateVaultName(profileName);
  }, [profileName]);

  // Auto-lock after inactivity.
  useEffect(() => {
    let timer = setTimeout(lock, AUTO_LOCK_MINUTES * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, AUTO_LOCK_MINUTES * 60_000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [lock]);

  // Reconnect quickly when the phone regains signal or the tab comes back.
  useEffect(() => {
    const again = () => reconnectAllRooms();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    const warn = (e: BeforeUnloadEvent) => {
      if (unsavedTotal() > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);

  const session = useMemo<Session | null>(
    () => (keyring ? { identity, name, keyring, lock } : null),
    [identity, name, keyring, lock],
  );
  if (!session) return null;

  return (
    <SessionContext.Provider value={session}>
      <Router hash={hash} />
    </SessionContext.Provider>
  );
}

function Router({ hash }: { hash: string }) {
  let m: RegExpMatchArray | null;
  if ((m = hash.match(/^#\/join\/([A-Za-z0-9_-]+)$/))) return <Join key={m[1]} secret={m[1]!} />;
  if ((m = hash.match(/^#\/t\/([A-Za-z0-9_-]{22})\/d\/([A-Za-z0-9_-]{22})$/)))
    return <DocumentScreen key={m[2]} teamId={m[1]!} docId={m[2]!} />;
  if ((m = hash.match(/^#\/t\/([A-Za-z0-9_-]{22})$/))) return <Team key={m[1]} teamId={m[1]!} />;
  if (hash === "#/settings") return <Settings />;
  return <Home />;
}
