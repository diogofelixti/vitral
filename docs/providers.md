# Data sources

Each kind of information is a **capability**, and each capability has interchangeable
**providers**. In `config.yaml`, a capability's `providers` list is both the order of
preference and the fallback chain: the backend tries the first source and, if it fails, the
next. The answer says which source responded.

```yaml
bitcoin: { providers: [coingecko, coinbase], currencies: [brl, usd], primary: brl }
```

No default source needs a key or a signup. Whoever clones the project sees the panel working
without configuring anything but the calendars.

## The envelope

Every data route (`/api/bitcoin`, `/api/fx`, `/api/weather`, `/api/onchain`,
`/api/calendar?profile=work|personal`, `/api/calendar/next`) returns the same envelope:

```json
{ "data": { }, "updatedAt": "2026-09-20T14:30:00.000Z", "provider": "coingecko", "stale": false, "degraded": false }
```

- `stale: true`: every source failed and this is the last known value. The panel shows its
  age instead of dropping the reading.
- `degraded: true`: the answer came from a source other than the first in the list.
- When no source answers and nothing is cached, the route returns `503` with a code
  (`PROVIDER_UNAVAILABLE`, `GOOGLE_NOT_CONFIGURED`...). The backend never returns a sentence:
  the frontend translates.

Each answer is cached for the provider's `ttl`, and that sets the call rate: however many
screens have the panel open, they read the cache, and each source is asked once per `ttl`
(the next one in the list only when the one before it fails). Each service documents its
own rate limits; at this pace Vitral stays well clear of all of them.

## `bitcoin`

Normal form: `{ prices: { <currency>: { price, change24h } } }`, price in whole units of the
currency (not cents) and `change24h` as a percentage, or `null` when the source doesn't
report it.

| Provider | Covers | Doesn't cover | `ttl` |
|---|---|---|---|
| `coingecko` | every currency in `supported_vs_currencies`, `sats` included; 24 h change | | 60 s |
| `coinbase` | the currencies in Coinbase's exchange-rate table | 24 h change (`change24h: null`) | 60 s |

`currencies` lists the currencies shown and `primary` is the featured one; it must be in the
list.

## `fx`

Normal form: `{ pairs: { "USD-BRL": { rate, change } } }`, with `rate` in quote currency per
unit of base (how many reais one dollar costs) and `change` as a percentage, or `null`.

| Provider | Covers | Doesn't cover | `ttl` |
|---|---|---|---|
| `awesomeapi` | USD-BRL, EUR-BRL, GBP-BRL, ARS-BRL and BTC-BRL, with the day's change | other pairs | 60 s |
| `frankfurter` | any pair among the European Central Bank's reference currencies | change (`change: null`); one rate per business day | 60 s |

## `weather`

Normal form: `{ now: { tempC }, today: { maxC, minC }, sun: { rise, set }, hourly: [{ hour, tempC }] }`,
in Celsius, with `HH:MM` times in the location's time zone and at most 8 hours of forecast.

| Provider | Covers | Doesn't cover | `ttl` |
|---|---|---|---|
| `open-meteo` | everything, with an hour-by-hour forecast | | 15 min |
| `wttr-in` | everything | forecast in 3-hour steps, not hourly | 15 min |

The location comes from `location` (latitude, longitude and the name shown on the widget).

## `onchain`

Normal form: `{ blockHeight, feeSatVb, halving: { blocksLeft, estimatedDays } }`. The halving
is computed from the height, the same for every source.

| Provider | Covers | Doesn't cover | `ttl` |
|---|---|---|---|
| `mempool` | block height and recommended fee in sat/vB | | 60 s |
| `blockstream` | block height | fee (`feeSatVb: null`) | 60 s |

Difficulty has no source yet: the widget reads "Difficulty · pending".

## `calendar`

Normal form: `{ events: [{ id, title, start, end, allDay }] }`, sorted by start, with
recurring events already expanded and titles exactly as they arrived (the frontend
neutralizes HTML by writing them with `textContent`).

Each calendar (`work` and `personal`) has one provider and no fallback chain. The "next
event" is derived from both.

| Provider | Needs | `ttl` |
|---|---|---|
| `ics-url` | the calendar's secret iCal address, in `url` | 5 min |
| `google` | OAuth, see [`google-calendar.md`](google-calendar.md) | 5 min |

A calendar with no `url` (or Google with no credentials) shows as "not set up", with a hint,
not as an error.

## Adding a provider

1. Create `api/src/providers/<capability>/<name>.js` exporting `{ id, capability, ttl,
   fetch(params, ctx), capabilities(ctx) }`. The registry finds the file on its own; code
   shared by providers of one capability goes in a `lib/` subfolder.
2. Include a real API response in the pull request, so it can be recorded as a fixture.
3. Document it here: what it covers, what it doesn't, and its `ttl`.

Before merging it goes through **the same battery** as every other provider of its
capability, so that switching sources cannot change what the screen shows.

Every URL that comes from configuration goes through the SSRF guard before any connection;
use the `http` that arrives in `ctx`, which already does that, rather than `fetch`. If the
source covers less than the others, say so in `capabilities()` instead of failing quietly.

## When a source changes

Public APIs change their format without warning. The maintainer also runs the same battery
against the real sources, which catches a change no recorded response can; meanwhile the
fallback chain keeps the widget up, and the panel shows which source answered. If a widget
starts showing "source unavailable" for good, open an issue saying which source.
