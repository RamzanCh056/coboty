import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { bucket, db } from '../helpers/admin'
import { assertCanMutate, assertSameTenant, requireStaffActor } from '../helpers/auth'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { isTrackingToken } from '../helpers/trackingToken'
import type { PublicTracking } from '../types'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_BYTES = 5 * 1024 * 1024
const SIGNED_URL_TTL_MS = 15 * 60 * 1000

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
}

async function resolveTicketAccess(input: {
  sessionId?: string
  trackingToken?: string
  tenantId?: string
  ticketId?: string
  request: Parameters<typeof requireStaffActor>[0]
}): Promise<{ tenantId: string; ticketId: string; actor: string; isStaff: boolean }> {
  if (input.trackingToken) {
    if (!isTrackingToken(input.trackingToken)) {
      throw new HttpsError('invalid-argument', 'Invalid tracking token.')
    }
    const projectionSnap = await db.collection('publicTracking').doc(input.trackingToken).get()
    if (!projectionSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')
    const projection = projectionSnap.data() as PublicTracking
    return {
      tenantId: projection.tenantId,
      ticketId: projection.ticketId,
      actor: 'Customer',
      isStaff: false,
    }
  }

  if (input.sessionId && input.tenantId && input.ticketId) {
    const claims = await requireStaffActor(input.request)
    assertCanMutate(claims.role)
    assertSameTenant(claims, input.tenantId)
    const userSnap = await db
      .collection('tenants')
      .doc(input.tenantId)
      .collection('users')
      .doc(claims.uid)
      .get()
    const actorName = (userSnap.data()?.name as string | undefined) ?? 'Staff'
    return {
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      actor: actorName,
      isStaff: true,
    }
  }

  throw new HttpsError('invalid-argument', 'sessionId with tenant/ticket or trackingToken is required.')
}

const uploadSchema = z
  .object({
    sessionId: z.string().min(16).max(128).optional(),
    trackingToken: z.string().min(3).max(48).optional(),
    tenantId: z.string().min(1).optional(),
    ticketId: z.string().min(1).optional(),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(3).max(100),
    size: z.number().int().positive(),
  })
  .refine((d) => d.trackingToken || d.sessionId, {
    message: 'sessionId or trackingToken is required',
  })

export const createAttachmentUploadUrl = onCall({ cors: true }, async (request) => {
  const parsed = uploadSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid upload request.')
  }
  const { sessionId, trackingToken, tenantId, ticketId, fileName, contentType, size } = parsed.data

  if (!ALLOWED_TYPES.has(contentType)) {
    throw new HttpsError('invalid-argument', 'Allowed types: JPEG, PNG, WebP, PDF.')
  }
  if (size > MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'File must be 5MB or smaller.')
  }

  const access = await resolveTicketAccess({
    sessionId,
    trackingToken,
    tenantId,
    ticketId,
    request,
  })

  const ticketSnap = await db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .get()
  if (!ticketSnap.exists) throw new HttpsError('not-found', 'Ticket not found.')

  const attachmentRef = db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .collection('attachments')
    .doc()

  const safeName = safeFileName(fileName)
  const storagePath = `tenants/${access.tenantId}/tickets/${access.ticketId}/attachments/${attachmentRef.id}/${safeName}`
  const now = new Date().toISOString()

  await attachmentRef.set({
    id: attachmentRef.id,
    name: safeName,
    contentType,
    size,
    storagePath,
    uploadedBy: access.actor,
    createdAt: now,
    visibleToCustomer: true,
    finalized: false,
  })

  const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
    action: 'write',
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType,
  })

  return {
    attachmentId: attachmentRef.id,
    uploadUrl,
    storagePath,
    expiresInSeconds: 15 * 60,
  }
})

const finalizeSchema = z
  .object({
    sessionId: z.string().min(16).max(128).optional(),
    trackingToken: z.string().min(3).max(48).optional(),
    tenantId: z.string().min(1).optional(),
    ticketId: z.string().min(1).optional(),
    attachmentId: z.string().min(1),
  })
  .refine((d) => d.trackingToken || d.sessionId, {
    message: 'sessionId or trackingToken is required',
  })

export const finalizeAttachment = onCall({ cors: true }, async (request) => {
  const parsed = finalizeSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid finalize request.')
  }
  const { sessionId, trackingToken, tenantId, ticketId, attachmentId } = parsed.data

  const access = await resolveTicketAccess({
    sessionId,
    trackingToken,
    tenantId,
    ticketId,
    request,
  })

  const attachmentRef = db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .collection('attachments')
    .doc(attachmentId)

  const snap = await attachmentRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Attachment not found.')
  const data = snap.data()!
  if (data.finalized === true) {
    return { ok: true, alreadyFinalized: true }
  }

  const now = new Date().toISOString()
  await attachmentRef.update({ finalized: true })

  await appendHistory(access.tenantId, access.ticketId, {
    action: 'attachment',
    actor: access.actor,
    note: `Attached file: ${data.name ?? attachmentId}`,
    visibleToCustomer: Boolean(data.visibleToCustomer),
    timestamp: now,
  })

  await db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .update({ updatedAt: now })

  await rebuildProjection(access.tenantId, access.ticketId)
  return { ok: true }
})

const listSchema = z
  .object({
    sessionId: z.string().min(16).max(128).optional(),
    trackingToken: z.string().min(3).max(48).optional(),
    tenantId: z.string().min(1).optional(),
    ticketId: z.string().min(1).optional(),
  })
  .refine((d) => d.trackingToken || d.sessionId, {
    message: 'sessionId or trackingToken is required',
  })

export const listTicketAttachments = onCall({ cors: true }, async (request) => {
  const parsed = listSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid list request.')
  }
  const { sessionId, trackingToken, tenantId, ticketId } = parsed.data

  const access = await resolveTicketAccess({
    sessionId,
    trackingToken,
    tenantId,
    ticketId,
    request,
  })

  const snap = await db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .collection('attachments')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  const attachments = snap.docs
    .filter((d) => {
      const data = d.data()
      if (!access.isStaff && data.visibleToCustomer !== true) return false
      if (!access.isStaff && data.finalized !== true) return false
      return true
    })
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        name: data.name as string,
        contentType: data.contentType as string,
        size: data.size as number,
        createdAt: data.createdAt as string,
        finalized: data.finalized === true,
        visibleToCustomer: data.visibleToCustomer === true,
      }
    })

  return { attachments }
})

const downloadSchema = z
  .object({
    sessionId: z.string().min(16).max(128).optional(),
    trackingToken: z.string().min(3).max(48).optional(),
    tenantId: z.string().min(1).optional(),
    ticketId: z.string().min(1).optional(),
    attachmentId: z.string().min(1),
  })
  .refine((d) => d.trackingToken || d.sessionId, {
    message: 'sessionId or trackingToken is required',
  })

export const createAttachmentDownloadUrl = onCall({ cors: true }, async (request) => {
  const parsed = downloadSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid download request.')
  }
  const { sessionId, trackingToken, tenantId, ticketId, attachmentId } = parsed.data

  const access = await resolveTicketAccess({
    sessionId,
    trackingToken,
    tenantId,
    ticketId,
    request,
  })

  const snap = await db
    .collection('tenants')
    .doc(access.tenantId)
    .collection('tickets')
    .doc(access.ticketId)
    .collection('attachments')
    .doc(attachmentId)
    .get()

  if (!snap.exists) throw new HttpsError('not-found', 'Attachment not found.')
  const data = snap.data()!
  if (!access.isStaff && data.visibleToCustomer !== true) {
    throw new HttpsError('permission-denied', 'Attachment is not available.')
  }
  if (data.finalized !== true) {
    throw new HttpsError('failed-precondition', 'Attachment is not ready yet.')
  }

  const storagePath = data.storagePath as string
  const [downloadUrl] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  })

  return { downloadUrl, expiresInSeconds: 15 * 60, name: data.name as string }
})
