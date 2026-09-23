# Contributing to Vitral

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

Thanks for your interest. This project was born open and contributions of any size are
welcome: a theme, a data source, a widget, a translation, a typo in the README.

## Running it for development

```bash
docker compose up -d --build       # brings up web (:8080) and api
docker compose logs -f api         # follow the backend
```

The frontend has no build step, but the `web` container copies the files into its image:
after editing, run `docker compose up -d --build web`. The backend doesn't reload on its own
either: `docker compose up -d --build api` after changing its code.

To run the backend outside Docker, set `PORT`. The default internal port is 3100, because
3000 is contested and may already be taken on your machine.

## Before opening a pull request

Check your change on the running panel in both languages (`L`), in every theme (`T`) and at a
few widths, from a TV down to a phone. The maintainer runs the full test suite (every theme
at several sizes, both languages, the security checks) on each pull request before merging,
and will tell you what it found. If your pull request fixes a bug, describe how to see it
before the fix.

## Creating a theme

The easiest way to contribute, and the one that helps the project most.

1. Copy `web/themes/terminal.css` to `web/themes/your-theme.css`.
2. Replace the `[data-theme="terminal"]` selector with your theme's name.
3. Define **every** variable listed in `web/themes/_contract.css`.
4. Lay out your own `grid-template-areas`: you can rearrange the whole screen and even hide
   widgets, without touching JavaScript.
5. Press `T` until your theme comes up, and check it at a TV size, a laptop size and a phone.

Four rules:

- Never declare selectors outside your `[data-theme="..."]`.
- Never put words in CSS (`content:` with text): they escape translation.
- Measure in `cqw`, not `px` or `vw`: the panel runs from a 55" TV to an upright phone, and
  also embedded, where the window size lies about the space available.
- Meet WCAG AA on every text/background pair. The contrast is checked from the hex values in
  your CSS before merging; a beautiful theme nobody can read doesn't go in.

Design for both languages: "Próximo compromisso" and "Next event" are not the same length,
and that is where themes break. Details in [`docs/themes.md`](docs/themes.md).

## Adding a data source

Each kind of information is a **capability** (`bitcoin`, `fx`, `weather`, `onchain`,
`calendar`) and each capability has several interchangeable **providers**, which the user
picks in the configuration. A provider knows nothing about HTTP servers, caching or
languages: it fetches, normalizes and returns.

1. Create `api/src/providers/<capability>/your-source.js`, returning the capability's normal
   form described in [`docs/providers.md`](docs/providers.md). The registry finds the file on
   its own.
2. Include in the pull request a real response from the API, so it can be recorded as a
   fixture.
3. Document it in `docs/providers.md`: what it covers, what it doesn't, and its `ttl`.

Before merging, the provider goes through the same battery as every other provider of its
capability. That isn't bureaucracy: the project's promise is that switching sources changes
nothing on screen, and it is only real if providers pass literally the same checks. It is
what stops one from returning prices in cents and another in units, or a change as a fraction
in one and a percentage in the other.

Prefer **sources with no key and no signup**. If yours needs a credential, the widget has to
degrade cleanly without it: whoever clones the project must see the panel working without
configuring anything. If it covers less than the others (fewer currencies, say), report that
in `capabilities()` instead of failing silently.

## Security

Vitral is built for a local network: no login and no HTTPS, and the README says so. Inside
that premise, three rules any pull request has to respect.

**Never `innerHTML` with external data.** An event title, a city name, any text from an API
goes to the screen through `textContent` or `setAttribute`. An invitation sent by a stranger
is already third-party content rendered on someone's panel, and the CSP has no
`unsafe-inline` to fall back on.

**Every URL that comes from configuration goes through the SSRF guard**
(`api/src/security/ssrf-guard.js`) before any connection: `https` only, no loopback, no
link-local, no private ranges, redirects re-checked by the same rules. A provider that fetches
a user's URL without the guard isn't accepted.

**Secrets never go into an API response.** Routes build an allowlist of fields and never
return the configuration object.

The same model covers the rest: the Google OAuth callback validates and consumes a one-time
`state`, no redirect destination comes from a parameter, the `api` container publishes no
port, the token file is `0600` and never mounted into `web`, YAML is parsed with a safe
schema, and every outbound call has a timeout and a size cap.

If you find a vulnerability, open an issue describing the impact without publishing a working
exploit.

## Translations

The interface is bilingual: `web/i18n/pt-BR.json` and `web/i18n/en.json`, with exactly the same
keys, so every new string needs both versions in the same pull request.

The backend never returns a finished sentence, only an error code (`PROVIDER_UNAVAILABLE`);
the frontend, which knows the active language, translates it. Dates, numbers and currencies
always go through `Intl`, never formatted by hand.

## Language

Code, file names, endpoints, commit messages and documentation are in **English**. The
interface speaks Portuguese and English. Proper names (`vitral`, `estacao`, `cianotipo`)
aren't translated.

## Commit messages

Imperative, in English, explaining the why when it isn't obvious:

```
add coinbase provider for the bitcoin capability

Gives users a second option when CoinGecko rate-limits, and doubles as
automatic fallback. Covers fewer currencies than CoinGecko, which the
currency picker now reflects through capabilities().
```

## Before investing a lot of time

Open an issue first. It's frustrating to receive a well-made pull request that doesn't fit the
scope. Deliberately left out of v1, so it could ship small and complete: login, HTTPS and
exposure to the internet; multiple users or profiles; configuration through the interface;
push updates instead of polling; a visual layout editor; history and time-series charts;
write actions (creating events, setting alerts); providers that need a key or signup; CalDAV;
languages beyond Portuguese and English; native apps and installable PWAs.
