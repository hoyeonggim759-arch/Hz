# Task worker contract

The web UI and database schema reserve a task subsystem. The worker is intentionally a no-op until the
actual business operation is specified and reviewed.

Required server-side checks before dispatch:
1. Authenticated user and active account.
2. Membership is active.
3. Phone format is `^010[0-9]{8}$`.
4. The requested duration is an integer from 1 through 300 minutes.
5. Per-user and per-IP concurrency/rate limits.
6. Idempotency key prevents duplicate starts.
7. User can read/stop only their own task.
8. Stop request is persisted and worker checks it cooperatively.
9. Deadline is enforced by the server even if the browser closes.
10. Append-only audit events for start/stop/failure.

Do not implement bulk messaging, OTP flooding, unsolicited contact, or actions against numbers
without the number owner's consent.


Phone numbers are stored encrypted at rest using the backend `decryptSensitive` helper (`apps/api/src/crypto.ts`). A worker must decrypt only after authenticating the task owner and re-checking membership/authorization. Never log the decrypted number. Keep `APP_DATA_KEY` outside the database and source repository.
