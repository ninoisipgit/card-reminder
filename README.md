# Card Reminder

A personal Android app that does two things well:

- **Credit cards:** reminds you before each card's due date and keeps a history of every month you marked paid.
- **Debts:** tracks money you lend to or borrow from family and friends, with partial repayments and a paid history.

A home-screen widget shows every card and the debts due soon, with **Add card** and **Add debt** buttons. Tapping an unpaid card asks "Mark as paid?".

Everything stays on the phone. There is no account and no server. Backups are a file you save yourself.

## Version 1.0.0 features

| Area | What it does |
| --- | --- |
| Cards | Statement day, days to due (default 20), reminder days (default 3). Monthly cycles are calculated, not stored. Mark as paid with undo; full history (on time / late). Sorted by due date. |
| Reminders | "Due in 3 days" at your chosen time (default 9:00 AM), then every 4 hours once overdue until marked paid. Optional quiet hours 10 PM – 7 AM. Re-planned after every change. |
| Debts | Each loan is its own record under a person. "They owe me" / "I owe them". Partial repayments; a debt settles itself when fully repaid. Overpayment is blocked. People sorted by soonest due date. |
| Paid history | Settled debts grouped by person, searchable. |
| Widget | Cards and debts due within 7 days, light and dark. Rows open the card or debt; Add card / Add debt buttons. |
| Settings | Reminder time, quiet at night, notification and battery help, test reminder, backup save/restore, theme, delete all data, download latest published version. |

## Getting updates on your phone

A new APK is built only when you publish (`.github/workflows/android-apk.yml`). Publish by pushing a version tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

or with **GitHub → Actions → Android APK → Run workflow**. Ordinary pushes don't build. The newest APK is always here:

https://github.com/ninoisipgit/card-reminder/releases/latest/download/card-reminder.apk

Open it on the phone (or use **Settings → Updates → Download latest version**) and tap **Update**. Your data stays: every build is signed with the same key (`credentials/`) and has a higher version code.

## Developing

Requirements: Node 22.5+, Android Studio (SDK + emulator) or a phone with USB debugging. Keep the project at a short path without spaces (for example `C:\dev\card-reminder`); long Windows paths break the native build.

```bash
npm install
npx expo run:android      # build and install a development build (needed after adding native packages)
npx expo start -c         # start Metro; JavaScript changes reload instantly
npm test                  # data-layer and reminder tests (Node's built-in SQLite)
npx tsc --noEmit          # typecheck
```

Release build on a connected phone: `npx expo run:android --variant release`.

## Project layout

| Path | What's there |
| --- | --- |
| `src/app/(cards)/` | Cards tab: list, card detail, add/edit, settings, test tools |
| `src/app/debts/` | Debts tab: people, person, debt, add/edit, repayment, paid history, settings |
| `src/data/` | SQLite schema and migrations, cards, debts, settings, backup |
| `src/lib/` | Card cycle math, reminder planning, notifications, sync, display helpers |
| `src/widgets/` | Home-screen widget |
| `tests/` | Tests run with `npm test` |

Requirements and decisions: see the product requirements document (Claude doc "Debt & Card Reminder App — Product Requirements").
