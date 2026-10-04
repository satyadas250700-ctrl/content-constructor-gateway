const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || "GigaChat-3-Ultra";

const OAUTH_URL =
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

const CHAT_URL =
  "https://api.giga.chat/v1/chat/completions";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

let accessToken = null;
let tokenExpiresAt = 0;

let generationInProgress = false;
let generationStartedAt = 0;

const GENERATION_LOCK_TIMEOUT = 120000;


/* ============================================================
   GENERATION LOCK
============================================================ */

function acquireGenerationLock(source) {
  if (generationInProgress) {
    const age = Date.now() - generationStartedAt;

    if (age < GENERATION_LOCK_TIMEOUT) {
      console.warn(
        `[LOCK] Busy. Source: ${source}. Age: ${age} ms`
      );

      return false;
    }

    console.warn(
      `[LOCK] Stale lock reset. Previous age: ${age} ms`
    );
  }

  generationInProgress = true;
  generationStartedAt = Date.now();

  console.log(`[LOCK] Acquired by ${source}`);

  return true;
}

function releaseGenerationLock(source) {
  generationInProgress = false;
  generationStartedAt = 0;

  console.log(`[LOCK] Released by ${source}`);
}


/* ============================================================
   GIGACHAT AUTH
============================================================ */

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      httpsAgent,
      timeout: 8000,
      headers: {
        Authorization: `Basic ${GIGACHAT_KEY}`,
        RqUID: crypto.randomUUID(),
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  accessToken = response.data.access_token;

  const expiresIn =
    Number(response.data.expires_in) || 1800;

  tokenExpiresAt =
    Date.now() + (expiresIn - 60) * 1000;

  return accessToken;
}


/* ============================================================
   CONTENT TYPE HELPERS
============================================================ */

function isContentPlan(contentType) {
  const type = String(contentType || "").toLowerCase();

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}


/* ============================================================
   NORMAL CONTENT INSTRUCTIONS
============================================================ */

function getContentInstructions(contentType) {
  const type = String(contentType || "").toLowerCase();

  if (
    type.includes("telegram") ||
    type.includes("тг") ||
    type.includes("телеграм")
  ) {
    return `
СОЗДАЙ ГОТОВЫЙ ПОСТ ДЛЯ TELEGRAM.

Текст должен:
- быть естественным;
- цеплять с первых строк;
- соответствовать целевой аудитории;
- демонстрировать экспертность;
- учитывать выбранную цель;
- соответствовать выбранному стилю.

Структура:
1. Сильное начало.
2. Основная мысль.
3. Полезное содержание.
4. Сильный финал.
5. CTA.

Выдай только готовый пост.
`;
  }

  if (type.includes("reels")) {
    return `
СОЗДАЙ ГОТОВЫЙ СЦЕНАРИЙ REELS.

Структура:
ХУК: первая цепляющая фраза.
СЦЕНАРИЙ: короткий динамичный текст.
ФИНАЛ: сильное завершение.
CTA: призыв к действию.

Текст должен быть естественным, интересным и соответствовать бизнесу, аудитории, цели и стилю.

Выдай только готовый материал.
`;
  }

  if (
    type.includes("пост") &&
    !type.includes("telegram") &&
    !type.includes("телеграм")
  ) {
    return `
СОЗДАЙ ГОТОВЫЙ ПОСТ ДЛЯ СОЦИАЛЬНЫХ СЕТЕЙ.

Требования:
- сильное начало;
- интересная основная часть;
- конкретная польза;
- естественный язык;
- соответствие бизнесу, аудитории, цели и стилю;
- хороший CTA.

Выдай только готовый пост.
`;
  }

  if (
    type.includes("карусель") ||
    type.includes("carousel")
  ) {
    return `
СОЗДАЙ ГОТОВУЮ КАРУСЕЛЬ.

Сделай 7–9 слайдов.

Для каждого:
Слайд N:
Заголовок: ...
Текст: ...

Первый слайд должен цеплять.
Последний должен содержать CTA.

Выдай только готовую карусель.
`;
  }

  return `
Создай качественный готовый контент для предпринимателя или эксперта.

Учитывай:
- бизнес;
- целевую аудиторию;
- предложение;
- цель;
- тему;
- стиль.

Ответ только на русском языке.
`;
}


/* ============================================================
   NORMAL CONTENT PROMPT
============================================================ */

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  reelsTopic,
  contentStyle
}) {
  return `
Ты — профессиональный российский контент-маркетолог, контент-стратег и сценарист сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

ТВОЯ ЦЕЛЬ

Создать сильный, полезный и готовый к публикации контент, который выглядит конкретно и живо, но НЕ ПРИДУМЫВАЕТ факты о бизнесе.

====================
ДАННЫЕ КЛИЕНТА — ЕДИНСТВЕННЫЙ ИСТОЧНИК ФАКТОВ
====================

Формат: ${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Что продаёт / предложение:
${offer || "не указано"}

Цель контента:
${contentGoal}

Тема:
${reelsTopic || "Определи подходящую тему самостоятельно"}

Стиль:
${contentStyle}


ВАЖНО

- Любой факт о конкретном бизнесе должен быть прямо подтверждён этими данными.
- Не превращай вероятное в известное.
- Не придумывай продукты, свойства, цены, скидки, процессы, этапы работы, клиентов, отзывы, кейсы, личные истории, помещения, оборудование, технологии, результаты или гарантии.
- Не придумывай числа, сроки, даты и количественные показатели.
- Если конкретной информации не хватает, НЕ заполняй пробел выдумкой.
- Подними уровень формулировки: проблема аудитории, вопрос, принцип, наблюдение, сравнение, метафора, условный сценарий.
- Условные конструкции допустимы:
  «если у вас есть...»
  «можно показать...»
  «представьте...»
  «например...»
- Они не должны выдавать условный объект за существующий.
- Метафоры, юмор, гиперболы, сравнения и эмоциональные образы разрешены.
- Они должны оставаться очевидно творческими, а не превращаться в конкретные факты.
- Не используй шаблоны в квадратных скобках.
- Если точного значения нет — перепиши фразу без него.
- Не используй пустые универсальные клише только ради конкретности.
- Лучше одна точная опора на данные клиента, чем пять выдуманных деталей.

КЛЮЧЕВОЙ ПРИНЦИП:

КОНКРЕТНОСТЬ ДОЛЖНА РАСТИ ЗА СЧЁТ СМЫСЛА,
А НЕ ЗА СЧЁТ ВЫДУМАННЫХ ФАКТОВ.


====================
ИНСТРУКЦИЯ ФОРМАТА
====================

${getContentInstructions(contentType)}


====================
КАЧЕСТВО
====================

- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без пустых фраз.
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Не повторяй входные данные механически.
- Превращай их в полезный контент.
- CTA должен соответствовать цели и не обещать того, чего клиент не подтвердил.
- Не используй автоматические CTA вроде:
  «переходите по ссылке в профиле»,
  «напишите мне — пришлю чек-лист»,
  «запишитесь на консультацию»,
  если соответствующий ресурс или действие не указаны клиентом.
- Не создавай искусственную конкретику ради ощущения экспертности:
  «классический подход больше не работает»,
  «раньше метод давал результат»,
  «клиент получает трансформацию»
  и подобные фразы допустимы только при прямой опоре в данных.
- Если исходных фактов мало, используй сильную мысль, хороший вопрос, разбор проблемы, метафору или условный сценарий вместо выдуманной конкретики.

Выдай только готовый контент.
`;
}


/* ============================================================
   30-DAY PLAN PROMPT
============================================================ */

function buildPlanChunkPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  const contextBlock = previousPlan
    ? `
ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan}

Используй её только как контекст.

Не повторяй темы и идеи.
Продолжай общую логику контент-воронки.
`
    : `
Это начало контент-плана.

Построй первые дни так, чтобы аудитория постепенно двигалась от внимания к интересу, экспертности и доверию.
`;

  return `
Ты — профессиональный контент-стратег для предпринимателей и экспертов.

Создай часть ЕДИНОГО контент-плана на 30 дней.

ТОЛЬКО ДНИ ${startDay}–${endDay}.


====================
ДАННЫЕ КЛИЕНТА — ЕДИНСТВЕННЫЙ ИСТОЧНИК ФАКТОВ
====================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Что продаёт / предложение:
${offer || "не указано"}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}


${contextBlock}


====================
ЛОГИКА
====================

Веди аудиторию по пути:

внимание → интерес → экспертность → доверие → желание → действие.


Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост


====================
СТРОГОЕ ПРАВИЛО ФАКТОВ
====================

Каждый день обязан иметь ПОДТВЕРЖДЁННУЮ СМЫСЛОВУЮ ОПОРУ в данных клиента:

- бизнес;
- предложение;
- аудитория;
- цель;
- явно заданная тема.

Нельзя придумывать:

- свойства продукта или услуги;
- цены;
- скидки;
- цифры;
- сроки;
- даты;
- клиентов;
- отзывы;
- кейсы;
- продажи;
- результаты;
- личные истории;
- прошлые события;
- процессы;
- этапы работы;
- консультации;
- созвоны;
- оборудование;
- помещения;
- технологии;
- конкретные объекты;
- обещания результата;
- гарантии;
- наличие ссылки;
- чек-листа;
- гайда;
- файла;
- подарка;
- расчёта;
- консультации;
- другого ресурса;
- конкретные действия бизнеса, если они не указаны.

Не используй плейсхолдеры вида [текст].

Если факта нет — переформулируй идею.


Метафоры, юмор, сравнения, гиперболы и эмоциональные образы разрешены.

Условные съёмочные рекомендации тоже разрешены:

«если у вас есть...»
«можно показать...»
«представьте...»
«например...».


====================
ПРИМЕРЫ
====================

НЕПРАВИЛЬНО:

«Покажите экран ноутбука с таблицей»,
если наличие ноутбука и таблицы не подтверждено.

«Расскажите о своём первом клиенте»,
если такой факт не дан.

«Дайте чек-лист»,
если наличие чек-листа не подтверждено.

«За 15 секунд»,
если 15 секунд нет во входных данных.


ПРАВИЛЬНО:

«Можно передать мысль через текст на экране и динамичный монтаж».

«Если у вас есть реальный вопрос клиента, можно разобрать его».

«Разберите типичную ошибку аудитории без выдуманной личной истории».


КОНКРЕТНОСТЬ =

конкретная мысль,
проблема,
вопрос,
возражение,
критерий,
сравнение,
связь с данными клиента,

а НЕ выдуманная деталь.


====================
ТРЕБОВАНИЯ К ПЛАНУ
====================

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть самостоятельной полезной единицей.
3. Темы должны быть максимально привязаны к данным клиента.
4. Не превращай отсутствие данных в выдуманную конкретику.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Не используй одинаковые CTA каждый день.
13. CTA должен быть реально выполнимым без обещания неподтверждённого ресурса.
14. Не используй по умолчанию:
    «ссылка в профиле»,
    «напишите мне — пришлю чек-лист»,
    «запишитесь на консультацию»
    и другие CTA, предполагающие наличие ресурса или канала действия, которых нет во входных данных.


====================
ФОРМАТ КАЖДОГО ДНЯ
====================

День N — Формат

Тема: конкретная тема

Идея: что именно раскрыть или показать

Задача: какую реакцию или действие должна вызвать публикация

CTA: конкретный призыв к действию


Если данных мало, не делай день пустым или слишком общим.

Возьми ОДНУ подтверждённую опору и раскрой её глубже:

- через вопрос;
- возражение;
- типичную ошибку аудитории;
- сравнение подходов;
- миф;
- критерий выбора;
- эмоциональную метафору.


ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
`;
}


/* ============================================================
   GIGACHAT GENERATION
============================================================ */

async function generateWithGigaChat({
  token,
  prompt,
  temperature,
  maxTokens,
  label
}) {
  const startedAt = Date.now();

  console.log(
    `[${label}] Sending request to GigaChat...`
  );

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,

        messages: [
          {
            role: "system",
            content:
              "Ты профессиональный контент-маркетолог и контент-стратег. Создавай только качественный готовый контент на русском языке."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature,
        max_tokens: maxTokens
      },
      {
        httpsAgent,
        timeout: 9000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content || "";

    const elapsed = Date.now() - startedAt;

    console.log(
      `[${label}] HTTP status: ${response.status}`
    );

    console.log(
      `[${label}] Result length: ${result.length}`
    );

    console.log(
      `[${label}] Time: ${elapsed} ms`
    );

    if (!result) {
      throw new Error(
        `${label}: GigaChat returned empty result`
      );
    }

    return {
      result,
      elapsed,
      status: response.status
    };
  } catch (error) {
    const elapsed = Date.now() - startedAt;

    console.error(`[${label}] ERROR`);
    console.error(
      `[${label}] Message:`,
      error.message
    );

    console.error(
      `[${label}] Status:`,
      error.response?.status
    );

    console.error(
      `[${label}] Response:`,
      error.response?.data
    );

    console.error(
      `[${label}] Time:`,
      elapsed,
      "ms"
    );

    throw error;
  }
}


/* ============================================================
   DETERMINISTIC STRUCTURAL CHECK
============================================================ */

function extractInputNumbers(text) {
  return new Set(
    (
      String(text || "").match(
        /\b\d+(?:[.,]\d+)?\b/g
      ) || []
    ).map(value =>
      value.replace(",", ".")
    )
  );
}


function getDeterministicViolations({
  content,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  reelsTopic
}) {
  const text = String(content || "");

  const source = [
    businessInfo,
    targetAudience,
    offer,
    contentGoal,
    reelsTopic
  ]
    .filter(Boolean)
    .join(" ");

  const sourceNumbers =
    extractInputNumbers(source);

  const violations = [];
  const seen = new Set();


  function add(
    textPart,
    reason,
    support = ""
  ) {
    const key =
      `${textPart}|${reason}`;

    if (!textPart || seen.has(key)) {
      return;
    }

    seen.add(key);

    violations.push({
      text: textPart,
      reason,
      support
    });
  }


  /*
   * PLACEHOLDERS
   */

  const placeholders =
    text.match(
      /\[[^\]\n]{1,100}\]/g
    ) || [];

  placeholders.forEach(item => {
    add(
      item,
      "Незаполненный шаблон или плейсхолдер.",
      "Во входных данных нет значения, которое должно заменить этот шаблон."
    );
  });


  /*
   * NUMBERS
   */

  const numberPatterns = [
    /\b\d+(?:[.,]\d+)?\s*(?:%|сек(?:унд)?|мин(?:ут)?|час(?:ов|а)?|дн(?:ей|я)?|лет|руб(?:лей|ля)?|₽|клиент(?:ов|а)?|критери(?:ев|я)?|шаг(?:ов|а)?|этап(?:ов|а)?|слайд(?:ов|а)?)\b/gi,

    /\b(?:один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:клиент|ошиб|критер|этап|шаг|причин|способ|миф|пункт|результат)/gi
  ];


  for (const pattern of numberPatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];

      const numeric =
        (
          value.match(
            /\d+(?:[.,]\d+)?/
          ) || [""]
        )[0].replace(",", ".");

      if (
        numeric &&
        sourceNumbers.has(numeric)
      ) {
        continue;
      }

      add(
        value,
        "Конкретное число или количественный показатель не подтверждён входными данными.",
        "В исходных данных нет этого числа или количества."
      );
    }
  }


  /*
   * STRUCTURAL FACT PATTERNS
   */

  const structuralPatterns = [
    /\b(?:вчера|сегодня|завтра|раньше|недавно|в прошлом|первый клиент|первый заказ|один из клиентов|наши клиенты|подписчики|отзывы|комментарии под|кейсы|кейс клиента)\b/gi,

    /\b(?:переходите|перейдите)\s+(?:по )?ссылк(?:е|ой)\s+в\s+(?:профиле|био)\b/gi,

    /\b(?:дам|дать|пришлю|пришлём|отправлю|отправим|получите|скачайте|скачать)\s+(?:чек-?лист|гайд|файл|шаблон|материал|расчёт|разбор|кейс)\b/gi,

    /\b(?:гарантирую|гарантируем|гарантированно|точно получите|получите результат|решит(?:ь|) проблему навсегда|избавит(?:ь|) от проблемы)\b/gi
  ];


  for (const pattern of structuralPatterns) {
    for (const match of text.matchAll(pattern)) {
      add(
        match[0],
        "Формулировка содержит конкретное обстоятельство, ресурс или результат, которого нет в исходных данных.",
        "Автоматическая структурная проверка не нашла прямой опоры во входных данных."
      );
    }
  }


  return violations.slice(0, 20);
}


/* ============================================================
   AI SEMANTIC FACT AUDITOR
============================================================ */

function cleanJsonText(text) {
  let value =
    String(text || "").trim();

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace =
    value.indexOf("{");

  const lastBrace =
    value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    value =
      value.slice(
        firstBrace,
        lastBrace + 1
      );
  }

  return value;
}


function parseAuditorJson(text) {
  try {
    return JSON.parse(
      cleanJsonText(text)
    );
  } catch (error) {
    console.error(
      "[AI AUDITOR] JSON parse error:",
      error.message
    );

    return null;
  }
}


function buildAuditPrompt({
  contentType,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent
}) {
  return `
Ты — строгий семантический факт-аудитор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — определить, содержит ли готовый контент КОНКРЕТНЫЕ УТВЕРЖДЕНИЯ, которые выглядят как факты о данном бизнесе, аудитории или предложении, но не подтверждены входными данными.

Это не проверка правдоподобия.

Это проверка ДОКАЗАТЕЛЬНОСТИ.

Правдоподобно ≠ подтверждено.


====================
ИСТОЧНИК ИСТИНЫ
====================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Что продаёт / предложение:
${offer || "не указано"}

Цель:
${contentGoal}

Тема:
${reelsTopic || "не задана отдельно"}

Формат:
${contentType}

Стиль:
${contentStyle}


====================
КОНТЕНТ
====================

${generatedContent}


====================
КАК ПРИНИМАТЬ РЕШЕНИЕ
====================

Проверяй смысл, а не отдельные слова.

Для каждого существенного конкретного утверждения спроси:

«Могу ли я показать точную смысловую опору этому утверждению в данных клиента?»


ЕСЛИ ДА → разрешено.

ЕСЛИ НЕТ → нарушение.


Особенно ловить «правдоподобные выдумки»:

фразы, которые звучат естественно для маркетинга, но не следуют из входных данных.

Например:

- «после работы с экспертом клиент меняет мышление»;
- «классический подход больше не работает»;
- «раньше этот метод давал результат»;
- «эксперт использует определённый процесс»;
- «клиенты получают конкретный результат»;
- «у аудитории часто возникает конкретная ситуация», если она не дана;
- «переходите по ссылке в профиле», если наличие такой ссылки не подтверждено.


СТРОГО ПРОВЕРЯЙ:

- числа;
- проценты;
- сроки;
- даты;
- цены;
- скидки;
- количества;
- продукты;
- услуги;
- свойства продуктов и услуг;
- процессы;
- этапы;
- методы;
- технологии;
- оборудование;
- клиентов;
- подписчиков;
- отзывы;
- комментарии;
- кейсы;
- продажи;
- результаты;
- личные истории;
- прошлые события;
- утверждения от первого лица;
- обещания;
- гарантии;
- причинно-следственные связи;
- наличие ресурсов;
- чек-листов;
- гайдов;
- файлов;
- ссылок;
- подарков;
- расчётов;
- консультаций;
- конкретных объектов для съёмки, если они выдаются за существующие у клиента.


ЧТО РАЗРЕШЕНО:

- метафоры;
- юмор;
- сравнения;
- гиперболы;
- эмоциональные образы;
- маркетинговые цели;
- маркетинговые задачи;
- универсальные приёмы;
- текст на экране;
- субтитры;
- монтаж;
- графика;
- голос за кадром;
- условные рекомендации;
- вопросы аудитории;
- нейтральные CTA.


Условные конструкции:

«если у вас есть...»
«можно показать...»
«представьте...»
«например...»


допустимы, если они не утверждают существование объекта или события.


ВАЖНО:

1. Не требуй, чтобы каждая творческая фраза была буквально подтверждена.

2. Проверяй только конкретные фактические утверждения.

3. Не считай метафору фактом только потому, что в ней есть существительное.

4. Если фраза сформулирована как условный сценарий, не помечай её как выдуманный факт.

5. Если сомневаешься между «факт» и «творческая формулировка», оцени полный контекст предложения.

6. Если конкретное утверждение можно подтвердить только здравым смыслом или типичностью ниши — это НЕДОСТАТОЧНО.

7. Если ты возвращаешь passed=true, это означает, что ты проверил существенные конкретные утверждения и не нашёл ни одного неподтверждённого факта, скрытого под правдоподобной маркетинговой формулировкой.

8. Не оценивай стиль, качество, продающую силу или оригинальность.


Для каждого нарушения укажи КОРОТКИЙ точный фрагмент и объясни, какого подтверждения не хватает.


====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент",
      "reason": "конкретное неподтверждённое утверждение",
      "support": "какой опоры нет во входных данных"
    }
  ]
}


Если нарушений нет:

{
  "passed": true,
  "violations": []
}


Если violations не пустой, passed ОБЯЗАТЕЛЬНО false.

Максимум 12 нарушений.
`;
}


/* ============================================================
   AI AUDIT EXECUTION
============================================================ */

async function auditGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  offer,
  generatedContent,
  label
}) {
  const deterministicViolations =
    getDeterministicViolations({
      content: generatedContent,
      businessInfo,
      targetAudience,
      offer,
      contentGoal,
      reelsTopic
    });


  const prompt =
    buildAuditPrompt({
      contentType,
      businessInfo,
      targetAudience,
      offer,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent
    });


  try {
    const audit =
      await generateWithGigaChat({
        token,
        prompt,
        temperature: 0.1,
        maxTokens: 450,
        label: `${label} AI AUDITOR`
      });


    const parsed =
      parseAuditorJson(
        audit.result
      );


    if (
      !parsed ||
      typeof parsed.passed !== "boolean" ||
      !Array.isArray(parsed.violations)
    ) {
      console.error(
        "[AI AUDITOR] Invalid auditor response."
      );

      return {
        available: false,
        passed:
          deterministicViolations.length === 0,
        violations:
          deterministicViolations,
        deterministicViolations,
        raw: audit.result
      };
    }


    const aiViolations =
      parsed.violations
        .filter(
          item =>
            item &&
            typeof item.text === "string" &&
            typeof item.reason === "string"
        )
        .slice(0, 12)
        .map(item => ({
          text: item.text.trim(),
          reason: item.reason.trim(),
          support:
            typeof item.support === "string"
              ? item.support.trim()
              : ""
        }))
        .filter(
          item =>
            item.text &&
            item.reason
        );


    const merged = [
      ...deterministicViolations,
      ...aiViolations
    ];


    const unique = [];
    const seen = new Set();


    for (const item of merged) {
      const key =
        String(item.text)
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      unique.push(item);
    }


    const violations =
      unique.slice(0, 15);

    const passed =
      violations.length === 0;


    console.log(
      `[AI AUDITOR] AI passed: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] Deterministic violations: ${deterministicViolations.length}`
    );

    console.log(
      `[AI AUDITOR] Total violations: ${violations.length}`
    );


    return {
      available: true,
      passed,
      violations,
      deterministicViolations,
      aiViolations,
      raw: parsed
    };
  } catch (error) {
    console.error(
      "[AI AUDITOR] Failed:",
      error.message
    );

    return {
      available: false,
      passed:
        deterministicViolations.length === 0,
      violations:
        deterministicViolations,
      deterministicViolations,
      error: error.message
    };
  }
}


/* ============================================================
   REPAIR PROMPT
============================================================ */

function buildRepairPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  offer,
  generatedContent,
  violations
}) {
  const violationBlock =
    violations
      .map(
        (item, index) =>
          `${index + 1}. Фрагмент: «${item.text}»\n` +
          `Причина: ${item.reason}` +
          (
            item.support
              ? `\nОпора: ${item.support}`
              : ""
          )
      )
      .join("\n\n");


  return `
Ты — финальный редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — исправить готовый контент после строгой факт-проверки.


====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Что продаёт / предложение:
${offer || "не указано"}

Цель:
${contentGoal}

Тема:
${reelsTopic || "не задана отдельно"}

Стиль:
${contentStyle}


====================
НАЙДЕННЫЕ НАРУШЕНИЯ
====================

${violationBlock}


====================
ИСХОДНЫЙ КОНТЕНТ
====================

${generatedContent}


====================
ПРАВИЛА ИСПРАВЛЕНИЯ
====================

1. Исправь каждое перечисленное нарушение.

2. НЕ ДОБАВЛЯЙ НИКАКИХ НОВЫХ ФАКТОВ.

3. Во время исправления нельзя придумывать замену неподтверждённой детали.

4. Если факт не подтверждён — удали его или подними уровень абстракции.

5. Если конкретный сценарий зависит от существования объекта или события, переведи его в условную рекомендацию:
«если у вас есть...»
«можно...»
«например...»
«представьте...»

Не утверждай существование этого объекта или события.

6. Если число не подтверждено — удали число.

Не заменяй его другим числом.

7. Если личная история не подтверждена — не создавай новую историю.

Переведи идею в универсальный разбор или условный сценарий.

8. Если процесс работы не описан клиентом — не придумывай этапы, консультации, анализ, правки, созвоны, оборудование и технологии.

9. Если есть неподтверждённое свойство или результат — убери его.

Не заменяй его другим неподтверждённым свойством или результатом.

10. Не используй от первого лица:
«я»
«мы»
«у нас»
«мой»
«наша»

для неподтверждённого опыта, процесса или факта.

11. Сохрани полезность, конкретность, структуру, формат и стиль настолько, насколько это возможно без выдуманных фактов.

12. Метафоры, юмор, сравнения, гиперболы и эмоциональные формулировки сохраняй, если они не создают конкретный новый факт.

13. Универсальные приёмы съёмки и монтажа можно сохранять.

14. Обычные CTA можно сохранять, если они ничего не обещают и не утверждают неподтверждённый ресурс.

15. Не объясняй, что именно ты исправил.

16. Верни только готовый исправленный контент.

17. ИСПРАВЛЯЙ МИНИМАЛЬНО.

Не переписывай весь материал в абстрактный набор фраз, если можно заменить только неподтверждённое утверждение.

18. Сохраняй исходные:
- тему;
- формат;
- структуру;
- маркетинговую задачу;
- связь с известными данными клиента.

19. Если нарушенная деталь заменяется, сначала попробуй привязать формулировку к точному факту из данных клиента.

Если такой привязки нет, используй содержательную абстракцию или условный сценарий.

Не используй пустое:
«расскажите о своей услуге».

20. Не удаляй полезную мысль только потому, что в ней есть творческая формулировка.

Удаляй только неподтверждённую конкретику.


====================
ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ОТВЕТОМ
====================

Перед выдачей текста самостоятельно проверь каждое предложение:

- Есть ли у конкретного факта прямая опора во входных данных?
- Если числа нет во входных данных — удалено ли оно?
- Не появилась ли новая история?
- Не появился ли новый кейс?
- Не появился ли новый клиент?
- Не появились ли комментарии или отзывы?
- Не появился ли новый результат?
- Не появился ли новый процесс работы?
- Не появился ли новый объект?
- Не появилось ли оборудование?
- Не появилась ли технология?
- Не утверждается ли как существующее то, что было лишь идеей для съёмки?
- Если опоры нет — заменена ли фраза на содержательную абстракцию или условную рекомендацию?

Если сомневаешься, выбирай более абстрактную формулировку, НО сохраняй исходную маркетинговую мысль.
`;
}


/* ============================================================
   REPAIR EXECUTION
============================================================ */

async function repairGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  offer,
  generatedContent,
  violations,
  label
}) {
  const prompt =
    buildRepairPrompt({
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      offer,
      generatedContent,
      violations
    });


  return generateWithGigaChat({
    token,
    prompt,
    temperature: 0.15,
    maxTokens: 900,
    label: `${label} REPAIR`
  });
}


/* ============================================================
   POST FILTER
   ONE REPAIR + SECOND AUDIT
============================================================ */

async function postFilterGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  offer,
  generatedContent,
  label
}) {
  console.log(
    `[${label}] Starting semantic fact audit...`
  );


  const firstAudit =
    await auditGeneratedContent({
      token,
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      offer,
      generatedContent,
      label
    });


  if (
    !firstAudit.available &&
    firstAudit.passed
  ) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null,
      finalPassed: true
    };
  }


  if (firstAudit.passed) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null,
      finalPassed: true
    };
  }


  console.log(
    `[${label}] Violations detected. Starting exactly one repair pass...`
  );


  try {
    const repaired =
      await repairGeneratedContent({
        token,
        contentType,
        businessInfo,
        targetAudience,
        contentGoal,
        reelsTopic,
        contentStyle,
        offer,
        generatedContent,
        violations:
          firstAudit.violations,
        label
      });


    const secondAudit =
      await auditGeneratedContent({
        token,
        contentType,
        businessInfo,
        targetAudience,
        contentGoal,
        reelsTopic,
        contentStyle,
        offer,
        generatedContent:
          repaired.result,
        label:
          `${label} SECOND`
      });


    const finalDeterministicViolations =
      getDeterministicViolations({
        content: repaired.result,
        businessInfo,
        targetAudience,
        offer,
        contentGoal,
        reelsTopic
      });


    const finalPassed =
      secondAudit.passed &&
      finalDeterministicViolations.length === 0;


    if (!finalPassed) {
      console.warn(
        `[${label}] Final audit did not pass. No additional repair loop will run.`
      );
    }


    return {
      result: repaired.result,
      audit: firstAudit,
      repaired: true,

      secondAudit: {
        ...secondAudit,
        finalDeterministicViolations
      },

      finalPassed
    };
  } catch (error) {
    console.error(
      `[${label}] Repair failed. Returning original content:`,
      error.message
    );

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null,
      finalPassed: false,
      repair_error: error.message
    };
  }
}


/* ============================================================
   PLAN VALIDATION
============================================================ */

function validatePlanData({
  bridge_key,
  business_info,
  target_audience,
  content_goal,
  content_style
}) {
  if (!bridge_key) {
    return "bridge_key is required";
  }

  if (!BRIDGE_KEY) {
    return "BRIDGE_KEY is not configured";
  }

  if (bridge_key !== BRIDGE_KEY) {
    return "Invalid bridge_key";
  }

  if (!business_info) {
    return "business_info is required";
  }

  if (!target_audience) {
    return "target_audience is required";
  }

  if (!content_goal) {
    return "content_goal is required";
  }

  if (!content_style) {
    return "content_style is required";
  }

  return null;
}


/* ============================================================
   PLAN GENERATION
============================================================ */

async function generatePlanChunk({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  contentStyle,
  previousPlan,
  label
}) {
  const token =
    await getAccessToken();


  const prompt =
    buildPlanChunkPrompt({
      startDay,
      endDay,
      businessInfo,
      targetAudience,
      offer,
      contentGoal,
      contentStyle,
      previousPlan
    });


  const generated =
    await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.35,
      maxTokens: 550,
      label
    });


  const filtered =
    await postFilterGeneratedContent({
      token,
      contentType:
        `Контент-план, дни ${startDay}-${endDay}`,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic: "",
      contentStyle,
      offer,
      generatedContent:
        generated.result,
      label
    });


  return {
    ...generated,

    result:
      filtered.result,

    audit:
      filtered.audit,

    repaired:
      filtered.repaired,

    secondAudit:
      filtered.secondAudit,

    finalPassed:
      filtered.finalPassed,

    repair_error:
      filtered.repair_error || null
  };
}


/* ============================================================
   PLAN ENDPOINT
============================================================ */

async function handlePlanChunk(
  req,
  res,
  startDay,
  endDay
) {
  const startedAt =
    Date.now();


  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    `PLAN CHUNK REQUEST: ${startDay}-${endDay}`
  );
  console.log(
    "===================================="
  );


  const {
    bridge_key,
    business_info,
    target_audience,
    offer,
    content_goal,
    content_style,
    previous_plan
  } = req.body || {};


  const validationError =
    validatePlanData({
      bridge_key,
      business_info,
      target_audience,
      content_goal,
      content_style
    });


  if (validationError) {
    const status =
      validationError === "Invalid bridge_key" ||
      validationError === "bridge_key is required"
        ? 401
        : 400;

    return res.status(status).json({
      ok: false,
      error: validationError
    });
  }


  const safePreviousPlan =
    String(previous_plan || "")
      .slice(-18000);


  if (
    !acquireGenerationLock(
      `PLAN ${startDay}-${endDay}`
    )
  ) {
    return res.status(429).json({
      ok: false,
      error:
        "Generation already in progress. Please try again later."
    });
  }


  try {
    const result =
      await generatePlanChunk({
        startDay,
        endDay,

        businessInfo:
          business_info,

        targetAudience:
          target_audience,

        offer,

        contentGoal:
          content_goal,

        contentStyle:
          content_style,

        previousPlan:
          safePreviousPlan,

        label:
          `PLAN DAYS ${startDay}-${endDay}`
      });


    return res.json({
      ok: true,

      start_day:
        startDay,

      end_day:
        endDay,

      model:
        GIGACHAT_MODEL,

      status:
        result.status,

      time_ms:
        Date.now() - startedAt,

      result_length:
        result.result.length,

      post_filter: {
        auditor_available:
          result.audit?.available || false,

        triggered:
          !(result.audit?.passed ?? true),

        repaired:
          result.repaired || false,

        warnings:
          result.audit?.violations?.length || 0,

        second_audit_passed:
          result.secondAudit?.passed ?? null,

        final_passed:
          result.finalPassed ?? null,

        final_deterministic_violations:
          result.secondAudit
            ?.finalDeterministicViolations || []
      },

      reels_result:
        result.result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,

      start_day:
        startDay,

      end_day:
        endDay,

      message:
        error.message,

      status:
        error.response?.status,

      response:
        error.response?.data,

      time_ms:
        Date.now() - startedAt
    });
  } finally {
    releaseGenerationLock(
      `PLAN ${startDay}-${endDay}`
    );
  }
}


/* ============================================================
   HEALTH
============================================================ */

app.get("/health", (req, res) => {
  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    model:
      GIGACHAT_MODEL,

    gigachat_key_configured:
      !!GIGACHAT_KEY,

    bridge_key_configured:
      !!BRIDGE_KEY,

    generation_in_progress:
      generationInProgress,

    generation_lock_age_ms:
      generationInProgress
        ? Date.now() - generationStartedAt
        : 0
  });
});


/* ============================================================
   ROOT
============================================================ */

app.get("/", (req, res) => {
  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    message:
      "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",

    endpoints: {
      health:
        "/health",

      test_auth:
        "/test-auth",

      test_generate:
        "/test-generate",

      test_plan_1_5:
        "/test-plan-1-5",

      generate:
        "POST /generate",

      plan_1_5:
        "POST /generate-plan-1-5",

      plan_6_10:
        "POST /generate-plan-6-10",

      plan_11_15:
        "POST /generate-plan-11-15",

      plan_16_20:
        "POST /generate-plan-16-20",

      plan_21_25:
        "POST /generate-plan-21-25",

      plan_26_30:
        "POST /generate-plan-26-30"
    }
  });
});


/* ============================================================
   TEST AUTH
============================================================ */

app.get(
  "/test-auth",
  async (req, res) => {
    try {
      const token =
        await getAccessToken();

      res.json({
        ok: true,
        stage: "auth",
        token_received:
          !!token
      });
    } catch (error) {
      console.error(
        "AUTH ERROR:",
        error.message
      );

      res.status(500).json({
        ok: false,
        stage: "auth",
        error:
          error.message
      });
    }
  }
);


/* ============================================================
   TEST GENERATE
============================================================ */

app.get(
  "/test-generate",
  async (req, res) => {
    const startedAt =
      Date.now();

    try {
      const token =
        await getAccessToken();

      const response =
        await axios.post(
          CHAT_URL,
          {
            model:
              GIGACHAT_MODEL,

            messages: [
              {
                role: "user",
                content:
                  "Ответь одним словом: Да"
              }
            ],

            temperature:
              0.2,

            max_tokens:
              10
          },
          {
            httpsAgent,

            timeout:
              9000,

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json"
            }
          }
        );


      const result =
        response.data
          ?.choices?.[0]
          ?.message
          ?.content || "";


      res.json({
        ok: true,

        stage:
          "generation",

        status:
          response.status,

        time_ms:
          Date.now() - startedAt,

        response:
          response.data,

        reels_result:
          result
      });
    } catch (error) {
      console.error(
        "TEST GENERATE ERROR:",
        error.message
      );

      res.status(500).json({
        ok: false,

        stage:
          "generation",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });
    }
  }
);


/* ============================================================
   TEST PLAN 1-5
============================================================ */

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    const startedAt =
      Date.now();


    if (
      !acquireGenerationLock(
        "TEST PLAN 1-5"
      )
    ) {
      return res.status(429).json({
        ok: false,
        test:
          "plan-1-5",
        error:
          "Generation already in progress"
      });
    }


    try {
      const result =
        await generatePlanChunk({
          startDay:
            1,

          endDay:
            5,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          offer:
            "свои услуги или продукты",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно",

          previousPlan:
            "",

          label:
            "TEST PLAN 1-5"
        });


      res.json({
        ok: true,

        test:
          "plan-1-5",

        status:
          result.status,

        time_ms:
          Date.now() - startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

        post_filter: {
          auditor_available:
            result.audit?.available || false,

          first_audit_passed:
            result.audit?.passed ?? null,

          triggered:
            !(result.audit?.passed ?? true),

          repaired:
            result.repaired || false,

          violations_count:
            result.audit?.violations?.length || 0,

          violations:
            result.audit?.violations || [],

          repair_error:
            result.repair_error || null,

          second_audit_available:
            result.secondAudit?.available ?? null,

          second_audit_passed:
            result.secondAudit?.passed ?? null,

          second_audit_violations_count:
            result.secondAudit?.violations?.length || 0,

          second_audit_violations:
            result.secondAudit?.violations || [],

          final_passed:
            result.finalPassed ?? null,

          final_deterministic_violations:
            result.secondAudit
              ?.finalDeterministicViolations || [],

          first_audit_raw:
            result.audit?.raw || null,

          second_audit_raw:
            result.secondAudit?.raw || null,

          first_audit_error:
            result.audit?.error || null,

          second_audit_error:
            result.secondAudit?.error || null
        },

        reels_result:
          result.result
      });
    } catch (error) {
      res.status(500).json({
        ok: false,

        test:
          "plan-1-5",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });
    } finally {
      releaseGenerationLock(
        "TEST PLAN 1-5"
      );
    }
  }
);


/* ============================================================
   PLAN ROUTES
============================================================ */

app.post(
  "/generate-plan-1-5",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      1,
      5
    )
);

app.post(
  "/generate-plan-6-10",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      6,
      10
    )
);

app.post(
  "/generate-plan-11-15",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      11,
      15
    )
);

app.post(
  "/generate-plan-16-20",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      16,
      20
    )
);

app.post(
  "/generate-plan-21-25",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      21,
      25
    )
);

app.post(
  "/generate-plan-26-30",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      26,
      30
    )
);


/* ============================================================
   NORMAL GENERATE
============================================================ */

app.post(
  "/generate",
  async (req, res) => {
    const startedAt =
      Date.now();

    let lockAcquired =
      false;


    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      "GENERATE REQUEST RECEIVED"
    );

    console.log(
      "===================================="
    );


    try {
      const {
        bridge_key,
        content_type,
        business_info,
        target_audience,
        offer,
        content_goal,
        reels_topic,
        content_style
      } = req.body || {};


      console.log(
        "Content-Type:",
        content_type
      );

      console.log(
        "Body keys:",
        Object.keys(
          req.body || {}
        )
      );


      if (!bridge_key) {
        return res.status(401).json({
          ok: false,
          error:
            "bridge_key is required"
        });
      }


      if (!BRIDGE_KEY) {
        return res.status(500).json({
          ok: false,
          error:
            "BRIDGE_KEY is not configured"
        });
      }


      if (
        bridge_key !== BRIDGE_KEY
      ) {
        return res.status(401).json({
          ok: false,
          error:
            "Invalid bridge_key"
        });
      }


      if (!content_type) {
        return res.status(400).json({
          ok: false,
          error:
            "content_type is required"
        });
      }


      if (!business_info) {
        return res.status(400).json({
          ok: false,
          error:
            "business_info is required"
        });
      }


      if (!target_audience) {
        return res.status(400).json({
          ok: false,
          error:
            "target_audience is required"
        });
      }


      if (!content_goal) {
        return res.status(400).json({
          ok: false,
          error:
            "content_goal is required"
        });
      }


      if (!content_style) {
        return res.status(400).json({
          ok: false,
          error:
            "content_style is required"
        });
      }


      if (
        isContentPlan(
          content_type
        )
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "Для контент-плана используй отдельные endpoints: /generate-plan-1-5, /generate-plan-6-10, /generate-plan-11-15, /generate-plan-16-20, /generate-plan-21-25, /generate-plan-26-30"
        });
      }


      if (!reels_topic) {
        return res.status(400).json({
          ok: false,
          error:
            "reels_topic is required"
        });
      }


      if (
        !acquireGenerationLock(
          "NORMAL CONTENT"
        )
      ) {
        return res.status(429).json({
          ok: false,
          error:
            "Generation already in progress. Please try again later."
        });
      }

      lockAcquired = true;


      const token =
        await getAccessToken();


      const prompt =
        buildPrompt({
          contentType:
            content_type,

          businessInfo:
            business_info,

          targetAudience:
            target_audience,

          offer,

          contentGoal:
            content_goal,

          reelsTopic:
            reels_topic,

          contentStyle:
            content_style
        });


      const result =
        await generateWithGigaChat({
          token,

          prompt,

          temperature:
            0.75,

          maxTokens:
            1800,

          label:
            "NORMAL CONTENT"
        });


      const filtered =
        await postFilterGeneratedContent({
          token,

          contentType:
            content_type,

          businessInfo:
            business_info,

          targetAudience:
            target_audience,

          offer,

          contentGoal:
            content_goal,

          reelsTopic:
            reels_topic,

          contentStyle:
            content_style,

          generatedContent:
            result.result,

          label:
            "NORMAL CONTENT"
        });


      return res.json({
        ok: true,

        content_type:
          content_type,

        status:
          result.status,

        time_ms:
          Date.now() - startedAt,

        result_length:
          filtered.result.length,

        post_filter: {
          auditor_available:
            filtered.audit?.available || false,

          triggered:
            !(filtered.audit?.passed ?? true),

          repaired:
            filtered.repaired,

          warnings:
            filtered.audit?.violations?.length || 0,

          second_audit_passed:
            filtered.secondAudit?.passed ?? null,

          final_passed:
            filtered.finalPassed ?? null,

          final_deterministic_violations:
            filtered.secondAudit
              ?.finalDeterministicViolations || []
        },

        reels_result:
          filtered.result
      });
    } catch (error) {
      console.error(
        "GENERATE ERROR"
      );

      console.error(
        "Message:",
        error.message
      );

      console.error(
        "Status:",
        error.response?.status
      );

      console.error(
        "Response:",
        error.response?.data
      );


      return res.status(500).json({
        ok: false,

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });
    } finally {
      if (lockAcquired) {
        releaseGenerationLock(
          "NORMAL CONTENT"
        );
      }
    }
  }
);


/* ============================================================
   404
============================================================ */

app.use(
  (req, res) => {
    res.status(404).json({
      ok: false,
      error:
        "Endpoint not found",
      path:
        req.path,
      method:
        req.method
    });
  }
);


/* ============================================================
   GLOBAL ERROR
============================================================ */

app.use(
  (error, req, res, next) => {
    console.error(
      "GLOBAL ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Internal server error"
    });
  }
);


/* ============================================================
   PROCESS ERROR LOGGING
============================================================ */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);


process.on(
  "uncaughtException",
  error => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);


/* ============================================================
   SERVER START
============================================================ */

app.listen(
  PORT,
  () => {
    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      "МОЙ КОНТЕНТ-КОНСТРУКТОР"
    );

    console.log(
      "Gateway started"
    );

    console.log(
      "===================================="
    );

    console.log(
      "PORT:",
      PORT
    );

    console.log(
      "MODEL:",
      GIGACHAT_MODEL
    );

    console.log(
      "GIGACHAT_KEY:",
      GIGACHAT_KEY
        ? "configured"
        : "MISSING"
    );

    console.log(
      "BRIDGE_KEY:",
      BRIDGE_KEY
        ? "configured"
        : "MISSING"
    );

    console.log(
      "PLAN ENDPOINTS:"
    );

    console.log(
      "POST /generate-plan-1-5"
    );

    console.log(
      "POST /generate-plan-6-10"
    );

    console.log(
      "POST /generate-plan-11-15"
    );

    console.log(
      "POST /generate-plan-16-20"
    );

    console.log(
      "POST /generate-plan-21-25"
    );

    console.log(
      "POST /generate-plan-26-30"
    );

    console.log(
      "===================================="
    );
  }
);
