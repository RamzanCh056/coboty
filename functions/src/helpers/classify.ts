import Anthropic from '@anthropic-ai/sdk'
import type { Department, TicketPriority } from '../types'
import { getAnthropicApiKey } from './templates'

export function matchDepartmentByKeywords(
  departments: Department[],
  claimText: string,
): Department | null {
  const lower = claimText.toLowerCase()
  return (
    departments.find((dep) => dep.routingKeywords.some((kw) => lower.includes(kw.toLowerCase()))) ??
    null
  )
}

function urgencyFromText(claimText: string): TicketPriority {
  const lower = claimText.toLowerCase()
  if (/(no heating|data breach|flood|gas leak|urgent|emergency)/.test(lower)) return 'critical'
  if (/(asap|immediately|broken|not working)/.test(lower)) return 'high'
  if (/(soon|refund|charge)/.test(lower)) return 'medium'
  return 'low'
}

export async function classifyClaim(input: {
  claimText: string
  departments: Department[]
}): Promise<{ departmentId: string; summary: string; priority: TicketPriority; usedAi: boolean }> {
  const keywordMatch = matchDepartmentByKeywords(input.departments, input.claimText)
  if (keywordMatch) {
    return {
      departmentId: keywordMatch.id,
      summary: input.claimText.trim().slice(0, 80),
      priority: urgencyFromText(input.claimText),
      usedAi: false,
    }
  }

  const apiKey = getAnthropicApiKey()
  if (!apiKey || apiKey.startsWith('unset')) {
    console.warn('[classify] ANTHROPIC_API_KEY missing — falling back to first department')
    const fallback = input.departments[0]
    if (!fallback) throw new Error('No departments configured for tenant')
    return {
      departmentId: fallback.id,
      summary: input.claimText.trim().slice(0, 80),
      priority: urgencyFromText(input.claimText),
      usedAi: false,
    }
  }

  const client = new Anthropic({ apiKey })
  const deptList = input.departments.map((d) => `${d.id}:${d.name}`).join(', ')
  const prompt = `Classify this customer claim into one department id from this list: ${deptList}.
Also return a short summary (<=80 chars) and priority as one of low|medium|high|critical.
Respond ONLY as JSON: {"departmentId":"...","summary":"...","priority":"..."}

Claim:
${input.claimText}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      departmentId: string
      summary: string
      priority: TicketPriority
    }
    const valid = input.departments.some((d) => d.id === parsed.departmentId)
    return {
      departmentId: valid ? parsed.departmentId : input.departments[0]!.id,
      summary: (parsed.summary || input.claimText).slice(0, 80),
      priority: ['low', 'medium', 'high', 'critical'].includes(parsed.priority)
        ? parsed.priority
        : urgencyFromText(input.claimText),
      usedAi: true,
    }
  } catch (err) {
    console.error('[classify] Claude failed', err)
    return {
      departmentId: input.departments[0]!.id,
      summary: input.claimText.trim().slice(0, 80),
      priority: urgencyFromText(input.claimText),
      usedAi: false,
    }
  }
}
