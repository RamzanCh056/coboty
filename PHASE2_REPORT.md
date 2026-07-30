# CoBotty Phase 2 — Implementation Report

Date: 2026-07-30  
Project: `cobotty`  
Hosting: https://cobotty.web.app

## Implemented vs deferred

### Implemented
- Nested Firestore model under `/tenants/{tenantId}/…` (departments, users, tickets, history, notifications, billingEvents)
- Sanitized public tracking projection `/publicTracking/{displayId}` (get/listen only; no list/write)
- Hardened Security Rules with claim-based tenant isolation and server-only mutations
- Rules unit tests — **9/9 passed** via Firestore emulator
- Cloud Functions (TypeScript, 2nd gen) source + build + business-rule unit tests (**6/6 passed**)
- Frontend rewritten to Auth custom claims, nested listeners, and callable actions
- Removed all Phase 1 mock/demo artifacts (mock store, DevTools, demo login toggle, client seed, status simulators)
- Report page now aggregates live tickets (CSAT/reopen show “—” until those signals exist)
- Firebase Hosting deployed with the new frontend
- Firestore rules + composite indexes deployed

### Deferred (blocked on your Firebase project)
| Item | Why |
|------|-----|
| Cloud Functions deploy | Project must be on **Blaze (pay-as-you-go)** — deploy failed enabling Cloud Build / Artifact Registry |
| Live bootstrap of staff users | Needs Admin credentials after Functions/Blaze (script is ready: `npm run bootstrap`) |
| Live acceptance path (submit → assign → takeover) | Requires deployed Functions + seeded staff |
| Claude classification | Needs `ANTHROPIC_API_KEY` env on Functions; falls back to keywords / first department |
| Real Twilio SMS | Needs `TWILIO_*` env vars; otherwise notifications are logged as `skipped` |
| App Check | Not wired yet — public callables use IP rate limits only |

## Cloud Functions (source ready; deploy pending Blaze)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `submitTicket` | Callable (public) | Create ticket + billing event + initial public projection |
| `onTicketCreated` | Firestore `onCreate` | Keyword→Claude classify, Received history, SMS, projection sync |
| `assignTicket` | Callable (auth) | Assign / open / will-call / solved with transition checks |
| `takeoverTicket` | Callable (auth) | Reason-validated takeover + SMS template + history |
| `reassignTicket` | Callable (manager/admin) | Direct reassignment |
| `sendCustomerMessage` | Callable (public) | Customer message → history + projection |
| `createStaffUser` | Callable (manager/admin) | Create Auth user + claims + users doc |
| `checkStuckTickets` | Schedule every 15 min | Flag tickets idle >24h |

## Security Rules test results

Command: `firebase emulators:exec --only firestore --project cobotty "npm --prefix tests/rules test"`

| Test | Result |
|------|--------|
| Same-tenant ticket read | PASS |
| Cross-tenant ticket read denied | PASS |
| Unauthenticated tenant ticket list denied | PASS |
| Unauthenticated publicTracking get allowed | PASS |
| Unauthenticated publicTracking list denied | PASS |
| Client write to publicTracking denied | PASS |
| Agent direct ticket mutation denied | PASS |
| Manager direct ticket mutation denied | PASS |
| Cross-tenant write denied | PASS |

**9/9 passed.**

## Behavior differences vs Phase 1 mock

- No silent mock fallback — missing Firebase config throws
- Staff role/tenant come from Auth custom claims, not editable Firestore docs
- Ticket mutations go through Cloud Functions (enforced by rules even if a modified client tries direct writes)
- Customer tracking reads only the sanitized projection (no phone/raw claim list access)
- SMS is real-or-skipped (logged), not a fake toast implying delivery
- Report metrics are live aggregates; CSAT/reopen are unavailable until product collects them
- Artificial skeleton delays and inflated footer stats removed

## What you need to do next

1. **Upgrade billing**  
   https://console.firebase.google.com/project/cobotty/usage/details → Blaze plan

2. **Enable Email/Password Auth**  
   Authentication → Sign-in method → Email/Password → Enable

3. **Deploy Functions**
   ```bash
   cd /Users/apple/cobotty
   npm run deploy:functions
   ```

4. **Bootstrap staff**
   ```bash
   # ADC or service account with Firebase Admin access
   export AGENT_PASSWORD='your-strong-password'
   export MANAGER_PASSWORD='your-strong-password'
   npm run bootstrap
   ```
   Defaults: `andrew.chen@fenwickhs.com` (agent/Repair), `sarah.okafor@fenwickhs.com` (manager/Finance)

5. **Optional env vars (Cloud Functions runtime)**  
   In Google Cloud Console → Cloud Functions → each function → Environment variables, or later migrate to Secret Manager:
   - `ANTHROPIC_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`

6. **Acceptance walkthrough** (after steps 1–4)
   - Open https://cobotty.web.app/fenwick/submit → submit a claim
   - Log in as Andrew → see ticket under New (live)
   - Assign to me → open tracking tab → status updates live
   - Log in as Sarah → take over a stuck ticket with reason → history + SMS preview match
   - Confirm Alderly agent cannot read Fenwick tickets (rules already verified in emulator)

## Repo map (key paths)

- Functions: [`functions/src/`](functions/src/)
- Rules: [`firestore.rules`](firestore.rules)
- Rules tests: [`tests/rules/firestore.rules.test.ts`](tests/rules/firestore.rules.test.ts)
- Frontend data: [`src/lib/firebase/data.ts`](src/lib/firebase/data.ts), [`src/context/AppData.tsx`](src/context/AppData.tsx)
- Bootstrap: [`functions/scripts/bootstrap.ts`](functions/scripts/bootstrap.ts)
