# Home first visit redesign (#548)

Home now presents the actual learner greeting and introduction above three grouped paper starters. Existing next exam/talk, practiced fact and pull refresh remain factual. buddy.tsx wires existing send and camera attachment callbacks; merged Header/Composer and their controller behavior are preserved. Shared Row adds chevron=false for direct actions and 16/600 titles (`TYPE.option` 16/22 since #599). Optional pure iconTone/iconSize props; since #599 their defaults are the design's (20, accent — `components/core/List.jsx:24`), which is what Home passes with calendar/camera/sparkle. Calendar and sparkle are additive shapes in the existing Icon registry; existing artwork and ColorValue remain intact. Later small-controls must preserve these additions.

Home reuses UI.iconButton.glyph 20; no duplicate glyph-size token. New theme/home values: section gap 28, greeting gap 10, practiced mark 9/3/13. Supplied gutter 16 and shared 56 pt rows take precedence over prototype 24/52 geometry. Five locale dictionaries contain the supplied German Home introduction with faithful translations, plus actual greeting/photo/practice strings. intro.body has only the HomeIntro caller. No new routes, API, synthetic data or domain limits.

## Verification

Integrated on published Clearance main `b2b3d338`. Frozen install, mobile typecheck, scoped lint/format/diff pass; 17 focused HomeIntro/Row/frozen-token/locale-parity tests across four files pass. Actual real-PG browser matrix passes 5/5 in 34.6 s: Pastell/Meer light/dark at both phone sizes, plus an actual saved 40-character learner at 360×740. Full greeting, supplied copy, three starters and Composer fit without truncation or scroll allowance. Real camera chooser preserves no fabricated attachment. Actual selected radios, ink/Figtree and visible Composer primary paint prove the selected palette; held primary press proves live reduced-motion settling.

The existing signUpMia test helper accepts an optional learnerName with unchanged Mia default for the long-name setup; request and accepted server response prove real display_name persistence. No new production data/helper copy. An initial added test used a prototype action label; its stopped diagnostic remains separate. Final selectors use existing locale buddy.talk.open.

Durable final evidence: test-results/redesign-home-preparation/final contains nine named phone screenshots plus strict fit/axe reports and browser.log. All four looks at both phones and the long-name render were inspected. The before folder is a historical actual-app Sunset centered intro, capture commit unknown; it is not a same-source Pastell baseline. Supplied Home.jsx remains a separate design reference.

## Integration and remaining limits

Normal publication gates and CI follow manager source/render approval. Native redesigned Home/camera/provider behavior and separate full-page background treatment remain open; browser proof does not claim device verification. Later Memory/ListGroup and small-controls/Icon integration must preserve the additive Row variants/glyphs. No pending Clearance/Home module copies, new routes, API or contract changes.
