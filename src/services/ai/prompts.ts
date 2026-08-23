import type { StoryRequest } from '@/types/domain';
import { HARD_LIMITS } from '@/config/constants';

/**
 * Prompt construction for story generation (§6).
 *
 * The quality bar the specification sets -- "must not sound like generic
 * AI-generated text" -- is mostly won or lost here. Three things do the
 * work:
 *
 *  1. A craft-level system prompt that talks about children's literature
 *     rather than about being helpful.
 *  2. Explicit *negative* instruction against the specific failure modes
 *     of LLM prose: summarising instead of dramatising, moralising in the
 *     last paragraph, and the same three sentence shapes forever.
 *  3. Per-language guidance from the database, so Azerbaijani is written
 *     as Azerbaijani rather than translated out of English.
 *
 * `PROMPT_VERSION` is recorded on every generated version so a change here
 * is attributable later.
 */
export const PROMPT_VERSION = '2026-08-23.1';

export function buildSystemPrompt(request: StoryRequest, targetPages: number, wordsPerPage: number): string {
  const age = request.child.age_years;
  const ageBand = describeAgeBand(age);

  return [
    `You are a celebrated author and illustrator's collaborator who writes original picture books for children. You have published widely and your books are known for warmth, rhythm and respect for the reader.`,
    ``,
    `You are writing one complete picture book. It will be printed, illustrated and read aloud at bedtime, so every sentence must survive being spoken.`,
    ``,
    `## The reader`,
    age === null
      ? `The child's exact age is unknown. Write for roughly five to seven years old.`
      : `The child is ${age} years old. ${ageBand}`,
    `The child is the protagonist. They are named in the story and they are the one who acts, decides and changes. Adults may help but must never solve the problem for them.`,
    ``,
    `## Craft rules`,
    `- Show the story in scenes. Never summarise what happened; let the reader watch it happen.`,
    `- Give the book a real shape: an opening that establishes the ordinary world, a want, a complication that genuinely worsens, a turn, and a resolution that costs something.`,
    `- Vary sentence length deliberately. A short sentence after two long ones is where the rhythm lives.`,
    `- Write dialogue the way children actually speak: interruptions, repetition, small illogic. Do not have children speak like narrators.`,
    `- Use concrete, sensory detail. One precise image beats three adjectives.`,
    `- Emotions progress. The child should not feel the same on the last page as on the first.`,
    `- Let the ending land a beat before it explains itself. Trust the reader.`,
    ``,
    `## Do not`,
    `- Do not end with a stated moral, a lesson paragraph, or a sentence beginning "And so ${request.child.display_name} learned...".`,
    `- Do not use the stock openings "Once upon a time", "In a land far away" or "It was a beautiful sunny day".`,
    `- Do not repeat a distinctive phrase, image or sentence construction across pages.`,
    `- Do not use exclamation marks to manufacture excitement. At most two in the whole book.`,
    `- Do not include brand names, real living people, or anything a parent would need to explain.`,
    `- Do not write anything frightening beyond a gentle, resolvable worry: no injury, no death, no cruelty, no menace that is not resolved within the same book.`,
    ``,
    `## Format`,
    `- Exactly ${targetPages} pages, numbered from 1.`,
    `- Around ${wordsPerPage} words per page. Vary it: a page may be a single line if the moment earns it.`,
    `- Every page must be a distinct moment in time or place. A page is a picture plus the words beside it.`,
    ``,
    buildLanguageSection(request),
    ``,
    buildIllustrationSection(),
  ].join('\n');
}

function describeAgeBand(age: number | null): string {
  if (age === null) return '';
  if (age <= 3) {
    return 'Write in very short sentences with strong rhythm and repetition. Concrete nouns only. The plot is a single simple want.';
  }
  if (age <= 5) {
    return 'Use simple sentences and familiar vocabulary. One clear problem, one clear solution. Repetition and pattern are welcome.';
  }
  if (age <= 7) {
    return 'Use straightforward sentences with occasional richer words made clear by context. The plot may have two connected beats.';
  }
  if (age <= 9) {
    return 'Use fuller sentences and more varied vocabulary. The plot can carry a subplot and a genuine misunderstanding.';
  }
  return 'Use confident, literary prose for a fluent young reader. The emotional situation may be genuinely complicated.';
}

function buildLanguageSection(request: StoryRequest): string {
  return [
    `## Language`,
    `Write the entire story in ${request.languageCode}. Every field of your output -- title, subtitle, summary, dedication, page text, takeaway and discussion questions -- must be in that language.`,
    `The only exception is \`illustrationPrompt\` and the character description fields, which must be written in English because they are sent to an image model.`,
    request.languageGuidance ?? '',
    `Write as a native author of this language writing an original book, not as a translator. Idiom, rhythm and cultural texture must belong to the language.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildIllustrationSection(): string {
  return [
    `## Illustration prompts`,
    `For each page write an \`illustrationPrompt\` in English describing one single image.`,
    `- Describe the moment, the composition, the light and the setting.`,
    `- Refer to the protagonist as "the child described in the character sheet" rather than restating their appearance; the appearance is supplied separately and would otherwise drift.`,
    `- Never include words, letters, captions or numbers in the image.`,
    `- Never name or reference a living artist, studio, or copyrighted character.`,
    `- Never describe a real, identifiable person.`,
  ].join('\n');
}

export function buildUserPrompt(request: StoryRequest): string {
  const child = request.child;
  const lines: string[] = [];

  lines.push(`## The child`);
  lines.push(`Name used in the story: ${child.display_name}`);
  if (child.age_years !== null) lines.push(`Age: ${child.age_years}`);
  if (child.gender) lines.push(`Gender: ${child.gender}`);
  pushList(lines, 'Interests', child.interests);
  pushList(lines, 'Favourite animals', child.favourite_animals);
  pushList(lines, 'Favourite activities', child.favourite_activities);
  pushList(lines, 'Loves characters like', child.favourite_characters);
  pushList(lines, 'Personality', child.personality_traits);
  pushList(lines, 'Curious about', child.learning_interests);
  if (child.parent_notes) {
    lines.push(`Notes from the parent: ${child.parent_notes.slice(0, HARD_LIMITS.maxParentNotesChars)}`);
  }
  lines.push(
    `Weave two or three of these details in so the child recognises themselves. Do not list them; let them show up as behaviour, choices and things the child notices.`,
  );

  lines.push('');
  lines.push(`## The book`);
  lines.push(`Theme: ${request.themeSlug}`);
  if (request.themeGuidance) lines.push(request.themeGuidance);

  if (request.objectiveSlug) {
    lines.push('');
    lines.push(`Educational thread: ${request.objectiveSlug}`);
    if (request.objectiveGuidance) lines.push(request.objectiveGuidance);
    lines.push(
      `The lesson must be carried by what happens, never stated. A reader should feel it without being able to point at the sentence that says it.`,
    );
  }

  if (request.customInstructions) {
    lines.push('');
    lines.push(`## What the parent asked for`);
    lines.push(request.customInstructions.slice(0, HARD_LIMITS.maxCustomInstructionChars));
    lines.push(
      `Follow this closely. If any part of it conflicts with the age-appropriateness or safety rules, quietly satisfy the spirit of the request within those rules.`,
    );
  }

  if (request.remixOf) {
    lines.push('');
    lines.push(`## This is a new version of an existing book`);
    lines.push(`Change requested: ${request.remixOf.kind}`);
    lines.push(`Original title: ${request.remixOf.originalTitle}`);
    lines.push(`Original summary: ${request.remixOf.originalSummary}`);
    lines.push(`Original pages:`);
    request.remixOf.originalPages.forEach((text, index) => {
      lines.push(`${index + 1}. ${text}`);
    });
    lines.push(
      `Keep the protagonist, their voice and the world consistent with the original. Make the requested change genuinely -- this must read as a different book, not a paraphrase.`,
    );
  }

  lines.push('');
  lines.push(`## The character sheet`);
  lines.push(
    `Before writing, decide the protagonist's appearance and record it in \`characterBible\` in English. Be specific and unambiguous: hair colour and style, eye colour, skin tone, build, and one memorable item of clothing they wear on every page. This sheet is pasted into every illustration prompt, so it is what keeps the child looking like the same child from page to page.`,
  );
  if (child.appearance_description) {
    lines.push(`The parent has described the child's appearance: ${child.appearance_description}`);
    lines.push(`Use this as the basis for the character sheet.`);
  } else {
    lines.push(
      `No photograph or appearance description was provided. Invent a warm, appealing appearance that suits the name and the story, and keep it consistent.`,
    );
  }

  return lines.join('\n');
}

function pushList(lines: string[], label: string, values: string[]): void {
  if (values.length > 0) lines.push(`${label}: ${values.join(', ')}`);
}

/**
 * Composes the final image prompt for one page (§8).
 *
 * Consistency comes from repeating the character sheet verbatim in every
 * prompt rather than hoping the model remembers.
 */
export function buildIllustrationPrompt(input: {
  stylePrefix: string;
  scenePrompt: string;
  characterSheet: string;
  worldPalette: string;
  artDirection: string;
  isCover: boolean;
}): string {
  const parts = [
    input.stylePrefix,
    '',
    input.isCover ? 'Book cover illustration.' : 'Interior picture-book illustration.',
    `Scene: ${input.scenePrompt}`,
    '',
    `The child must look exactly like this in every image: ${input.characterSheet}`,
    input.worldPalette ? `Colour palette: ${input.worldPalette}` : '',
    input.artDirection ? `Art direction: ${input.artDirection}` : '',
    '',
    'No text, no letters, no numbers, no captions, no watermark, no signature anywhere in the image.',
    'Safe and gentle for young children. No injury, weapons, blood or menace.',
  ];
  return parts.filter((part) => part !== '').join('\n');
}

/** Turns the character bible into the one paragraph that gets repeated. */
export function characterSheetLine(bible: {
  protagonist: {
    name: string;
    appearance: string;
    clothing: string;
    hairstyle: string;
    distinguishingFeatures: string;
  };
}): string {
  const p = bible.protagonist;
  return [p.appearance, p.hairstyle, p.clothing, p.distinguishingFeatures]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('. ');
}

/** Narration direction sent to the speech model (§10). */
export function buildNarrationInstructions(input: {
  languageCode: string;
  voiceGuidance: string | null;
  themeSlug: string;
}): string {
  const base = [
    `Read this children's story aloud in ${input.languageCode}, pronouncing every word with that language's native pronunciation.`,
    input.voiceGuidance ?? 'Read warmly and unhurriedly, as a parent reading at bedtime.',
    'Pause slightly at paragraph breaks. Give dialogue a light character without exaggeration.',
    'Never read out punctuation, page numbers or any instruction text.',
  ];
  if (input.themeSlug === 'bedtime') {
    base.push('This is a bedtime story: slow down gradually and soften towards the end.');
  }
  return base.join(' ');
}
