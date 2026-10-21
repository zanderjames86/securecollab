import { useState, type FormEvent } from "react";
import { fingerprint, seedToRecoveryCode } from "@securecollab/crypto";
import { Layout } from "../components/Layout";
import { Avatar, Button, Card, Field, Notice } from "../components/ui";
import { useSession } from "../lib/session";
import { loadVault, unlockVault } from "../lib/vault";
import { AUTO_LOCK_MINUTES } from "../lib/config";

export function Settings() {
  const { identity, name, lock } = useSession();
  const [pass, setPass] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reveal(e: FormEvent) {
    e.preventDefault();
    const vault = loadVault();
    if (!vault) return setError("No account stored on this device.");
    try {
      unlockVault(vault, pass);
      setCode(seedToRecoveryCode(identity.seed));
      setPass("");
      setError(null);
    } catch {
      setError("That passphrase is not right.");
    }
  }

  return (
    <Layout crumbs={[{ label: "Teams", href: "#/" }, { label: "Account" }]}>
      <h1 className="page-title">Account and security</h1>
      <div className="grid">
        <Card title="You">
          <div className="row">
            <Avatar id={identity.id} name={name} size={44} />
            <div>
              <div className="list-title">{name}</div>
              <div className="list-meta mono">{fingerprint(identity.signPublicKey)}</div>
            </div>
          </div>
          <p className="hint">
            This fingerprint identifies your keys. Teammates can compare it with the one shown next to your name to be sure it's really you.
          </p>
        </Card>

        <Card title="Recovery code">
          {code ? (
            <div className="stack">
              <div className="recovery-code">
                {code.split("-").map((g, i) => (
                  <span key={i}>{g}</span>
                ))}
              </div>
              <Button onClick={() => setCode(null)}>Hide</Button>
            </div>
          ) : (
            <form className="stack" onSubmit={reveal}>
              <p className="muted">Enter your passphrase to show your recovery code.</p>
              <Field label="Passphrase" type="password" value={pass} onChange={(e) => setPass(e.target.value)} error={error} autoComplete="current-password" />
              <Button type="submit" disabled={!pass}>
                Show recovery code
              </Button>
            </form>
          )}
        </Card>

        <Card title="This device">
          <p className="muted">
            The app locks itself after {AUTO_LOCK_MINUTES} minutes without activity. Your keys are stored here only in encrypted form.
          </p>
          <Button variant="primary" onClick={lock}>
            Lock now
          </Button>
        </Card>

        <Card title="What the server can see">
          <Notice>
            Not your documents, titles, comments, team names or member names: those are encrypted before they leave this
            device. The server can see that encrypted data exists, its size, timing, and network addresses.
          </Notice>
        </Card>
      </div>
    </Layout>
  );
}
