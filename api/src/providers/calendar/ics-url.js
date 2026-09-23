import ical from 'node-ical'
import { assertFetchable } from '../../security/ssrf-guard.js'
import { CalendarNotConfigured } from './lib/not-configured.js'

// Constructing an Intl.DateTimeFormat is by far the most expensive thing
// in this file, and expanding a single recurring occurrence needs several
// -- anchor() reads the offset twice per occurrence, and each read is one
// format. Measured at 110ms for 1050 fresh formatters against 7ms for 1050
// reuses of one, so they are cached per (zone, field-set) instead.
//
// The key lowercases the zone, which is what makes the cache bounded
// rather than merely usually-small. Intl matches zone names
// case-insensitively and node-ical hands a TZID through verbatim (checked:
// "america/sao_paulo", "AMERICA/SAO_POULO"-style mixed case and
// "aMeRiCa/sAo_PaUlO" all reach Intl and all resolve to the same zone), so
// a case-sensitive key gives one zone 2^17 equivalent spellings, each
// minting its own never-evicted formatter -- measured at 1.7MB retained
// for 4,000 spellings, which at the response-size cap is several MB
// retained per fetch, compounding on every 300s refresh. Lowercased, the
// key space is the zone database itself: IANA names are unique
// case-insensitively (verified -- 418 zones, 418 distinct lowercased), a
// name ICU does not know makes Intl.DateTimeFormat throw rather than
// cache, and `fields` only ever takes the two shapes used below. So this
// holds at most two entries per zone that exists, and needs no eviction.
const formatters = new Map()

/** `instant`'s year/month/day/etc. as seen in `timeZone`, via Intl -- the
 * only reliable way to ask "what is it over there right now" for an
 * arbitrary IANA zone without adding a date library for it. */
function partsInZone(instant, timeZone, fields) {
  // Keyed on the field names *and* their values, so two different
  // field-sets for one zone can never collide on a single formatter, and on
  // the lowercased zone, so two spellings of one zone cannot each mint one.
  const key = timeZone.toLowerCase() + '|' + Object.entries(fields).flat().join(',')
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...fields })
    formatters.set(key, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]))
}

/**
 * How far `timeZone`'s wall clock sits from UTC at `instant`, in ms
 * (negative west of UTC, e.g. -3h for America/Sao_Paulo). `hourCycle:
 * 'h23'` matters here specifically: without it, local midnight formats as
 * "24" and would silently roll the computed offset onto the wrong day.
 */
function offsetMs(instant, timeZone) {
  const p = partsInZone(instant, timeZone, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return asUTC - instant.getTime()
}

/** The UTC instant of local midnight, `dayOffset` calendar days after the
 * date `instant` falls on in `timeZone`. */
function startOfDayUTC(instant, timeZone, dayOffset = 0) {
  const p = partsInZone(instant, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const naive = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + dayOffset)
  return new Date(naive - offsetMs(new Date(naive), timeZone))
}

/**
 * Today 00:00 through the day after tomorrow's 00:00, in `timezone` -- the
 * *panel's* configured zone (config.timezone), never this process's own.
 *
 * The container this runs in is not guaranteed to share a zone with the
 * screen it drives: a base image commonly boots with its clock at UTC
 * regardless of where the panel physically hangs. Deriving "today" from
 * the host's own clock (`new Date().setHours(0,0,0,0)`) reads the host's
 * midnight, which silently drifts the window by however many hours the
 * two zones differ -- at 21:00 in America/Sao_Paulo a UTC host already
 * believes it is tomorrow, and would show tomorrow's and the day-after's
 * events under "today and tomorrow" while today's remaining evening
 * events fall out of the window entirely. This resolves "today" the same
 * way weather/wttr-in.js already resolves "the current hour": against the
 * configured zone, wherever the process happens to execute.
 */
export function defaultWindow(timezone = 'UTC', now = new Date()) {
  return { from: startOfDayUTC(now, timezone), to: startOfDayUTC(now, timezone, 2) }
}

/**
 * node-ical builds a VALUE=DATE (all-day) field's Date using *this
 * process's* local timezone, so the instant it produces -- and therefore
 * .toISOString() -- shifts with wherever the container happens to run,
 * and can even land on the wrong calendar day (a host east of UTC turns a
 * local midnight into the previous day once read back in UTC). Reading
 * the same Date through its own local getters (never getUTCFullYear())
 * recovers exactly the Y/M/D node-ical was given, on any host, because
 * construction and these getters agree on what "local" means within one
 * process. Anchoring that Y/M/D at UTC midnight instead gives an all-day
 * event's start/end an instant that no longer depends on where this
 * happens to execute. Verified empirically against TZ=UTC, America/Sao_Paulo,
 * Asia/Tokyo and Pacific/Kiritimati while writing this file.
 */
function dateOnlyAsUTC(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/** `dateOnlyAsUTC` for an all-day instant, otherwise unchanged. Centralizes
 * the allDay/not-allDay distinction so every call site -- a plain event, an
 * expanded recurrence, an override -- normalizes the same way. */
function normalizeInstant(date, allDay) {
  return allDay ? dateOnlyAsUTC(date) : date
}

/**
 * A "floating" instant -- one whose UTC-getter digits equal a wall clock
 * in `tz`, not a real UTC instant -- anchored to the real UTC instant it
 * actually denotes. Two passes: a single pass reads the offset from the
 * floating digits themselves, which can land on the wrong side of a DST
 * transition; the second pass re-reads the offset at the corrected
 * instant instead. Verified DST-exact across a Europe/Berlin
 * spring-forward (a 09:30 daily event holds at 09:30 wall-clock on both
 * sides while its UTC instant steps by exactly one hour).
 */
function anchor(floating, tz) {
  const guess = new Date(floating.getTime() - offsetMs(floating, tz))
  return new Date(floating.getTime() - offsetMs(guess, tz))
}

// rrule advances one "tick" at a time from DTSTART; this is each FREQ's
// tick in seconds, keyed by rrule's own numeric Frequency enum (read from
// node_modules/rrule/dist/esm/types.js: YEARLY=0, MONTHLY=1, WEEKLY=2,
// DAILY=3, HOURLY=4, MINUTELY=5, SECONDLY=6). Each value is a true *floor*
// on that frequency's tick, which is what makes the estimate below a
// ceiling on the tick count: it can over-count but never under-count, so a
// guard built on it can refuse too eagerly but never wave a pathological
// rule through. Hence 28 days for MONTHLY (February, not the 30 an earlier
// version of this table used, which under-counted a February-containing
// span by ~7% and made the invariant above false) and 365 days for YEARLY
// (a non-leap year). The sub-daily ticks are exact, and DAILY's 86,400s is
// exact too: the walk is measured in the floating space rrule steps
// through with `tzid: null`, where a day is always 86,400s and no DST
// transition shortens one.
//
// Every frequency is listed, DAILY and coarser included. They were exempt
// here originally, on the reasoning that a calendar-day tick is cheap
// however far back DTSTART sits. That is true for any DTSTART a real
// calendar carries and false in general: FREQ=DAILY from a year-1000
// DTSTART is 375,001 ticks and measures 1479ms, which is squarely the
// pathology this guard exists to refuse. The thresholds below are far
// enough out that no realistic entry is affected -- 200,000 ticks is 547
// years of daily history, 3,835 years of weekly.
const WALK_TICK_SECONDS = {
  0: 365 * 86400, // YEARLY
  1: 28 * 86400,  // MONTHLY
  2: 7 * 86400,   // WEEKLY
  3: 86400,       // DAILY
  4: 3600,        // HOURLY
  5: 60,          // MINUTELY
  6: 1,           // SECONDLY
}

// Cost is very nearly proportional to ticks walked, at a rate that barely
// varies with frequency -- measured on this hardware at 208-254K
// ticks/second across four shapes (FREQ=HOURLY 199,152 ticks in 845ms,
// FREQ=DAILY 375,001 in 1479ms, FREQ=WEEKLY 53,572 in 258ms, FREQ=DAILY
// 20,716 in 89ms). One tick count therefore serves as the cost measure for
// every frequency, which is why there is one threshold here and not one per
// FREQ.
const MAX_WALK_TICKS = 200_000
const MAX_OCCURRENCES = 1000

/**
 * How many raw ticks rrule would step through to reach the query window
 * that starts at `from` -- computed from the rule's own options alone, so
 * asking is free even when walking it would not be.
 *
 * COUNT and UNTIL both terminate the walk early, independent of the
 * window, and a rule bounded by either is not pathological just because
 * its unbounded walk distance would be -- a "remind me every minute for a
 * week" reminder set up nine months ago is a finished, harmless series,
 * not a live one. COUNT bounds the walk directly: rrule decrements its own
 * internal counter on every candidate it examines, window or no, so the
 * real walk can never exceed `count` however far back DTSTART sits. UNTIL
 * clamps the distance actually walked: once a rule's UNTIL is already
 * behind the window, the walk that matters ends at UNTIL, not at the
 * window.
 *
 * `origOptions.dtstart` holds *floating* digits -- the event's own
 * wall-clock time reinterpreted as if it were UTC (see expandRecurring's
 * comment below) -- not a real instant, so it cannot be compared against a
 * real boundary without moving one side into the same frame. The boundary
 * is shifted into floating space here, exactly as expandRecurring already
 * does for the query window it hands to `between()`. `origOptions.until`
 * needs no such shift: RFC 5545 requires a Z-suffixed (absolute) UNTIL
 * whenever DTSTART carries a TZID, so it is already a real instant and is
 * compared as one.
 *
 * The lower bound probed is `from` widened by the event's own duration,
 * matching the searchFrom expandRecurring actually queries with, so the
 * estimate answers the question the walk will really be asked.
 */
function estimateWalkTicks(e, from) {
  const tickSeconds = WALK_TICK_SECONDS[e.rrule.origOptions.freq]
  // A rule rrule could read no FREQ from has no tick to count. rrule
  // itself defaults such a rule to YEARLY, which is never pathological.
  if (!tickSeconds) return 0

  const allDay = e.datetype === 'date'
  const tz = e.rrule.origOptions.tzid ?? 'UTC'
  const durationMs = normalizeInstant(e.end, allDay).getTime() - normalizeInstant(e.start, allDay).getTime()
  const searchFrom = new Date(from.getTime() - durationMs)

  const until = e.rrule.origOptions.until
  const walkTo = until && until < searchFrom ? until : searchFrom
  const walkToFloating = new Date(walkTo.getTime() + offsetMs(walkTo, tz))
  const walkSeconds = Math.max(0, (walkToFloating.getTime() - e.rrule.origOptions.dtstart.getTime()) / 1000)

  // node-ical passes INTERVAL and COUNT through to rrule without checking
  // either, so both arrive as whatever the feed wrote: it rejects
  // FREQ=BOGUS and UNTIL=garbage, but accepts INTERVAL=-1, INTERVAL=abc
  // (verbatim, as the string "abc") and COUNT=-1. Every comparison below
  // is a `>`, and a negative or NaN estimate answers false to all of them
  // -- so before these two checks existed, such a rule was classed cheap,
  // was not refused by MAX_WALK_TICKS, and charged a *negative* number of
  // ticks to the feed-wide ceiling. All measured, on a four-line body.
  //
  // The two malformed inputs need opposite answers, and which one is
  // which came from measuring rrule rather than reasoning about it:
  //
  // An interval rrule cannot step by makes between() never return -- a
  // DAILY;INTERVAL=-1, a DAILY;INTERVAL=abc and a DAILY;INTERVAL=0.5 were
  // all still running when killed at 12s here (and at 45s and 60s by the
  // review), while the RRule object itself constructs fine every time.
  // There is no safe estimate for a rule that cannot be walked at all, so
  // it is reported as unwalkable and refused by the per-event guard below,
  // which also means it is never charged. A permanent hang is the one
  // failure the 300s TTL cannot recover from, because the first request
  // never returns.
  //
  // A malformed COUNT, by contrast, rrule simply ignores, and none of them
  // hang: DAILY;COUNT=-1 and DAILY;COUNT=-1000000 expand normally, two
  // occurrences in 76ms, and COUNT=abc, COUNT=" 2" and COUNT=0 return
  // nothing in under 30ms. So a bad COUNT bounds nothing, and the estimate
  // has to ignore it rather than take it as a bound -- taken as one it is
  // negative, and
  // a negative charge is a refund. Five COUNT=-1000000 events, 4 lines
  // each, refunded 5,000,000 ticks and switched the feed-wide ceiling off
  // completely: the same 220-series feed went from 61 dropped in 11,979ms
  // to 0 dropped in 17,213ms, unbounded with more of them.
  //
  // Both checks test the value rrule was actually handed, never a coercion
  // of it. An earlier attempt at this fix used Number(interval) and let
  // `INTERVAL= 2` -- one leading space -- straight through: Number(" 2")
  // is 2, so the check passed, while rrule still held the string " 2" and
  // still hung. node-ical's typing makes the right predicate obvious once
  // looked at: it converts to a `number` only for a clean decimal integer
  // (verified across "2", "-1", "0", "+1", "abc", " 2", "2 ", "0.5",
  // "1e999", "1x", "", "0x2", "1_0" -- the first four arrive as numbers,
  // every other one stays a verbatim string). So Number.isInteger accepts
  // exactly the values rrule can step by and rejects every malformed
  // spelling, without this file having to enumerate them.
  const interval = e.rrule.origOptions.interval ?? 1
  if (!(Number.isInteger(interval) && interval >= 1)) return Infinity
  const declaredCount = e.rrule.origOptions.count
  const count = Number.isInteger(declaredCount) && declaredCount >= 1 ? declaredCount : Infinity

  const ticks = Math.min(walkSeconds / (tickSeconds * interval), count)
  // A last guarantee for every caller below, which all compare with `>`:
  // the answer is a non-negative number or Infinity, never negative and
  // never NaN. Nothing above can produce either any more, but an Invalid
  // Date in origOptions.dtstart would make walkSeconds NaN, and one
  // arithmetic change upstream is all it would take for a NaN to start
  // answering false to every bound in the file again.
  return ticks >= 0 ? ticks : Infinity
}

/**
 * Expands a recurring (RRULE) master event into its individual
 * occurrences inside [from, to).
 *
 * This corrects a real bug in rrule@2.8.1 (node-ical's own recurrence
 * engine, and still the only one in node-ical 0.22.1's dependency tree):
 * once a DTSTART carries an explicit TZID, `rrule.between()` silently
 * applies *this process's own* local-timezone offset while stepping
 * through occurrences, instead of the event's declared zone. Reproduced
 * directly: a `TZID=America/Sao_Paulo` daily 09:00 event's `between()`
 * came back as 12:00 UTC (correct) on a UTC host, 09:00 UTC on a Sao
 * Paulo host, and 21:00 UTC on a Tokyo host -- an error of exactly the
 * host's own offset, every time. A DTSTART with no TZID at all (a bare
 * "Z" instant, or an all-day VALUE=DATE field) does not hit this path and
 * needs no correction -- confirmed separately, and folded into the same
 * code below by falling back to `tz = 'UTC'`, under which `shift`/`anchor`
 * are the identity and `between()`'s own (already-correct) output passes
 * through untouched. One code path for every case, not two: a provider
 * that expands some recurrences correctly and silently mishandles others
 * is harder to diagnose than one that does not expand any.
 *
 * The fix: rebuild the rule with `tzid: null`, which makes rrule step
 * through floating digits -- the event's own wall-clock digits,
 * reinterpreted as if they were UTC -- entirely independent of the host.
 * Shifting the query window into that same floating space before calling
 * `between()`, then anchoring each floating result back to a real instant
 * in the event's own zone afterwards, keeps the whole computation off the
 * host's clock throughout. Verified against UTC, America/Sao_Paulo,
 * Asia/Tokyo, Pacific/Kiritimati and America/New_York as the host (all
 * five agree), Asia/Kathmandu's UTC+5:45 offset, and Pacific/Apia's
 * UTC+13. (Not re-verified: an occurrence landing exactly at the [from,
 * to) boundary on the same instant a DST transition takes effect --
 * `shift` uses the offset at the boundary itself, not at the eventual
 * occurrence, so a recurrence could in principle be a transition-sized
 * margin off right at the edge of the window. Narrow, and unlike the
 * window `defaultWindow` computes -- always a local midnight -- the
 * probed boundary here is `from - durationMs` (see searchFrom below),
 * which is not; still not observed in practice.)
 *
 * `EXDATE` removes an occurrence outright; a `RECURRENCE-ID` override
 * (node-ical folds these into `e.recurrences`, keyed by the *original*
 * occurrence's UTC calendar date) substitutes a different time/title/
 * duration for one. node-ical's own key -- date-only, not the exact
 * instant -- can collide for an event recurring more than once a day;
 * node-ical documents this as a known limitation of its own, and this
 * inherits it rather than working around it. The same bounded-window
 * approach also means an override that relocates an occurrence from
 * *outside* [from, to) to inside it (or that runs longer than the
 * master's own duration, straddling into the window from further back
 * than the master's duration alone would search) is not found -- this
 * only ever substitutes an occurrence the master's own rhythm already
 * placed somewhere in the searched range.
 *
 * Bounds by occurrence *start* alone would also miss an occurrence
 * already running when `from` arrives (started earlier, not yet over) --
 * rrule has no notion of duration -- so the query's lower bound is widened
 * by the master's own duration first, and trimmed back to the true
 * [from, to) afterwards using each occurrence's real start/end, not the
 * widened probe.
 */
export function expandRecurring(e, from, to) {
  const allDay = e.datetype === 'date'
  const tz = e.rrule.origOptions.tzid ?? 'UTC'
  const rule = new e.rrule.constructor({ ...e.rrule.origOptions, tzid: null })
  const shift = w => new Date(w.getTime() + offsetMs(w, tz))
  const durationMs = normalizeInstant(e.end, allDay).getTime() - normalizeInstant(e.start, allDay).getTime()
  const searchFrom = new Date(from.getTime() - durationMs)

  // The walk to the window is pure waste -- ticks nobody ever sees -- and
  // rrule cannot seek past it, so a rule far enough from the window is
  // refused before a single tick of it is walked. Measured on an earlier,
  // uncapped version of this function: a FREQ=SECONDLY rule with a
  // same-day DTSTART took 38s, and the same rule nine months earlier took
  // 134s for an identical result. The MAX_OCCURRENCES cap below cannot
  // help with *this* cost: rrule's IterResult only invokes that callback
  // for candidates that already passed the `after` bound (see rrule's
  // iterresult.js `accept()`), so a rule that never reaches the window
  // can walk indefinitely before the callback is ever called once --
  // confirmed directly, a build with only the iterator cap and no
  // walk-distance guard was still running against a nine-months-back
  // DTSTART when killed at 90s.
  if (estimateWalkTicks(e, from) > MAX_WALK_TICKS) {
    throw new Error(`ics-url: recurring event ${e.uid} would need to walk an unreasonable number of occurrences to reach this window -- refusing to expand it`)
  }

  const excluded = new Set(
    Object.values(e.exdate ?? {}).map(d => normalizeInstant(d, allDay).getTime())
  )
  const overrides = e.recurrences ?? {}

  // Once inside the window, a *different* pathology -- many genuinely
  // in-range occurrences (e.g. FREQ=SECONDLY with DTSTART the day before)
  // -- is capped here: the iterator stops rrule from generating a single
  // candidate past MAX_OCCURRENCES, rather than generating everything and
  // truncating the array afterwards.
  let truncated = false
  const floating = rule.between(shift(searchFrom), shift(to), true, (_d, len) => {
    if (len >= MAX_OCCURRENCES) { truncated = true; return false }
    return true
  })
  if (truncated) {
    throw new Error(`ics-url: recurring event ${e.uid} has more than ${MAX_OCCURRENCES} occurrences in this window -- refusing to expand it`)
  }

  return floating
    .map(f => normalizeInstant(anchor(f, tz), allDay))
    .filter(start => !excluded.has(start.getTime()))
    .map(start => {
      const override = overrides[start.toISOString().slice(0, 10)]
      if (override) {
        const overrideAllDay = override.datetype === 'date'
        const oStart = normalizeInstant(override.start, overrideAllDay)
        const oEnd = normalizeInstant(override.end, overrideAllDay)
        // Composite id: an override shares its master's UID (RFC 5545),
        // so without this every occurrence of a series -- moved ones
        // included -- would report the exact same `id`.
        return { uid: `${override.uid}#${oStart.toISOString()}`, summary: override.summary, allDay: overrideAllDay, start: oStart, end: oEnd }
      }
      return { uid: `${e.uid}#${start.toISOString()}`, summary: e.summary, allDay, start, end: new Date(start.getTime() + durationMs) }
    })
    // The exact [from, to) trim, on each occurrence's real start/end --
    // not the widened searchFrom probe above. Applied here, inside the
    // function, rather than left to fetch()'s own identical filter
    // further down, so expandRecurring's own unit tests exercise the
    // real, complete behaviour without needing fetch()'s wrapper around
    // them.
    .filter(o => o.end > from && o.start < to)
}

// A recurring series is "costly" when its own walk is longer than this,
// and only a costly series draws on (or can be denied by) the per-fetch
// budget below.
//
// The scoping is the whole point. A budget every recurring event draws on
// is spent by whichever series happen to be expensive and then refuses
// everything after them in ICS file order -- so the junk that spent it
// survives and the user's ordinary calendar is silently dropped, order-
// dependent on the file and on how fast the machine is. Measured before
// this scoping existed: three legacy FREQ=HOURLY series with a 2004
// DTSTART (each one individually inside MAX_WALK_TICKS) alongside twenty
// ordinary FREQ=DAILY series returned all 144 legacy occurrences and none
// of the 40 ordinary ones. It needed no pathological event at all either:
// 300 ordinary series spend 1329ms of a 2000ms budget between them, so a
// few hundred more would start losing real events here, and proportionally
// fewer on the slow hardware a wall panel actually is.
//
// A series under this many ticks is genuinely cheap, not assumed to be:
// cost tracks ticks at a rate that barely varies by frequency (see
// MAX_WALK_TICKS), so such a series costs under a tenth of a second, and
// whatever it generates *inside* the window is separately capped by
// MAX_OCCURRENCES -- measured at 10-31ms even for a FREQ=SECONDLY rule
// starting inside the window. 20,000 ticks is 54 years of FREQ=DAILY
// history, 383 of FREQ=WEEKLY and 1,600 of FREQ=MONTHLY, so every
// recurring entry a real calendar can hold is exempt.
//
// This threshold was 50,000, which left a real hole: a FREQ=HOURLY series
// with a 2021 DTSTART estimates 49,368 ticks, slipped under it, and was
// therefore never charged, never denied and never logged while costing
// 209ms of walking -- a hundred of them in one 11KB feed measured 21,285ms.
// It is not the aggregate bound (MAX_FETCH_WALK_TICKS below is), but it is
// what decides whether a series near the line gets the tight
// COSTLY_RECURRING_BUDGET_MS treatment or the loose ceiling's, and 54 years
// of daily history is already far past any real entry.
//
// Note this is deliberately *not* scoped by frequency. FREQ=DAILY-or-
// coarser looks structurally cheap and nearly always is, but it is not:
// a FREQ=DAILY rule with a year-1000 DTSTART walks 375,001 ticks and
// measures 1479ms, and a FREQ=WEEKLY one at the same distance measures
// 258ms. Exempting those by frequency would hand back, as a class, the
// unbounded cost these bounds exist to bound.
const FREE_WALK_TICKS = 20_000

// The aggregate ceiling: how many raw ticks all of one feed's recurring
// expansion may walk between them, cheap series included.
//
// Nothing else bounds the cheap class in aggregate. Each cheap series is
// bounded on its own (under FREE_WALK_TICKS, so under ~90ms) and the
// costly class is bounded as a class by COSTLY_RECURRING_BUDGET_MS, but a
// feed made only of cheap series was charged nothing at all. This bounds
// the walk *to* the window, which is where that cost lived: 100
// FREQ=HOURLY series at 49,368 ticks each measured 21,285ms in one
// fetch(), rising linearly, and the 2MB response cap admits about 20,400
// of them -- roughly 71 minutes of synchronous, event-loop-blocking CPU in
// a single-threaded API, re-triggered every 300s when the cache entry
// expires. Every capability freezes, not only calendar.
//
// It bounds that half only. A series whose DTSTART sits inside the window
// has no walk to reach it -- estimateWalkTicks' own Math.max(0, ...) floors
// such a series at zero ticks -- so it charges nothing here however many
// occurrences it generates. What it generates is capped per event by
// MAX_OCCURRENCES and measured at 10-31ms, so the per-event cost is small,
// but the aggregate of many such series is not bounded by this ceiling. A
// recorded limitation, not a claim.
//
// The earlier justification for leaving this unbounded -- parity with the
// unbudgeted non-recurring path -- does not survive measurement: 20,000
// plain VEVENTs in a 2.08MB feed cost 373ms in total, because that path is
// linear in bytes while this one is ~209ms per 98 bytes. Four orders of
// magnitude apart, and http.js's own docstring names the intent ("a source
// that answers forever must not be able to exhaust its memory").
//
// Denominated in ticks rather than milliseconds on purpose: ticks are
// arithmetic on the rule's own options, so the ceiling is deterministic
// and identical on fast and slow hardware, and every series' charge is
// known before any of it is walked -- which is what lets the masters be
// expanded cheapest-first (see fetch()) so the ceiling, when reached,
// drops the most expensive series remaining rather than whichever happened
// to be last in the file.
//
// 3,000,000 is ~12s of walking here and about 941 ordinary FREQ=DAILY
// series before it bites, against a measured realistic worst case of 300
// series / 956K ticks -- a 3.1x margin. I chose it below the 5,000,000 the
// review suggested because reaching the ceiling costs real time by
// construction (ticks are cost), so a 5M ceiling *is* a 22s block, itself
// close to a denial of service on an API whose own per-request HTTP
// timeout is 8s. A feed carrying 941 recurring series is far outside what
// the two calendars a panel configures can hold, and at the cliff the
// series dropped are the most expensive ones, which are the least likely
// to have anything in a today-and-tomorrow window.
const MAX_FETCH_WALK_TICKS = 3_000_000

// How much real wall-clock time expanding costly recurring series may
// spend in total across one feed. Each individual event's own guards
// (MAX_WALK_TICKS, MAX_OCCURRENCES) bound *that event's* worst case to
// under roughly a second, but nothing stops twenty separate, individually
// unremarkable events from each spending close to it: measured at
// 16,899ms for twenty FREQ=HOURLY events each landing just inside
// MAX_WALK_TICKS. This tracks actual elapsed time, not a further
// estimate, so it covers every cost a costly series can incur and not
// only the walk the estimate above predicts.
const COSTLY_RECURRING_BUDGET_MS = 2000

// How many of a fetch's dropped-event reasons the single summary line
// spells out in full before falling back to a count.
const DROP_REASONS_LOGGED = 3

/** The one-line reason a recurring event was dropped, for the per-fetch
 * summary. */
function dropReason(e, err) {
  // This file's own guards already name both the event and the reason, and
  // the summary line adds the prefix once, so it is stripped here rather
  // than doubled.
  if (err.message.startsWith('ics-url: ')) return err.message.slice('ics-url: '.length)
  // Anything else names neither -- a malformed DTSTART/DTEND throws a bare
  // "getTime is not a function" from durationMs -- and a summary line that
  // identifies no entry in the feed gives an operator nothing to go and
  // look at.
  return `recurring event ${e.uid ?? '(no uid)'} could not be expanded: ${err.message}`
}

export default {
  id: 'ics-url',
  capability: 'calendar',
  ttl: 300,

  async fetch({ url, timezone, window }, { http, resolveDns }) {
    if (!url) throw new CalendarNotConfigured('ics-url: this calendar has no url configured')
    // Guarded even though http() already guards: a future caller might
    // supply a pre-fetched body through a different `http`, and this
    // provider must never be the one place that lets an SSRF url through.
    await assertFetchable(url, { resolveDns })

    const { from, to } = window ?? defaultWindow(timezone)
    const parsed = ical.sync.parseICS((await http(url)).text)

    // node-ical never throws on unparseable input -- garbage, or an HTML
    // login page from an expired share link, parses to {}, indistinguishable
    // from a genuinely empty calendar. Left unchecked, a broken feed would
    // silently and permanently show "no events today", with nothing
    // anywhere to say the feed itself is broken.
    if (!Object.values(parsed).some(e => e.type === 'VCALENDAR')) {
      throw new Error('ics-url: response does not look like a valid iCalendar file')
    }

    // Collected rather than logged one line at a time -- see the single
    // summary line after the pipeline below.
    const dropped = []

    const vevents = Object.values(parsed).filter(e => e.type === 'VEVENT' && e.start && e.end)

    const plain = vevents.filter(e => !e.rrule).map(e => {
      const allDay = e.datetype === 'date'
      return {
        uid: e.uid,
        summary: e.summary,
        allDay,
        start: normalizeInstant(e.start, allDay),
        end: normalizeInstant(e.end, allDay),
      }
    })

    // Every recurring master's walk is estimated before any of it is
    // walked -- pure arithmetic on the rule's own options, so asking costs
    // nothing -- and they are then expanded cheapest-first rather than in
    // ICS file order.
    //
    // The order is what makes the bounds below fair. Spending a shared
    // bound in file order means whichever series happen to be expensive
    // spend it and everything after them is refused, so the junk that
    // spent it survives while the user's ordinary calendar is dropped.
    // Cheapest-first inverts that: when a bound is reached, what remains
    // unexpanded is always the most expensive series in the feed, which is
    // the entry that should be dropped. Nothing observable depends on this
    // order -- the events are sorted by start at the end regardless -- only
    // which entries survive when a feed is too expensive to expand whole.
    //
    // estimateWalkTicks is inside the try because it reads the event's own
    // endpoints: a malformed DTSTART/DTEND throws a TypeError from
    // durationMs here (an Invalid Date would go on to make Intl throw a
    // RangeError, but it never gets that far). Outside a try, that would
    // escape fetch() and blank the whole calendar rather than dropping one
    // entry -- exactly the regression the per-event catch exists to
    // prevent.
    const masters = []
    for (const e of vevents) {
      if (!e.rrule) continue
      try {
        masters.push({ e, ticks: estimateWalkTicks(e, from) })
      } catch (err) {
        dropped.push(dropReason(e, err))
      }
    }
    masters.sort((a, b) => a.ticks - b.ticks)

    // A single pathological, malformed, or (collectively, with others)
    // too-expensive recurring series must not blank the rest of an
    // otherwise fine calendar -- the project's whole degradation design
    // (resolve.js's provider fallback, the stale-cache serve) shows what it
    // has and marks what it cannot, rather than failing everything for one
    // bad entry. The HTTP response has no field for "one event, of many,
    // could not be expanded", so this is server-side logging only (see
    // resolve.js's own catch for the same reasoning).
    const expanded = []
    let walkTicksUsed = 0
    let costlyBudgetUsedMs = 0
    for (const { e, ticks } of masters) {
      if (walkTicksUsed > MAX_FETCH_WALK_TICKS) {
        dropped.push(`recurring event ${e.uid ?? '(no uid)'} was not expanded: this fetch's recurrence-walk ceiling of ${MAX_FETCH_WALK_TICKS} ticks is already spent`)
        continue
      }
      const costly = ticks > FREE_WALK_TICKS
      if (costly && costlyBudgetUsedMs > COSTLY_RECURRING_BUDGET_MS) {
        dropped.push(`recurring event ${e.uid ?? '(no uid)'} was not expanded: this fetch's budget for costly recurring series is already spent`)
        continue
      }
      const startedAt = Date.now()
      try {
        expanded.push(...expandRecurring(e, from, to))
      } catch (err) {
        dropped.push(dropReason(e, err))
      } finally {
        // Charged for what actually ran, including when expandRecurring
        // threw: a series refused by the occurrence cap has already paid
        // for its walk, and leaving that uncharged would let many such
        // series spend unbounded time between them. The one exception is a
        // series the per-event walk guard refuses, which is refused before
        // a single tick is walked and so costs nothing -- charging it would
        // let a feed of junk push real series over the ceiling.
        if (ticks <= MAX_WALK_TICKS) walkTicksUsed += ticks
        if (costly) costlyBudgetUsedMs += Date.now() - startedAt
      }
    }

    const events = [...plain, ...expanded]
      // DTEND is exclusive (RFC 5545): an event ending exactly at `from`
      // is over, not still running, and must not appear -- `>=` here
      // would show yesterday's all-day event again on the very next day,
      // and a timed event ending exactly at local midnight on the
      // following morning.
      .filter(e => e.end > from && e.start < to)
      .map(e => ({
        id: String(e.uid ?? `${e.start.toISOString()}-${e.summary}`),
        // Verbatim, deliberately: the frontend renders every field with
        // textContent, never innerHTML, and that -- not this provider --
        // is where a hostile title is neutralised. Escaping here would
        // double-escape once textContent's own escaping runs on top of
        // it, and the viewer would see the literal characters
        // "&lt;img src=x..." instead of the plain text the calendar's
        // author actually typed.
        title: String(e.summary ?? ''),
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        allDay: e.allDay,
      }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

    // One line per fetch, never one per dropped event: a feed carrying
    // hundreds of guard-rejected series would otherwise write hundreds of
    // lines into the container log every time the 300s cache entry
    // expires. Each reason names its own event and cause (see dropReason,
    // which is also where this file's own prefix is stripped off so the
    // line below carries it exactly once rather than twice).
    if (dropped.length > 0) {
      const spelled = dropped.slice(0, DROP_REASONS_LOGGED)
      const unspelled = dropped.length - spelled.length
      console.error(`ics-url: dropped ${dropped.length} recurring event(s), the rest of the calendar continues -- ${spelled.join(' | ')}${unspelled > 0 ? ` | and ${unspelled} more` : ''}`)
    }

    return { events }
  },

  // Recurring (RRULE) events are expanded into per-occurrence instances
  // by expandRecurring() above, including EXDATE exclusions and
  // RECURRENCE-ID overrides -- see its own comment for the host-timezone
  // bug that expansion has to route around.
  async capabilities() { return { needsOAuth: false, recurring: true } },
}
