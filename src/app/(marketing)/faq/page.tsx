import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { SectionHeading } from '@/components/ui/card';

/**
 * FAQ (§20).
 *
 * Written for the questions a parent actually asks before paying: is my
 * child's data safe, how good are the stories really, what happens to the
 * books I have made, and can I get a physical copy.
 */
export const metadata: Metadata = {
  title: 'Questions',
  description: 'How Nagilai works, how your child’s information is handled, and what you get.',
  alternates: { canonical: '/faq' },
};

const FAQ = [
  {
    q: 'How personalised is the story, really?',
    a: 'Your child is the protagonist by name, and two or three details from their profile — a favourite animal, something they are curious about, a personality trait — are woven into what happens rather than listed. The same child with the same theme gets a different story each time.',
  },
  {
    q: 'What happens to my child’s information?',
    a: 'It is stored against your account, visible only to you, and never published. It is not used to train any model. Stories are private by default; a link is only created when you deliberately make one, and you can revoke it at any moment. You can export or delete everything from Settings.',
  },
  {
    q: 'Do I need to upload a photograph?',
    a: 'No. Photograph upload is switched off. If you want the illustrations to resemble your child, you can write a short description of how they look, and that description is reused across every page so the character stays consistent.',
  },
  {
    q: 'Which languages can stories be written in?',
    a: 'Azerbaijani, English, Russian and Turkish. Each story is written natively in its language rather than translated from English, so the rhythm and idiom belong to that language. The app’s own interface language is a separate setting — you can browse in one language and make stories in another.',
  },
  {
    q: 'Is the content safe for young children?',
    a: 'Every request you write and every story that comes back is checked before you see it. The stories themselves are constrained to gentle, resolvable situations: no injury, no cruelty, and nothing frightening left unresolved at the end of the book.',
  },
  {
    q: 'Can I get a real printed book?',
    a: 'You can download a print-quality PDF today, laid out properly with a cover, a dedication and page numbers — not a printout of a web page. Ordering a professionally printed and bound copy is coming.',
  },
  {
    q: 'What if a story or a picture comes out wrong?',
    a: 'You are not charged for anything that fails, and you can retry just the part that went wrong rather than remaking the whole book. You can also make another version of a story — a different ending, a different length, another language — and the original is kept exactly as it was.',
  },
  {
    q: 'Who reads the stories aloud?',
    a: 'A synthesised voice, chosen by you, reading in the story’s own language. The audio is generated once and kept, so pressing play again costs nothing and works instantly.',
  },
];

export default function FaqPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading title="Questions parents ask" align="center" className="mb-14" />

        <dl className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q} className="card">
              <dt className="font-display text-lg font-bold text-ink">{item.q}</dt>
              <dd className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-soft">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Shell>
  );
}
