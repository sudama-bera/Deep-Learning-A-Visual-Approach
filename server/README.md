# Server (Sprint 1 baseline backend)

Node.js + TypeScript backend with:

- Express REST APIs
- JWT authentication
- PostgreSQL persistence (users/workspaces/documents/memberships)
- Socket.io real-time channels
- Redis pub/sub bridge for multi-instance socket fanout
- Redis ephemeral state for presence/cursor/typing (TTL-based)

## Quick start

1. Ensure PostgreSQL and Redis are running.
2. Copy environment file:
   - `cp .env.example .env`
3. Install dependencies:
   - `npm install`
4. Run in dev mode:
   - `npm run dev`

Server listens on `http://localhost:4000` by default.

## Auth flow

- `POST /auth/register`
- `POST /auth/login`

Use the returned JWT as:

`Authorization: Bearer <token>`

## Minimal collaboration milestone

1. Register/login 2 users.
2. Create workspace + document with one user.
3. Add second user to workspace.
4. Both users connect over Socket.io with JWT.
5. Both emit `document:join` for same document.
6. Emit `document:event` from one client; other client receives broadcast.

## Notes

- Yjs relay is intentionally not included in Sprint 1.
- This server creates required PostgreSQL tables automatically at startup.
