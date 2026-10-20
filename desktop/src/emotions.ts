// ─────────────────────────────────────────────────────────────────────────────
// Emotion builder data: groups of Russian-labelled directions with their English
// words for Drama 3, and an offline Russian → English translation of short voice
// descriptions ("устало, хрипло, почти шёпотом") by a built-in word list plus the
// words the user taught it. Directions are lists of short words, so a word list
// is enough; unknown words are reported for the user to translate.
// ─────────────────────────────────────────────────────────────────────────────

export type EmotionItem = {
  ru: string;
  en: string;
  /** Intensity words that go in front of the next word ("very tired"). */
  prefix?: boolean;
};

export type EmotionGroup = {
  id: string;
  title: string;
  /** Only one item of the group can be on. */
  single?: boolean;
  /** Items are separate sound tags ([sigh]), not words of the direction. */
  sounds?: boolean;
  items: EmotionItem[];
};

export const EMOTION_GROUPS: EmotionGroup[] = [
  {
    id: "intensity",
    title: "Сила",
    single: true,
    items: [
      { ru: "слегка", en: "slightly", prefix: true },
      { ru: "заметно", en: "noticeably", prefix: true },
      { ru: "очень", en: "very", prefix: true },
      { ru: "крайне", en: "extremely", prefix: true },
      { ru: "еле сдерживаясь", en: "barely holding back" },
      { ru: "наигранно", en: "theatrically" },
    ],
  },
  {
    id: "emotion",
    title: "Эмоция",
    items: [
      { ru: "радостно", en: "joyful" },
      { ru: "счастливо", en: "happy" },
      { ru: "восторженно", en: "delighted" },
      { ru: "весело", en: "cheerful" },
      { ru: "с облегчением", en: "relieved" },
      { ru: "нежно", en: "tender" },
      { ru: "ласково", en: "affectionate" },
      { ru: "с любовью", en: "loving" },
      { ru: "мечтательно", en: "dreamy" },
      { ru: "с надеждой", en: "hopeful" },
      { ru: "гордо", en: "proud" },
      { ru: "уверенно", en: "confident" },
      { ru: "спокойно", en: "calm" },
      { ru: "задумчиво", en: "thoughtful" },
      { ru: "с любопытством", en: "curious" },
      { ru: "удивлённо", en: "surprised" },
      { ru: "изумлённо", en: "astonished" },
      { ru: "растерянно", en: "confused" },
      { ru: "смущённо", en: "embarrassed" },
      { ru: "виновато", en: "guilty" },
      { ru: "робко", en: "shy" },
      { ru: "грустно", en: "sad" },
      { ru: "печально", en: "sorrowful" },
      { ru: "с тоской", en: "longing" },
      { ru: "разочарованно", en: "disappointed" },
      { ru: "обиженно", en: "hurt" },
      { ru: "с отчаянием", en: "desperate" },
      { ru: "с горем", en: "grief-stricken" },
      { ru: "тревожно", en: "anxious" },
      { ru: "нервно", en: "nervous" },
      { ru: "испуганно", en: "scared" },
      { ru: "в ужасе", en: "terrified" },
      { ru: "раздражённо", en: "irritated" },
      { ru: "зло", en: "angry" },
      { ru: "в ярости", en: "furious" },
      { ru: "с презрением", en: "contemptuous" },
      { ru: "с отвращением", en: "disgusted" },
      { ru: "ревниво", en: "jealous" },
      { ru: "подозрительно", en: "suspicious" },
      { ru: "скучающе", en: "bored" },
      { ru: "равнодушно", en: "indifferent" },
      { ru: "устало", en: "tired" },
      { ru: "сонно", en: "sleepy" },
      { ru: "пьяно", en: "drunk" },
      { ru: "больным голосом", en: "sick" },
    ],
  },
  {
    id: "voice",
    title: "Голос",
    items: [
      { ru: "шёпотом", en: "whispering" },
      { ru: "вполголоса", en: "under the breath" },
      { ru: "тихо", en: "quiet" },
      { ru: "громко", en: "loud" },
      { ru: "кричит", en: "shouting" },
      { ru: "хрипло", en: "hoarse" },
      { ru: "с придыханием", en: "breathy" },
      { ru: "дрожащим голосом", en: "trembling voice" },
      { ru: "сдавленно", en: "strained voice" },
      { ru: "сквозь слёзы", en: "through tears" },
      { ru: "на грани слёз", en: "on the verge of tears" },
      { ru: "сквозь смех", en: "through laughter" },
      { ru: "сквозь зубы", en: "through gritted teeth" },
      { ru: "запыхавшись", en: "out of breath" },
      { ru: "низким голосом", en: "low voice" },
      { ru: "высоким голосом", en: "high voice" },
      { ru: "звонко", en: "bright voice" },
      { ru: "мягко", en: "soft" },
      { ru: "бархатно", en: "velvety voice" },
      { ru: "глухо", en: "muffled" },
    ],
  },
  {
    id: "delivery",
    title: "Подача",
    items: [
      { ru: "насмешливо", en: "mocking" },
      { ru: "с иронией", en: "ironic" },
      { ru: "саркастично", en: "sarcastic" },
      { ru: "игриво", en: "playful" },
      { ru: "кокетливо", en: "flirty" },
      { ru: "заговорщически", en: "conspiratorial" },
      { ru: "таинственно", en: "mysterious" },
      { ru: "торжественно", en: "solemn" },
      { ru: "строго", en: "stern" },
      { ru: "властно", en: "commanding" },
      { ru: "угрожающе", en: "threatening" },
      { ru: "холодно", en: "cold" },
      { ru: "сухо", en: "dry" },
      { ru: "официально", en: "formal" },
      { ru: "дружелюбно", en: "friendly" },
      { ru: "тепло", en: "warm" },
      { ru: "умоляюще", en: "pleading" },
      { ru: "жалобно", en: "whiny" },
      { ru: "капризно", en: "capricious" },
      { ru: "по-детски", en: "childlike" },
      { ru: "как сказку", en: "storytelling" },
      { ru: "как диктор", en: "announcer" },
    ],
  },
  {
    id: "tempo",
    title: "Темп",
    items: [
      { ru: "быстро", en: "fast" },
      { ru: "торопливо", en: "hurried" },
      { ru: "медленно", en: "slow" },
      { ru: "размеренно", en: "measured" },
      { ru: "неуверенно, с запинками", en: "hesitant" },
      { ru: "отрывисто", en: "clipped" },
      { ru: "нараспев", en: "sing-song" },
    ],
  },
  {
    id: "who",
    title: "Кто говорит (для голоса none)",
    items: [
      { ru: "мужчина", en: "male voice" },
      { ru: "женщина", en: "female voice" },
      { ru: "низкий мужской", en: "deep male voice" },
      { ru: "мягкий женский", en: "soft female voice" },
      { ru: "старик", en: "old man" },
      { ru: "старушка", en: "old woman" },
      { ru: "ребёнок", en: "child" },
      { ru: "подросток", en: "teenager" },
      { ru: "молодая девушка", en: "young woman" },
      { ru: "молодой парень", en: "young man" },
    ],
  },
  {
    id: "sounds",
    title: "Звуки (отдельные теги)",
    sounds: true,
    items: [
      { ru: "вздох", en: "[sigh]" },
      { ru: "смех", en: "[laughs]" },
      { ru: "смешок", en: "[chuckles]" },
      { ru: "хихиканье", en: "[giggles]" },
      { ru: "всхлип", en: "[sobs]" },
      { ru: "плач", en: "[crying]" },
      { ru: "ахнуть", en: "[gasps]" },
      { ru: "кашель", en: "[coughs]" },
      { ru: "прочистить горло", en: "[clears throat]" },
      { ru: "зевок", en: "[yawns]" },
      { ru: "фыркнуть", en: "[scoffs]" },
      { ru: "шмыгнуть носом", en: "[sniffs]" },
      { ru: "хмыкнуть", en: "[hmm]" },
      { ru: "глубокий вдох", en: "[inhales deeply]" },
    ],
  },
];

// ─── Translation ───

/** Several words that mean one thing; matched before single words. */
const RU_PHRASES: Record<string, string> = {
  "сквозь слезы": "through tears",
  "сквозь смех": "through laughter",
  "сквозь зубы": "through gritted teeth",
  "на грани слез": "on the verge of tears",
  "почти шепотом": "almost whispering",
  "еле слышно": "barely audible",
  "еле сдерживаясь": "barely holding back",
  "с трудом сдерживаясь": "barely holding back",
  "не веря": "in disbelief",
  "не веря своим ушам": "in disbelief",
  "с комом в горле": "with a lump in the throat",
  "срывающимся голосом": "breaking voice",
  "дрожащим голосом": "trembling voice",
  "низким голосом": "low voice",
  "высоким голосом": "high voice",
  "как будто": "as if",
  "по-детски": "childlike",
  "по-доброму": "kindly",
  "по-дружески": "friendly",
  "в ужасе": "terrified",
  "в ярости": "furious",
  "в панике": "panicked",
  "в восторге": "delighted",
  "в шоке": "shocked",
  "в слезах": "in tears",
  "из последних сил": "exhausted",
  "с улыбкой": "smiling",
  "с легкой улыбкой": "with a slight smile",
  "с грустной улыбкой": "with a sad smile",
  "с усмешкой": "smirking",
  "с легкой усмешкой": "with a slight smirk",
  "с придыханием": "breathy",
  "с облегчением": "relieved",
  "с надеждой": "hopeful",
  "с тоской": "longing",
  "с горечью": "bitter",
  "с болью": "pained",
  "с иронией": "ironic",
  "с презрением": "contemptuous",
  "с отвращением": "disgusted",
  "с любопытством": "curious",
  "с любовью": "loving",
  "с нежностью": "tenderly",
  "с упреком": "reproachful",
  "с вызовом": "defiant",
  "с угрозой": "threatening",
  "с сомнением": "doubtful",
  "с интересом": "interested",
  "с гордостью": "proud",
  "с отчаянием": "desperate",
  "с раздражением": "irritated",
  "с восхищением": "admiring",
  "с сожалением": "regretful",
  "с паузами": "with pauses",
  "с запинками": "hesitant",
  "на одном дыхании": "in one breath",
  "под нос": "muttering",
  "себе под нос": "muttering to self",
  "как сказку": "storytelling",
  "как диктор": "announcer",
  "как ребенок": "childlike",
};

/** Russian words (any form; matched by stem) → English. "" = left out. */
const RU_WORDS: Record<string, string> = {
  // Little words
  "и": "", "а": "", "но": "but", "с": "with", "со": "with", "в": "", "во": "", "на": "", "к": "", "от": "",
  "не": "not", "без": "without", "почти": "almost", "чуть": "a little", "чуть-чуть": "a little",
  "слегка": "slightly", "немного": "a little", "очень": "very", "крайне": "extremely", "совсем": "completely",
  "заметно": "noticeably", "едва": "barely", "еле": "barely", "все": "", "более": "more", "менее": "less",
  "как": "like", "будто": "as if", "словно": "as if", "голос": "voice", "голосом": "voice", "тон": "tone",
  "тоном": "tone", "интонация": "intonation", "речь": "speech", "манера": "manner",
  // Feelings
  "радостный": "joyful", "радость": "joy", "счастливый": "happy", "счастье": "happiness", "веселый": "cheerful",
  "восторженный": "delighted", "восторг": "delight", "ликующий": "jubilant", "довольный": "pleased",
  "облегчение": "relief", "нежный": "tender", "нежность": "tenderness", "ласковый": "affectionate",
  "любящий": "loving", "любовь": "love", "мечтательный": "dreamy", "надежда": "hope", "гордый": "proud",
  "гордость": "pride", "уверенный": "confident", "спокойный": "calm", "спокойствие": "calm",
  "умиротворенный": "peaceful", "задумчивый": "thoughtful", "любопытный": "curious", "удивленный": "surprised",
  "удивление": "surprise", "изумленный": "astonished", "растерянный": "confused", "смущенный": "embarrassed",
  "стеснительный": "shy", "робкий": "shy", "виноватый": "guilty", "грустный": "sad", "грусть": "sadness",
  "печальный": "sorrowful", "печаль": "sorrow", "тоскливый": "melancholic", "тоска": "longing",
  "меланхоличный": "melancholic", "разочарованный": "disappointed", "обиженный": "hurt", "обида": "resentment",
  "отчаянный": "desperate", "отчаяние": "despair", "горе": "grief", "горький": "bitter", "горечь": "bitterness",
  "болезненный": "pained", "тревожный": "anxious", "тревога": "anxiety", "нервный": "nervous",
  "взволнованный": "excited", "волнение": "excitement", "испуганный": "scared", "страх": "fear",
  "напуганный": "frightened", "ужас": "horror", "паника": "panic", "раздраженный": "irritated",
  "раздражение": "irritation", "злой": "angry", "зло": "angry", "злость": "anger", "злобный": "spiteful",
  "сердитый": "angry", "гневный": "wrathful", "гнев": "wrath", "яростный": "furious", "ярость": "fury",
  "бешеный": "furious", "презрительный": "contemptuous", "презрение": "contempt", "брезгливый": "squeamish",
  "отвращение": "disgust", "ревнивый": "jealous", "подозрительный": "suspicious", "недоверчивый": "distrustful",
  "скучающий": "bored", "скучный": "bored", "равнодушный": "indifferent", "безразличный": "indifferent",
  "усталый": "tired", "уставший": "tired", "усталость": "fatigue", "измученный": "exhausted",
  "сонный": "sleepy", "пьяный": "drunk", "больной": "sick", "простуженный": "with a cold",
  "растроганный": "moved", "благодарный": "grateful", "сочувственный": "sympathetic", "сочувствие": "sympathy",
  "жалостливый": "pitying", "смиренный": "humble", "решительный": "determined", "упрямый": "stubborn",
  "дерзкий": "cheeky", "наглый": "insolent", "хитрый": "sly", "лукавый": "sly", "озорной": "mischievous",
  "восхищенный": "admiring", "влюбленный": "in love", "страстный": "passionate", "возбужденный": "excited",
  "шокированный": "shocked", "потрясенный": "stunned", "ошарашенный": "stunned", "недовольный": "displeased",
  "капризный": "capricious", "обреченный": "doomed", "безнадежный": "hopeless", "мрачный": "gloomy",
  "угрюмый": "sullen", "серьезный": "serious", "встревоженный": "alarmed", "загадочный": "mysterious",
  "таинственный": "mysterious", "торжественный": "solemn", "трагический": "tragic", "драматический": "dramatic",
  "драматичный": "dramatic", "истеричный": "hysterical", "истерика": "hysterics",
  // Voice
  "шепот": "whispering", "шепотом": "whispering", "шепчущий": "whispering", "вполголоса": "under the breath",
  "тихий": "quiet", "громкий": "loud", "крик": "shouting", "кричащий": "shouting", "кричит": "shouting",
  "хриплый": "hoarse", "сиплый": "husky", "охрипший": "hoarse", "придыхание": "breathy",
  "дрожащий": "trembling", "дрожь": "trembling", "сдавленный": "strained", "срывающийся": "breaking",
  "слеза": "tears", "слезы": "tears", "плачущий": "crying", "плач": "crying", "смех": "laughter",
  "смеющийся": "laughing", "улыбка": "smile", "улыбающийся": "smiling", "усмешка": "smirk",
  "запыхавшийся": "out of breath", "запыхавшись": "out of breath", "задыхающийся": "breathless",
  "низкий": "low", "высокий": "high", "глубокий": "deep", "звонкий": "bright", "мягкий": "soft",
  "бархатный": "velvety", "глухой": "muffled", "грубый": "rough", "резкий": "sharp", "писклявый": "squeaky",
  "густой": "rich", "теплый": "warm", "холодный": "cold", "ледяной": "icy", "металлический": "metallic",
  "носовой": "nasal", "гнусавый": "nasal", "басовитый": "bassy", "звучный": "resonant", "сухой": "dry",
  "легкий": "light", "тяжелый": "heavy", "слабый": "weak", "сильный": "strong",
  // Delivery
  "насмешливый": "mocking", "ироничный": "ironic", "ирония": "irony", "саркастичный": "sarcastic",
  "саркастический": "sarcastic", "сарказм": "sarcasm", "игривый": "playful", "кокетливый": "flirty",
  "заговорщический": "conspiratorial", "заговорщицкий": "conspiratorial", "строгий": "stern",
  "властный": "commanding", "угрожающий": "threatening", "угроза": "threat", "официальный": "formal",
  "дружелюбный": "friendly", "добрый": "kind", "умоляющий": "pleading", "мольба": "pleading",
  "жалобный": "whiny", "детский": "childlike", "наигранный": "theatrical", "театральный": "theatrical",
  "фальшивый": "fake", "искренний": "sincere", "вежливый": "polite", "грозный": "menacing",
  "надменный": "arrogant", "высокомерный": "arrogant", "снисходительный": "condescending",
  "небрежный": "casual", "ленивый": "lazy", "деловой": "businesslike", "убедительный": "persuasive",
  "вкрадчивый": "insinuating", "елейный": "unctuous", "шутливый": "joking", "задорный": "perky",
  "бодрый": "upbeat", "энергичный": "energetic", "вялый": "sluggish", "монотонный": "monotone",
  "выразительный": "expressive", "повествовательный": "narrative", "рассказчик": "narrator",
  "рассказчица": "narrator", "диктор": "announcer", "сказка": "fairy tale", "сказочник": "storyteller",
  "ворчливый": "grumpy", "ворчит": "grumbling", "бормочет": "muttering", "бормотание": "muttering",
  "мямлит": "mumbling",
  // Tempo
  "быстрый": "fast", "торопливый": "hurried", "медленный": "slow", "размеренный": "measured",
  "неуверенный": "hesitant", "запинка": "hesitant", "отрывистый": "clipped", "нараспев": "sing-song",
  "протяжный": "drawn-out", "пауза": "pause", "паузы": "pauses", "ровный": "even", "плавный": "smooth",
  // Who
  "мужской": "male", "мужчина": "man", "женский": "female", "женщина": "woman", "старик": "old man",
  "старый": "old", "пожилой": "elderly", "старушка": "old woman", "бабушка": "grandmother",
  "дедушка": "grandfather", "ребенок": "child", "мальчик": "boy", "девочка": "girl", "подросток": "teenager",
  "молодой": "young", "юный": "young", "девушка": "young woman", "парень": "young man",
};

const ENDINGS = [
  "ующими", "ающими", "ями", "ами", "ыми", "ими", "ого", "его", "ому", "ему",
  "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "ой", "ей", "ую", "юю", "ым", "им", "ом", "ем", "ах", "ях", "ов", "ев",
  "о", "а", "я", "ы", "и", "е", "у", "ю", "ь", "й",
];

function normalize(word: string): string {
  return word.toLowerCase().replace(/ё/g, "е");
}

function stem(word: string): string {
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
  }
  return word;
}

export const EMOTION_WORDS_STORAGE_KEY = "dramaStudio.emotionWords";

export function loadUserWords(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(EMOTION_WORDS_STORAGE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function saveUserWord(ru: string, en: string): void {
  const words = loadUserWords();
  words[normalize(ru)] = en.trim();
  try {
    localStorage.setItem(EMOTION_WORDS_STORAGE_KEY, JSON.stringify(words));
  } catch {
    // The taught words are a convenience.
  }
}

type WordMaps = { exact: Map<string, string>; stems: Map<string, string>; phrases: Map<string, string> };

function wordMaps(): WordMaps {
  const exact = new Map<string, string>();
  const stems = new Map<string, string>();
  const phrases = new Map<string, string>();
  const user = loadUserWords();
  for (const [ru, en] of Object.entries({ ...RU_WORDS, ...user })) {
    const key = normalize(ru);
    if (key.includes(" ")) {
      phrases.set(key, en);
      continue;
    }
    exact.set(key, en);
    if (!stems.has(stem(key)) || key in user) stems.set(stem(key), en);
  }
  for (const [ru, en] of Object.entries(RU_PHRASES)) phrases.set(normalize(ru), en);
  for (const [ru, en] of Object.entries(user)) if (normalize(ru).includes(" ")) phrases.set(normalize(ru), en);
  return { exact, stems, phrases };
}

export type Translation = { en: string; unknown: string[] };

/** "устало, хрипло, почти шёпотом" → "tired, hoarse, almost whispering". */
export function translateRu(text: string): Translation {
  const maps = wordMaps();
  const unknown: string[] = [];
  const out: string[] = [];
  const parts = normalize(text).split(/[,;.!?\n]+|\s+и\s+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    // Latin words are kept as they are: the user may mix in English.
    const words = part.split(/\s+/).filter(Boolean);
    const english: string[] = [];
    for (let i = 0; i < words.length; ) {
      let matched = 0;
      for (let n = Math.min(5, words.length - i); n >= 2; n--) {
        const phrase = words.slice(i, i + n).join(" ");
        const en = maps.phrases.get(phrase);
        if (en !== undefined) {
          if (en) english.push(en);
          matched = n;
          break;
        }
      }
      if (matched) {
        i += matched;
        continue;
      }
      const word = words[i].replace(/^[«"'(]+|[»"')]+$/g, "");
      i += 1;
      if (!word) continue;
      if (!/[а-я]/.test(word)) {
        english.push(word);
        continue;
      }
      const en = maps.exact.get(word) ?? maps.stems.get(stem(word));
      if (en === undefined) {
        if (!unknown.includes(word)) unknown.push(word);
        english.push(word);
      } else if (en) {
        english.push(en);
      }
    }
    const phrase = english.join(" ").trim();
    if (phrase) out.push(phrase);
  }
  return { en: out.join(", "), unknown };
}

export type EmotionChoice = Record<string, string[]>;

/** The direction built from the chosen items and the translated own words. */
export function buildEmotionTag(choice: EmotionChoice, ownEnglish: string): { tag: string; sounds: string; words: number } {
  const parts: string[] = [];
  const intensity = EMOTION_GROUPS[0].items.find((item) => choice.intensity?.includes(item.ru));
  for (const group of EMOTION_GROUPS) {
    if (group.id === "intensity" || group.sounds) continue;
    for (const item of group.items) if (choice[group.id]?.includes(item.ru)) parts.push(item.en);
  }
  if (ownEnglish.trim()) parts.push(...ownEnglish.split(",").map((p) => p.trim()).filter(Boolean));
  if (intensity) {
    if (intensity.prefix && parts.length > 0) parts[0] = `${intensity.en} ${parts[0]}`;
    else parts.push(intensity.en);
  }
  const sounds = EMOTION_GROUPS.find((g) => g.sounds)!.items
    .filter((item) => choice.sounds?.includes(item.ru))
    .map((item) => item.en)
    .join(" ");
  return { tag: parts.length > 0 ? `[${parts.join(", ")}]` : "", sounds, words: parts.length };
}

/** A short Russian label of the choice, for a remark button. */
export function emotionLabel(choice: EmotionChoice, ownRussian: string): string {
  const words: string[] = [];
  for (const group of EMOTION_GROUPS) for (const item of group.items) if (choice[group.id]?.includes(item.ru)) words.push(item.ru);
  if (ownRussian.trim()) words.push(ownRussian.trim());
  const label = words.join(", ");
  return label.length > 40 ? `${label.slice(0, 38)}…` : label;
}
