import { randomBytes } from 'node:crypto'
import { db } from './admin'
import type { Ticket } from '../types'

export function generateTrackingToken(): string {
  return randomBytes(24).toString('hex') // 192-bit, 48 hex chars
}

export function isTrackingToken(id: string): boolean {
  return /^[a-f0-9]{48}$/i.test(id)
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function phonesMatch(phoneA: string, phoneB: string): boolean {
  const digitsA = normalizePhone(phoneA)
  const digitsB = normalizePhone(phoneB)
  
  // Compare last 10 digits
  const lastA = digitsA.slice(-10)
  const lastB = digitsB.slice(-10)
  
  return lastA === lastB && lastA.length === 10
}

export async function ensureTicketTrackingToken(ticket: Ticket): Promise<string> {
  if (ticket.trackingToken) {
    return ticket.trackingToken
  }
  
  const token = generateTrackingToken()
  
  await db
    .collection('tenants')
    .doc(ticket.tenantId)
    .collection('tickets')
    .doc(ticket.id)
    .update({ trackingToken: token })
    
  return token
}