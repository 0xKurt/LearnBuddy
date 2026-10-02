# Screenshots: #206 "Buddy ist gerade überlastet"

Branch `claude/train2-drosselung-tempo-eval-206-165-127`. The provider throttled a turn (HTTP 429)
through every retry. The chat now says so, calmly, with "Nochmal senden" beside it.

Shot by `tests/web/tour.spec.ts` (step `41b-busy-message`) against the real app with a scripted
model, at 390×844 and 360×740, in light and dark.

- `shots/composite-41b-busy.png` — side by side: light 390 · light 360 · dark 390 · dark 360
- `shots/41b-busy-message-{light,dark}[-360].png` — single frames

Design rounds:
1. The first copy was "Buddy ist gerade überlastet – gleich nochmal", in danger red. It wrapped to
   three lines at 360 px and repeated the button next to it.
2. Now "Buddy ist gerade überlastet" in secondary ink, because a throttle is neither her fault nor
   a broken app. It takes one line at 390 px and two at 360 px, like the existing failure line.

fit.ts and the a11y check found nothing for these frames.
