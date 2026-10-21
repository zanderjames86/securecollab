# Notes for Claude

SecureCollab is a zero-knowledge collaboration app owned by James (non-developer, approves every deploy). The full requirements live in the "SecureCollab – Requirements & User Stories" doc; README.md has the phase roadmap and SECURITY.md the current limitations.

## Non-negotiables

- The server must never see plaintext or keys. All crypto goes through `packages/crypto` (libsodium primitives only, no custom algorithms). Add tests there for any change.
- WhatsApp messages carry links only, never document content.
- Every edit stays signed; never apply unsigned or unverifiable updates.
- Keep it within the Cloudflare free plan.

## Workflow

- Work on a branch, open a PR with a plain-English summary for James, and include a "how to test on your phone" section.
- Before pushing: `npm run typecheck && npm test && npm run build`, plus the live test against `wrangler dev` (see README).
- Merging to `main` deploys automatically (.github/workflows/deploy.yml).
- Update SECURITY.md whenever a limitation is fixed or introduced.
