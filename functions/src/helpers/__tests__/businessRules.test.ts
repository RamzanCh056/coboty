import { describe, expect, it } from 'vitest'
import { canTransition } from '../status'
import { matchDepartmentByKeywords } from '../classify'
import { takeoverHistoryNote, takeoverSmsPreview } from '../templates'
import type { Department } from '../../types'

describe('status transitions', () => {
  it('allows new -> assigned only', () => {
    expect(canTransition('new', 'assigned')).toBe(true)
    expect(canTransition('new', 'solved')).toBe(false)
  })

  it('allows assigned -> opened or calling', () => {
    expect(canTransition('assigned', 'opened')).toBe(true)
    expect(canTransition('assigned', 'calling')).toBe(true)
    expect(canTransition('assigned', 'solved')).toBe(false)
  })

  it('allows calling -> solved', () => {
    expect(canTransition('calling', 'solved')).toBe(true)
    expect(canTransition('solved', 'new')).toBe(false)
  })
})

describe('keyword routing', () => {
  const departments: Department[] = [
    {
      id: 'dep_repair',
      tenantId: 'tn_fenwick',
      name: 'Repair',
      slug: 'repair',
      routingKeywords: ['leak', 'broken'],
    },
    {
      id: 'dep_finance',
      tenantId: 'tn_fenwick',
      name: 'Finance',
      slug: 'finance',
      routingKeywords: ['invoice', 'refund'],
    },
  ]

  it('routes by keyword', () => {
    expect(matchDepartmentByKeywords(departments, 'My washer has a leak')?.id).toBe('dep_repair')
    expect(matchDepartmentByKeywords(departments, 'Need a refund please')?.id).toBe('dep_finance')
  })

  it('returns null when no keyword matches', () => {
    expect(matchDepartmentByKeywords(departments, 'Hello there')).toBeNull()
  })
})

describe('takeover templates', () => {
  it('builds customer SMS and history note', () => {
    const sms = takeoverSmsPreview({
      customerFirstName: 'Camille',
      displayId: 'CB-10466',
      actorFirstName: 'Andrew',
      previousFirstName: 'Sarah',
      reason: 'shift_change',
    })
    expect(sms).toContain('Andrew')
    expect(sms).toContain('CB-10466')
    expect(sms).toContain('Sarah')

    expect(takeoverHistoryNote('Andrew Chen', 'Sarah Okafor', 'shift_change')).toContain(
      'Took over from Sarah Okafor',
    )
  })
})
