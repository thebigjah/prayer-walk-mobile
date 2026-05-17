# Prayer Walk — Play Store + App Store Listing Copy

Drafted 2026-05-17 for Elijah to copy-paste into the Play Console + App Store Connect listings.

---

## App Name
**Prayer Walk**

## Short Description (Play Store, max 80 chars)
> Walk. Pray. See your coverage grow on a personal map.

(70 chars)

## Full Description (Play Store, max 4000 chars)

```
Prayer Walk turns the streets you already walk into a record of intercession.

Press Start. Walk and pray. Press Stop. Your route is added to a personal heatmap of every street, sidewalk, and trail you've ever covered in prayer.

WHAT IT DOES
- Records your prayer walks via GPS — only while you're actively recording, never in the background
- Builds a personal heatmap showing every place you've walked
- Tracks lifetime stats: total walks, total distance, total time, current streak
- Detects personal records and shows a "PR" badge after qualifying walks
- Daily scripture verse on the empty state — different verse every day
- Map recenter button — one tap returns to your live position
- Haptic feedback on Start, Stop, and Save so you know it registered without looking
- Export any walk as a GPX file (works in Strava, Garmin Connect, AllTrails)
- Full JSON backup + restore — your data is yours, never trapped on one device

WHY IT EXISTS
There are running apps. There are habit apps. There are prayer apps. None of them sit at the intersection of "I walk a lot" and "I want to remember where I've prayed."

This app does one thing: keeps a quiet, permanent record of the ground you've covered while talking to God.

It's not social. It doesn't gamify your faith. You'll see no leaderboards, no streaks-shaming, no "your friends prayed more than you this week." Your map is yours.

PRIVACY
- Location is recorded only while a walk is actively in progress
- All data stored locally on your device (AsyncStorage)
- Nothing uploaded, nothing tracked, no analytics
- No account required — open the app and walk

WHO IT'S FOR
- People who already walk and pray, who want to see the cumulative shape of that practice
- Pastors and prayer-walk leaders who want to map their parish coverage
- Anyone doing 24-hour or 40-day prayer-walk commitments
- People building a habit of walking + intercession

WHO IT'S NOT FOR
- People looking for guided prayer (try Lectio 365 or Pray As You Go)
- People who want social features (this is solo by design)
- People who want a generic fitness tracker (this is single-purpose)

OPEN SOURCE
github.com/thebigjah/prayer-walk-mobile

CONTACT
elijahpurcell@gmail.com

— Built solo, shipped fast, free forever.
```

## Category
Lifestyle (primary) — Health & Fitness (secondary)

## Tags
prayer, walking, gps, route, intercession, christian, faith, heatmap, walk tracker, prayer walk

## Content Rating
Everyone — no objectionable content, no in-app purchases, no ads, no user-generated content sharing.

## Privacy Policy URL
https://thebigjah.github.io/prayer-walk-mobile/privacy.html

(Privacy policy HTML page needs to be added to repo + GitHub Pages enabled — TODO before submission.)

## Contact Email
elijahpurcell@gmail.com

## Website
https://purcellventures.co

## Screenshots Needed (Play Store requires 2-8)
1. Empty state with daily verse
2. Active recording — map showing live route in progress
3. Walk completed — save dialog with stats
4. History view — list of past walks
5. Heatmap view — overlapping past routes in color-graded opacity
6. Lifetime stats panel
7. Map recenter + share buttons visible
8. (Optional) Settings or backup screen

Capture method: run `npx expo start --tunnel`, open on physical Android device, walk a fake route in a dense area (downtown Marietta works), screenshot at each state above. Tablet screenshots optional.

## Feature Graphic (Play Store, 1024x500 PNG)
Suggested: dark navy bg, brass-gold "Prayer Walk" wordmark left-aligned, map snippet with heatmap overlay on right side, subtle cross watermark.

## App Icon (already in repo at ./assets/icon.png — verify it's 1024x1024 for Play Store)

---

## App Store Connect (iOS) — same copy mostly works

iOS-specific differences:
- "Subtitle" field max 30 chars: **"Map your prayer routes"** (22 chars)
- Keywords field (100 chars total, comma-separated, NO spaces after commas): `prayer,walk,gps,route,heatmap,christian,faith,intercession,tracker,fitness`
- "What's New" field for v0.5: "Initial release. Record prayer walks, see your coverage heatmap, export GPX, full JSON backup."
- iOS screenshots: need 6.7" (iPhone 15 Pro Max), 6.5" (older Plus), and 5.5" (legacy) sizes — Xcode simulator can generate all three

---

## Submission Checklist (when Elijah has time)

### Play Store ($25, ~1.5 hr)
- [ ] Sign up at play.google.com/console with elijahpurcell@gmail.com (have $25 + ID ready)
- [ ] Create app, paste short + full description from above
- [ ] Upload feature graphic (1024x500) and 8 screenshots
- [ ] Upload AAB from EAS build (URL above in email)
- [ ] Privacy policy URL (will be live on GitHub Pages — me to set up)
- [ ] Complete content rating questionnaire (all "no" answers)
- [ ] Select countries (default: all available)
- [ ] Submit for review (1-3 days)

### App Store ($99/yr, ~3 hr)
- [ ] Apple Developer Program enrollment at developer.apple.com (have $99 + Apple ID ready)
- [ ] Create app record in App Store Connect
- [ ] Generate iOS build via EAS (needs eas.json ios.production profile — present already)
- [ ] Generate signing cert + provisioning profile (EAS handles)
- [ ] Upload via Transporter or `eas submit --platform ios`
- [ ] Paste listing copy, screenshots, keywords
- [ ] Submit for review (3-14 days typically)
