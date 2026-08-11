import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertManagerOrAdmin, assertSameTenant, requireStaffActor } from '../helpers/auth'

const schema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(16).max(128).optional(),
  hours: z.number().int().min(1).max(72),
})

export const updateUnopenedSla = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Choose a timer between 1 and 72 hours.')
  }
  assertSameTenant(claims, parsed.data.tenantId)

  const tenantRef = db.collection('tenants').doc(parsed.data.tenantId)
  const snap = await tenantRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Company not found.')
  const data = snap.data() ?? {}
  const config = { ...(data.config ?? {}), unopenedSlaHours: parsed.data.hours }
  const configJson = { ...(data.configJson ?? config), unopenedSlaHours: parsed.data.hours }
  await tenantRef.update({ config, configJson })
  return { ok: true, hours: parsed.data.hours }
})
