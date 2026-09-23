# Google Calendar

> **You probably don't need this.** The `ics-url` provider reads any calendar that exports an
> iCal address (Google, Outlook, Proton, Apple, Nextcloud), with no OAuth, no credentials and
> nothing in this guide. In Google Calendar the address is under *Settings → [your calendar]
> → Integrate calendar → Secret address in iCal format*. Paste it as `url`:
>
> ```yaml
> calendars:
>   personal: { provider: ics-url, url: "https://calendar.google.com/calendar/ical/.../basic.ics", label: { pt-BR: Pessoal, en: Personal } }
> ```
>
> The secret address gives read access to the calendar to whoever holds it: treat it like a
> password.

Use the `google` provider when you want Google's API rather than the iCal feed. Vitral asks
for read-only access (`calendar.readonly`) and never writes to your calendar.

## 1. Create the OAuth client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project
   (the name doesn't matter, `vitral` for instance).
2. Under *APIs & Services → Library*, enable the **Google Calendar API**.
3. Under *APIs & Services → OAuth consent screen*, pick the **External** user type (or
   **Internal**, for a Google Workspace account), fill in the name and email, and add the
   `.../auth/calendar.readonly` scope. While the app is in testing, add your own account
   under *Test users*.
4. Under *APIs & Services → Credentials → Create credentials → OAuth client ID*, pick **Web
   application** and register exactly this authorized redirect URI:

   ```
   http://localhost:8080/auth/google/callback
   ```

   If you changed `VITRAL_PORT` in `.env`, use your port instead of `8080`: the backend builds
   the redirect address from it, and Google refuses any mismatch.

## 2. Put the credentials in `.env`

```bash
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

In `config.yaml`, point the calendar at the `google` provider:

```yaml
calendars:
  work: { provider: google, calendarId: primary, label: { pt-BR: Trabalho, en: Work } }
```

`primary` is the account's main calendar. For another one, use the ID shown under *Settings →
[calendar] → Integrate calendar → Calendar ID*.

Then run `docker compose up -d` again so the container reads `.env`.

## 3. Authorize once

Open **`http://localhost:8080/auth/google`**, sign in with the account and accept. Google sends
you back to the panel, and the backend keeps the refresh token in the `vitral-data` volume.
From then on it renews access by itself.

The address has to be `localhost`: Google only accepts a plain `http` redirect to
`localhost`. That means consent happens **on the machine running the panel**. If it has no
browser (a Raspberry Pi, a server), open a tunnel from your computer and consent there:

```bash
ssh -L 8080:localhost:8080 user@panel-machine
# then open http://localhost:8080/auth/google in your computer's browser
```

## The 7-day token

With an **External consent screen in testing**, Google expires the refresh token after 7
days. The panel then shows "Reconnect Google Calendar" (`GOOGLE_REAUTH_REQUIRED`) and stops
refreshing the calendar until someone repeats step 3. For a panel meant to run untouched,
that won't do. There are two ways out:

- **Publish the app** (*OAuth consent screen → Publish app*). A personal app with a sensitive
  scope that hasn't gone through Google's verification keeps working for you; Google only
  shows an "unverified app" warning at consent time.
- **Use a Google Workspace account** with an **Internal** consent screen, which has no such
  limit.

Or, again, use `ics-url`, which has no token at all.

## When something goes wrong

| The panel shows | Cause | What to do |
|---|---|---|
| Google not configured | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing | Fill in `.env` and bring the stack up again |
| Reconnect Google Calendar | The token was revoked or expired (see the 7 days above) | Open `/auth/google` again |
| `redirect_uri_mismatch` on Google's page | The registered URI doesn't match the port in `.env` | Fix the URI in the Console |
