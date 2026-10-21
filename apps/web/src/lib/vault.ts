/**
 * The vault: this device's copy of the user's master seed, encrypted with
 * their passphrase (Argon2id). Nothing readable is stored on the device.
 */
import {
  identityFromSeed,
  unwrapWithPassphrase,
  wrapWithPassphrase,
  type Identity,
  type WrappedSecret,
} from "@securecollab/crypto";

const VAULT_KEY = "securecollab.vault.v1";

export interface Vault {
  v: 1;
  /** Public identity id, used to show which account this device holds. */
  id: string;
  /** Display name cached for the unlock screen. */
  name: string;
  wrapped: WrappedSecret;
  createdAt: number;
}

export function loadVault(): Vault | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const vault = JSON.parse(raw) as Vault;
    return vault?.v === 1 ? vault : null;
  } catch {
    return null;
  }
}

export function saveVault(identity: Identity, name: string, passphrase: string): Vault {
  const vault: Vault = {
    v: 1,
    id: identity.id,
    name,
    wrapped: wrapWithPassphrase(identity.seed, passphrase),
    createdAt: Date.now(),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  return vault;
}

export function updateVaultName(name: string): void {
  const vault = loadVault();
  if (!vault || vault.name === name) return;
  localStorage.setItem(VAULT_KEY, JSON.stringify({ ...vault, name }));
}

/** Throws CryptoError("wrong passphrase") on failure. */
export function unlockVault(vault: Vault, passphrase: string): Identity {
  return identityFromSeed(unwrapWithPassphrase(vault.wrapped, passphrase));
}

export function forgetVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

/** Passphrase rules shown to the user. */
export function passphraseProblem(passphrase: string, confirm: string): string | null {
  if (passphrase.length < 10) return "Use at least 10 characters. A short sentence works well.";
  if (passphrase !== confirm) return "The two passphrases do not match.";
  return null;
}
