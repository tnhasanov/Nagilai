-- =====================================================================
-- Nagilai · 0009 · Reference data and business configuration
-- =====================================================================
-- Idempotent: safe to re-run after every deploy. Everything here is
-- *configuration*, not application logic -- an administrator changes it
-- from the admin panel, no deployment required (§18).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Languages (§13)
-- ---------------------------------------------------------------------
insert into public.languages (code, name_native, name_en, flag_emoji, is_story_language, is_ui_language, sort_order, style_guidance)
values
  ('az-AZ', 'Azərbaycan dili', 'Azerbaijani', '🇦🇿', true, true, 10,
   'Write in natural, idiomatic Azerbaijani as a native children''s author would - never a word-for-word translation of English. Use the full Azerbaijani alphabet correctly, including ə, ğ, ı, İ, ö, ş, ü and ç. Prefer native vocabulary and native sentence rhythm over borrowed Russian or English constructions. Respect vowel harmony and the agglutinative structure. Use warm, familiar forms of address appropriate for a small child.'),
  ('en-US', 'English', 'English', '🇬🇧', true, true, 20,
   'Write in warm, rhythmic English suited to being read aloud. Prefer concrete images over abstractions and short, musical sentences.'),
  ('ru-RU', 'Русский', 'Russian', '🇷🇺', true, true, 30,
   'Write in natural literary Russian for children. Use correct case endings and aspect, and the affectionate diminutives that Russian children''s literature uses. Avoid calques from English.'),
  ('tr-TR', 'Türkçe', 'Turkish', '🇹🇷', true, true, 40,
   'Write in natural, contemporary Turkish for children. Respect vowel harmony and agglutination, and use the warm storytelling register of Turkish children''s books.')
on conflict (code) do update
  set name_native = excluded.name_native,
      name_en = excluded.name_en,
      flag_emoji = excluded.flag_emoji,
      is_story_language = excluded.is_story_language,
      is_ui_language = excluded.is_ui_language,
      sort_order = excluded.sort_order,
      style_guidance = excluded.style_guidance;

-- ---------------------------------------------------------------------
-- Themes (§4)
-- ---------------------------------------------------------------------
insert into public.themes (slug, labels, icon, accent_color, prompt_guidance, min_age, max_age, is_custom_input, sort_order)
values
  ('adventure',
   '{"en-US":"Adventure","az-AZ":"Macəra","ru-RU":"Приключение","tr-TR":"Macera"}',
   'compass', '#F59E0B',
   'A journey with a clear goal, a growing obstacle and a satisfying arrival. Keep peril gentle and always resolvable by the child''s own courage or cleverness.', 3, 12, false, 10),
  ('bedtime',
   '{"en-US":"Bedtime","az-AZ":"Yuxu nağılı","ru-RU":"Сказка на ночь","tr-TR":"Uyku masalı"}',
   'moon', '#6366F1',
   'A calm, slowing story. Soft sensory detail, a gentle rhythm, and an ending that settles into sleep. No sudden excitement in the final pages.', 2, 9, false, 20),
  ('friendship',
   '{"en-US":"Friendship","az-AZ":"Dostluq","ru-RU":"Дружба","tr-TR":"Arkadaşlık"}',
   'heart-handshake', '#EC4899',
   'A small misunderstanding between friends, honestly felt and warmly repaired. Both characters are allowed to be right about something.', 3, 12, false, 30),
  ('space',
   '{"en-US":"Space","az-AZ":"Kosmos","ru-RU":"Космос","tr-TR":"Uzay"}',
   'rocket', '#3B82F6',
   'Wonder first, facts second. Real astronomy may appear but must stay woven into the adventure rather than lectured.', 4, 12, false, 40),
  ('dinosaurs',
   '{"en-US":"Dinosaurs","az-AZ":"Dinozavrlar","ru-RU":"Динозавры","tr-TR":"Dinozorlar"}',
   'bone', '#84CC16',
   'Friendly, characterful dinosaurs. Use real species names naturally. No hunting or predation on the page.', 3, 10, false, 50),
  ('animals',
   '{"en-US":"Animals","az-AZ":"Heyvanlar","ru-RU":"Животные","tr-TR":"Hayvanlar"}',
   'paw-print', '#10B981',
   'Animal companions with distinct voices and habits. Kindness to animals is shown through action, never stated as a rule.', 2, 10, false, 60),
  ('princess_fantasy',
   '{"en-US":"Princess & Magic","az-AZ":"Şahzadə və sehr","ru-RU":"Принцессы и волшебство","tr-TR":"Prenses ve büyü"}',
   'crown', '#A855F7',
   'Magic with rules. The child solves the problem; the magic assists but never rescues. Avoid rescue-by-royalty tropes.', 3, 11, false, 70),
  ('superhero',
   '{"en-US":"Superhero","az-AZ":"Super qəhrəman","ru-RU":"Супергерой","tr-TR":"Süper kahraman"}',
   'zap', '#EF4444',
   'The power is a metaphor for a real strength the child already has. Conflict is resolved by helping, not by fighting.', 4, 11, false, 80),
  ('nature',
   '{"en-US":"Nature","az-AZ":"Təbiət","ru-RU":"Природа","tr-TR":"Doğa"}',
   'trees', '#22C55E',
   'Close observation of the natural world: weather, seasons, small creatures. Sensory and unhurried.', 2, 11, false, 90),
  ('school',
   '{"en-US":"School","az-AZ":"Məktəb","ru-RU":"Школа","tr-TR":"Okul"}',
   'graduation-cap', '#0EA5E9',
   'Everyday school life at a child''s scale: a first day, a lost item, a shy classmate. Grounded and reassuring.', 4, 12, false, 100),
  ('family',
   '{"en-US":"Family","az-AZ":"Ailə","ru-RU":"Семья","tr-TR":"Aile"}',
   'users', '#F97316',
   'Warm family life. Be inclusive about family shapes and never assume a particular household composition.', 2, 11, false, 110),
  ('travel',
   '{"en-US":"Travel","az-AZ":"Səyahət","ru-RU":"Путешествие","tr-TR":"Seyahat"}',
   'plane', '#14B8A6',
   'Places rendered with genuine, respectful specificity. No national stereotypes or caricature.', 4, 12, false, 120),
  ('mystery',
   '{"en-US":"Mystery","az-AZ":"Sirli hadisə","ru-RU":"Загадка","tr-TR":"Gizem"}',
   'search', '#8B5CF6',
   'A puzzle the reader can solve alongside the child. Plant every clue fairly. The answer is always harmless.', 5, 12, false, 130),
  ('educational',
   '{"en-US":"Learning","az-AZ":"Öyrədici","ru-RU":"Обучающая","tr-TR":"Öğretici"}',
   'book-open', '#0891B2',
   'One idea, taught through story. The child discovers it by doing, not by being told.', 3, 12, false, 140),
  ('emotional_development',
   '{"en-US":"Feelings","az-AZ":"Hisslər","ru-RU":"Эмоции и чувства","tr-TR":"Duygular"}',
   'smile', '#FB7185',
   'Name the feeling honestly and let it be uncomfortable for a while before it eases. Never rush to reassurance.', 3, 11, false, 150),
  ('custom',
   '{"en-US":"My own idea","az-AZ":"Öz fikrim","ru-RU":"Своя история","tr-TR":"Kendi fikrim"}',
   'sparkles', '#EAB308',
   'Follow the parent''s description closely while still meeting every age-appropriateness and quality rule.', 2, 12, true, 900)
on conflict (slug) do update
  set labels = excluded.labels,
      icon = excluded.icon,
      accent_color = excluded.accent_color,
      prompt_guidance = excluded.prompt_guidance,
      min_age = excluded.min_age,
      max_age = excluded.max_age,
      is_custom_input = excluded.is_custom_input,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Educational objectives (§4)
-- ---------------------------------------------------------------------
insert into public.educational_objectives (slug, category, labels, prompt_guidance, min_age, max_age, sort_order)
values
  ('courage','values','{"en-US":"Courage","az-AZ":"Cəsarət","ru-RU":"Храбрость","tr-TR":"Cesaret"}','Courage is acting while still afraid - show the fear, then the small brave step.',3,12,10),
  ('kindness','values','{"en-US":"Kindness","az-AZ":"Xeyirxahlıq","ru-RU":"Доброта","tr-TR":"İyilik"}','Kindness costs the character something small. Show the cost.',2,12,20),
  ('sharing','values','{"en-US":"Sharing","az-AZ":"Bölüşmək","ru-RU":"Умение делиться","tr-TR":"Paylaşmak"}','Sharing is genuinely hard at first. Let the reluctance be real before it turns.',2,8,30),
  ('patience','values','{"en-US":"Patience","az-AZ":"Səbir","ru-RU":"Терпение","tr-TR":"Sabır"}','Give waiting a texture - something to notice while time passes.',3,10,40),
  ('honesty','values','{"en-US":"Honesty","az-AZ":"Dürüstlük","ru-RU":"Честность","tr-TR":"Dürüstlük"}','The truth is told and the world does not end. Relief, not punishment.',4,12,50),
  ('confidence','emotional','{"en-US":"Confidence","az-AZ":"Özünə inam","ru-RU":"Уверенность в себе","tr-TR":"Özgüven"}','Confidence grows from one concrete success the child earns themselves.',4,12,60),
  ('curiosity','values','{"en-US":"Curiosity","az-AZ":"Maraq","ru-RU":"Любознательность","tr-TR":"Merak"}','A question drives the plot. Answering it opens a better question.',3,12,70),
  ('responsibility','values','{"en-US":"Responsibility","az-AZ":"Məsuliyyət","ru-RU":"Ответственность","tr-TR":"Sorumluluk"}','Something depends on the child. They forget once, then remember.',4,12,80),
  ('dealing_with_fear','emotional','{"en-US":"Facing fears","az-AZ":"Qorxunu yenmək","ru-RU":"Как справиться со страхом","tr-TR":"Korkuyla başa çıkmak"}','Name the fear plainly and shrink it by looking at it, not by denying it.',3,11,90),
  ('teamwork','values','{"en-US":"Teamwork","az-AZ":"Komanda işi","ru-RU":"Работа в команде","tr-TR":"Takım çalışması"}','Each character contributes something only they can. Nobody is a spare part.',4,12,100),
  ('mathematics','academic','{"en-US":"Numbers & maths","az-AZ":"Riyaziyyat","ru-RU":"Математика","tr-TR":"Matematik"}','Counting, comparing or simple arithmetic that the plot actually needs.',4,11,110),
  ('science','academic','{"en-US":"Science","az-AZ":"Elm","ru-RU":"Наука","tr-TR":"Bilim"}','One accurate scientific idea, correctly stated and age-appropriately simplified.',4,12,120),
  ('geography','academic','{"en-US":"Geography","az-AZ":"Coğrafiya","ru-RU":"География","tr-TR":"Coğrafya"}','Real places described respectfully and accurately.',5,12,130),
  ('history','academic','{"en-US":"History","az-AZ":"Tarix","ru-RU":"История","tr-TR":"Tarih"}','Historical setting handled gently and without violence or ideology.',6,12,140),
  ('vocabulary','academic','{"en-US":"New words","az-AZ":"Yeni sözlər","ru-RU":"Новые слова","tr-TR":"Yeni kelimeler"}','Introduce three to five new words and make each meaning obvious from context.',3,12,150)
on conflict (slug) do update
  set category = excluded.category,
      labels = excluded.labels,
      prompt_guidance = excluded.prompt_guidance,
      min_age = excluded.min_age,
      max_age = excluded.max_age,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Illustration styles (§8)
-- ---------------------------------------------------------------------
-- Every prefix describes technique, palette and mood only. None names or
-- alludes to a living artist.
insert into public.illustration_styles (slug, labels, prompt_prefix, negative_prompt, is_premium, sort_order)
values
  ('storybook',
   '{"en-US":"Storybook","az-AZ":"Nağıl kitabı","ru-RU":"Книжная иллюстрация","tr-TR":"Masal kitabı"}',
   'A warm classic children''s picture-book illustration. Soft rounded shapes, gentle outlines, hand-painted texture, generous negative space, a cosy inviting palette of creams, warm ochres and muted blues. Friendly proportions, expressive faces, natural soft lighting.',
   'photorealism, harsh shadows, horror, text, watermark, signature, logo, extra limbs, distorted hands, uncanny faces',
   false, 10),
  ('watercolour',
   '{"en-US":"Watercolour","az-AZ":"Akvarel","ru-RU":"Акварель","tr-TR":"Suluboya"}',
   'A delicate watercolour illustration on textured paper. Translucent washes, soft bleeding edges, visible paper grain, light pencil under-drawing, an airy pastel palette with plenty of white space.',
   'photorealism, heavy black outlines, digital gloss, text, watermark, signature, distorted hands',
   false, 20),
  ('animated_3d',
   '{"en-US":"3D animated","az-AZ":"3D animasiya","ru-RU":"3D-анимация","tr-TR":"3B animasyon"}',
   'A bright stylised 3D-animated film still. Soft global illumination, rounded appealing character design, subsurface-scattered skin, shallow depth of field, saturated cheerful colours, clean uncluttered composition.',
   'photorealistic human, uncanny valley, horror, text, watermark, distorted hands, extra fingers',
   false, 30),
  ('soft_fantasy',
   '{"en-US":"Soft fantasy","az-AZ":"Yumşaq fantaziya","ru-RU":"Мягкое фэнтези","tr-TR":"Yumuşak fantezi"}',
   'A dreamlike fantasy illustration with luminous rim lighting, drifting motes of light, layered atmospheric depth, a twilight palette of lavender, teal and warm gold. Gentle and wondrous, never frightening.',
   'dark horror, grim, gore, weapons, text, watermark, distorted hands',
   false, 40),
  ('classic_illustration',
   '{"en-US":"Classic","az-AZ":"Klassik","ru-RU":"Классическая","tr-TR":"Klasik"}',
   'A timeless mid-century children''s book illustration. Limited three or four colour palette, screen-printed texture, confident flat shapes, subtle misregistration, decorative patterning.',
   'photorealism, gradient mesh, neon, text, watermark, distorted hands',
   false, 50),
  ('paper_collage',
   '{"en-US":"Paper collage","az-AZ":"Kağız kollaj","ru-RU":"Бумажный коллаж","tr-TR":"Kâğıt kolaj"}',
   'A handmade cut-paper collage. Layered torn and cut coloured paper with visible fibre edges, soft drop shadows between layers, tactile matte surfaces, bold simple silhouettes.',
   'photorealism, 3d render, text, watermark, distorted hands',
   true, 60)
on conflict (slug) do update
  set labels = excluded.labels,
      prompt_prefix = excluded.prompt_prefix,
      negative_prompt = excluded.negative_prompt,
      is_premium = excluded.is_premium,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Narration voices (§10)
-- ---------------------------------------------------------------------
-- `supported_language_codes = '{}'` means "all languages". The OpenAI
-- speech models are multilingual and take their pronunciation from the
-- text, so voice choice is about character, not language.
insert into public.voices (slug, provider, provider_voice_id, labels, description, supported_language_codes, delivery_guidance, is_premium, sort_order)
values
  ('storyteller', 'openai', 'fable',
   '{"en-US":"Storyteller","az-AZ":"Nağılçı","ru-RU":"Сказочник","tr-TR":"Masalcı"}',
   'Warm and expressive, like a parent reading at bedtime.', '{}',
   'Read as a bedtime story: unhurried, warm, gently expressive. Pause a beat at the end of each sentence. Let dialogue have character without becoming cartoonish.', false, 10),
  ('gentle', 'openai', 'shimmer',
   '{"en-US":"Gentle","az-AZ":"Mülayim","ru-RU":"Нежный","tr-TR":"Yumuşak"}',
   'Soft and calming - the quietest voice, made for falling asleep to.', '{}',
   'Read very softly and slowly, almost a whisper. Keep the pitch even and soothing throughout.', false, 20),
  ('bright', 'openai', 'nova',
   '{"en-US":"Bright","az-AZ":"Şən","ru-RU":"Светлый","tr-TR":"Neşeli"}',
   'Lively and cheerful, good for adventures.', '{}',
   'Read with bright energy and a smile in the voice. Lift into moments of surprise and delight.', false, 30),
  ('warm', 'openai', 'coral',
   '{"en-US":"Warm","az-AZ":"İsti","ru-RU":"Тёплый","tr-TR":"Sıcak"}',
   'Rounded and affectionate.', '{}',
   'Read affectionately and close, as if sitting beside the child.', false, 40),
  ('calm', 'openai', 'alloy',
   '{"en-US":"Calm","az-AZ":"Sakit","ru-RU":"Спокойный","tr-TR":"Sakin"}',
   'Clear and neutral.', '{}',
   'Read clearly and steadily with light natural expression.', false, 50),
  ('deep', 'openai', 'onyx',
   '{"en-US":"Deep","az-AZ":"Dərin","ru-RU":"Глубокий","tr-TR":"Derin"}',
   'Low and reassuring, like a grandfather''s voice.', '{}',
   'Read low, slow and reassuring, with weight on the important words.', false, 60)
on conflict (slug) do update
  set provider_voice_id = excluded.provider_voice_id,
      labels = excluded.labels,
      description = excluded.description,
      delivery_guidance = excluded.delivery_guidance,
      is_premium = excluded.is_premium,
      sort_order = excluded.sort_order;

update public.languages l
   set default_voice_id = v.id
  from public.voices v
 where v.slug = 'storyteller' and l.default_voice_id is null;

-- ---------------------------------------------------------------------
-- Business configuration (§16, §17, §18)
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, description, is_public) values
  ('credits',
   jsonb_build_object(
     'signup_grant', 3,
     'story_text', 1,
     'story_illustration', 1,
     'story_narration', 1,
     'story_pdf_hq', 0
   ),
   'Credit grants and per-operation costs. `story_illustration` is charged per image.', true),

  ('ai_models',
   jsonb_build_object(
     'text', 'gpt-5',
     'text_fallback', 'gpt-5-mini',
     'image', 'gpt-image-1',
     'image_size', '1024x1024',
     'image_quality', 'medium',
     'tts', 'gpt-4o-mini-tts',
     'tts_format', 'mp3',
     'moderation', 'omni-moderation-latest'
   ),
   'Model identifiers per capability. Changing these takes effect on the next generation - no deployment needed.', false),

  ('ai_pricing',
   jsonb_build_object(
     'text', jsonb_build_object(
       'gpt-5', jsonb_build_object('input_micro_usd_per_1k', 1250, 'output_micro_usd_per_1k', 10000, 'cached_input_micro_usd_per_1k', 125),
       'gpt-5-mini', jsonb_build_object('input_micro_usd_per_1k', 250, 'output_micro_usd_per_1k', 2000, 'cached_input_micro_usd_per_1k', 25)
     ),
     'image', jsonb_build_object(
       'gpt-image-1', jsonb_build_object('low', 11000, 'medium', 42000, 'high', 167000)
     ),
     'speech', jsonb_build_object(
       'gpt-4o-mini-tts', jsonb_build_object('micro_usd_per_1k_characters', 600)
     )
   ),
   'Estimated provider unit costs used for internal cost reporting. VERIFY against the current OpenAI price list before relying on these figures for margin decisions.', false),

  ('generation_limits',
   jsonb_build_object(
     'short',  jsonb_build_object('pages', 6,  'words_per_page', 40,  'max_output_tokens', 3000),
     'medium', jsonb_build_object('pages', 10, 'words_per_page', 70,  'max_output_tokens', 6000),
     'long',   jsonb_build_object('pages', 16, 'words_per_page', 110, 'max_output_tokens', 12000),
     'max_pages', 24,
     'max_custom_instruction_chars', 600
   ),
   'Translation of the parent-facing Short/Medium/Long choice into generation limits.', false),

  ('rate_limits',
   jsonb_build_object(
     'story_create', jsonb_build_object('limit', 10, 'window_seconds', 3600),
     'illustration', jsonb_build_object('limit', 60, 'window_seconds', 3600),
     'narration',    jsonb_build_object('limit', 40, 'window_seconds', 3600),
     'pdf',          jsonb_build_object('limit', 20, 'window_seconds', 3600),
     'share_create', jsonb_build_object('limit', 30, 'window_seconds', 3600),
     'auth',         jsonb_build_object('limit', 20, 'window_seconds', 900)
   ),
   'Per-user request budgets for expensive operations.', false),

  ('plan_limits',
   jsonb_build_object(
     'free',    jsonb_build_object('max_children', 2, 'max_stories_per_month', 3, 'allow_premium_styles', false, 'max_length', 'medium'),
     'family',  jsonb_build_object('max_children', 5, 'max_stories_per_month', 30, 'allow_premium_styles', true, 'max_length', 'long'),
     'premium', jsonb_build_object('max_children', 10, 'max_stories_per_month', 100, 'allow_premium_styles', true, 'max_length', 'long')
   ),
   'Entitlements per subscription tier.', true),

  ('features',
   jsonb_build_object(
     'illustrations_enabled', true,
     'narration_enabled', true,
     'pdf_enabled', true,
     'sharing_enabled', true,
     'child_photo_upload_enabled', false,
     'remix_enabled', true,
     'payments_enabled', false,
     'printing_enabled', false,
     'guest_preview_enabled', true
   ),
   'Feature flags. Photo upload, payments and printing stay off until their legal and provider prerequisites are signed off.', true),

  ('branding',
   jsonb_build_object(
     'tagline', jsonb_build_object(
       'en-US', 'Your child. Their imagination. Their own story.',
       'az-AZ', 'Sizin uşağınız. Onun xəyalları. Onun öz nağılı.',
       'ru-RU', 'Ваш ребёнок. Его воображение. Его собственная история.',
       'tr-TR', 'Çocuğunuz. Onun hayal gücü. Kendi hikâyesi.'
     ),
     'support_email', 'hello@nagilai.com'
   ),
   'Public marketing strings.', true),

  ('safety',
   jsonb_build_object(
     'blocked_input_categories', jsonb_build_array(
       'sexual', 'sexual/minors', 'violence/graphic', 'self-harm', 'self-harm/intent',
       'self-harm/instructions', 'hate', 'hate/threatening', 'harassment/threatening', 'illicit/violent'
     ),
     'max_child_age', 12,
     'min_child_age', 2
   ),
   'Moderation categories that block generation outright.', false)
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      is_public = excluded.is_public;

-- ---------------------------------------------------------------------
-- Products and prices (Phase 2/3 scaffolding, inactive by default)
-- ---------------------------------------------------------------------
insert into public.products (slug, kind, labels, descriptions, features, credits_granted, is_active, sort_order)
values
  ('plan_free', 'subscription_plan',
   '{"en-US":"Free","az-AZ":"Pulsuz","ru-RU":"Бесплатно","tr-TR":"Ücretsiz"}',
   '{"en-US":"Try Nagilai with a few stories a month."}',
   '{"max_children":2,"monthly_story_credits":3,"premium_styles":false}', 3, true, 10),
  ('plan_family', 'subscription_plan',
   '{"en-US":"Family","az-AZ":"Ailə","ru-RU":"Семейный","tr-TR":"Aile"}',
   '{"en-US":"For families who read together every week."}',
   '{"max_children":5,"monthly_story_credits":30,"premium_styles":true,"hq_pdf":true}', 30, false, 20),
  ('plan_premium', 'subscription_plan',
   '{"en-US":"Premium","az-AZ":"Premium","ru-RU":"Премиум","tr-TR":"Premium"}',
   '{"en-US":"Unlimited imagination, premium art styles and printing discounts."}',
   '{"max_children":10,"monthly_story_credits":100,"premium_styles":true,"hq_pdf":true,"print_discount_percent":15}', 100, false, 30),
  ('credits_10', 'credit_pack',
   '{"en-US":"10 credits","az-AZ":"10 kredit","ru-RU":"10 кредитов","tr-TR":"10 kredi"}',
   '{"en-US":"A small top-up."}', '{}', 10, false, 40),
  ('credits_50', 'credit_pack',
   '{"en-US":"50 credits","az-AZ":"50 kredit","ru-RU":"50 кредитов","tr-TR":"50 kredi"}',
   '{"en-US":"Best value top-up."}', '{}', 50, false, 50),
  ('book_a5_softcover', 'printed_book',
   '{"en-US":"A5 softcover","az-AZ":"A5 yumşaq cild","ru-RU":"A5 мягкая обложка","tr-TR":"A5 karton kapak"}',
   '{"en-US":"A pocket-sized keepsake edition."}', '{}', null, false, 60),
  ('book_a4_hardcover', 'printed_book',
   '{"en-US":"A4 hardcover","az-AZ":"A4 sərt cild","ru-RU":"A4 твёрдая обложка","tr-TR":"A4 sert kapak"}',
   '{"en-US":"A full-size hardcover book, printed and bound."}', '{}', null, false, 70)
on conflict (slug) do update
  set labels = excluded.labels,
      descriptions = excluded.descriptions,
      features = excluded.features,
      credits_granted = excluded.credits_granted,
      sort_order = excluded.sort_order;

update public.products
   set book_trim_size = 'a5', book_binding = 'softcover', book_page_capacity = 32
 where slug = 'book_a5_softcover';

update public.products
   set book_trim_size = 'a4', book_binding = 'hardcover', book_page_capacity = 32
 where slug = 'book_a4_hardcover';
