# Chosen — iPhone Live Activity / Dynamic Island companion

The Dynamic Island can only be drawn into by ActivityKit, from a native
process. A page in Safari — on Vercel or anywhere else — cannot put anything
there, and no amount of web code changes that. So the Dynamic Island support
ships as a small native companion app that hosts the existing site and owns
the Live Activity, and the site tells it what happened.

Nothing about the web app's own look or behaviour changes. There is no
web-drawn imitation of an island anywhere in this repo: on a device that has
one you get the real thing, and on a device that doesn't, nothing appears and
the pack-opening flow runs exactly as it does today.

## Shape of it

```
mobile web app  (js/app.js — rolls the pack, as it always has)
      │  window.webkit.messageHandlers.chosen   (js/liveActivity.js)
      ▼
Chosen.app      (WebHost.swift — WKWebView + bridge)
      │  ActivityKit
      ▼
Live Activity ──► Dynamic Island + Lock Screen  (ChosenActivityWidget)
      ▲
      │  APNs, for updates that can't come from the phone
Vercel  /api/live-activity/update
```

Two update paths, on purpose:

- **Local** is the fast path and the one an ordinary open uses. The result is
  already known in the web layer, so the app updates its own activity with no
  network round trip at all.
- **Remote (APNs)** exists for state the phone can't produce: a result that
  settles after the app is backgrounded, a correction from the backend, or
  ending an activity the app is no longer running to end. The activity is
  requested with `pushType: .token`, and the token is handed back to the page
  (`window.ChosenNative.pushToken`, plus a `chosen:pushtoken` event) so it can
  POST to `/api/live-activity/update`.

The iOS layer contains **no pack logic**. It does not roll, weight, apply
pity, price, or touch a balance. It renders a result it was handed. That was
the hard requirement and it's the reason the bridge is one-way.

### One thing to know about "source of truth"

Today the roll happens in the browser — `weightedPick` + `applyPity` in
`js/app.js`, committed to a fairness hash client-side — and player state lives
in `localStorage`. There is no server-side pack endpoint for the island to be
downstream of, so the *web app* is the source of truth, not Vercel.

That doesn't change anything about this integration except where the arrow
starts. When a real server-authoritative roll exists, it slots in without
touching the iOS layer: have the server return the same fields
`liveActivity.reportItem` already sends, and either let the page forward them
over the bridge or push them straight to `/api/live-activity/update`. The
contract is the same either way — see `PackActivityAttributes.ContentState`,
which is the single shape all three sides encode.

## States

| state | compact island | when |
|---|---|---|
| `opening` | `◈ OPENING` | crate paid for, reel spinning |
| `itemWon` | `◈ ★ RARE` | the pick locks in |
| `creditsWon` | `◈ +333` | the Cash Out exit pays a balance |
| `ended` | — | 12s after the result, or on leaving the open |

Long-pressing expands to Chosen branding, the item thumbnail, name, rarity and
value (or the credits earned and the new balance), and a **View Item** /
**View Result** link that deep-links back into the page.

`creditsWon` maps to the Cash Out exit because that is the only place in this
app where an open pays a balance instead of an item — every pull from every
pool is an item. If credit-denominated prizes are added later, calling
`liveActivity.reportCredits` from wherever they resolve is the whole change.

## Setup

Xcode 15+, an Apple Developer account, a physical iPhone 14 Pro or later to
see the island itself (the simulator renders it too, on Pro device types).

1. **Generate the project.** The `.pbxproj` is deliberately not committed.

   ```bash
   brew install xcodegen
   cd ios && xcodegen generate && open Chosen.xcodeproj
   ```

2. **Set your team and bundle IDs.** `project.yml` uses `com.chosen.app` and
   `com.chosen.app.ActivityWidget`; change both to something you own, set
   `DEVELOPMENT_TEAM`, and regenerate.

3. **App Group.** Both targets need the same group, and it has to match the
   string in `ThumbnailCache.swift` and `PackLiveActivity.swift`
   (`group.com.chosen.app`). This is what lets the widget read an item's
   thumbnail — a widget extension can't fetch images at render time, so the
   app downloads and downscales it first.

4. **Push Notifications capability** on the app target. Required even though
   there's no alert push here: Live Activity push tokens come from it.

5. **Point at your deployment.** `ChosenWebURL` in `Chosen/Info.plist`.

### APNs (only needed for the remote path)

Create an APNs auth key (.p8) in the developer portal, then set on Vercel:

| variable | value |
|---|---|
| `APNS_KEY_ID` | the key's 10-character ID |
| `APNS_TEAM_ID` | your team ID |
| `APNS_AUTH_KEY` | the .p8 file's contents |
| `APNS_BUNDLE_ID` | e.g. `com.chosen.app` — the endpoint appends `.push-type.liveactivity` |
| `APNS_ENV` | `sandbox` for development builds; omit for production |

Unconfigured, the endpoint returns 503 and nothing breaks — the app keeps
updating its activity locally, which is all an ordinary open needs. This
mirrors how `api/stockx.mjs` degrades without its key.

Push a state by hand:

```bash
curl -X POST https://testcrates.vercel.app/api/live-activity/update \
  -H 'content-type: application/json' \
  -d '{"token":"<activity push token>","event":"update",
       "state":{"phase":"itemWon","rarity":"legendary","rarityLabel":"Legendary",
                "itemName":"Air Jordan 1 High Off-White Chicago","itemValue":6236,
                "deepLink":"chosen://result?item=abc"}}'
```

Push-driven updates carry no thumbnail: `imageFile` names a file in the app
group, and a server has no way to put one there. Those render the rarity mark
instead, which is why the mark is the fallback in `ArtworkView`.

## Fallbacks

Every one of these takes the existing path, unchanged:

- any browser that isn't the companion app — `window.ChosenNative` is
  undefined, and every function in `js/liveActivity.js` returns immediately
- iPad, or any non-phone idiom
- iOS older than 16.2
- Live Activities switched off for the app in Settings (re-checked live, not
  just at launch — see `activityEnablementUpdates`)
- an iPhone with Live Activities but no Dynamic Island: the same activity
  presents as a Lock Screen banner, which is Apple's own fallback and needs
  nothing extra

## Status

The web and Vercel sides are written, wired and verified against the running
site. **The Swift has not been compiled** — this machine has Command Line
Tools but no Xcode, so there is no iOS SDK here to build or run against.
Expect to fix the ordinary things a first build turns up (signing, the App
Group string, an import) before it runs on a device.
