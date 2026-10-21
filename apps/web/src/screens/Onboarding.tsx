import { useState, type FormEvent } from "react";
import {
  createIdentity,
  fingerprint,
  identityFromSeed,
  recoveryCodeToSeed,
  seedToRecoveryCode,
  type Identity,
} from "@securecollab/crypto";
import { Button, Field, Lock, Notice } from "../components/ui";
import { copyText } from "../lib/share";
import { forgetVault, passphraseProblem, saveVault, unlockVault, type Vault } from "../lib/vault";

/** Lets the "working…" state paint before slow key derivation runs. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

export type Unlocked = (identity: Identity, name: string, isNew: boolean) => void;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="onboard">
      <div className="brand">
        <span className="brand-mark">
          <Lock />
        </span>
        SecureCollab
      </div>
      {children}
    </main>
  );
}

export function Welcome({ onCreate, onRestore, joining }: { onCreate: () => void; onRestore: () => void; joining: boolean }) {
  return (
    <Shell>
      <h1 className="hero">Private documents your team writes together.</h1>
      {joining && <Notice>You opened an invite. Create your account first, then you'll join the team.</Notice>}
      <ul className="promise">
        <li>Encrypted on your device. The server only ever stores scrambled data.</li>
        <li>Every change is signed, so it always shows who made it.</li>
        <li>No email, no phone number. Your recovery code is your account.</li>
      </ul>
      <div className="stack">
        <Button variant="primary" onClick={onCreate}>
          Create my account
        </Button>
        <Button variant="ghost" onClick={onRestore}>
          I have a recovery code
        </Button>
      </div>
    </Shell>
  );
}

export function CreateAccount({ onDone, onBack }: { onDone: Unlocked; onBack: () => void }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the name your team knows you by.");
    const problem = passphraseProblem(pass, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    await nextFrame();
    const id = createIdentity();
    saveVault(id, name.trim(), pass);
    setBusy(false);
    setIdentity(id);
  }

  if (identity) {
    return <RecoveryStep identity={identity} onDone={() => onDone(identity, name.trim(), true)} />;
  }

  return (
    <Shell>
      <h1>Create your account</h1>
      <form className="stack" onSubmit={submit}>
        <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        <Field
          label="Passphrase"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="new-password"
          hint="Unlocks the app on this device. At least 10 characters; a short sentence is easiest."
        />
        <Field
          label="Repeat passphrase"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={error}
        />
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Generating your keys…" : "Continue"}
        </Button>
        <Button variant="ghost" type="button" onClick={onBack}>
          Back
        </Button>
      </form>
    </Shell>
  );
}

function RecoveryStep({ identity, onDone }: { identity: Identity; onDone: () => void }) {
  const code = seedToRecoveryCode(identity.seed);
  const lastGroup = code.split("-").pop()!;
  const [saved, setSaved] = useState(false);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);
  const ok = saved && typed.trim().toUpperCase() === lastGroup;

  function download() {
    const blob = new Blob(
      [
        "SecureCollab recovery code\n\n",
        code,
        "\n\nAnyone with this code can open your account. Keep it offline and private.\n",
        `Account fingerprint: ${fingerprint(identity.signPublicKey)}\n`,
      ],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "securecollab-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Shell>
      <h1>Save your recovery code</h1>
      <p>
        This code is the only way back into your account if you forget your passphrase or lose this device.
        Nobody, including the people running this app, can reset it for you.
      </p>
      <div className="recovery-code" aria-label="Recovery code">
        {code.split("-").map((g, i) => (
          <span key={i}>{g}</span>
        ))}
      </div>
      <div className="row">
        <Button onClick={async () => setCopied(await copyText(code))}>{copied ? "Copied" : "Copy"}</Button>
        <Button onClick={download}>Download as file</Button>
      </div>
      <Notice tone="warn">
        Write it on paper or keep it in a password manager. Don't send it on WhatsApp or keep it in your photos.
      </Notice>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have stored my recovery code somewhere safe.
      </label>
      <Field
        label={`Type the last group of the code to confirm`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoCapitalize="characters"
        spellCheck={false}
      />
      <Button variant="primary" disabled={!ok} onClick={onDone}>
        Finish
      </Button>
    </Shell>
  );
}

export function Restore({ onDone, onBack }: { onDone: Unlocked; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    let identity: Identity;
    try {
      identity = identityFromSeed(recoveryCodeToSeed(code));
    } catch (err) {
      return setError((err as Error).message);
    }
    const problem = passphraseProblem(pass, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    await nextFrame();
    saveVault(identity, name.trim(), pass);
    setBusy(false);
    onDone(identity, name.trim(), false);
  }

  return (
    <Shell>
      <h1>Restore your account</h1>
      <p>Your teams and documents come back automatically once the code is accepted.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Recovery code</span>
          <textarea
            className="field-input mono"
            rows={3}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            autoCapitalize="characters"
            autoFocus
          />
        </label>
        <Field
          label="Your name (optional)"
          hint="Leave blank to use the name saved in your account."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field label="New passphrase for this device" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        <Field
          label="Repeat passphrase"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={error}
        />
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Restoring…" : "Restore"}
        </Button>
        <Button variant="ghost" type="button" onClick={onBack}>
          Back
        </Button>
      </form>
    </Shell>
  );
}

export function Unlock({ vault, onDone, onRestore }: { vault: Vault; onDone: Unlocked; onRestore: () => void }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await nextFrame();
    try {
      const identity = unlockVault(vault, pass);
      onDone(identity, vault.name, false);
    } catch {
      setError("That passphrase is not right.");
      setBusy(false);
    }
  }

  function removeFromDevice() {
    if (
      confirm(
        "Remove your account from this device? You will need your recovery code to use it here again. Your documents are not deleted.",
      )
    ) {
      forgetVault();
      location.reload();
    }
  }

  return (
    <Shell>
      <h1>Welcome back{vault.name ? `, ${vault.name}` : ""}</h1>
      <form className="stack" onSubmit={submit}>
        <Field
          label="Passphrase"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="current-password"
          autoFocus
          error={error}
        />
        <Button variant="primary" type="submit" disabled={busy || !pass}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
      <div className="row muted-links">
        <button className="linklike" onClick={onRestore}>
          Forgot passphrase? Use recovery code
        </button>
        <button className="linklike" onClick={removeFromDevice}>
          Remove account from this device
        </button>
      </div>
    </Shell>
  );
}

