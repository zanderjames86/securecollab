/**
 * SecureCollab crypto core.
 *
 * Everything that touches keys lives here so it can be reviewed in one place.
 * Only well-reviewed libsodium primitives are used:
 *  - XChaCha20-Poly1305 (AEAD) for all symmetric encryption
 *  - Ed25519 for signatures (every update names and proves its author)
 *  - X25519 sealed boxes for handing keys to a specific person
 *  - Argon2id for turning a passphrase into a key
 *  - BLAKE2b for hashing and key derivation
 */
import _sodium from "libsodium-wrappers-sumo";

type Sodium = typeof _sodium;
let sodium: Sodium | undefined;

/** Must be awaited once before any other function is used. */
export async function ready(): Promise<void> {
  await _sodium.ready;
  sodium = _sodium;
}

function na(): Sodium {
  if (!sodium) throw new Error("crypto not initialised: await ready() first");
  return sodium;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

export function toBytes(text: string): Uint8Array {
  return utf8.encode(text);
}

export function fromBytes(bytes: Uint8Array): string {
  return utf8d.decode(bytes);
}

/** URL-safe base64 without padding. */
export function toB64(bytes: Uint8Array): string {
  return na().to_base64(bytes, na().base64_variants.URLSAFE_NO_PADDING);
}

export function fromB64(text: string): Uint8Array {
  try {
    return na().from_base64(text, na().base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new CryptoError("invalid base64 data");
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return na().randombytes_buf(n);
}

/** Random, unguessable identifier (128 bits) for rooms, teams and documents. */
export function randomId(): string {
  return toB64(randomBytes(16));
}

/** Derive an independent 32-byte key from a secret for a named purpose. */
export function deriveKey(secret: Uint8Array, label: string): Uint8Array {
  return na().crypto_generichash(32, toBytes(`securecollab/${label}`), secret);
}

// ---------------------------------------------------------------------------
// Recovery codes (Crockford base32 with checksum)
// ---------------------------------------------------------------------------

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string, byteLength: number): Uint8Array {
  if (text.length !== Math.ceil((byteLength * 8) / 5)) {
    throw new CryptoError("recovery code is the wrong length");
  }
  const out = new Uint8Array(byteLength);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const ch of text) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new CryptoError(`invalid character "${ch}" in recovery code`);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      if (index < byteLength) out[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  if (index !== byteLength) throw new CryptoError("recovery code is the wrong length");
  return out;
}

function normaliseRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** Turn a 32-byte seed into a human-copyable recovery code with a checksum. */
export function seedToRecoveryCode(seed: Uint8Array): string {
  if (seed.length !== 32) throw new CryptoError("seed must be 32 bytes");
  const check = na().crypto_generichash(2, seed, null);
  const raw = base32Encode(concat(seed, check));
  return raw.match(/.{1,5}/g)!.join("-");
}

/** Parse a recovery code back into the seed; tolerant of spaces, dashes and case. */
export function recoveryCodeToSeed(code: string): Uint8Array {
  const bytes = base32Decode(normaliseRecoveryCode(code), 34);
  const seed = bytes.slice(0, 32);
  const check = na().crypto_generichash(2, seed, null);
  if (check[0] !== bytes[32] || check[1] !== bytes[33]) {
    throw new CryptoError("recovery code checksum does not match; check for typos");
  }
  return seed;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface Identity {
  /** 32-byte master seed. The recovery code encodes exactly this. */
  seed: Uint8Array;
  signPublicKey: Uint8Array;
  signSecretKey: Uint8Array;
  boxPublicKey: Uint8Array;
  boxSecretKey: Uint8Array;
  /** Stable public identifier: base64 of the signing public key. */
  id: string;
}

export function identityFromSeed(seed: Uint8Array): Identity {
  if (seed.length !== 32) throw new CryptoError("seed must be 32 bytes");
  const s = na();
  const sign = s.crypto_sign_seed_keypair(deriveKey(seed, "identity/sign"));
  const box = s.crypto_box_seed_keypair(deriveKey(seed, "identity/box"));
  return {
    seed,
    signPublicKey: sign.publicKey,
    signSecretKey: sign.privateKey,
    boxPublicKey: box.publicKey,
    boxSecretKey: box.privateKey,
    id: toB64(sign.publicKey),
  };
}

export function createIdentity(): Identity {
  return identityFromSeed(randomBytes(32));
}

/** Short fingerprint people can compare in person to confirm an identity. */
export function fingerprint(publicKey: Uint8Array): string {
  const hash = na().crypto_generichash(10, publicKey, null);
  return base32Encode(hash).match(/.{1,4}/g)!.join(" ");
}

// ---------------------------------------------------------------------------
// Passphrase protection (Argon2id)
// ---------------------------------------------------------------------------

export interface WrappedSecret {
  v: 1;
  salt: string;
  nonce: string;
  ciphertext: string;
  opslimit: number;
  memlimit: number;
}

export interface PassphraseCost {
  opslimit: number;
  memlimit: number;
}

/** Default Argon2id cost: libsodium's "interactive" profile, fine on phones. */
export function defaultPassphraseCost(): PassphraseCost {
  const s = na();
  return {
    opslimit: s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    memlimit: s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
  };
}

function passphraseKey(passphrase: string, salt: Uint8Array, cost: PassphraseCost): Uint8Array {
  const s = na();
  return s.crypto_pwhash(
    32,
    passphrase,
    salt,
    cost.opslimit,
    cost.memlimit,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export function wrapWithPassphrase(
  secret: Uint8Array,
  passphrase: string,
  cost: PassphraseCost = defaultPassphraseCost(),
): WrappedSecret {
  if (passphrase.length < 8) throw new CryptoError("passphrase must be at least 8 characters");
  const s = na();
  const salt = randomBytes(s.crypto_pwhash_SALTBYTES);
  const key = passphraseKey(passphrase, salt, cost);
  const boxed = encrypt(secret, key, toBytes("passphrase-wrap/v1"));
  return {
    v: 1,
    salt: toB64(salt),
    nonce: toB64(boxed.slice(0, NONCE_BYTES)),
    ciphertext: toB64(boxed.slice(NONCE_BYTES)),
    opslimit: cost.opslimit,
    memlimit: cost.memlimit,
  };
}

export function unwrapWithPassphrase(wrapped: WrappedSecret, passphrase: string): Uint8Array {
  const key = passphraseKey(passphrase, fromB64(wrapped.salt), wrapped);
  try {
    return decrypt(
      concat(fromB64(wrapped.nonce), fromB64(wrapped.ciphertext)),
      key,
      toBytes("passphrase-wrap/v1"),
    );
  } catch {
    throw new CryptoError("wrong passphrase");
  }
}

// ---------------------------------------------------------------------------
// Symmetric encryption (XChaCha20-Poly1305)
// ---------------------------------------------------------------------------

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;

export function newKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/** Returns nonce || ciphertext. `ad` is authenticated but not encrypted. */
export function encrypt(plaintext: Uint8Array, key: Uint8Array, ad: Uint8Array | null = null): Uint8Array {
  const s = na();
  const nonce = randomBytes(NONCE_BYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key);
  return concat(nonce, ct);
}

export function decrypt(boxed: Uint8Array, key: Uint8Array, ad: Uint8Array | null = null): Uint8Array {
  const s = na();
  if (boxed.length < NONCE_BYTES + s.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    throw new CryptoError("ciphertext too short");
  }
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      boxed.slice(NONCE_BYTES),
      ad,
      boxed.slice(0, NONCE_BYTES),
      key,
    );
  } catch {
    throw new CryptoError("decryption failed: wrong key or tampered data");
  }
}

export function encryptJson(value: unknown, key: Uint8Array, ad: string): string {
  return toB64(encrypt(toBytes(JSON.stringify(value)), key, toBytes(ad)));
}

export function decryptJson<T>(boxed: string, key: Uint8Array, ad: string): T {
  return JSON.parse(fromBytes(decrypt(fromB64(boxed), key, toBytes(ad)))) as T;
}

// ---------------------------------------------------------------------------
// Signed, encrypted envelopes (one per edit)
// ---------------------------------------------------------------------------

const ENVELOPE_VERSION = 1;
const SIGN_PK_BYTES = 32;
const SIG_BYTES = 64;

export interface OpenedEnvelope {
  /** Author identity id (base64 signing public key). */
  author: string;
  payload: Uint8Array;
}

/**
 * Encrypt and sign a payload for a given context (for example "room:<id>/update").
 * Layout: [version 1][author key 32][nonce 24][ciphertext n][signature 64].
 * The signature covers the context, so an envelope cannot be replayed into another room.
 */
export function sealEnvelope(
  payload: Uint8Array,
  key: Uint8Array,
  author: Identity,
  context: string,
): Uint8Array {
  const s = na();
  const ctx = toBytes(context);
  const header = concat(Uint8Array.of(ENVELOPE_VERSION), author.signPublicKey);
  const boxed = encrypt(payload, key, concat(ctx, header));
  const body = concat(header, boxed);
  const sig = s.crypto_sign_detached(concat(ctx, body), author.signSecretKey);
  return concat(body, sig);
}

export function openEnvelope(envelope: Uint8Array, key: Uint8Array, context: string): OpenedEnvelope {
  const s = na();
  const minLength = 1 + SIGN_PK_BYTES + NONCE_BYTES + s.crypto_aead_xchacha20poly1305_ietf_ABYTES + SIG_BYTES;
  if (envelope.length < minLength) throw new CryptoError("envelope too short");
  if (envelope[0] !== ENVELOPE_VERSION) throw new CryptoError("unsupported envelope version");
  const ctx = toBytes(context);
  const body = envelope.slice(0, envelope.length - SIG_BYTES);
  const sig = envelope.slice(envelope.length - SIG_BYTES);
  const authorKey = body.slice(1, 1 + SIGN_PK_BYTES);
  if (!s.crypto_sign_verify_detached(sig, concat(ctx, body), authorKey)) {
    throw new CryptoError("signature invalid: edit was forged or altered");
  }
  const header = body.slice(0, 1 + SIGN_PK_BYTES);
  const payload = decrypt(body.slice(1 + SIGN_PK_BYTES), key, concat(ctx, header));
  return { author: toB64(authorKey), payload };
}

/** Read the claimed author without decrypting (signature is NOT checked). */
export function envelopeAuthor(envelope: Uint8Array): string {
  return toB64(envelope.slice(1, 1 + SIGN_PK_BYTES));
}

// ---------------------------------------------------------------------------
// Sending a key to one person (sealed boxes)
// ---------------------------------------------------------------------------

export function sealTo(data: Uint8Array, recipientBoxPublicKey: Uint8Array): Uint8Array {
  return na().crypto_box_seal(data, recipientBoxPublicKey);
}

export function openSealed(sealed: Uint8Array, recipient: Identity): Uint8Array {
  try {
    return na().crypto_box_seal_open(sealed, recipient.boxPublicKey, recipient.boxSecretKey);
  } catch {
    throw new CryptoError("could not open sealed data: not addressed to this identity");
  }
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export interface InviteSecret {
  /** Goes only into the link fragment (after #); never sent to the server. */
  secret: Uint8Array;
  /** Public lookup id the server stores the encrypted invite under. */
  id: string;
  /** Key that encrypts the invite payload. */
  key: Uint8Array;
}

export function inviteFromSecret(secret: Uint8Array): InviteSecret {
  return {
    secret,
    id: toB64(deriveKey(secret, "invite/id").slice(0, 16)),
    key: deriveKey(secret, "invite/key"),
  };
}

export function createInvite(): InviteSecret {
  return inviteFromSecret(randomBytes(32));
}

/** Constant-time comparison. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && na().memcmp(a, b);
}
