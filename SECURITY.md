# Security model

## What is protected

| Data | Protection |
| --- | --- |
| Document text, titles, tables | Encrypted on the device with a per-document key (XChaCha20-Poly1305) |
| Team name, member names, document list | Encrypted with the team key |
| Your list of teams and keys | Encrypted with a key derived from your seed; only you can read it |
| Every edit | Signed with the author's Ed25519 key; bound to its room so it cannot be replayed elsewhere |
| Keys on your device | Stored only inside a vault encrypted with your passphrase (Argon2id) |
| Invite links | The secret is in the link fragment (`#...`), which browsers never send to a server; invites work once and expire after 7 days |

The server never receives keys and cannot read content. If it alters or forges data, clients detect it: the change fails signature or decryption checks, is ignored, and a warning is shown.

## What the server can see

Encrypted data exists, its size and timing, which room ids are active, and connecting IP addresses. Cloudflare logging is disabled in `wrangler.jsonc`.

## Not protected

- An unlocked or compromised phone or laptop.
- Screenshots, photos of the screen, or text copied out by a member. (Phase 2 adds watermarks and copy/print blocks to make leaks traceable, but no web app can prevent a screenshot.)
- Anyone who gets your recovery code. Treat it like the key to a safe.

## Phase 1 limitations (being addressed in Phase 2)

- **Roles are not yet enforced cryptographically.** Anyone holding a team's key can currently edit its documents and member list. Only the owner sees the invite button, but that is a UI restriction.
- **Removing a member does not yet revoke access.** Key rotation on removal arrives in Phase 2.
- **Unsent edits live in memory.** If the app is closed while offline, unsent edits are lost (the app warns before closing).
- **History is not compacted**, so very large documents take longer to open over time.
- **One account per browser.**
- **No independent security audit.** The cryptography uses libsodium primitives only, but the design and code have not been externally reviewed. Do not use for classified material.

## Reporting a problem

Open a private security advisory on the GitHub repository.
