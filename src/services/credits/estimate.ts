/**
 * What a story will cost, in credits.
 *
 * **Deliberately free of `server-only`.** The wizard has to show the
 * parent the same number the server is about to enforce, and the only way
 * to guarantee two numbers agree is for there to be one number. This
 * module holds it: no imports, no configuration lookup, no I/O — the
 * inputs are passed in by whoever knows them.
 *
 * It exists because the two numbers *did* disagree. The server checked
 * the whole book while the wizard displayed the cost of its first job, so
 * a parent with three credits was shown "this uses 1 credit", allowed to
 * press the button, and told they had run out. The prices had not
 * changed; only one side had been taught to add them up.
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

/**
 * What an illustrated story will cost in total, not just what its first
 * job costs.
 *
 * This matters because `story_illustration` is charged *per image* and a
 * story fans out to one image per page plus a cover. Checking only the
 * text cost before starting lets a parent begin a book they cannot
 * finish: the text succeeds, the first images succeed, and the rest fail
 * with `insufficient_credits` -- which is not retryable, so those jobs
 * dead-letter and the parent is left holding half a book.
 *
 * The page count is the target the model is asked for, so this is an
 * estimate: the model may return a page or two either side, and the
 * ledger always charges for what was actually produced. It is the right
 * number to *refuse* on, because refusing early costs a parent nothing
 * and refusing late costs them a broken story.
 */
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
