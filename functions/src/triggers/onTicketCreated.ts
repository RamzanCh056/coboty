import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db } from '../helpers/admin'
import { classifyClaim } from '../helpers/classify'
import { appendHistory, rebuildProjection } from '../helpers/projection'
import { sendCustomerSms } from '../helpers/sms'
import { receivedSms } from '../helpers/templates'
import type { Department, Ticket } from '../types'

export const onTicketCreated = onDocumentCreated(
  {
    document: 'tenants/{tenantId}/tickets/{ticketId}',
  },
  async (event) => {
    const tenantId = event.params.tenantId
    const ticketId = event.params.ticketId
    const data = event.data?.data()
    if (!data) return

    const ticket = { id: ticketId, ...data } as Ticket
    // Skip if already classified (re-seed / retry safety).
    if (ticket.departmentId) {
      await rebuildProjection(tenantId, ticketId)
      return
    }

    const tenantSnap = await db.collection('tenants').doc(tenantId).get()
    if (!tenantSnap.exists) return

    const deptSnap = await db.collection('tenants').doc(tenantId).collection('departments').get()
    const departments = deptSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Department)
    if (departments.length === 0) {
      console.error('[onTicketCreated] No departments for tenant', tenantId)
      return
    }

    const classification = await classifyClaim({
      claimText: ticket.claimText,
      departments,
    })

    const now = new Date().toISOString()
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('tickets')
      .doc(ticketId)
      .update({
        departmentId: classification.departmentId,
        summary: classification.summary,
        priority: classification.priority,
        updatedAt: now,
      })

    if (classification.usedAi) {
      await db.collection('tenants').doc(tenantId).collection('billingEvents').add({
        tenantId,
        eventType: 'ai_classification',
        quantity: 1,
        timestamp: now,
      })
    }

    const department = departments.find((d) => d.id === classification.departmentId) ?? departments[0]!

    await appendHistory(tenantId, ticketId, {
      action: 'received',
      actor: 'CoBotty routing',
      note: `Routed to ${department.name}${classification.usedAi ? ' via AI' : ' via keywords'}.`,
      visibleToCustomer: true,
      timestamp: now,
    })

    await sendCustomerSms({
      tenantId,
      ticketId,
      toPhone: ticket.customerPhone,
      message: receivedSms(
        ticket.customerName.split(' ')[0] ?? 'there',
        ticket.displayId,
        department.name,
      ),
    })

    await rebuildProjection(tenantId, ticketId)
  },
)
