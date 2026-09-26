# Google Calendar

> **You probably don't need this.** Any calendar that exports an iCal address (Google,
> Outlook, Proton, Apple, Nextcloud) can be read with no OAuth, no credentials and nothing in
> this guide. In Google Calendar the address is under *Settings → [your calendar] → Integrate
> calendar → Secret address in iCal format*. In Vitral, open **Settings → Calendars** (or the
> calendars step of the setup), pick **iCal address**, paste it and press **Test**.
>
> The secret address gives read access to the calendar to whoever holds it: treat it like a
> password. Vitral never shows it again once saved, only the name of its host.

Use Google Calendar when you want Google's API rather than the iCal feed. Vitral asks for
read-only access (`calendar.readonly`) and never writes to your calendar. Each install uses
its own OAuth client, which you create once in Google's console; everything else happens in
**Settings → Calendars → Google Calendar**, which shows these same steps.

Each calendar connects its **own Google account**. Work can be your company account and
Personal your Gmail, with one OAuth client for both.

## 1. Create the OAuth client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project
   (the name doesn't matter, `vitral` for instance).
2. Under *APIs & Services → Library*, enable the **Google Calendar API**.
3. Under *APIs & Services → OAuth consent screen*, pick the **External** user type (or
   **Internal**, for a Google Workspace account), fill in the name and email, and add the
   `.../auth/calendar.readonly` scope.
4. **Publish the app** (*OAuth consent screen → Publish app*). In testing mode Google
   disconnects the calendar every 7 days; see [below](#the-7-day-token).
5. Under *APIs & Services → Credentials → Create credentials → OAuth client ID*, pick **Web
   application** and register exactly the authorized redirect URI the settings show, with a
   **Copy** button beside it. On the default port it is:

   ```
   http://localhost:8080/auth/google/callback
   ```

   If you changed `VITRAL_PORT`, the address follows your port: Google refuses any mismatch.

## 2. Save the credentials

In **Settings → Calendars → Google Calendar**, paste the **Client ID** and the **Client
secret** and press **Save credentials**. The secret is kept in the api's volume and never
shown again; to replace it, open **Change credentials**.

An existing install that had `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` loses
nothing: they are imported once, on the first start of this version.

## 3. Connect each calendar

Set **Work** or **Personal** (or both) to **Google Calendar**. Each one gets its own box with a
**Connect** button. Press it, pick the account for that calendar and accept. Google always
shows the account chooser, so the second calendar can use a different account from the
first. Connect saves your choices in the menu first, then Google sends you back to the
panel. The api keeps one refresh token per calendar in the `vitral-data` volume and renews
access by itself.

**Disconnect** in a calendar's box drops only that calendar's account.

An install from before calendars had their own accounts keeps working: its single
connection serves both calendars until you connect one of them again.

Google only accepts a plain `http` redirect to `localhost`, so consent has to happen **on
the machine running the panel**. Opened from any other device, the settings show a tunnel
command instead of the button:

```bash
ssh -L 8080:localhost:8080 <user>@<panel-machine>
# then open http://localhost:8080 on your computer and press Connect there
```

## 4. Pick the calendars

Once connected, each box lists the calendars of its account by name, with the main one
preselected. Press **Save**.

## The 7-day token

With an **External consent screen in testing**, Google expires the refresh token after 7
days. The panel then shows "Reconnect Google Calendar" (`GOOGLE_REAUTH_REQUIRED`) and stops
refreshing the calendar until someone connects again. For a panel meant to run untouched,
that won't do. There are two ways out:

- **Publish the app** (step 4 above). A personal app with a sensitive scope that hasn't gone
  through Google's verification keeps working for you; Google only shows an "unverified app"
  warning at consent time.
- **Use a Google Workspace account** with an **Internal** consent screen, which has no such
  limit.

Or, again, use an iCal address, which has no token at all.

## When something goes wrong

| You see | Cause | What to do |
|---|---|---|
| Google not configured | No credentials saved yet | Settings → Calendars → Google Calendar → Save credentials |
| Reconnect Google Calendar | The token was revoked or expired (see the 7 days above) | Settings → Calendars → connect again |
| `redirect_uri_mismatch` on Google's page | The URI registered in the Console doesn't match the one the settings show | Copy it from the settings into the Console again |
| No Connect button, a tunnel command instead | The settings are open on another device | Run the tunnel, or open the settings on the panel machine |
| The account's calendars don't list | The connection dropped | Connect again, then pick them |
| Both calendars show the same events | Both are connected to the same account | Press **Connect** in the other calendar's box and pick the other account |
