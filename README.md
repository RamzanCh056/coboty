# CoBotty

Multi-tenant customer claim tracking — Phase 2 Firebase backend
(Auth + Firestore + Cloud Functions + Hosting).

## Stack

- Frontend: React + Vite + TypeScript
- Staff login: Firestore `staf` credentials + session cookies (email **or** username / document id)
- Customer auth: Firebase Auth (email/password)
- Data: Firestore nested under `/tenants/{tenantId}/…`
- Mutations: Cloud Functions (2nd gen) — clients are read-mostly
- Public tracking: sanitized `/publicTracking/{trackingToken}` projection (192-bit token, get-only)

## Prerequisites

1. Firebase project `cobotty` on the **Blaze (pay-as-you-go)** plan (required for Cloud Functions)
2. Enable: Authentication (Email/Password), Cloud Firestore, Cloud Functions, Cloud Scheduler
3. Node 22+ recommended for Functions runtime

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
AI customer-reply drafts also fall back to a template + heuristic missing-info checklist when Anthropic is unset.

## AI conversation agent

**Phase 1:** Staff open a ticket → **AI customer reply** → **Draft with AI** → edit → **Approve & send**.

**Phase 2 (live):** When a customer sends a message, CoBotty auto-creates a pending AI draft
(`pendingAiReplies`) with confidence + risk flags. Staff see an **AI drafts awaiting approval**
strip on the Dashboard, then Open / Approve & send / Dismiss. Ticket modal prefills the pending draft.

Optional **low-risk auto-send** (manager settings, default off): high-confidence drafts with no
pricing/legal/promise flags may send automatically. The agent never marks a ticket solved.

## Deploy

Deploy **all three** together after tracking-token / confirmation changes:

```bash
npm run functions:build
npm run deploy:rules
npm run deploy:functions
npm run deploy:hosting
```

Also deploy Firestore indexes (`firestore.indexes.json`) when collection-group lookup indexes change:

```bash
firebase deploy --only firestore:indexes
```

For Vercel frontend deploys, push to the connected GitHub repo; Functions + rules still deploy via Firebase CLI.

## Security notes

- Guest tracking requires **ticket number + matching phone**; projection docs are keyed by private tokens, not `CB-#####`.
- Firestore rules reject get on predictable display-id paths under `publicTracking`.
- **Critical remaining issue:** staff passwords in `staf` are still stored/compared as plain values and must be migrated (hashed) before production use.

## Tests

```bash
npm run functions:test
npm run test:rules   # requires Java for Firestore emulator
```

## Customer URLs

- Submit: `https://<host>/fenwick/submit`
- Track lookup (OTP): `https://<host>/fenwick/track`
- Track (private token): `https://<host>/fenwick/track/<48-char-hex-token>`

Staff login: `/login` (email or username such as `manager`)

## High-value features (2026)

- Attachments via signed Storage URLs (images/PDF, 5MB)
- SMS OTP before opening a tracking link
- Missed-promise alerts in the 5-minute scheduler
- Manager escalation inbox (ack / assign / resolve)
- Preferred update channel: SMS or email (SendGrid optional)
- Resolution evidence required before customer confirm
- One-tap CSAT after confirmed close

Secrets (in addition to Twilio): `SENDGRID_API_KEY`, `EMAIL_FROM` / `SENDGRID_FROM` for email updates.
