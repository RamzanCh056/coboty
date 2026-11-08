import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { db } from '../helpers/admin'
import { assertManagerOrAdmin, assertSameTenant, requireStaffActor } from '../helpers/auth'

const schema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(16).max(128).optional(),
  aiAutoSendEnabled: z.boolean(),
  aiAutoSendMinConfidence: z.number().min(0.5).max(1).optional(),
})

export const updateAiAgentSettings = onCall({ cors: true }, async (request) => {
  const claims = await requireStaffActor(request)
  assertManagerOrAdmin(claims.role)
  const parsed = schema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid AI agent settings.')
  }
  assertSameTenant(claims, parsed.data.tenantId)

  const tenantRef = db.collection('tenants').doc(parsed.data.tenantId)
  const snap = await tenantRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Company not found.')
  const data = snap.data() ?? {}
  const minConfidence = parsed.data.aiAutoSendMinConfidence ?? 0.85
  const patch = {
    aiAutoSendEnabled: parsed.data.aiAutoSendEnabled,
    aiAutoSendMinConfidence: minConfidence,
  }
  const config = { ...(data.config ?? {}), ...patch }
  const configJson = { ...(data.configJson ?? config), ...patch }
  await tenantRef.update({ config, configJson })
  return { ok: true, ...patch }
})
