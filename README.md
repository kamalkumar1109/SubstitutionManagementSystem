# School Substitution Management System (MVP)

Monorepo:

- `client/` React (Vite)
- `server/` Node + Express

This MVP uses **hardcoded data only** (no DB) and stores generated substitutions **in memory** (server restart resets state).

## Run locally

In the repo root:

```bash
npm install --workspaces
```

Start backend + frontend (two terminals is most reliable):

```bash
npm run dev:server
```

```bash
npm run dev:client
```

- Frontend: `http://localhost:5173/` (Vite may pick the next free port)
- Backend: `http://localhost:5050/` by default. If that port is busy, the server tries **5051, 5052, …** and prints the URL — if it is not `5050`, set `VITE_API_TARGET` when starting Vite, e.g. `VITE_API_TARGET=http://localhost:5052 npm run dev` in `client/`, or update `client/vite.config.js` `API_TARGET` to match the terminal line `[SMS] Server running on http://localhost:…`.

## Core APIs

- `POST /mark-attendance` `{ teacherId, status }`
- `POST /generate-substitution` `{ day }`
- `GET /substitutions?day=Monday`
- `POST /manual-override` `{ day, period, absentTeacherId, substituteTeacherId|null }`
- `POST /reset-day` `{ day }`

## Substitution rules (implemented)

Implemented in `server/services/substitutionService.js`:

- Only **PRESENT** teachers are candidates
- Candidate must be **FREE** in that period
- Score = `freePeriodsCount - substitutionCount`
- Highest score wins; ties are random
- Never assign a teacher who is already assigned as a substitute in the same period
- Adds a small penalty to reduce back-to-back assignments (fairness)

