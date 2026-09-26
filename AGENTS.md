# Instructions for AI coding agents

This file is for an AI agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot and the like)
that was asked to install, update or troubleshoot Vitral, or to change its code. People
should start with the [README](README.md).

## What Vitral is

An always-on panel for a TV or monitor: clock, two calendars, next event, Bitcoin, exchange
rates, weather and countdowns. Two Docker containers: `web` (nginx, serves the page on
`VITRAL_PORT`, default 8080) and `api` (Node 20, port 3100 inside the Compose network only,
never published). All configuration happens in the panel's own settings, not in files.

## Installing

Do these steps in order, and check each one before going on.

1. **Check the requirements.** `docker compose version` must work. That is the Compose
   plugin, not the old `docker-compose`. If it fails, stop and tell the person how to install
   Docker for their system. Don't install it without asking.
2. **Check the port.** Run `docker ps --filter publish=8080`, and on Linux
   `ss -ltn 'sport = :8080'` too. If 8080 is taken, pick a free port and write it to a `.env`
   next to `docker-compose.yml`: `echo "VITRAL_PORT=8081" > .env`. Use that port everywhere
   below.
3. **Look for an existing install.** Run `docker ps -a --filter name=vitral` and
   `docker volume ls --filter name=vitral`. Compose names the project after the directory, so
   a clone in a directory called `vitral` shares its containers and its settings volume
   (`vitral_vitral-data`) with any other `vitral` directory on the machine. If one exists,
   ask the person whether to update it or install a separate one. For a separate one, use
   another directory name or `docker compose -p <name>`, and another port.
4. **Get the code and start it:**

   ```bash
   git clone https://github.com/diogofelixti/vitral.git
   cd vitral
   docker compose up -d --build
   ```

5. **Check that it runs.** Give the `api` about 10 seconds, then:

   ```bash
   docker compose ps                              # both services Up, api healthy
   curl -s http://localhost:8080/api/health       # {"status":"ok"}
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/   # 200
   ```

   If something fails, read `docker compose logs api` and `docker compose logs web` before
   changing anything.
6. **Hand over to the person.** Tell them to open `http://localhost:8080` (or
   `http://<machine-address>:8080` from another device) and follow the short setup: language,
   city and calendars. The panel works without it; it can be skipped.

## What only the person can do

Don't try to do these steps yourself, and don't ask for secrets in the chat. Explain them
and wait.

- **Calendars.** The easy way is each calendar's secret iCal address, pasted in
  **Settings → Calendars**. That address grants read access to the calendar, so never ask for
  it, print it, log it or commit it.
- **Google Calendar through the API**, when chosen instead: the person creates an OAuth
  client in the Google Cloud Console, following [docs/google-calendar.md](docs/google-calendar.md),
  and pastes the Client ID and secret into the settings. Consent only works in a browser **on
  the machine running the panel**, because Google accepts a plain-http redirect only to
  `localhost`. Each calendar (Work, Personal) connects its own Google account with its own
  **Connect** button.
- **Kiosk mode and autostart** on the screen's machine are the person's call. Suggest
  `chromium --kiosk http://localhost:8080`.

## Updating and stopping

```bash
git pull && docker compose up -d --build   # update, keeps the settings
docker compose down                        # stop
```

Never run `docker compose down -v` or delete the `vitral-data` volume unless the person asks
for it. The volume holds the settings and the Google tokens, and losing it means setting up
and connecting Google again.

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `Bind for 0.0.0.0:8080 failed: port is already allocated` | Something else holds the port | See step 2, then `docker compose down && docker compose up -d` (a failed start leaves `web` with no network) |
| `redirect_uri_mismatch` on Google's page | The port changed, or the OAuth client has another URI | The exact URI is in Settings → Calendars; the person adds it in the Google Console |
| The panel opens the setup after an update | An old `config.yaml` in the project root | `mkdir -p config && mv config.yaml config/`, then restart |
| The api answers `421` with `MISDIRECTED_HOST` | The panel is reached by a name it doesn't trust | Add the name to `PANEL_HOSTS` in `.env` (see `.env.example`) |
| Both calendars show the same events | Both are connected to the same Google account | Settings → Calendars → **Connect** on the other calendar, picking the other account |

## Security rules

- Vitral is built for a local network. It has no login and no HTTPS. Don't publish it to the
  internet, open ports on the router or add a tunnel unless the person explicitly asks. Even
  then, put it behind a VPN or an authenticating proxy.
- Don't add a `ports:` entry to the `api` service. It holds the Google token and must stay
  unreachable from the host.
- Don't put credentials in `docker-compose.yml`, in commits or in logs.

## Changing the code

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short:

- There is no build step. `web/` is plain JavaScript with Web Components, and after editing
  it, `docker compose up -d --build web`. The `api/` doesn't reload by itself either, so run
  `docker compose up -d --build api` after changing it.
- Code, API and documentation are in English. The interface is bilingual: every visible
  string lives in both `web/i18n/en.json` and `web/i18n/pt-BR.json`. The api returns error
  codes, never sentences, and the frontend translates them.
- A theme is one CSS file under `web/themes/`, following `web/themes/_contract.css`. Measure
  in `cqw`, never put words in CSS, and meet WCAG AA contrast.
- A data source is a provider under `api/src/providers/<capability>/`. Providers of the same
  capability must be interchangeable: same output shape, same errors.
- Check every change on the running panel in both languages (`L`), in every theme (`T`) and
  from a TV size down to a phone.
