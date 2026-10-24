import type { Page } from '@playwright/test';

/**
 * The start button of the offer card whose own line is `title` (the offer's text).
 *
 * Not "the newest `Los geht's`", and that cost two runs to learn (issue #267). The thread keeps
 * every earlier offer, and the new one renders a frame AFTER Buddy's words — so `.last()` after
 * waiting for the text clicked the PREVIOUS offer about one run in two, and counting the buttons
 * first raced the other way.
 *
 * Nor "the block that contains some words and a button" (#243 merge, 03.10.): a new card enters
 * with an animation and is invisible for a moment (Reanimated `entering` on the web). Its text
 * already counts for `hasText`, its button not yet for `getByRole` — so the innermost block with
 * both was the thread itself, holding the earlier cards' buttons: two of them failed the click
 * (strict mode), one would have been clicked. Hence the card's own title, and only once it is
 * VISIBLE: `.last()` over the divs holding that visible title and a start button is the card.
 */
export function chatCardAction(page: Page, title: string, action = "Los geht's") {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: action, exact: true }) })
    .filter({ has: page.getByText(title, { exact: true }).filter({ visible: true }) })
    .last()
    .getByRole('button', { name: action, exact: true });
}
