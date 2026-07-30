# CoBotty

Multi-tenant customer claim tracking — Phase 2 Firebase backend
(Auth + Firestore + Cloud Functions + Hosting).

## Stack

- Frontend: React + Vite + TypeScript
- Auth: Firebase Auth (email/password) with custom claims `{ tenantId, role, departmentId }`
- Data: Firestore nested under `/tenants/{tenantId}/…`
- Mutations: Cloud Functions (2nd gen) — clients are read-mostly
- Public tracking: sanitized `/publicTracking/{displayId}` projection (get-only)

## Prerequisites

1. Firebase project `cobotty` on the **Blaze (pay-as-you-go)** plan (required for Cloud Functions)
2. Enable: Authentication (Email/Password), Cloud Firestore, Cloud Functions, Cloud Scheduler
3. Node 20+ recommended for Functions runtime

Upgrade billing: https://console.firebase.google.com/project/cobotty/usage/details


## Local setup

```bash
cp .env.example .env   # fill VITE_FIREBASE_* from Firebase console
npm install
npm --prefix functions install
npm --prefix tests/rules install
```

## Bootstrap tenants + staff

Requires Application Default Credentials or a service account:

```bash
export AGENT_PASSWORD='choose-a-strong-password'
export MANAGER_PASSWORD='choose-a-strong-password'
# optional: AGENT_EMAIL, MANAGER_EMAIL, ALDERLY_AGENT_PASSWORD
npm run bootstrap
```

Creates Fenwick + Alderly tenants, departments, and staff with custom claims.

## Secrets (Cloud Functions)

Set as runtime environment variables on deployed functions (or migrate to Secret Manager):

- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

If unset, classification falls back to keywords / first department and SMS sends are logged as `skipped`.

## Deploy

```bash
npm run functions:build
npm run deploy:rules
npm run deploy:functions
npm run deploy:hosting
```

## Tests

```bash
npm run functions:test
npm run test:rules   # requires Java for Firestore emulator
```

## Customer URLs

- Submit: `https://<host>/fenwick/submit`
- Track: `https://<host>/fenwick/track/CB-12345`

Staff login: `/login`
