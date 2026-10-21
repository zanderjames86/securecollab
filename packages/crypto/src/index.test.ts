import { beforeAll, describe, expect, it } from "vitest";
import {
  CryptoError,
  createIdentity,
  createInvite,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  envelopeAuthor,
  fingerprint,
  identityFromSeed,
  inviteFromSecret,
  newKey,
  openEnvelope,
  openSealed,
  ready,
  recoveryCodeToSeed,
  sealEnvelope,
  sealTo,
  seedToRecoveryCode,
  toBytes,
  fromBytes,
  unwrapWithPassphrase,
  wrapWithPassphrase,
  equalBytes,
} from "./index";

// Cheap Argon2 settings so the suite stays fast; production uses the interactive profile.
const FAST = { opslimit: 1, memlimit: 8192 };

beforeAll(async () => {
  await ready();
});

describe("identity and recovery code", () => {
  it("regenerates the same identity from its recovery code", () => {
    const me = createIdentity();
    const code = seedToRecoveryCode(me.seed);
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{1,5})+$/);
    const restored = identityFromSeed(recoveryCodeToSeed(code));
    expect(restored.id).toBe(me.id);
    expect(equalBytes(restored.boxPublicKey, me.boxPublicKey)).toBe(true);
  });

  it("tolerates lowercase, spaces and look-alike letters", () => {
    const me = createIdentity();
    const code = seedToRecoveryCode(me.seed);
    const messy = code.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
    expect(identityFromSeed(recoveryCodeToSeed(messy)).id).toBe(me.id);
  });

  it("rejects a recovery code with a typo", () => {
    const code = seedToRecoveryCode(createIdentity().seed);
    const typo = (code[0] === "A" ? "B" : "A") + code.slice(1);
    expect(() => recoveryCodeToSeed(typo)).toThrow(CryptoError);
  });

  it("rejects a recovery code of the wrong length", () => {
    const code = seedToRecoveryCode(createIdentity().seed);
    expect(() => recoveryCodeToSeed(code + "A")).toThrow(/wrong length/);
  });

  it("gives different people different fingerprints", () => {
    expect(fingerprint(createIdentity().signPublicKey)).not.toBe(
      fingerprint(createIdentity().signPublicKey),
    );
  });
});

describe("passphrase protection", () => {
  it("round-trips with the right passphrase", () => {
    const secret = createIdentity().seed;
    const wrapped = wrapWithPassphrase(secret, "correct horse battery", FAST);
    expect(equalBytes(unwrapWithPassphrase(wrapped, "correct horse battery"), secret)).toBe(true);
  });

  it("fails with the wrong passphrase", () => {
    const wrapped = wrapWithPassphrase(createIdentity().seed, "correct horse battery", FAST);
    expect(() => unwrapWithPassphrase(wrapped, "wrong horse battery")).toThrow(/wrong passphrase/);
  });

  it("refuses short passphrases", () => {
    expect(() => wrapWithPassphrase(new Uint8Array(32), "short", FAST)).toThrow();
  });
});

describe("symmetric encryption", () => {
  it("round-trips and binds associated data", () => {
    const key = newKey();
    const boxed = encrypt(toBytes("hello"), key, toBytes("ctx-a"));
    expect(fromBytes(decrypt(boxed, key, toBytes("ctx-a")))).toBe("hello");
    expect(() => decrypt(boxed, key, toBytes("ctx-b"))).toThrow(CryptoError);
    expect(() => decrypt(boxed, newKey(), toBytes("ctx-a"))).toThrow(CryptoError);
  });

  it("detects tampering", () => {
    const key = newKey();
    const boxed = encrypt(toBytes("hello"), key);
    boxed[boxed.length - 1]! ^= 1;
    expect(() => decrypt(boxed, key)).toThrow(CryptoError);
  });

  it("encrypts JSON", () => {
    const key = newKey();
    const boxed = encryptJson({ a: 1 }, key, "meta");
    expect(decryptJson(boxed, key, "meta")).toEqual({ a: 1 });
  });
});

describe("signed envelopes", () => {
  it("proves who wrote an edit", () => {
    const alice = createIdentity();
    const key = newKey();
    const env = sealEnvelope(toBytes("edit"), key, alice, "room:1/update");
    const opened = openEnvelope(env, key, "room:1/update");
    expect(opened.author).toBe(alice.id);
    expect(fromBytes(opened.payload)).toBe("edit");
    expect(envelopeAuthor(env)).toBe(alice.id);
  });

  it("cannot be replayed into another room", () => {
    const key = newKey();
    const env = sealEnvelope(toBytes("edit"), key, createIdentity(), "room:1/update");
    expect(() => openEnvelope(env, key, "room:2/update")).toThrow(/signature/);
  });

  it("rejects an envelope re-attributed to someone else", () => {
    const alice = createIdentity();
    const mallory = createIdentity();
    const key = newKey();
    const env = sealEnvelope(toBytes("edit"), key, alice, "room:1/update");
    env.set(mallory.signPublicKey, 1);
    expect(() => openEnvelope(env, key, "room:1/update")).toThrow(/signature/);
  });

  it("rejects a forged signature over altered ciphertext", () => {
    const key = newKey();
    const env = sealEnvelope(toBytes("edit"), key, createIdentity(), "room:1/update");
    env[40]! ^= 1;
    expect(() => openEnvelope(env, key, "room:1/update")).toThrow(CryptoError);
  });

  it("cannot be read without the document key", () => {
    const env = sealEnvelope(toBytes("edit"), newKey(), createIdentity(), "room:1/update");
    expect(() => openEnvelope(env, newKey(), "room:1/update")).toThrow(/decryption/);
  });
});

describe("sealed boxes and invites", () => {
  it("hands a key to exactly one person", () => {
    const bob = createIdentity();
    const key = newKey();
    const sealed = sealTo(key, bob.boxPublicKey);
    expect(equalBytes(openSealed(sealed, bob), key)).toBe(true);
    expect(() => openSealed(sealed, createIdentity())).toThrow(CryptoError);
  });

  it("derives the same invite id and key from the link secret", () => {
    const invite = createInvite();
    const again = inviteFromSecret(invite.secret);
    expect(again.id).toBe(invite.id);
    expect(equalBytes(again.key, invite.key)).toBe(true);
    expect(invite.id).not.toContain("=");
  });
});
