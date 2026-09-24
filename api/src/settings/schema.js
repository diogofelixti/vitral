import { z } from 'zod'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const withCode = (code, message) => ({ message, params: { code } })
const validTimezone = zone => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false } }

/** A label may be one string or one per language. One string means both. */
const Label = z.union([z.string().min(1), z.object({ 'pt-BR': z.string().min(1), en: z.string().min(1) })])
  .transform(v => (typeof v === 'string' ? { 'pt-BR': v, en: v } : v))

const Calendar = z.object({
  provider: z.enum(['google', 'ics-url']),
  calendarId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  label: Label,
})

const Time = z.string().refine(v => HHMM.test(v), withCode('INVALID_TIME', 'must be HH:MM'))

export const ConfigSchema = z.object({
  language: z.enum(['pt-BR', 'en']).default('pt-BR'),
  timezone: z.string().refine(validTimezone, withCode('UNKNOWN_TIMEZONE', 'unknown time zone')).default('America/Sao_Paulo'),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().min(1),
  }),
  bitcoin: z.object({
    providers: z.array(z.string()).min(1),
    currencies: z.array(z.string()).min(1),
    primary: z.string(),
  }).refine(b => b.currencies.includes(b.primary), {
    message: 'primary must be one of the listed currencies', path: ['primary'], params: { code: 'NOT_IN_LIST' },
  }),
  fx: z.object({ providers: z.array(z.string()).min(1), pairs: z.array(z.string()).min(1) }),
  weather: z.object({ providers: z.array(z.string()).min(1) }),
  onchain: z.object({ providers: z.array(z.string()).min(1) }),
  calendars: z.object({ work: Calendar, personal: Calendar }),
  countdowns: z.array(z.object({ date: z.coerce.date(), label: Label })).default([]),
  screensaver: z.object({
    pixelShift: z.boolean().default(true),
    nightDim: z.object({ from: Time, to: Time, opacity: z.number().min(0).max(1) }).optional(),
  }).default({}),
  theme: z.string().default('terminal'),
})

/** What a panel runs with before anyone has configured it. */
export const DEFAULT_CONFIG = Object.freeze({
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  location: { latitude: -23.55, longitude: -46.63, label: 'São Paulo' },
  bitcoin: { providers: ['coingecko', 'coinbase'], currencies: ['brl', 'usd'], primary: 'brl' },
  fx: { providers: ['awesomeapi'], pairs: ['USD-BRL'] },
  weather: { providers: ['open-meteo'] },
  onchain: { providers: ['mempool'] },
  calendars: {
    work: { provider: 'ics-url', label: { 'pt-BR': 'Trabalho', en: 'Work' } },
    personal: { provider: 'ics-url', label: { 'pt-BR': 'Pessoal', en: 'Personal' } },
  },
  countdowns: [],
  screensaver: { pixelShift: true },
  theme: 'terminal',
})

export const FIELD_CODES = ['REQUIRED', 'INVALID_TYPE', 'OUT_OF_RANGE', 'EMPTY_LIST', 'INVALID_VALUE',
  'INVALID_URL', 'INVALID_DATE', 'INVALID_TIME', 'UNKNOWN_TIMEZONE', 'NOT_IN_LIST', 'UNKNOWN_PROVIDER']

function codeOf(issue) {
  if (issue.code === 'custom') return issue.params?.code ?? 'INVALID_VALUE'
  if (issue.code === 'invalid_type') return issue.received === 'undefined' ? 'REQUIRED' : 'INVALID_TYPE'
  if (issue.code === 'too_small' && issue.type === 'array') return 'EMPTY_LIST'
  if (issue.code === 'too_small' && issue.type === 'string') return 'REQUIRED'
  if (issue.code === 'too_small' || issue.code === 'too_big') return 'OUT_OF_RANGE'
  if (issue.code === 'invalid_string' && issue.validation === 'url') return 'INVALID_URL'
  if (issue.code === 'invalid_date') return 'INVALID_DATE'
  return 'INVALID_VALUE'
}

/** Every problem at once, as a path and a code the menu can put next to its field. */
export function validateConfig(input) {
  const parsed = ConfigSchema.safeParse(input)
  if (parsed.success) return { ok: true, config: parsed.data }
  return { ok: false, errors: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), code: codeOf(issue) })) }
}

/** Provider ids the registry doesn't have. The schema can't know them; the registry does. */
export function providerErrors(config, available) {
  const errors = []
  for (const capability of ['bitcoin', 'fx', 'weather', 'onchain']) {
    config[capability].providers.forEach((id, index) => {
      if (!available[capability]?.includes(id)) errors.push({ path: `${capability}.providers.${index}`, code: 'UNKNOWN_PROVIDER' })
    })
  }
  return errors
}
