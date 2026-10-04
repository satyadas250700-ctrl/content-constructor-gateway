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

const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://api.giga.chat/v1/chat/completions";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

let accessToken = null;
let tokenExpiresAt = 0;

let generationInProgress = false;
let generationStartedAt = 0;

const GENERATION_LOCK_TIMEOUT = 120000;


// ============================================================
// GENERATION LOCK
// ============================================================

function acquireGenerationLock(source) {
  const now = Date.now();

  if (generationInProgress) {
    const age = now - generationStartedAt;

    if (age < GENERATION_LOCK_TIMEOUT) {
      console.warn(
        `[LOCK] Busy. Source: ${source}. Age: ${age} ms`
      );

      return false;
    }

    console.warn(
      `[LOCK] Stale lock detected (${age} ms). Resetting.`
    );
  }

  generationInProgress = true;
  generationStartedAt = now;

  console.log(`[LOCK] Acquired by ${source}`);

  return true;
}

function releaseGenerationLock(source) {
  generationInProgress = false;
  generationStartedAt = 0;

  console.log(`[LOCK] Released by ${source}`);
}


// ============================================================
// GIGACHAT AUTH
// ============================================================

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


// ============================================================
// CONTENT TYPE
// ============================================================

function isContentPlan(contentType) {
  const type = String(contentType || "").toLowerCase();

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}


// ============================================================
// NORMAL CONTENT INSTRUCTIONS
// ============================================================

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
- продукт или услугу;
- целевую аудиторию;
- цель;
- тему;
- стиль.

Ответ только на русском языке.
`;
}


// ============================================================
// NORMAL CONTENT PROMPT
// ============================================================

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
Ты — профессиональный российский контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

====================
ДАННЫЕ КЛИЕНТА
====================

Формат: ${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Оффер / что продаётся:
${offer || "не указан отдельно"}

Цель контента:
${contentGoal}

Тема:
${reelsTopic || "Определи подходящую тему самостоятельно."}

Стиль:
${contentStyle}

====================
ИНСТРУКЦИЯ
====================

${getContentInstructions(contentType)}

====================
ОБЩИЕ ТРЕБОВАНИЯ
====================

- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без фраз вроде «в современном мире».
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Учитывай бизнес, продукт/услугу, аудиторию, цель и стиль.
- Контент должен быть практически применим.

====================
КРИТИЧЕСКОЕ ПРАВИЛО ФАКТОВ
====================

Не придумывай реальные факты о клиенте.

Разрешены:
- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- художественные формулировки;
- универсальные рекомендации по съёмке;
- условные конструкции «если у вас есть...»;
- «можно снять...»;
- «представьте...»;
- графика;
- текст на экране;
- монтаж;
- субтитры;
- голос за кадром.

Запрещено выдавать как реальность то, чего клиент не сообщал.

Не придумывай:
- клиентов;
- отзывы;
- кейсы;
- результаты;
- цифры;
- цены;
- скидки;
- даты;
- сроки;
- процессы;
- этапы;
- консультации;
- созвоны;
- оборудование;
- помещения;
- интерьер;
- сотрудников;
- технологии;
- приложения;
- истории;
- личный опыт;
- свойства продукта;
- гарантии;
- обещания результата.

Если конкретной информации недостаточно — используй более абстрактную формулировку, а не выдумывай недостающую деталь.

Выдай только готовый контент.
`;
}


// ============================================================
// 30-DAY PLAN PROMPT
// ============================================================

function buildPlanChunkPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
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

Построй первые дни так, чтобы человек постепенно переходил от внимания к интересу и доверию.
`;

  return `
Ты — профессиональный контент-стратег для предпринимателей и экспертов.

Создай часть единого контент-плана на 30 дней.

ТОЛЬКО ДНИ ${startDay}–${endDay}.

====================
ДАННЫЕ КЛИЕНТА
====================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

${contextBlock}

====================
ЛОГИКА ПЛАНА
====================

Постепенно веди аудиторию по пути:

внимание → интерес → экспертность → доверие → желание → действие.

Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост

====================
ТРЕБОВАНИЯ
====================

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть конкретным.
3. Темы должны соответствовать именно этому бизнесу.
4. Не используй абстрактные универсальные идеи.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Ответ только на русском языке.

====================
ФОРМАТ
====================

День N — Формат

Тема: конкретная тема

Идея: что именно показать или раскрыть

Задача: какую реакцию или действие должна вызвать публикация

CTA: конкретный призыв к действию

Каждый пункт — короткий, но содержательный.

Не используй одинаковые CTA каждый день.

====================
ФАКТИЧНОСТЬ
====================

Нельзя придумывать факты о бизнесе.

Разрешены:
- метафоры;
- сравнения;
- юмор;
- гиперболы;
- художественные формулировки;
- эмоциональные образы;
- условные сценарии;
- универсальные рекомендации по съёмке;
- текст на экране;
- монтаж;
- графика;
- субтитры;
- голос за кадром.

Нельзя придумывать:
- реальные истории;
- клиентов;
- кейсы;
- отзывы;
- результаты;
- цифры;
- цены;
- скидки;
- сроки;
- даты;
- конкретные помещения;
- конкретные предметы;
- оборудование;
- сотрудников;
- процессы;
- этапы работы;
- консультации;
- созвоны;
- технологии;
- приложения;
- свойства продукта;
- гарантии;
- обещания результата.

Если конкретной информации нет, подними уровень абстракции.

Не заменяй отсутствующую деталь другой выдуманной деталью.

ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
`;
}


// ============================================================
// GIGACHAT GENERATION
// ============================================================

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

    const elapsed =
      Date.now() - startedAt;

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
    const elapsed =
      Date.now() - startedAt;

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


// ============================================================
// AUDITOR JSON HELPERS
// ============================================================

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


// ============================================================
// AI FACT AUDIT PROMPT
// ============================================================

function buildAuditPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent
}) {
  return `
Ты — строгий редактор-фактчекер сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент на ФАКТИЧЕСКУЮ ОПОРУ именно на данных конкретного клиента.

====================
ГЛАВНОЕ ПРАВИЛО
====================

НЕТ ПРЯМОЙ ОПОРЫ В ИСХОДНЫХ ДАННЫХ
→ ЗНАЧИТ ЭТО НЕПОДТВЕРЖДЁННЫЙ ФАКТ.

Не додумывай за клиента то, чего он не сообщил.

====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель:
${contentGoal}

Тема:
${reelsTopic || "не задана отдельно"}

Стиль:
${contentStyle}

====================
ГОТОВЫЙ КОНТЕНТ
====================

${generatedContent}

====================
АЛГОРИТМ ПРОВЕРКИ
====================

Для КАЖДОГО конкретного утверждения в готовом контенте мысленно задай вопрос:

«Какой конкретный фрагмент исходных данных подтверждает это утверждение?»

Если можешь указать прямую смысловую опору — разрешено.

Если опоры нет — это нарушение.

Если не уверен, есть ли опора, считай, что опоры НЕТ.

====================
ОСОБЕННО СТРОГО ПРОВЕРЯЙ
====================

- числа;
- проценты;
- количество;
- длительность;
- сроки;
- даты;
- возраст;
- цены;
- стоимость;
- скидки;
- акции;
- финансовые условия;
- реальные истории;
- личный опыт;
- прошлые события;
- ошибки;
- провалы;
- кейсы;
- клиентов;
- подписчиков;
- комментарии;
- отзывы;
- продажи;
- результаты;
- обещания;
- гарантии;
- конкретные продукты;
- услуги;
- объекты;
- помещения;
- оборудование;
- локации;
- конкретные действия бизнеса;
- рабочие процессы;
- технологии;
- методы;
- этапы;
- свойства продукта или услуги;
- утверждения от первого лица;
- утверждения о том, что что-то уже происходило;
- утверждения о регулярности;
- утверждения о будущем результате.

====================
КРИТИЧЕСКИ ВАЖНО
====================

1. Любое конкретное число в тексте является нарушением, если такого числа нет во входных данных.

Исключение:
- номера дней;
- техническая нумерация слайдов;
- структурная нумерация.

2. «15 секунд», «90%», «5 критериев», «прошлый пост», «комментарий подписчика», «завтра», «один из клиентов» — конкретные обстоятельства.

Если они не подтверждены — помечай их.

3. «Моя услуга устроена так», «мы распределяем ответственность», «я прошёл через...», «мы используем...» нельзя считать фактом только потому, что это правдоподобно.

4. Не разрешается превращать общую бизнес-нишу в выдуманный процесс.

Например:

Если известно только:
«эксперт продаёт услуги»,

нельзя автоматически утверждать наличие:
- консультаций;
- этапов;
- созвонов;
- анализа;
- правок;
- кейсов;
- диагностики;
- конкретной системы работы.

5. Не разрешается превращать наличие продукта в выдуманные свойства, результаты или клиентский опыт.

6. Сценарная идея может быть условной.

Допустимо:

«если у вас есть...»

«можно снять...»

«представьте...»

«например...»

Но нельзя утверждать существование объекта или события как факт.

7. Простые универсальные рекомендации по съёмке допустимы:

- текст на экране;
- монтаж;
- субтитры;
- графика;
- крупный план;
- голос за кадром.

Но нельзя утверждать, что у клиента уже есть конкретный предмет, помещение, сотрудник, отзыв или кейс.

8. Метафоры, сравнения, юмор, гиперболы и эмоциональные образы допустимы.

9. Маркетинговая задача не является фактом.

Например:

«привлечь внимание»

«вызвать доверие»

«показать экспертность»

не требуют подтверждения.

10. Обычный CTA допустим.

Но нельзя обещать неподтверждённый ресурс:

«пришлю кейс»

«дам чек-лист»

«отправлю гайд»

«рассчитаю стоимость»

если наличие такого ресурса не подтверждено.

11. Не оценивай качество идеи.

Не оценивай:
- стиль;
- маркетинговую силу;
- эмоциональность.

Проверяй только фактологическую опору.

====================
ПРИМЕРЫ
====================

Плохо:

«Эксперт открывает комментарии под прошлым постом и выбирает вопрос подписчика».

Хорошо:

«Если под публикациями уже есть вопросы аудитории, можно выбрать один из них для короткого разбора».

Плохо:

«Эксперт рассказывает о своих первых ошибках».

Хорошо:

«Можно разобрать типичную ошибку в нише и объяснить, как её распознать».

Плохо:

«За 15 секунд покажите...».

Хорошо:

«Сделайте короткое динамичное видео...».

Плохо:

«5 критериев выбора».

Хорошо:

«Несколько критериев выбора».

Плохо:

«Что получает клиент и какие этапы включает ваша работа».

Если эти сведения не даны — нарушение.

Хорошо:

«Раскройте те элементы услуги, которые действительно указаны в описании бизнеса».

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON.

Без Markdown.

Без пояснений.

Если нарушений нет:

{
  "passed": true,
  "violations": []
}

Если есть нарушения:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из контента",
      "reason": "почему он не имеет прямой опоры во входных данных",
      "support": "какой именно факт отсутствует или не подтверждён"
    }
  ]
}

Критически важно:

если violations содержит хотя бы один элемент,
passed ДОЛЖЕН быть false.

Максимум 15 нарушений.
`;
}


// ============================================================
// DETERMINISTIC FACT CHECK
// ============================================================

function getDeterministicViolations({
  generatedContent,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {
  const text =
    String(generatedContent || "");

  const violations = [];

  const add = (
    fragment,
    reason,
    support
  ) => {
    const clean =
      String(fragment || "").trim();

    if (!clean) return;

    if (
      violations.some(
        item => item.text === clean
      )
    ) {
      return;
    }

    violations.push({
      text: clean,
      reason,
      support
    });
  };


  // ----------------------------------------------------------
  // PLACEHOLDERS
  // ----------------------------------------------------------

  const placeholderRegex =
    /\[[^\]\n]{1,80}\]/g;

  for (
    const match of text.matchAll(
      placeholderRegex
    )
  ) {
    add(
      match[0],
      "Незаполненный шаблон или плейсхолдер.",
      "Во входных данных нет значения, которое должно заменить этот шаблон."
    );
  }


  // ----------------------------------------------------------
  // NUMBERS
  // ----------------------------------------------------------

  const numberRegex =
    /\b\d+(?:[–-]\d+)?(?:[.,]\d+)?\s*(?:%|руб(?:\.?|лей)?|₽|сек(?:унд(?:ы|у|ой)?)?|мин(?:ут(?:а|ы|у)?)?|час(?:а|ов|у)?|дн(?:ей|я|ем)?)\b/giu;

  for (
    const match of text.matchAll(
      numberRegex
    )
  ) {
    add(
      match[0].trim(),
      "Конкретное число или измеримый показатель не подтверждён исходными данными.",
      "Во входных данных нет такого числа или измеримого показателя."
    );
  }


  // ----------------------------------------------------------
  // STRUCTURAL RED FLAGS
  // ----------------------------------------------------------

  const riskyPatterns = [
    {
      regex:
        /\b(мой|моя|моё|мои|наш|наша|наше|наши|я|мы|у нас)\b[^.\n]{0,120}\b(кейс|опыт|истори|результат|процесс|этап|консультац|созвон|правк|анализ|метод|система|команда)\b/giu,

      reason:
        "Утверждение от первого лица о конкретном опыте или процессе без прямой опоры."
    },

    {
      regex:
        /\b(гарантир|обеща|получите|получает|получают|привед[её]т к|увеличит|увеличивает|снизит|снижает|решит проблему|решение навсегда|результат гарантирован)\b[^.\n]{0,100}/giu,

      reason:
        "Утверждается результат, эффект или гарантия, не подтверждённые входными данными."
    },

    {
      regex:
        /\b(пришлю|отправлю|дам|выдам|получите)\b[^.\n]{0,80}\b(чек-?лист|гайд|шаблон|файл|материал|расч[её]т|прайс|кейс)\b/giu,

      reason:
        "CTA обещает конкретный ресурс, наличие которого не подтверждено."
    },

    {
      regex:
        /\b(мой первый|моя первая|наш первый|наша первая|мой прошлый|мой недавний|в прошлом|раньше я|когда я начинал|когда мы начинали|однажды я|однажды мы|мой кейс|наш кейс|мой опыт|наш опыт)\b[^.\n]{0,140}/giu,

      reason:
        "Утверждается личная история, прошлое событие или опыт без подтверждения."
    },

    {
      regex:
        /\b(клиент)\b[^.\n]{0,80}\b(получил|получила|сказал|сказала|написал|написала|приш[её]л|пришла|купил|купила|заказал|заказала|добился|добилась|получил результат|оставил отзыв)\b/giu,

      reason:
        "Утверждается конкретный клиентский опыт или социальное доказательство без подтверждения."
    }
  ];

  for (
    const item of riskyPatterns
  ) {
    for (
      const match of text.matchAll(
        item.regex
      )
    ) {
      add(
        match[0],
        item.reason,
        "Во входных данных нет прямого подтверждения указанной конкретики."
      );

      if (
        violations.length >= 20
      ) {
        break;
      }
    }

    if (
      violations.length >= 20
    ) {
      break;
    }
  }

  return violations.slice(0, 20);
}


// ============================================================
// AI AUDITOR
// ============================================================

async function auditGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  label
}) {
  const deterministicViolations =
    getDeterministicViolations({
      generatedContent,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle
    });

  const prompt =
    buildAuditPrompt({
      contentType,
      businessInfo,
      targetAudience,
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
        maxTokens: 550,
        label:
          `${label} AI AUDITOR`
      });

    const parsed =
      parseAuditorJson(
        audit.result
      );

    if (
      !parsed ||
      typeof parsed.passed !== "boolean" ||
      !Array.isArray(
        parsed.violations
      )
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

        raw: audit.result,

        deterministic_violations:
          deterministicViolations
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
        .slice(0, 15)
        .map(item => ({
          text:
            item.text.trim(),

          reason:
            item.reason.trim(),

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
      ...deterministicViolations
    ];

    for (
      const item of aiViolations
    ) {
      if (
        !merged.some(
          existing =>
            existing.text === item.text
        )
      ) {
        merged.push(item);
      }
    }

    const violations =
      merged.slice(0, 20);

    const passed =
      violations.length === 0;

    console.log(
      `[AI AUDITOR] AI passed: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] Deterministic violations: ${deterministicViolations.length}`
    );

    console.log(
      `[AI AUDITOR] Final violations: ${violations.length}`
    );

    return {
      available: true,
      passed,
      violations,
      raw: parsed,
      deterministic_violations:
        deterministicViolations
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

      error:
        error.message,

      deterministic_violations:
        deterministicViolations
    };
  }
}


// ============================================================
// REPAIR PROMPT
// ============================================================

function buildRepairPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
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

8. Если процесс работы не описан клиентом — не придумывай:
- этапы;
- консультации;
- анализ;
- правки;
- созвоны;
- оборудование;
- технологии.

9. Если есть неподтверждённое свойство или результат — убери его.

Не заменяй его другим свойством или результатом.

10. Не используй от первого лица:
«я»,
«мы»,
«у нас»,
«мой»,
«наша»

для неподтверждённого опыта, процесса или факта.

11. Сохрани полезность, конкретность, структуру, формат и стиль настолько, насколько это возможно без выдуманных фактов.

12. Метафоры, юмор, сравнения, гиперболы и эмоциональные формулировки сохраняй, если они не создают конкретный новый факт.

13. Универсальные приёмы съёмки и монтажа можно сохранять.

14. Обычные CTA можно сохранять, если они ничего не обещают и не утверждают неподтверждённый ресурс.

15. Не объясняй, что именно ты исправил.

16. Верни только готовый исправленный контент.

====================
ПРИОРИТЕТЫ ИСПРАВЛЕНИЯ
====================

Если нарушение можно исправить несколькими способами, используй такой порядок:

1. Привязать мысль к известному факту бизнеса.

2. Если это невозможно — заменить конкретику на вопрос или универсальный разбор.

3. Если сценарий требует неизвестного объекта — сделать его условным.

4. Если мысль всё равно остаётся неподтверждённой — поднять уровень абстракции.

5. Если сохранить мысль невозможно — удалить её.

Не превращай весь материал в набор общих фраз.

Сохрани связь с бизнесом настолько, насколько позволяют исходные данные.

====================
ФИНАЛЬНАЯ ПРОВЕРКА
====================

Перед выдачей текста самостоятельно проверь каждое предложение:

- Есть ли у конкретного факта прямая опора во входных данных?
- Если числа нет во входных данных — удалено ли оно?
- Не появилась ли новая история?
- Не появился ли новый кейс?
- Не появился ли новый клиент?
- Не появился ли новый комментарий?
- Не появился ли новый отзыв?
- Не появился ли новый результат?
- Не появился ли новый процесс?
- Не появился ли новый объект?
- Не появилось ли новое оборудование?
- Не появилась ли новая технология?
- Не утверждается ли как существующее то, что было лишь идеей для съёмки?
- Если опоры нет — заменена ли фраза на абстрактную или условную?

Если сомневаешься — выбирай более абстрактную формулировку.

Но не уничтожай полезность контента.

Верни только исправленный контент.
`;
}


// ============================================================
// REPAIR
// ============================================================

async function repairGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
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
      generatedContent,
      violations
    });

  return generateWithGigaChat({
    token,
    prompt,
    temperature: 0.15,
    maxTokens: 900,
    label:
      `${label} REPAIR`
  });
}


// ============================================================
// POST FILTER
// ============================================================

async function postFilterGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  label
}) {
  console.log(
    `[${label}] Starting AI fact audit...`
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
      generatedContent,
      label
    });

  if (
    !firstAudit.available ||
    firstAudit.passed
  ) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null
    };
  }

  console.log(
    `[${label}] Violations detected. Starting one repair pass...`
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
        generatedContent:
          repaired.result,
        label:
          `${label} SECOND`
      });

    if (
      secondAudit.available &&
      !secondAudit.passed
    ) {
      console.warn(
        `[${label}] Second audit still found violations. Returning repaired version without another loop.`
      );
    }

    return {
      result: repaired.result,
      audit: firstAudit,
      repaired: true,
      secondAudit
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
      repair_error: error.message
    };
  }
}


// ============================================================
// PLAN VALIDATION
// ============================================================

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


// ============================================================
// PLAN GENERATION
// ============================================================

async function generatePlanChunk({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
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

    repair_error:
      filtered.repair_error || null
  };
}


// ============================================================
// PLAN HANDLER
// ============================================================

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

  if (
    !acquireGenerationLock(
      `PLAN ${startDay}-${endDay}`
    )
  ) {
    return res.status(429).json({
      ok: false,

      error:
        "Generation already in progress. Please try again later.",

      generation_in_progress: true,

      lock_age_ms:
        generationStartedAt
          ? Date.now() -
            generationStartedAt
          : null,

      lock_timeout_ms:
        GENERATION_LOCK_TIMEOUT
    });
  }

  const {
    bridge_key,
    business_info,
    target_audience,
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
      validationError ===
        "Invalid bridge_key" ||
      validationError ===
        "bridge_key is required"
        ? 401
        : 400;

    releaseGenerationLock(
      `PLAN ${startDay}-${endDay} VALIDATION`
    );

    return res.status(status).json({
      ok: false,
      error: validationError
    });
  }

  const safePreviousPlan =
    String(previous_plan || "")
      .slice(-18000);

  try {
    const result =
      await generatePlanChunk({
        startDay,
        endDay,
        businessInfo:
          business_info,
        targetAudience:
          target_audience,
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
        Date.now() -
        startedAt,

      result_length:
        result.result.length,

      post_filter: {
        auditor_available:
          result.audit?.available ||
          false,

        triggered:
          !(result.audit?.passed ?? true),

        repaired:
          result.repaired ||
          false,

        warnings:
          result.audit?.violations
            ?.length || 0,

        second_audit_passed:
          result.secondAudit
            ?.passed ?? null
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
        Date.now() -
        startedAt
    });
  } finally {
    releaseGenerationLock(
      `PLAN ${startDay}-${endDay}`
    );
  }
}


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {
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
        generationInProgress &&
        generationStartedAt
          ? Date.now() -
            generationStartedAt
          : 0,

      generation_lock_timeout_ms:
        GENERATION_LOCK_TIMEOUT
    });
  }
);


// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (req, res) => {
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
  }
);


// ============================================================
// TEST AUTH
// ============================================================

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


// ============================================================
// TEST GENERATE
// ============================================================

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

            temperature: 0.2,

            max_tokens: 10
          },
          {
            httpsAgent,

            timeout: 9000,

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
          ?.message?.content || "";

      res.json({
        ok: true,

        stage:
          "generation",

        status:
          response.status,

        time_ms:
          Date.now() -
          startedAt,

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
          Date.now() -
          startedAt
      });
    }
  }
);


// ============================================================
// TEST PLAN 1-5
// ============================================================

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
          "Generation already in progress",

        lock_age_ms:
          generationStartedAt
            ? Date.now() -
              generationStartedAt
            : null,

        lock_timeout_ms:
          GENERATION_LOCK_TIMEOUT
      });
    }

    try {
      const result =
        await generatePlanChunk({
          startDay: 1,
          endDay: 5,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

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
          Date.now() -
          startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

        post_filter: {
          auditor_available:
            result.audit
              ?.available ||
            false,

          first_audit_passed:
            result.audit
              ?.passed ?? null,

          triggered:
            !(result.audit
              ?.passed ?? true),

          repaired:
            result.repaired ||
            false,

          violations_count:
            result.audit
              ?.violations
              ?.length || 0,

          violations:
            result.audit
              ?.violations || [],

          repair_error:
            result.repair_error ||
            null,

          second_audit_available:
            result.secondAudit
              ?.available ?? null,

          second_audit_passed:
            result.secondAudit
              ?.passed ?? null,

          second_audit_violations_count:
            result.secondAudit
              ?.violations
              ?.length || 0,

          second_audit_violations:
            result.secondAudit
              ?.violations || [],

          first_audit_raw:
            result.audit
              ?.raw || null,

          second_audit_raw:
            result.secondAudit
              ?.raw || null,

          first_audit_error:
            result.audit
              ?.error || null,

          second_audit_error:
            result.secondAudit
              ?.error || null
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
          Date.now() -
          startedAt
      });
    } finally {
      releaseGenerationLock(
        "TEST PLAN 1-5"
      );
    }
  }
);


// ============================================================
// PLAN ENDPOINTS
// ============================================================

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


// ============================================================
// NORMAL GENERATE
// ============================================================

app.post(
  "/generate",
  async (req, res) => {
    const startedAt =
      Date.now();

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
            "Generation already in progress. Please try again later.",

          generation_in_progress:
            true,

          lock_age_ms:
            generationStartedAt
              ? Date.now() -
                generationStartedAt
              : null,

          lock_timeout_ms:
            GENERATION_LOCK_TIMEOUT
        });
      }

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
          Date.now() -
          startedAt,

        result_length:
          filtered.result.length,

        post_filter: {
          auditor_available:
            filtered.audit
              ?.available ||
            false,

          triggered:
            !(filtered.audit
              ?.passed ?? true),

          repaired:
            filtered.repaired,

          warnings:
            filtered.audit
              ?.violations
              ?.length || 0,

          second_audit_passed:
            filtered.secondAudit
              ?.passed ?? null
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
          Date.now() -
          startedAt
      });
    } finally {
      releaseGenerationLock(
        "NORMAL CONTENT"
      );
    }
  }
);


// ============================================================
// 404
// ============================================================

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


// ============================================================
// GLOBAL EXPRESS ERROR
// ============================================================

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


// ============================================================
// PROCESS ERROR LOGGING
// ============================================================

process.on(
  "unhandledRejection",
  reason => {
    console.error(
      "UNHANDLED REJECTION:",
      reason
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


// ============================================================
// SERVER START
// ============================================================

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
      "GENERATION LOCK TIMEOUT:",
      GENERATION_LOCK_TIMEOUT,
      "ms"
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
