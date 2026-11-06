# Security baseline

- Never store plaintext passwords; use Argon2id with parameters reviewed for the production host.
- Never return password hashes, session secrets, license hashes, or payment secrets from APIs.
- Admin and support roles are separate; enforce role checks in the API, not only in page routing.
- A license code is one-time use. Redeem in a DB transaction with a unique constraint on `licenseId`.
- Start membership time only after successful redemption; use server time.
- Do not trust client-submitted membership status, user IDs, task status, IP headers, or payment confirmations.
- Trust proxy headers only from explicitly configured reverse proxies.
- Rate-limit login, registration, password recovery, license redemption, uploads, and task creation.
- Uploads must use private object storage, generated object keys, size/type limits, malware scanning, and authorization checks.
- Keep payment chain/network, token contract, destination address, amount, and confirmation threshold explicit. Never issue a key from a browser redirect or unverified webhook.
- Task endpoints must verify ownership. Stop requests must be idempotent. Enforce a hard server-side duration cap of 300 minutes.
- The task worker is intentionally not implemented in this starter. Add only a documented, authorized task handler.
- Do not log passwords, raw license codes, session cookies, authorization headers, or full payment secrets.
- Keep production database private; use private networking and TLS between app and database nodes.
- Backups must be encrypted, off-host, access-separated, versioned/immutable where possible, and restore-tested.
- The production Compose layout separates the frontend network from the database-only network. PostgreSQL has no published host port; only the API joins its private network.
- Runtime API uses a restricted database role. A separate migration role owns schema changes; never use the PostgreSQL superuser in the application.
- Phone numbers and support message bodies are encrypted at rest with AES-256-GCM using `APP_DATA_KEY`. The key is not stored in PostgreSQL. Losing it makes those fields unreadable.
- Runtime application containers run as the unprivileged `node` user with dropped Linux capabilities and `no-new-privileges`.
- SameSite cookies and strict Origin allowlisting are used for browser requests. Validate the exact production origin and keep HTTPS enabled.
- The included rate limiter is in-memory and only suitable for a single API process. Production multi-instance deployments require a shared limiter and edge WAF.

- New account registration requires an unused, non-expired license code. Claiming the card, creating the user, recording the redemption, and assigning membership expiry happen in one serializable transaction.
- Registration never returns or stores the raw license code; only the existing HMAC card digest is used for lookup.
