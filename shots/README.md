# Shots — claude/train2-politur-133-126-194-177

Issues #194 (native dark splash), #133 position 15 (iOS dark/tinted icons), #177, #126.

| File | What |
|---|---|
| `composite.png` | Everything side by side: splash light/dark at 360×740 and 390×844, then the iOS icons |
| `splash-{light,dark}-{360x740,390x844}.png` | The native splash's layout (window colour + the 200 pt picture, centred) with the real assets |
| `ios-icons.png` | iOS 18 icon variants: light, dark (on a stand-in for iOS's dark backdrop), tinted (a sample tint applied in CSS — iOS picks the real one) |

**These are renders, not device captures.** The splash shots place the real PNGs on the real
window colour the way `expo-splash-screen` does; Android 12+ additionally masks the picture to
its splash icon circle, which only a device shows. Nothing here was captured from a phone.

What is not shown, because it only exists natively:

- **#177** (navigation bar under an open sheet in dark mode): the web build has no system
  navigation bar, and `systemChrome.web.ts` is a no-op. The fix is in code and in the generated
  native config; it needs a native rebuild and a look on the Xiaomi.
- **#126** (reduce motion cross-fades instead of jumping): on the web the system setting keeps
  deciding (`fadePolicy('web') === 'system'`), so a browser shows nothing new. On a phone with
  animations off, cards, sheets and the verdict chip now fade in place.
