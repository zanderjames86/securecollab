# SecureCollab

Zero-knowledge document collaboration for small teams (up to 10), with an owner-controlled approval workflow and WhatsApp as the coordination channel.

Documents are encrypted and every edit is signed on the user's device. The server stores and relays ciphertext only; it holds no keys.

## Status

**Phase 1 (secure core) — in progress.** Working today:

- Accounts with a passphrase-protected key vault and a 55-character recovery code (no email or phone number)
- Restore an account, its teams and documents on a new device from the recovery code
- Several separate teams per account, each with its own keys
- Single-use, 7-day invite links whose secret never reaches the server, with one-tap WhatsApp sharing
- Real-time co-editing (rich text, headings, lists, tables) with live cursors and presence
- Every edit encrypted (XChaCha20-Poly1305) and signed (Ed25519); forged, altered or replayed edits are rejected
- Edits made on a bad connection are queued and sent on reconnect
- Auto-lock after 15 minutes of inactivity; works on phones and laptops

See [SECURITY.md](SECURITY.md) for what is and isn't protected yet, and the full plan in the requirements document.

## Roadmap

1. **Secure core** — accounts, encryption, teams, invites, live editing *(current)*
2. **Controlled collaboration** — enforced roles and custom roles, suggest-only mode, comments, accept/reject, activity log, watermarking, copy/print blocks, member removal with key rotation
3. **Revisions and review** — approve-and-lock revisions, rounds (open or blind review), conflict view, comparison, password-protected PDF/Office export
4. **Tasks and owner automation** — Kanban board, deadlines, reminders, dashboard, WhatsApp message generator, backups
5. **Spreadsheets and charts**
6. **Presentations and whiteboard**

## Project layout

```
apps/web        React app (Vite, Tiptap editor, Yjs)
apps/sync       Cloudflare Worker + Durable Objects: serves the app and relays ciphertext
packages/crypto All cryptography, in one reviewable file, with tests
packages/protocol Wire protocol shared by app and server
```

## Development

Requires Node.js 20+.

```bash
npm ci
npm run build            # build the web app into apps/web/dist
npm run dev:sync         # sync server + built app on http://localhost:8787
npm run dev:web          # (optional) hot-reloading app on http://localhost:5173, proxied to the sync server
npm test                 # unit tests
npm run typecheck
SC_LIVE_URL=http://localhost:8787 npx vitest run --root apps/web live   # tests against a running server
```

## Deploying

See [DEPLOY.md](DEPLOY.md). Hosting runs on Cloudflare's free plan.
