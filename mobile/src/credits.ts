/**
 * What a story will cost, in credits.
 *
 * A deliberate mirror of `src/services/credits/estimate.ts` in the web
 * package. The two cannot import each other — separate packages, separate
 * bundlers, and a test that once reached across that boundary passed
 * locally and failed in CI — so the contract is held by
 * `tests/credits.test.ts` here pinning the same worked examples the web
 * suite pins. If one side changes, the other's test fails.
 *
 * The reason this exists at all is worth keeping: the native create
 * screen used `catalogue.credits.storyText`, which is what the *first
 * job* costs. Illustrations are charged per image and a story fans out to
 * one image per page plus a cover, so the app told a parent holding three
 * credits that a ten-page book cost 1, enabled the button, and the server
 * refused it — the same fault the web wizard had.
 */

export interface StoryCostEstimate {
  /** Credits for the story text itself. */
  text: number;
  /** Credits for every image: one per page, plus the cover. */
  illustrations: number;
  /** How many images that is. */
  imageCount: number;
  total: number;
}

export function estimateStoryCost(input: {
  pages: number;
  illustrated: boolean;
  textCost: number;
  illustrationCost: number;
}): StoryCostEstimate {
  const imageCount = input.illustrated ? input.pages + 1 : 0;
  const illustrations = imageCount * input.illustrationCost;
  return {
    text: input.textCost,
    illustrations,
    imageCount,
    total: input.textCost + illustrations,
  };
}
