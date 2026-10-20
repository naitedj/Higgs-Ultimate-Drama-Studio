// ─────────────────────────────────────────────────────────────────────────────
// Lightweight EN→RU localization.
//
// The upstream app has no i18n and hard-codes English throughout index.html and
// main.ts. Rather than annotate every element, we keep a dictionary keyed by the
// exact English source string and translate in two ways:
//   • translateStaticDom() walks the DOM once on load, replacing matching text
//     nodes and the placeholder / title / aria-label / data-tip attributes.
//   • t(en) translates dynamic strings created in JS (toasts, chips, statuses).
// Only exact known strings are touched, so code snippets and numbers are safe.
//
// Default language is Russian. Switching language reloads so the original
// English markup is restored cleanly.
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = "ru" | "en";

export const LANG_STORAGE_KEY = "higgsAudio.lang";

export function getLang(): Lang {
  return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "ru";
}

export function setLang(lang: Lang): void {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  window.location.reload();
}

// English source string → Russian.
export const RU: Record<string, string> = {
  // ── Topbar ──
  "Neural TTS · Voice Cloning · Audio Continuation": "Нейросетевой TTS · Клонирование голоса · Продолжение аудио",
  "API server status": "Статус API-сервера",
  "API server stopped": "API-сервер остановлен",
  "Show active download": "Показать активную загрузку",
  "Settings": "Настройки",
  "Engine unloaded": "Движок не загружен",
  "Engine loaded": "Движок загружен",
  "No model": "Нет модели",

  // ── Model panel ──
  "Model": "Модель",
  "Not loaded": "Не загружено",
  "Loaded": "Загружено",
  "Loading…": "Загрузка…",
  "Error": "Ошибка",
  "Select a model…": "Выберите модель…",
  "📁 Browse…": "📁 Обзор…",
  "⬇ Download": "⬇ Скачать",
  "Load Engine": "Загрузить движок",
  "Load Model": "Загрузить модель",
  "Unload": "Выгрузить",
  "⬇ Download Engine DLLs": "⬇ Скачать DLL движка",

  // ── Whisper panel ──
  "Choose model": "Выбрать модель",
  "Parakeet model": "Модель Parakeet",
  "Selected folder": "Выбранная папка",
  "Select the Parakeet model folder…": "Выберите папку модели Parakeet…",
  "Select ggml-base.en.bin…": "Выберите файл ggml…",

  // ── Hardware panel ──
  "Hardware": "Оборудование",
  "Poll": "Опрос",
  "Hardware monitor polling interval.": "Интервал опроса монитора оборудования.",
  "Collapse hardware": "Свернуть оборудование",
  "Power": "Питание",
  "Waiting for GPU data": "Ожидание данных GPU",

  // ── Queue ──
  "Queue Manager": "Очередь",
  "Idle": "Простаивает",
  "Clear": "Очистить",
  "Nothing generating": "Ничего не генерируется",

  // ── Mode tabs ──
  "Voice Clone": "Клон голоса",
  "Continue Speech": "Продолжить речь",
  "Multi Speaker": "Мультиспикер",
  "Speaker Gallery": "Галерея голосов",
  "History": "История",

  // ── TTS / Clone / Finish shared ──
  "Text to speak": "Текст для озвучки",
  "Type or paste text here…": "Введите или вставьте текст…",
  "Saved speaker identity (optional)": "Сохранённый голос (необязательно)",
  "Saved speaker identity": "Сохранённый голос",
  "Optional. Pick one from Speaker Gallery, or ignore this and upload a one-off reference below.":
    "Необязательно. Выберите голос из Галереи или загрузите разовый референс ниже.",
  "Reference voice": "Референс-голос",
  "Drop audio file or click to browse": "Перетащите аудио или нажмите для выбора",
  "⤒ Drop audio file here, or click to browse": "⤒ Перетащите аудио сюда или нажмите для выбора",
  "⤒ Drop reference voice here, or click to browse": "⤒ Перетащите референс-голос сюда или нажмите для выбора",
  "⤒ Drop the clip to continue, or click to browse": "⤒ Перетащите клип для продолжения или нажмите для выбора",
  "mp3 · wav · flac · m4a — auto-cropped to 30s": "mp3 · wav · flac · m4a — авто-обрезка до 30с",
  "Play reference": "Воспроизвести референс",
  "Play speaker reference": "Воспроизвести референс голоса",
  "Normalize reference": "Нормализовать референс",
  "Reference transcript (optional)": "Транскрипт референса (необязательно)",
  "Reference transcript": "Транскрипт референса",
  "✦ Auto-transcribe": "✦ Автотранскрипт",
  "What the reference audio says…": "Что говорит референс-аудио…",
  "What this reference voice says…": "Что говорит этот референс-голос…",
  "ⓘ Improves cloning fidelity. Leave blank to skip. Only clone voices you have permission to use.":
    "ⓘ Повышает точность клонирования. Можно оставить пустым. Клонируйте только голоса, на которые есть разрешение.",

  // ── Speaker Gallery ──
  "+ Speaker": "+ Голос",
  "Download the standard Nerual Dreming voice pack and add all voices to the gallery":
    "Скачать стандартный войспак Nerual Dreming и добавить все голоса в галерею",
  "Standard voices": "Стандартные голоса",
  "Import": "Импорт",
  "Export": "Экспорт",
  "Delete": "Удалить",
  "Add or replace display picture": "Добавить или заменить фото",
  "Speaker name": "Имя голоса",
  "Remove photo": "Удалить фото",
  "Drop speaker reference audio or click to browse": "Перетащите референс-аудио голоса или нажмите для выбора",
  "Source / consent notes": "Источник / заметки о согласии",
  "Where this reference came from, usage permission, character notes, etc.":
    "Откуда взят референс, разрешение на использование, заметки о персонаже и т.п.",

  // ── Continue Speech ──
  "What should be spoken after the input audio…": "Что должно прозвучать после входного аудио…",
  "ⓘ The text to generate after the input audio ends.": "ⓘ Текст, который будет сгенерирован после окончания входного аудио.",
  "Optional. Use a saved speaker as the continuation source, or upload a one-off clip below.":
    "Необязательно. Возьмите сохранённый голос как источник продолжения или загрузите разовый клип ниже.",
  "Audio to continue": "Аудио для продолжения",
  "Voice transcript": "Транскрипт голоса",
  "What the input audio says — type it or use auto-transcribe":
    "Что говорит входное аудио — впишите или используйте автотранскрипт",
  "Include whole audio": "Включить всё аудио",
  "ⓘ Transcript of the input audio. Improves continuation quality.":
    "ⓘ Транскрипт входного аудио. Улучшает качество продолжения.",

  // ── Multi Speaker ──
  "Speakers": "Спикеры",
  "Apply": "Применить",
  "Import IDs": "Импорт ID",
  "Export IDs": "Экспорт ID",
  "Speech Lines": "Реплики",
  "[Speaker1] First line\n[Speaker2] Reply line": "[Спикер1] Первая реплика\n[Спикер2] Ответная реплика",
  "Import tagged script": "Импорт размеченного сценария",
  "Clear lines": "Очистить реплики",
  "+ Line": "+ Реплика",

  // ── Advanced options ──
  "▸ Advanced options": "▸ Расширенные настройки",
  "Temperature": "Температура",
  "Default: 1.00. Controls sampling randomness. Higher is more varied; lower is more stable and repeatable.":
    "По умолчанию 1.00. Управляет случайностью сэмплирования. Больше — разнообразнее; меньше — стабильнее и воспроизводимее.",
  "Default: 50. Samples from only the top K likely tokens. 0 usually disables this filter.":
    "По умолчанию 50. Сэмплирует только из топ-K вероятных токенов. 0 обычно отключает фильтр.",
  "Default: 0.95. Nucleus sampling. Lower values keep output closer to the most likely tokens.":
    "По умолчанию 0.95. Nucleus-сэмплирование. Меньшие значения держат вывод ближе к самым вероятным токенам.",
  "Seed": "Сид",
  "Default: 0, Fixed. Controls repeatable randomness. Random changes every generation; increment and decrement step by 1 after each generation.":
    "По умолчанию 0, Фикс. Управляет воспроизводимой случайностью. «Случайно» меняется каждый раз; инкремент/декремент шагают на 1 после каждой генерации.",
  "Fixed": "Фикс.",
  "Increment": "Инкремент",
  "Decrement": "Декремент",
  "Random": "Случайно",
  "Randomize seed now": "Случайный сид сейчас",
  "Emotion": "Эмоция",
  "Default: None. Adds an optional emotion delivery tag when supported by the active Higgs backend/model.":
    "По умолчанию Нет. Добавляет тег эмоции, если поддерживается активным движком/моделью.",
  "None": "Нет",
  "Elation": "Ликование",
  "Amusement": "Веселье",
  "Enthusiasm": "Энтузиазм",
  "Determination": "Решимость",
  "Pride": "Гордость",
  "Contentment": "Удовлетворение",
  "Affection": "Нежность",
  "Relief": "Облегчение",
  "Contemplation": "Задумчивость",
  "Confusion": "Смятение",
  "Surprise": "Удивление",
  "Awe": "Трепет",
  "Longing": "Тоска",
  "Arousal": "Возбуждение",
  "Anger": "Гнев",
  "Fear": "Страх",
  "Disgust": "Отвращение",
  "Bitterness": "Горечь",
  "Sadness": "Грусть",
  "Shame": "Стыд",
  "Helplessness": "Беспомощность",
  "Style": "Стиль",
  "Default: None. Adds an optional style tag such as singing, shouting, or whispering when supported.":
    "По умолчанию Нет. Добавляет тег стиля (пение, крик, шёпот), если поддерживается.",
  "Singing": "Пение",
  "Shouting": "Крик",
  "Whispering": "Шёпот",
  "Speed": "Скорость",
  "Default: None. Adds an optional speaking-speed tag. Use only when the backend/model supports it.":
    "По умолчанию Нет. Добавляет тег скорости речи. Используйте, если движок/модель поддерживает.",
  "Very slow": "Очень медленно",
  "Slow": "Медленно",
  "Fast": "Быстро",
  "Very fast": "Очень быстро",
  "Pitch": "Высота тона",
  "Default: None. Adds an optional low/high pitch tag when supported by the backend/model.":
    "По умолчанию Нет. Добавляет тег низкой/высокой тональности, если поддерживается.",
  "Low": "Низкий",
  "High": "Высокий",
  "Expressiveness": "Выразительность",
  "Default: None. Adds an optional high/low expressiveness tag when supported.":
    "По умолчанию Нет. Добавляет тег высокой/низкой выразительности, если поддерживается.",
  "Max tokens": "Макс. токенов",
  "Default: 1024. Caps generated token count. Higher allows longer output but reserves more runtime KV/graph memory up front.":
    "По умолчанию 1024. Ограничивает число токенов. Больше — длиннее вывод, но больше памяти KV/графа резервируется заранее.",
  "Longform chunking": "Разбивка длинного текста",
  "Default: Off. Splits long text into smaller generations and joins the results. Useful for long passages.":
    "По умолчанию Выкл. Делит длинный текст на части и склеивает результаты. Полезно для длинных фрагментов.",
  "Chunk size": "Размер фрагмента",
  "Default: 45. Approximate text chunk size used only when longform chunking is enabled.":
    "По умолчанию 45. Примерный размер фрагмента текста, применяется только при включённой разбивке.",
  "Pause (sec)": "Пауза (сек)",
  "Default: 0.15 sec. Adds silence between chunks when longform chunking is enabled.":
    "По умолчанию 0.15 сек. Добавляет тишину между фрагментами при включённой разбивке.",
  "Speaker pause": "Пауза между спикерами",
  "Default: 0.15 sec. Multi Speaker only. Adds silence between generated speaker lines after they are stitched together.":
    "По умолчанию 0.15 сек. Только для мультиспикера. Добавляет тишину между репликами спикеров при склейке.",

  // ── API panel ──
  "Local API": "Локальный API",
  "Stopped": "Остановлен",
  "Running": "Работает",
  "API Info": "О API",
  "Start": "Старт",
  "Stop": "Стоп",
  "Host": "Хост",
  "Port": "Порт",
  "API key": "Ключ API",
  "Base URL": "Базовый URL",
  "Show API key": "Показать ключ API",
  "Generate key": "Сгенерировать ключ",
  "Copy base URL": "Копировать базовый URL",
  "Copy key": "Копировать ключ",
  "Copy curl": "Копировать curl",
  "Copy example": "Копировать пример",
  "Endpoints": "Эндпоинты",
  "Request Options": "Параметры запроса",
  "Command Centre": "Командный центр",
  "Pop out": "Открепить",
  "Copy": "Копировать",
  "All": "Все",
  "Info": "Инфо",
  "Warnings": "Предупреждения",
  "Errors": "Ошибки",
  "Requests": "Запросы",
  "Jobs": "Задачи",
  "Examples use the current Base URL and API key.": "Примеры используют текущий базовый URL и ключ API.",

  // ── History ──
  "Generation History": "История генераций",
  "Clear All": "Очистить всё",
  "No generations yet": "Пока нет генераций",

  // ── Generate / Output ──
  "▶ Generate": "▶ Генерировать",
  "⇉ Batch": "⇉ Пакет",
  "Batch: generate each line of text as a separate clip (Text to Speech and Voice Clone)":
    "Пакет: каждая строка текста генерируется как отдельный клип (TTS и Клон голоса)",
  "Add to Queue": "В очередь",
  "⏹ Cancel": "⏹ Отмена",
  "Output": "Результат",
  "Save audio": "Сохранить аудио",
  "Volume": "Громкость",

  // ── Settings popover ──
  "Theme": "Тема",
  "Dark": "Тёмная",
  "Light": "Светлая",
  "Accent": "Акцент",
  "Accent color": "Цвет акцента",
  "UI scale": "Масштаб интерфейса",
  "Language": "Язык",
  "Close settings": "Закрыть настройки",
  "Stream playback during generation": "Потоковое воспроизведение при генерации",
  "Requires a streaming-capable Higgs engine DLL. The current offline engine falls back to normal generation.":
    "Требуется потоковый DLL движка Higgs. Текущий офлайн-движок откатывается к обычной генерации.",
  "Minimize to tray on close": "Сворачивать в трей при закрытии",
  "Keeps the API and loaded model running in the background. Click the tray icon to restore.":
    "Оставляет API и загруженную модель работать в фоне. Клик по иконке в трее — восстановить.",
  "Quit app": "Выйти",

  // ── Download popover ──
  "Download Model": "Скачать модель",
  "Download Parakeet Model": "Скачать модель Parakeet",
  "Download Engine DLLs": "Скачать DLL движка",
  "Close": "Закрыть",
  "Model file": "Файл модели",
  "Paste HuggingFace GGUF URL…": "Вставьте ссылку на GGUF с HuggingFace…",
  "Parakeet ONNX model repo…": "Репозиторий ONNX-модели Parakeet…",
  "Engine package URL…": "URL пакета движка…",
  "Fetch": "Скачать",
  "Pause": "Пауза",
  "Resume": "Продолжить",

  // ── Speaker export modal ──
  "Export Speakers": "Экспорт голосов",
  "Select all": "Выбрать все",
  "Select none": "Снять выбор",
  "Cancel": "Отмена",
  "Export selected": "Экспорт выбранных",

  // ── First run wizard (dynamic) ──
  "Loaded and ready": "Загружено и готово",
  "Found:": "Найдено:",
  "Selected:": "Выбрано:",
  "Not found. Download the engine package or browse to audiocpp_engine.dll.":
    "Не найдено. Скачайте пакет движка или укажите файл audiocpp_engine.dll.",
  "Saved engine path not found:": "Сохранённый путь движка не найден:",
  "No Higgs model folder found. Download a model folder or browse to one.":
    "Папка модели Higgs не найдена. Скачайте модель или укажите папку вручную.",
  "Optional. Download only if you want auto-transcription.":
    "Необязательно. Скачайте, только если нужен авто-транскрипт.",
  "Core setup found. You can load anything not already loaded, or close this wizard.":
    "Основные файлы на месте. Загрузите то, что ещё не загружено, или закройте мастер.",
  "Some core setup files are missing. Use Browse if you already have them, or Download to fetch them.":
    "Не хватает основных файлов. Нажмите «Обзор», если они у вас уже есть, или «Скачать».",

  // ── First run wizard ──
  "First Run Setup": "Первый запуск",
  "Engine, model, then generate": "Движок, модель, затем генерация",
  "Checking local engine and model files...": "Проверка локальных файлов движка и модели…",
  "Engine DLLs": "DLL движка",
  "Checking engine package...": "Проверка пакета движка…",
  "Browse": "Обзор",
  "Download": "Скачать",
  "Load": "Загрузить",
  // ── System libraries block ──
  // ("VC++ runtime"/"NVIDIA driver" уже есть в секции Engine diagnostics ниже —
  //  не дублируем, TS запрещает повторные ключи в литерале.)
  "System libraries": "Системные библиотеки",
  "Core files": "Основные файлы",
  "CUDA runtime": "CUDA runtime",
  "Checking CUDA runtime DLLs...": "Проверка CUDA runtime DLL…",
  "Checking Visual C++ runtime DLLs...": "Проверка VC++ runtime DLL…",
  "Checking NVIDIA driver...": "Проверка драйвера NVIDIA…",
  "Open nvidia.com/drivers": "Открыть nvidia.com/drivers",
  "Higgs model folder": "Папка модели Higgs",
  "Checking downloaded model folders...": "Проверка скачанных папок моделей…",
  "Parakeet auto-transcribe": "Автотранскрипт Parakeet",
  "Optional. Needed only for auto reference transcripts.": "Необязательно. Нужно только для авто-транскриптов референса.",
  "Refresh": "Обновить",
  "Open Studio": "Открыть студию",

  // ── Engine diagnostics ──
  "Engine Dependency Check": "Проверка зависимостей движка",
  "Windows loader preflight": "Предпроверка загрузчика Windows",
  "Missing required DLLs": "Отсутствуют нужные DLL",
  "Detected DLLs": "Найденные DLL",
  "Search paths checked": "Проверенные пути поиска",
  "Copy diagnostics": "Копировать диагностику",
  "NVIDIA driver": "Драйвер NVIDIA",
  "VC++ runtime": "VC++ рантайм",
  "Download CUDA runtime": "Скачать CUDA runtime",
  "Download VC++ runtime": "Скачать VC++ runtime",

  // ── Toasts / statuses (dynamic) ──
  "A download is already running. Use Pause, Resume, or Stop.": "Загрузка уже идёт. Используйте Паузу, Продолжить или Стоп.",
  "Batch works in the Text to Speech and Voice Clone tabs": "Пакетный режим работает во вкладках TTS и Клон голоса",
  "Choose at least one speaker to export": "Выберите хотя бы один голос для экспорта",
  "Could not play that audio file": "Не удалось воспроизвести аудиофайл",
  "Could not prepare audio preview": "Не удалось подготовить превью аудио",
  "Create a speaker first": "Сначала создайте голос",
  "Download stopped": "Загрузка остановлена",
  "Downloading standard voice pack…": "Скачиваю стандартный войспак…",
  "Drop a reference voice before saving this identity": "Добавьте референс-голос перед сохранением",
  "Drop a reference voice first": "Сначала добавьте референс-голос",
  "Drop an audio file first": "Сначала добавьте аудиофайл",
  "Engine dependency missing. Opened repair details.": "Не хватает зависимости движка. Открыл детали для починки.",
  "History cleared": "История очищена",
  "Loaded queued item for editing": "Элемент очереди загружен для редактирования",
  "Model unloaded": "Модель выгружена",
  "No saved speakers to export": "Нет сохранённых голосов для экспорта",
  "Please enter text to speak (one clip per line)": "Введите текст (одна строка = один клип)",
  "Queue cleared": "Очередь очищена",
  "Queued item deleted": "Элемент очереди удалён",
  "Select a model first": "Сначала выберите модель",
  "Select a saved speaker identity first": "Сначала выберите сохранённый голос",
  "Select a speaker identity to delete": "Выберите голос для удаления",
  "Download the Parakeet model in Settings first": "Сначала скачайте модель Parakeet в настройках",
  "Speaker identity deleted": "Голос удалён",
  "Streaming needs an updated Higgs engine DLL; current DLL falls back to normal generation.":
    "Для стриминга нужен обновлённый DLL движка; текущий откатывается к обычной генерации.",
  "That speaker identity has no reference audio": "У этого голоса нет референс-аудио",
  "Use lines like [Speaker1] text to import a script": "Используйте строки вида [Speaker1] текст для импорта сценария",
  "Parakeet model downloaded": "Модель Parakeet скачана",
  "🎤 Record voice": "🎤 Записать голос",
  "or record your own voice with the microphone": "или запишите свой голос с микрофона",
  "Record voice": "Записать голос",
  "Standard voices already imported": "Стандартные голоса уже добавлены",
  "Loading engine…": "Загружаю движок…",
  "Loading model…": "Загружаю модель…",
  "Download the engine first — opening downloader": "Сначала скачайте движок — открываю загрузчик",
  "Download a model first — opening downloader": "Сначала скачайте модель — открываю загрузчик",

  // ── Dynamically rendered cards (multi-speaker, gallery, queue) ──
  "No saved speakers yet": "Пока нет сохранённых голосов",
  "No reference audio": "Нет референс-аудио",
  "No queued generations": "Очередь пуста",
  "Nothing detected yet": "Пока ничего не найдено",
  "Edit": "Править",
  "API request": "API-запрос",
  "Use saved identity…": "Выбрать сохранённый голос…",
  "Select saved identity…": "Выбрать сохранённый голос…",
  "Drop reference voice, or click to browse": "Перетащите референс-голос или нажмите для выбора",
  "Optional line-specific reference voice": "Необязательный референс для этой реплики",
  "Optional. Auto-filled with Parakeet when available.": "Необязательно. Автозаполнение через Parakeet, если доступно.",
  "Optional notes for this identity": "Необязательные заметки об этом голосе",
  "Collapse speaker": "Свернуть спикера",
  "Expand speaker": "Развернуть спикера",
  "Drag line": "Перетащить реплику",
  "Hide reference": "Скрыть референс",
  "Reference": "Референс",
  "Text to speak for this line...": "Текст этой реплики…",
  "Reference transcript override": "Переопределение транскрипта",
  "Leave blank to use the selected speaker transcript.": "Оставьте пустым — возьмётся транскрипт выбранного спикера.",

  // ── Batch tab ──
  "Batch": "Пакет",
  "Batch generation": "Пакетная генерация",
  "Generate many clips at once. One line = one clip, or load .txt files.":
    "Генерируйте много клипов сразу. Одна строка = один клип, либо загрузите .txt файлы.",
  "Voice": "Голос",
  "Empty = base voice. Pick a saved identity to clone it for every clip.":
    "Пусто = базовый голос. Выберите сохранённый голос, чтобы клонировать его для всех клипов.",
  "List of phrases (one per line)": "Список фраз (по одной в строке)",
  "Load .txt files…": "Загрузить .txt файлы…",
  "Each line = a clip": "Каждая строка = клип",
  "Clear files": "Очистить файлы",
  "▶ Generate batch": "▶ Сгенерировать пакет",
  "⏹ Stop": "⏹ Стоп",
  "First phrase.\nSecond phrase.\nThird phrase.": "Первая фраза.\nВторая фраза.\nТретья фраза.",
  "From files:": "Из файлов:",
  "Base voice (no cloning)": "Базовый голос (без клонирования)",
  "Clips loaded from files:": "Клипов загружено из файлов:",
  "Could not read files": "Не удалось прочитать файлы",
  "Generating": "Генерация",
  "Saved": "Сохранено",
  "Save": "Сохранить",
  "Failed": "Ошибка",
  "Done": "Готово",
  "saved": "сохр.",

  // ── Transcript & Diarization tab ──
  "Transcript & Diarization": "Транскрипт и диаризация",
  "Drop an audio or video file, or record from the microphone. Speech is transcribed with word timing; multiple voices are split into speakers.":
    "Перетащите аудио или видео, либо запишите с микрофона. Речь транскрибируется с таймингом по словам; несколько голосов разбиваются по спикерам.",
  "Drop audio or video here": "Перетащите аудио или видео сюда",
  "wav · mp3 · flac · m4a · ogg · mp4 (video audio track)":
    "wav · mp3 · flac · m4a · ogg · mp4 (аудиодорожка видео)",
  "Choose file…": "Выбрать файл…",
  "● Record": "● Запись",
  "Detect speakers (diarization)": "Определять спикеров (диаризация)",
  "⬇ Download diarization model (~470 MB)": "⬇ Скачать модель диаризации (~470 МБ)",
  "▶ Transcribe": "▶ Транскрибировать",
  "Export .txt": "Экспорт .txt",
  "Export .srt": "Экспорт .srt",
  "Diarization model ready.": "Модель диаризации готова.",
  "Diarization model not downloaded — single-speaker transcription only.":
    "Модель диаризации не скачана — только односпикерная транскрипция.",
  "Downloading diarization model…": "Скачивание модели диаризации…",
  "Diarization model downloaded.": "Модель диаризации скачана.",
  "Model download failed": "Не удалось скачать модель",
  // ── Очистка голоса (вокал-сепарация) ──
  "Clean voice (remove background)": "Очистка голоса (убрать фон)",
  "⬇ Download voice-cleaning model (~415 MB)": "⬇ Скачать модель очистки голоса (~415 МБ)",
  "Voice-cleaning model ready.": "Модель очистки голоса готова.",
  "Voice-cleaning engine not downloaded — references used as-is.":
    "Движок очистки голоса не скачан — референсы используются как есть.",
  "Downloading voice-cleaning model…": "Скачивание модели очистки голоса…",
  "Voice-cleaning model downloaded.": "Модель очистки голоса скачана.",
  "Cleaning voice…": "Очистка голоса…",
  "Voice cleaning failed, using reference as-is": "Очистка не удалась, референс без изменений",
  "No ASR model set. Download the Parakeet model in Settings.":
    "Не выбрана ASR-модель. Скачайте Parakeet в настройках.",
  "Choose an audio or video file first.": "Сначала выберите аудио или видео.",
  "Decoding…": "Декодирование…",
  "Diarizing…": "Диаризация…",
  "Transcribing…": "Транскрипция…",
  "Transcription failed": "Ошибка транскрипции",
  "No speech found.": "Речь не найдена.",
  "Speaker": "Спикер",
  "speakers": "спикеров",
  "1 speaker": "1 спикер",
  "Play segment": "Воспроизвести сегмент",
  "Rename speaker": "Переименовать спикера",
  "Make voice": "Сделать голос",
  "Building voice…": "Собираем голос…",
  "Voice added to gallery": "Голос добавлен в галерею",
  "A speaker with this name already exists": "Голос с таким именем уже существует",
  "Could not build voice": "Не удалось собрать голос",
  "Nothing to export yet.": "Пока нечего экспортировать.",
  "Exported": "Экспортировано",
  "Export failed": "Ошибка экспорта",
  "Recording…": "Запись…",
  "video": "видео",
  "Video has no decodable audio track, or the container is unsupported (try mp4).":
    "В видео нет декодируемой аудиодорожки, либо контейнер не поддерживается (попробуйте mp4).",

  // ── Drama 3 (speech.cpp) ──
  "Speech engine": "Движок речи",
  "Path to speech.dll…": "Путь к speech.dll…",
  "Path to Drama-35B-A3B-v3-Q4_K.gguf…": "Путь к Drama-35B-A3B-v3-Q4_K.gguf…",
  "Device": "Устройство",
  "Auto (first GPU)": "Авто (первая видеокарта)",
  "free": "свободно",
  "GB": "ГБ",
  "📁 Add voice file…": "📁 Добавить файл голоса…",
  "Remove": "Убрать",
  "“none”: the model chooses the voice. A description at the very start of the text, like [deep, low male voice], sets it.":
    "«none» — голос выбирает модель. Описание в самом начале текста, например [deep, low male voice], задаёт голос.",
  "none (the model chooses)": "none (голос выбирает модель)",
  "Remarks": "Ремарки",
  "▸ Drama 3 options": "▸ Настройки Drama 3",
  "Empty: a new random seed every time. The seed used is shown below; set it here to repeat a take.":
    "Пусто — каждый раз новый случайный seed. Использованный seed показан ниже; впишите его сюда, чтобы повторить дубль.",
  "random": "случайный",
  "Random seed": "Случайный seed",
  "Last seed": "Последний seed",
  "Keep": "Закрепить",
  "Put the last seed into the Seed field to repeat the take": "Вписать последний seed в поле Seed, чтобы повторить дубль",
  "Top-K": "Top-K",
  "Default here: 4097 (no limit). The model's own 30 causes long silent stalls on pauses.":
    "По умолчанию здесь 4097 (без ограничения). Родное значение модели 30 даёт долгие зависания-тишину на паузах.",
  "Top-P": "Top-P",
  "Default: 0.90. Nucleus sampling. Lower is steadier, higher is more varied.":
    "По умолчанию 0,90. Ниже — ровнее, выше — разнообразнее.",
  "Default: 1.00. Higher is more varied and expressive; lower is more even.":
    "По умолчанию 1,00. Выше — живее и разнообразнее, ниже — ровнее.",
  "Max seconds": "Макс. секунд",
  "Default: 47.6 s, up to 95.1 s. The longest one generation may last; it stops there.":
    "По умолчанию 47,6 с, максимум 95,1 с. Самая большая длина одной генерации: на ней озвучка обрывается.",
  "Experts on CPU": "Эксперты на CPU",
  "On: if the model does not fit in video memory, part of it runs on the CPU (slower). Off: refuse instead of running slowly.":
    "Вкл.: если модель не влезает в видеопамять, часть считается на процессоре (медленнее). Выкл.: отказ вместо медленной работы.",
  "Reset to defaults": "Сбросить по умолчанию",
  "Loading the model into video memory, about half a minute…": "Модель загружается в видеопамять, около полуминуты…",
  "Video memory free": "Свободно видеопамяти",
  "of": "из",
  "Part of the model runs on the CPU": "Часть модели считается на процессоре",
  "threads": "потоков",
  "generation is slower. Close programs that use the GPU and reload the model.":
    "озвучка медленнее. Закройте программы, занимающие видеокарту, и перезагрузите модель.",
  "The whole model is in video memory.": "Модель целиком в видеопамяти.",
  "ready. The model loads on the first generation or with the Load button.":
    "готов. Модель загрузится при первой озвучке или кнопкой «Загрузить модель».",
  "Higgs model unloaded to free video memory": "Модель Higgs выгружена, чтобы освободить видеопамять",
  "Drama 3 model unloaded to free video memory": "Модель Drama 3 выгружена, чтобы освободить видеопамять",
  "Could not add voice": "Не удалось добавить голос",
  "Drama 3 loaded, but part of the model runs on the CPU: generation will be slower.":
    "Drama 3 загружена, но часть модели считается на процессоре: озвучка будет медленнее.",
  "Drama 3 loaded": "Drama 3 загружена",
  "Failed to load Drama 3": "Не удалось загрузить Drama 3",
  "Loading the Drama 3 model…": "Загружаю модель Drama 3…",
  "Voice added": "Голос добавлен",
  "Voice saved, it will be added when the model loads": "Голос сохранён, он подключится при загрузке модели",
  "Voice removed from the list; it leaves the model on the next load":
    "Голос убран из списка; из модели он уйдёт при следующей загрузке",
  "Voice removed": "Голос убран",
  "Drama 3 works in the TTS tab for now": "Drama 3 пока работает во вкладке TTS",
  "Please enter text to speak": "Введите текст для озвучки",
  "The Drama 3 model is not loaded": "Модель Drama 3 не загружена",
  "Stopped at the Max seconds limit: the end of the text may be missing.":
    "Остановлено на пределе «Макс. секунд»: конец текста мог не прозвучать.",
  "Seed kept: generation will repeat this take": "Seed закреплён: озвучка повторит этот дубль",
  "Drama 3 options reset": "Настройки Drama 3 сброшены",
  "speech.dll did not load": "speech.dll не загрузилась",
  "Audio ready": "Готово звука",
  "s": "с",
  "elapsed": "прошло",
  // Drama 3 voices in the Speaker Gallery
  "Drama 3 voice": "Голос Drama 3",
  "Not created": "Не создан",
  "Ready": "Готов",
  "Creating…": "Создаётся…",
  "Transcript changed: recreate": "Запись или текст изменены — пересоздайте",
  "Create Drama 3 voice": "Создать голос Drama 3",
  "Recreate Drama 3 voice": "Пересоздать голос Drama 3",
  "Creating the voice, about 1–2 minutes…": "Создаю голос, около 1–2 минут…",
  "Drama 3 voice is ready": "Голос Drama 3 готов",
  "Uses the reference audio and its transcript, which must match the recording word for word. Best: 10–20 s of clean speech that ends at the end of a sentence. Takes about 1–2 minutes.":
    "Берутся эталонная запись и её текст — он должен совпадать с записью слово в слово. Лучше всего 10–20 с чистой речи, обрезанной по концу предложения. Создание занимает около 1–2 минут.",
  "Add the reference audio first": "Сначала добавьте эталонную запись",
  "Drama 3 needs the exact transcript of the reference: type it or use Auto-transcribe":
    "Drama 3 нужен точный текст эталона: впишите его или нажмите «Автотранскрипт»",
  "The transcript does not end with a full stop: the reference should end at the end of a sentence":
    "Текст не заканчивается точкой: эталон лучше обрезать по концу предложения",
  "Drama 3 voice created and added": "Голос Drama 3 создан и подключён",
  "Drama 3 voice created; it will be added when the model loads": "Голос Drama 3 создан; он подключится при загрузке модели",
  "Could not create the Drama 3 voice": "Не удалось создать голос Drama 3",
  // Own remarks: free tag field and the buttons editor
  "Your own direction in English, e.g. tired, hoarse voice": "Свой тег по-английски, например tired, hoarse voice",
  "Insert it in square brackets at the cursor": "Вставить в квадратных скобках в позицию курсора",
  "Insert [ ]": "Вставить [ ]",
  "✎ Edit buttons": "✎ Настроить кнопки",
  "Type a direction first, e.g. tired, hoarse voice": "Сначала впишите указание, например tired, hoarse voice",
  "Remark buttons": "Кнопки-ремарки",
  "Label in any language, tag in English. Changes are saved at once.":
    "Подпись на любом языке, тег по-английски. Изменения сохраняются сразу.",
  "Label": "Подпись",
  "Tag": "Тег",
  "Move up": "Выше",
  "Move down": "Ниже",
  "+ Button": "+ Кнопка",
  "Remark buttons reset to defaults": "Кнопки-ремарки сброшены по умолчанию",
  // Drama 3 scene (Multi Speaker tab)
  "Characters": "Персонажи",
  "Add names from the script": "Добавить имена из сценария",
  "+ Character": "+ Персонаж",
  "Voice: a Drama 3 voice from the Speaker Gallery or an added file, or “none” with a description in English, e.g. calm elderly man, low voice. Up to 16 characters.":
    "Голос: голос Drama 3 из Галереи или добавленный файл, либо «none» с описанием по-английски, например calm elderly man, low voice. До 16 персонажей.",
  "Script": "Сценарий",
  "Narrator: It was a quiet evening.\nMasha: [whispers] Are you asleep?\nPetya: No.":
    "Рассказчица: Был тихий вечер.\nМаша: [whispers] Ты спишь?\nПетя: Нет.",
  "One reply per line: “Name: text”. A line without a name continues the previous reply. Remarks in square brackets work as in TTS.":
    "Одна реплика — одна строка: «Имя: текст». Строка без имени продолжает предыдущую реплику. Ремарки в квадратных скобках работают как в TTS.",
  "Generate": "Озвучивать",
  "Whole scene": "Всю сцену сразу",
  "Line by line": "По репликам",
  "Pause between lines": "Пауза между репликами",
  "Lines": "Реплики",
  "Add at least one character": "Добавьте хотя бы одного персонажа",
  "Drama 3 takes at most 16 characters in a scene": "Drama 3 берёт не больше 16 персонажей в сцене",
  "Every character needs a name": "У каждого персонажа должно быть имя",
  "Not in the character list": "Нет в списке персонажей",
  "Write the script: one reply per line, “Name: text”": "Напишите сценарий: одна реплика — одна строка, «Имя: текст»",
  "Speaker number in Drama 3": "Номер говорящего в Drama 3",
  "Name": "Имя",
  "not found": "не найден",
  "Voice description in English, e.g. calm elderly man, low voice": "Описание голоса по-английски, например calm elderly man, low voice",
  "Add them, or such lines are read as text.": "Добавьте их, иначе такие строки прочитаются как текст.",
  "replies": "реплик",
  "characters of text": "знаков текста",
  "parts": "частей",
  "Each reply on its own, with its character's voice: every line gets a player and a Redo button, and the lines are joined with the pause.":
    "Каждая реплика отдельно, голосом своего персонажа: у каждой свой плеер и кнопка «Переделать», реплики склеиваются с паузой.",
  "The whole scene in one request: intonation and pauses between replies sound more natural. A long scene is split into parts of about 45 s.":
    "Вся сцена одним запросом: интонации и паузы между репликами естественнее. Длинная сцена делится на части примерно по 45 с.",
  "Play": "Слушать",
  "Generating…": "Озвучивается…",
  "↻ Redo": "↻ Переделать",
  "Voice not found": "Голос не найден",
  "Wait for the current generation to finish": "Дождитесь конца текущей озвучки",
  "Line redone": "Реплика переделана",
  "Generation failed": "Озвучка не удалась",
  "Line": "Реплика",
  "Part": "Часть",
  "Preparing the voices…": "Готовлю голоса…",
  "A part hit the 95 s limit: its end may be missing. Split long replies.":
    "Часть упёрлась в предел 95 с: её конец мог не прозвучать. Разбейте длинные реплики.",
  "Characters added": "Добавлены персонажи",
  // Audio editor and pause shortening
  "Audio editor": "Редактор аудио",
  "Drag on the wave to select. Red: long pauses, click one to select it. Mouse wheel: zoom, Shift + wheel: scroll. Space: play, Delete: remove the selection, Ctrl+Z: undo.":
    "Протяните мышью по волне, чтобы выделить. Красным — длинные паузы: щелчок по паузе выделяет её. Колесо мыши — приблизить, Shift + колесо — прокрутить. Пробел — слушать, Delete — удалить выделенное, Ctrl+Z — отменить.",
  "▶ Play": "▶ Слушать",
  "▶ Play selection": "▶ Слушать выделенное",
  "⏸ Stop": "⏸ Стоп",
  "✂ Delete selection": "✂ Удалить выделенное",
  "Keep only selection": "Оставить только выделенное",
  "↶ Undo": "↶ Отменить",
  "Pauses longer than": "Паузы длиннее",
  "s → keep": "с → оставлять",
  "Shorten all long pauses": "Сократить все длинные паузы",
  "Length": "Длина",
  "selected": "выделено",
  "cursor": "курсор",
  "long pauses": "длинных пауз",
  "No pauses that long": "Таких длинных пауз нет",
  "Pauses shortened": "Паузы сокращены",
  "📚 M4B of the book": "📚 M4B книги",
  "All joined chapters in one M4B file with a chapter list (needs ffmpeg). Loudness, tags and quality as in the audiobook export":
    "Все склеенные главы одним файлом M4B с оглавлением (нужен ffmpeg). Громкость, теги и качество — как в экспорте аудиокниги",
  "No joined chapters yet: voice the book first": "Склеенных глав пока нет: сначала озвучьте книгу",
  "Audiobook M4B": "Аудиокнига M4B",
  "Not joined yet": "Ещё не склеены",
  "Make the M4B from the joined chapters only?": "Сделать M4B только из склеенных глав?",
  "Make M4B": "Сделать M4B",
  "ffmpeg not found: install it or choose ffmpeg.exe (Video tab)": "ffmpeg не найден: установите его или укажите ffmpeg.exe (вкладка «Видео»)",
  "Preparing chapter": "Готовлю главу",
  "Encoding M4B": "Кодирую M4B",
  "Could not make the M4B": "Не удалось сделать M4B",
  "chapters": "глав",
  "+ Chapter": "+ Глава",
  "✎ Rename": "✎ Переименовать",
  "✕ Remove": "✕ Удалить",
  "Paste the whole book into the text box: it is cut into chapters at headings like «Глава 1», «Пролог», «Эпилог»":
    "Вставьте всю книгу в поле текста: она разрежется на главы по заголовкам вроде «Глава 1», «Пролог», «Эпилог»",
  "📖 Split the book into chapters": "📖 Разбить книгу на главы",
  "▶ Voice the book": "▶ Озвучить книгу",
  "⏹ Stop the book": "⏹ Остановить книгу",
  "not cut": "не разбита",
  "Chapters in the book": "Глав в книге",
  "A book of several chapters works in a project: create or open one on the left.": "Книга из нескольких глав работает в проекте: создайте или откройте его слева.",
  "Audio files not found": "Не найдены звуковые файлы",
  "Rename the chapter": "Переименовать главу",
  "Chapter title:": "Название главы:",
  "Remove the chapter": "Удалить главу",
  "from the book, with its voiced pieces?": "из книги вместе с озвученными кусками?",
  "Beginning": "Начало",
  "No chapter headings found: lines like «Глава 1», «Пролог», «Эпилог»": "Заголовки глав не найдены: нужны строки вроде «Глава 1», «Пролог», «Эпилог»",
  "Split the book into chapters": "Разбить книгу на главы",
  "Chapters found": "Найдено глав",
  "The text in the box becomes the first of them, the others are added after it.": "Текст в поле станет первой из них, остальные добавятся после неё.",
  "Split": "Разбить",
  "Voicing chapter": "Озвучиваю главу",
  "The book stopped: press ▶ Voice the book to go on": "Книга остановлена: нажмите «▶ Озвучить книгу», чтобы продолжить",
  "Book voiced": "Озвучено глав",
  "pieces to check": "кусков проверить",
  "Every part is recognised (Parakeet) and compared with the script; a part with missing words, silences or a cut end is voiced again with a new seed":
    "Каждая часть распознаётся (Parakeet) и сверяется со сценарием; часть с пропущенными словами, тишиной или обрывом озвучивается заново с новым seed",
  "How many new takes a bad part gets": "Сколько раз переозвучивать плохую часть",
  "Takes for a bad part": "Попыток для плохой части",
  "Parts that may have missing words": "Части, где могут быть пропуски",
  "listen to them": "послушайте их",
  "Parts redone after the check": "Переделано частей после проверки",
  "Mixed": "Смешанно",
  "Long narrator paragraphs on their own, the dialogue in one request": "Длинные абзацы рассказчика отдельно, диалоги одним запросом",
  "Long narrator paragraphs are read on their own in the narrator's voice (it keeps the voice better); the dialogue, with the short author's words between replies, goes in one request (livelier). The parts are joined with the pause.":
    "Длинные абзацы рассказчика озвучиваются отдельно его голосом (так он лучше держит голос), а диалоги вместе с короткими словами автора — одним запросом (так живее). Части склеиваются с паузой.",
  "No narrator in the list: name a character Рассказчик, Рассказчица or Автор": "В списке нет рассказчика: назовите персонажа «Рассказчик», «Рассказчица» или «Автор»",
  "narrator alone": "рассказчик отдельно",
  "narrator": "рассказчик",
  "dialogue": "диалог",
  "Build a direction from emotions in Russian": "Собрать ремарку из эмоций по-русски",
  "🎭 Emotions": "🎭 Эмоции",
  "Emotion builder": "Конструктор эмоций",
  "the narrator": "рассказчика",
  "this character": "этого персонажа",
  "Words the program does not know — type the English and press Remember:": "Эти слова программа не знает — впишите английский перевод и нажмите «Запомнить»:",
  "Remember": "Запомнить",
  "Words in the direction": "Слов в ремарке",
  "More than 3–4 and the model often ignores some — keep the most important ones.": "Больше 3–4 модель часто не слушает — оставьте самые важные.",
  "Choose an emotion or type a description first": "Сначала выберите эмоцию или напишите описание",
  "Manner set": "Манера задана",
  "Insert at the cursor": "Вставить в текст",
  "Set as the manner": "Поставить в манеру",
  "The direction goes where the cursor is in the text and works from there to the next direction.": "Ремарка встанет туда, где курсор в тексте, и действует оттуда до следующей ремарки.",
  "The manner is put before every reply of": "Манера ставится перед каждой репликой:",
  "In your own words, in Russian": "Своими словами по-русски",
  "e.g. tired, hoarse, almost in a whisper, with a slight smirk": "например: устало, хрипло, почти шёпотом, с лёгкой усмешкой",
  "Direction for Drama 3 (you can correct it)": "Ремарка для Drama 3 (можно поправить)",
  "Tip: 1–3 words work best. Sounds like [sigh] are separate tags and are put after the direction.": "Совет: лучше всего работают 1–3 слова. Звуки вроде [sigh] — отдельные теги, они встают после ремарки.",
  "+ To the remark buttons": "+ На панель ремарок",
  "Remark button added": "Кнопка ремарки добавлена",
  "Copied": "Скопировано",
  "Not enough free video memory": "Мало свободной видеопамяти",
  "Free": "Свободно",
  "the model needs about": "модели нужно около",
  "Another program holds the video memory (for example ComfyUI, a second Drama Studio, a game or a video). If you load now, part of the model will run on the CPU: voicing will be several times slower and the program may even crash. Close that program and press Load again.":
    "Видеопамять занята другой программой (например, ComfyUI, вторая открытая Drama Studio, игра или видео). Если загрузить сейчас, часть модели пойдёт на процессор: озвучка будет в несколько раз медленнее, а программа может даже упасть. Закройте ту программу и снова нажмите «Загрузить модель».",
  "Load anyway (slow)": "Всё равно загрузить (медленно)",
  "→ Next pause": "→ Следующая пауза",
  "Shorten all pauses": "Сократить все паузы",
  "Click: listen from there · click a red pause: select it · wheel: zoom": "Щелчок — слушать с этого места · щелчок по красной паузе — выделить её · колесо — масштаб",
  "view": "видно",
  "✂ Shorten this pause": "✂ Сократить эту паузу",
  "✂ Cut the selection": "✂ Вырезать выделенное",
  "Cut": "Вырезано",
  "Could not save": "Не удалось сохранить",
  "✂ Edit": "✂ Редактировать",
  "Cut pauses and pieces out of the result": "Вырезать паузы и куски из результата",
  "Cut pauses and pieces out of this line": "Вырезать паузы и куски из этой реплики",
  "Edit the result": "Редактирование результата",
  "Result updated": "Результат обновлён",
  "✂ Trim the recording": "✂ Обрезать запись",
  "Trim the recording": "Обрезка записи",
  "Could not read the recording": "Не удалось прочитать запись",
  "Recording trimmed": "Запись обрезана",
  "Recording trimmed. Recreate the Drama 3 voice so it uses the new recording.":
    "Запись обрезана. Пересоздайте голос Drama 3, чтобы он взял новую запись.",
  "Shorten pauses": "Сокращать паузы",
  "After each generation, long silences are shortened automatically. Drama 3 often leaves pauses of several seconds; this keeps takes usable. The editor (✂ Edit) does the same by hand.":
    "После каждой озвучки длинная тишина сокращается автоматически. Drama 3 часто оставляет паузы по несколько секунд — так дубли не пропадают. Вручную то же делает редактор (✂ Редактировать).",
  "Pause longer than": "Пауза длиннее",
  "Long pauses shortened": "Длинные паузы сокращены",
  // Montage tab and speed
  "Montage": "Монтаж",
  "Collect fragments from History, the last result, scene lines or files, put them in order and join them into one track. Fragments are kept until the program is closed: save the joined track to a file.":
    "Соберите фрагменты из Истории, последнего результата, реплик сцены или файлов, расставьте по порядку и склейте в один трек. Фрагменты хранятся, пока программа открыта, — склеенный трек сохраните в файл.",
  "+ Last result": "+ Последний результат",
  "+ From history": "+ Из истории",
  "+ File…": "+ Файл…",
  "Even out loudness": "Выровнять громкость",
  "Speed of the whole track": "Скорость всего трека",
  "⧉ Join": "⧉ Склеить",
  "Joining…": "Склеиваю…",
  "Joined track": "Склеенный трек",
  "Save WAV": "Сохранить WAV",
  "Save MP3": "Сохранить MP3",
  "To history": "В историю",
  "+ To montage": "+ В монтаж",
  "Add the result to the Montage tab": "Добавить результат во вкладку «Монтаж»",
  "Add to the Montage tab": "Добавить во вкладку «Монтаж»",
  "All lines → montage": "Все реплики → в монтаж",
  "Fragment": "Фрагмент",
  "Added to montage": "Добавлено в монтаж",
  "History is empty": "История пуста",
  "No fragments yet: add them with the buttons above or “+ To montage” in History and under a result.":
    "Фрагментов пока нет: добавьте их кнопками выше или «+ В монтаж» в Истории и у результата.",
  "Speed: above 1 faster, below 1 slower; the voice keeps its pitch": "Скорость: больше 1 — быстрее, меньше 1 — медленнее; высота голоса не меняется",
  "Silence after this fragment": "Тишина после этого фрагмента",
  "Pause after": "Пауза после",
  "Cut pauses and pieces out of this fragment": "Вырезать паузы и куски из этого фрагмента",
  "Hz": "Гц",
  "Joined": "Склеено",
  "fragments": "фрагм.",
  "Could not join": "Не удалось склеить",
  "No result yet": "Результата пока нет",
  "Result": "Результат",
  "Added to history": "Добавлено в историю",
  "× (the voice keeps its pitch)": "× (высота голоса не меняется)",
  "Apply speed": "Применить скорость",
  "Speed applied": "Скорость изменена",
  "Speed from": "Скорость от",
  "to": "до",
  // Speaker Gallery: a new recording dropped on a card that has one
  "This card already has a voice": "В этой карточке уже есть голос",
  "The card": "В карточке",
  "already has a recording. Make a new voice from the new recording, or replace the recording in this card?":
    "уже есть запись. Сделать из новой записи новый голос или заменить запись в этой карточке?",
  "Replace in": "Заменить в",
  "New voice": "Новый голос",
  // Scene: marking up speakers
  "✨ Mark up book text": "✨ Разметить текст книги",
  "Paste a book passage as it is, with dashes, and the program sets who says what":
    "Вставьте отрывок книги как есть, с тире, — программа сама расставит, кто что говорит",
  "↶ Undo markup": "↶ Отменить разметку",
  "Put the cursor in a line (or select several) and press a character, or Alt+its number: the line gets that speaker. Click a reply in the preview below to switch its speaker.":
    "Поставьте курсор в строку (или выделите несколько) и нажмите персонажа или Alt+его номер — строка достанется ему. Щелчок по реплике в разборе ниже переключает её персонажа.",
  "Click to switch the speaker of this reply": "Щёлкните, чтобы сменить персонажа этой реплики",
  "Paste a book passage into the script first": "Сначала вставьте отрывок книги в сценарий",
  "Narrator": "Рассказчик",
  "Character": "Персонаж",
  "Marked up": "Размечено",
  "characters added": "добавлены персонажи",
  "speaker guessed for": "говорящий угадан у",
  "check them": "проверьте их",
  // Steadier voices: steady preset, scene loudness, several recordings per voice
  "Steady voice": "Стабильный голос",
  "Temperature 0.75 and Top-P 0.85: the voice keeps closer to its reference, speech is a little more even":
    "Temperature 0,75 и Top-P 0,85: голос ближе к эталону, речь чуть ровнее",
  "Steady voice: temperature 0.75, Top-P 0.85": "Стабильный голос: temperature 0,75, Top-P 0,85",
  "Brings every line to the same loudness (EBU R128, −20 LUFS): takes of one voice sound closer to each other":
    "Приводит каждую реплику к одной громкости (EBU R128, −20 LUFS): дубли одного голоса звучат ближе друг к другу",
  "More recordings of this voice": "Ещё записи этого голоса",
  "+ Add a recording": "+ Добавить запись",
  "2–3 recordings of the same person make the Drama 3 voice steadier between takes. Each needs its exact transcript; the Drama 3 voice is made from all of them.":
    "2–3 записи одного и того же человека делают голос Drama 3 стабильнее от дубля к дублю. У каждой нужен точный текст; голос Drama 3 собирается из всех записей.",
  "The exact words of this recording…": "Точный текст этой записи…",
  "Add the main recording first": "Сначала добавьте основную запись",
  "Could not add the recording": "Не удалось добавить запись",
  "Recording": "Запись",
  "needs its exact transcript, or delete it": "нужен точный текст, или удалите её",
  // Mixing voices and locking a take
  "Mix voices": "Смешать голоса",
  "A new voice made of the recordings of two voices": "Новый голос из записей двух голосов",
  "Recordings": "Записей",
  "Name of the new voice": "Имя нового голоса",
  "Drama 3 has no \"percent\" control: the model hears all the recordings as one person and speaks somewhere between them, sometimes closer to one. More recordings of a voice pull the mix towards it. An experiment: generate a few takes and lock the one you like (🔒 Lock voice).":
    "В Drama 3 нет ползунка «процентов»: модель слышит все записи как одного человека и говорит где-то между ними, иногда ближе к одному. Чем больше записей голоса, тем ближе смесь к нему. Это эксперимент: сделайте несколько дублей и закрепите понравившийся (🔒 Закрепить голос).",
  "Create the mix": "Создать смесь",
  "Mixing needs two voices with a recording and its transcript": "Для смешивания нужны два голоса с записью и её текстом",
  "Choose two different voices": "Выберите два разных голоса",
  "Give the new voice a name": "Дайте новому голосу имя",
  "Mix of voices": "Смесь голосов",
  "Could not create the mix": "Не удалось создать смесь",
  "🔒 Lock voice": "🔒 Закрепить голос",
  "Make this take a permanent Drama 3 voice in the Speaker Gallery": "Сделать этот дубль постоянным голосом Drama 3 в Галерее",
  "Make this take the character's permanent voice": "Сделать этот дубль постоянным голосом персонажа",
  "The take becomes a voice in the Speaker Gallery. Its name:": "Дубль станет голосом в Галерее. Его имя:",
  "Locked take": "Закреплённый дубль",
  "Locked from a take": "Закреплён из дубля",
  "The take was longer than 30 s and was cut: check the transcript in the Speaker Gallery":
    "Дубль длиннее 30 с и был обрезан: проверьте текст в Галерее",
  "Could not lock the voice": "Не удалось закрепить голос",
  "Lock works for a TTS take, or for a scene line in “Line by line” mode (🔒 at the line)":
    "Закрепить можно дубль из TTS или реплику сцены в режиме «По репликам» (🔒 у реплики)",
  "Voice locked and given to": "Голос закреплён и назначен персонажу",
  "OK": "ОК",
  // Chapter tab
  "Chapter": "Глава",
  "Paste a chapter: it is cut into pieces (paragraphs, long ones at sentence ends) that are voiced one after another and checked. A bad piece is redone with another seed automatically. Pieces are kept until the program is closed: save the joined chapter to a file.":
    "Вставьте главу: она делится на куски (абзацы, длинные — по концам предложений), которые озвучиваются по очереди и проверяются. Неудачный кусок сам переделывается с другим seed. Куски хранятся, пока программа открыта, — склеенную главу сохраните в файл.",
  "Paste the chapter text here…": "Вставьте сюда текст главы…",
  "Narrator voice": "Голос рассказчика",
  "Dialogue in the characters' voices": "Диалоги голосами персонажей",
  "Dialogue with dashes is marked up as in Multi Speaker and voiced by its characters (their voices are set there)":
    "Диалоги с тире размечаются как в Мультиспикере и озвучиваются его персонажами (голоса задаются там)",
  "Piece up to, characters": "Кусок до, знаков",
  "Check by recognition": "Проверять распознаванием",
  "Each piece is recognised (Parakeet) and compared with its text: missing words mark it bad":
    "Каждый кусок распознаётся (Parakeet) и сверяется с текстом: пропущенные слова — повод переделать",
  "Retries of a bad piece": "Попыток для плохого куска",
  "Pause after a paragraph, s": "Пауза после абзаца, с",
  "between sentences, s": "между предложениями, с",
  "after a reply, s": "после реплики, с",
  "Cut into pieces": "Разбить на куски",
  "▶ Voice the chapter": "▶ Озвучить главу",
  "↻ Redo the marked pieces": "↻ Переделать отмеченные",
  "⧉ Join the chapter": "⧉ Склеить главу",
  "Waiting": "Ждёт",
  "Check": "Проверить",
  "Bad": "Плохо",
  "words": "слов",
  "takes": "дублей",
  "pieces": "кусков",
  "to check": "проверить",
  "The text was changed: redo this piece": "Изменён текст — переделайте этот кусок",
  "The voice or manner changed: redo this piece": "Изменился голос или манера — переделайте этот кусок",
  "Voice the whole chapter again? The present takes will be replaced.": "Озвучить всю главу заново? Нынешние дубли будут заменены.",
  "Voice everything again": "Переозвучить всё",
  "Paste the chapter text first": "Сначала вставьте текст главы",
  "Add characters in the Multi Speaker tab first, or turn off dialogue in the characters' voices":
    "Сначала добавьте персонажей во вкладке «Мультиспикер» или выключите «Диалоги голосами персонажей»",
  "hit the length limit: the end is missing": "упёрся в предел длины — конец не прозвучал",
  "too long for its text: silences or repeats": "слишком долго для такого текста — паузы или повторы",
  "too short for its text: words skipped": "слишком коротко для такого текста — пропущены слова",
  "words missing": "пропущены слова",
  "maybe missing": "возможно пропущены",
  "All pieces are voiced": "Все куски уже озвучены",
  "Piece": "Кусок",
  "about": "примерно",
  "left": "осталось",
  "Chapter stopped: press ▶ to go on": "Глава остановлена — нажмите ▶, чтобы продолжить",
  "Chapter voiced": "Глава озвучена",
  "Not all pieces are voiced": "Не все куски озвучены",
  "Chapter joined": "Глава склеена",
  "The voiced pieces will be dropped and the chapter cut again. Go on?": "Озвученные куски пропадут, глава разобьётся заново. Продолжить?",
  "Cut again": "Разбить заново",
  // Chapter: speakers
  "Characters and their voices: in the Multi Speaker tab →": "Персонажи и их голоса — во вкладке «Мультиспикер» →",
  "Put the cursor in a line (or select several) and press a character, or Alt+its number: the line gets that speaker. A line can also start with “Name:”.":
    "Поставьте курсор в строку (или выделите несколько) и нажмите персонажа или Alt+его номер — строка достанется ему. Строку можно начать и с «Имя:».",
  "Narrator (chapter voice)": "Рассказчик (голос главы)",
  // Manner of a character
  "How this character speaks in every reply: pick or type a direction in English": "Как этот персонаж говорит во всех репликах: выберите вариант или впишите указание по-английски",
  "Manner, e.g. calm narrator": "Манера, например спокойный рассказчик",
  "Narrator manner": "Манера рассказчика",
  "How the narrator speaks in every piece it reads: pick or type a direction in English": "Как рассказчик читает каждый свой кусок: выберите вариант или впишите указание по-английски",
  "Calm narrator": "Спокойный рассказчик",
  "Warm, gentle": "Тёплый, мягкий",
  "Lively, energetic": "Бодрый, живой",
  "Serious, measured": "Серьёзный, размеренный",
  "Stern, cold": "Строгий, холодный",
  "Cheerful": "Весёлый",
  "Sad, quiet": "Грустный, тихий",
  "Tired, slow": "Усталый, медленный",
  "Nervous, hurried": "Нервный, торопливый",
  "Playful, childlike": "Игривый, детский",
  "Soft, intimate": "Мягкий, доверительный",
  "Old, raspy": "Старческий, хрипловатый",
  // Voice Studio
  "Voice Studio": "Студия голоса",
  "Take a voice from the Speaker Gallery and change it slightly: its recordings are made higher or lower and faster or slower, and Drama 3 copies the changed recordings. Listen to the recording, try a take, and save what you like as a new voice; the original stays as it is.":
    "Возьмите голос из Галереи и слегка измените его: его записи делаются выше или ниже, быстрее или медленнее, а Drama 3 копирует изменённые записи. Прослушайте запись, сделайте пробный дубль и сохраните понравившееся как новый голос — исходный останется как был.",
  "In semitones. ±1–3 sounds natural; more becomes cartoonish, and Drama 3 copies that too.":
    "В полутонах. ±1–3 звучит естественно; больше — уже мультяшно, и Drama 3 это тоже скопирует.",
  "Tempo": "Темп",
  "Below 1: an unhurried voice, above 1: a quicker one. The pitch does not change.":
    "Меньше 1 — неторопливый голос, больше 1 — быстрее. Высота не меняется.",
  "Manner": "Манера",
  "How the voice speaks in the trial take: pick or type a direction in English. Emotion is changed here, not in the recording.":
    "Как голос говорит в пробном дубле: выберите вариант или впишите указание по-английски. Эмоции меняются здесь, а не в записи.",
  "Trial phrase": "Пробная фраза",
  "▶ Listen to the changed recording": "▶ Прослушать изменённую запись",
  "▶ Trial take": "▶ Пробный дубль",
  "Take with the original voice": "Дубль исходным голосом",
  "💾 Save as a new voice": "💾 Сохранить как новый голос",
  "No voices with a recording and its transcript in the Speaker Gallery": "В Галерее нет голосов с записью и её текстом",
  "higher by": "выше на",
  "lower by": "ниже на",
  "slower": "медленнее",
  "faster": "быстрее",
  "Choose a voice from the Speaker Gallery": "Выберите голос из Галереи",
  "Changed recording": "Изменённая запись",
  "no changes": "без изменений",
  "Type a trial phrase": "Впишите пробную фразу",
  "This voice has no Drama 3 voice yet: create it in the Speaker Gallery": "У этого голоса ещё нет голоса Drama 3 — создайте его в Галерее",
  "Making the changed voice, about a minute…": "Делаю изменённый голос, около минуты…",
  "Generating the trial take…": "Озвучиваю пробный дубль…",
  "Original voice": "Исходный голос",
  "Changed voice": "Изменённый голос",
  "The changed voice becomes a new card in the Speaker Gallery. Its name:": "Изменённый голос станет новой карточкой в Галерее. Её имя:",
  "from": "из",
  "manner for it": "манера для него",
  "Making the Drama 3 voice of the new card…": "Делаю голос Drama 3 для новой карточки…",
  "Saved as a new voice": "Сохранено как новый голос",
  "Could not save the voice": "Не удалось сохранить голос",
  // Projects
  "Project": "Проект",
  "Not saved": "Не сохранён",
  "No project": "Нет проекта",
  "New": "Новый",
  "Open…": "Открыть…",
  "Save as…": "Сохранить как…",
  "Saving…": "Сохраняю…",
  "Open": "Открыт",
  "Work is kept only until the program closes. Create a project to keep it on disk.":
    "Работа хранится, только пока программа открыта. Создайте проект, чтобы она сохранялась на диск.",
  "Could not save the project": "Не удалось сохранить проект",
  "not a Drama Studio project": "это не проект Drama Studio",
  "Could not open the project": "Не удалось открыть проект",
  "Opening the project…": "Открываю проект…",
  "Project opened, but some takes were not found": "Проект открыт, но часть дублей не найдена",
  "Project opened": "Проект открыт",
  "Project saved": "Проект сохранён",
  "New project": "Новый проект",
  "Name of the project (a book, a chapter, a video):": "Имя проекта (книга, глава, видео):",
  "Take the work that is open now into the new project, or start empty?": "Перенести в новый проект работу, которая открыта сейчас, или начать с чистого листа?",
  "Start empty": "Начать пустой",
  "Take the current work": "Перенести текущую работу",
  "Folder for the project": "Папка для проекта",
  "Name of the project:": "Имя проекта:",
  "Folder of a project": "Папка проекта",
  "Keep the chapter on disk?": "Сохранять главу на диск?",
  "Without a project, the voiced pieces are lost when the program closes. Create a project? Then every piece is saved as soon as it is voiced.":
    "Без проекта озвученные куски пропадут при закрытии программы. Создать проект? Тогда каждый кусок сохраняется сразу после озвучки.",
  "Without a project": "Без проекта",
  "Create a project": "Создать проект",
  // Pronunciation dictionary
  "Pronunciation dictionary": "Словарь произношения",
  "Applied to every text before Drama 3 reads it. “+” before the stressed vowel: з+амок → за́мок, зам+ок → замо́к.":
    "Применяется к каждому тексту перед озвучкой. «+» ставится перед ударной гласной: з+амок → за́мок, зам+ок → замо́к.",
  "Written": "Написано",
  "Read as": "Читать как",
  "Whole word": "Целое слово",
  "Check: type a phrase…": "Проверка: впишите фразу…",
  "+ Word": "+ Слово",
  "📖 Dictionary": "📖 Словарь",
  "Dictionary": "Словарь",
  "Stress marks, names and abbreviations, applied to every text": "Ударения, имена и сокращения — для всех текстов",
  // Audiobook export
  "📚 Audiobook export": "📚 Экспорт аудиокниги",
  "Audiobook export": "Экспорт аудиокниги",
  "Format": "Формат",
  "MP3 64 kbit/s (smaller)": "MP3 64 кбит/с (компактнее)",
  "MP3 128 kbit/s": "MP3 128 кбит/с",
  "WAV (no compression)": "WAV (без сжатия)",
  "Audiobook standard loudness": "Громкость по стандарту аудиокниг",
  "−19 LUFS, peaks at most −3 dB, 0.5 s of silence at the start and 1 s at the end":
    "−19 LUFS, пики не выше −3 дБ, 0,5 с тишины в начале и 1 с в конце",
  "Room tone in pauses": "Фон комнаты в паузах",
  "Very quiet noise instead of dead digital silence in pauses, as in a real recording":
    "Очень тихий шум вместо «мёртвой» цифровой тишины в паузах, как в настоящей записи",
  "Title": "Название",
  "Author": "Автор",
  "Book": "Книга",
  "Track number": "Номер трека",
  "💾 Export": "💾 Экспортировать",
  // Subtitles tab
  "Subtitles": "Субтитры",
  "Open or paste SRT/VTT subtitles: every line is voiced, its silence trimmed, and fitted into its time (sped up a little when it is too long, without changing the pitch). Then the lines are put at their times into one track as long as the video.":
    "Откройте или вставьте субтитры SRT/VTT: каждая реплика озвучивается, тишина по краям обрезается, и реплика подгоняется под своё время (если длинная — чуть ускоряется без изменения высоты). Потом реплики ставятся на свои отметки в одну дорожку длиной с видео.",
  "📂 Open SRT/VTT…": "📂 Открыть SRT/VTT…",
  "Read the pasted subtitles": "Прочитать вставленные субтитры",
  "Characters from Multi Speaker": "Персонажи из Мультиспикера",
  "“Name: text” lines are voiced by the characters of Multi Speaker (their voices and manners are set there)":
    "Реплики «Имя: текст» озвучивают персонажи Мультиспикера (их голоса и манеры задаются там)",
  "Speed up at most, ×": "Ускорять не больше, ×",
  "How much faster a line may be made to fit its time": "Насколько можно ускорить реплику, чтобы она влезла в своё время",
  "Retries of a line that does not fit": "Попыток для невлезающей реплики",
  "▶ Voice the subtitles": "▶ Озвучить субтитры",
  "↻ Redo the marked lines": "↻ Переделать отмеченные",
  "⧉ Build the track": "⧉ Собрать дорожку",
  "Dubbing track": "Дорожка озвучки",
  "Fits": "Влезает",
  "Sped up": "Ускорено",
  "Does not fit": "Не влезает",
  "slot": "время",
  "take": "дубль",
  "Default voice": "Голос по умолчанию",
  "lines": "реплик",
  "No subtitle lines found: SRT or VTT with times is needed": "Реплики не найдены: нужны субтитры SRT или VTT с таймингом",
  "Subtitle lines": "Реплик в субтитрах",
  "longer than its time by": "длиннее своего времени на",
  "s even sped up: shorten the text or allow more speed": "с даже с ускорением — сократите текст или разрешите большее ускорение",
  "All lines are voiced": "Все реплики уже озвучены",
  "Stopped: press ▶ to go on": "Остановлено — нажмите ▶, чтобы продолжить",
  "Subtitles voiced": "Субтитры озвучены",
  "Track built": "Дорожка собрана",
  "Could not read the file": "Не удалось прочитать файл",
  "The voiced lines will be dropped and the subtitles read again. Go on?": "Озвученные реплики пропадут, субтитры прочитаются заново. Продолжить?",
  "Read again": "Прочитать заново",
  // Voice Studio: age
  "Age": "Возраст",
  "Moves the formants (the size of the voice) without changing the pitch: to the right younger and smaller, to the left older and bigger. ±30–50 sounds natural.":
    "Сдвигает форманты («размер» голоса), не меняя высоту: вправо — моложе и меньше, влево — старше и крупнее. Естественно звучит ±30–50.",
  "younger": "моложе",
  "older": "старше",
  // Video tab
  "Video": "Видео",
  "Watch a video with the new dubbing track and save the video with it. The picture is copied as it is (fast, no quality loss); the original sound can stay as a quiet background. Needs ffmpeg, a free program.":
    "Смотрите видео с новой дорожкой озвучки и сохраняйте ролик с ней. Изображение копируется как есть (быстро и без потери качества), исходный звук можно оставить тихим фоном. Нужна бесплатная программа ffmpeg.",
  "ffmpeg.exe (found by itself if installed)": "ffmpeg.exe (найдётся сам, если установлен)",
  "Where to get ffmpeg →": "Где взять ffmpeg →",
  "📂 Choose a video…": "📂 Выбрать видео…",
  "New track": "Новая дорожка",
  "Subtitles: dubbing track": "Субтитры: дорожка озвучки",
  "Montage: joined track": "Монтаж: склеенный трек",
  "Chapter: joined chapter": "Глава: склеенная глава",
  "A file…": "Файл…",
  "Original sound": "Исходный звук",
  "💾 Save the video": "💾 Сохранить ролик",
  "ffmpeg not found: install it or choose ffmpeg.exe": "ffmpeg не найден — установите его или укажите ffmpeg.exe",
  "not ready: build it in its tab first": "не готова — сначала соберите её в своей вкладке",
  "Choose a video first": "Сначала выберите видео",
  "The new track is not ready: build it in its tab first": "Новая дорожка не готова — сначала соберите её в своей вкладке",
  "Saving the video…": "Сохраняю ролик…",
  "Video saved": "Ролик сохранён",
  "Could not save the video": "Не удалось сохранить ролик",
  // Remark buttons (the tags themselves stay English: Drama 3 reads English directions).
  "Sigh": "Вздох",
  "Laugh": "Смех",
  "Chuckle": "Смешок",
  "Whisper": "Шёпот",
  "Tender": "Нежно",
  "Sad": "Грустно",
  "Happy": "Радостно",
  "Angry": "Сердито",
  "Scared": "Испуганно",
  "Surprised": "Удивлённо",
  "Crying": "Плача",
  "Excited": "Взволнованно",
  "Shout": "Крик",
  "Slowly": "Медленно",
  "Male voice": "Мужской голос",
  "Female voice": "Женский голос",
  "Pause tags are risky: at the start of a line they can produce long silence.":
    "Теги пауз рискованны: в начале реплики могут дать долгую тишину.",
  "For the voice \"none\": put at the very start of the text to set the voice.":
    "Для голоса «none»: поставьте в самое начало текста, чтобы задать голос.",
};

// Translate a dynamic string. Returns Russian when in RU mode and known,
// otherwise the original English (safe fallback).
export function t(en: string): string {
  if (getLang() !== "ru") return en;
  return RU[en] ?? en;
}

const ATTR_TO_TRANSLATE = ["placeholder", "title", "aria-label", "data-tip"];

// Walk the DOM once and swap known English strings for Russian.
export function translateStaticDom(root: ParentNode = document.body): void {
  if (getLang() !== "ru") return;

  // Text nodes.
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of nodes) {
    const raw = textNode.nodeValue;
    if (!raw) continue;
    const key = raw.trim();
    if (!key) continue;
    const translated = RU[key];
    if (translated) textNode.nodeValue = raw.replace(key, translated);
  }

  // Attributes.
  const elements = (root as ParentNode).querySelectorAll<HTMLElement>("*");
  for (const el of elements) {
    for (const attr of ATTR_TO_TRANSLATE) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const translated = RU[value.trim()];
      if (translated) el.setAttribute(attr, translated);
    }
  }
}
