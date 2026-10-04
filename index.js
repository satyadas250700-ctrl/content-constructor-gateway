const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const GIGACHAT_SCOPE =
  process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const GIGACHAT_MODEL =
  process.env.GIGACHAT_MODEL || "GigaChat-3-Ultra";

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

async function getAccessToken() {
  if (
    accessToken &&
    Date.now() < tokenExpiresAt
  ) {
    return accessToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error(
      "GIGACHAT_KEY is not configured"
    );
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
        Authorization:
          `Basic ${GIGACHAT_KEY}`,
        RqUID: crypto.randomUUID(),
        "Content-Type":
          "application/x-www-form-urlencoded"
      }
    }
  );

  accessToken =
    response.data.access_token;

  const expiresIn =
    Number(response.data.expires_in) || 1800;

  tokenExpiresAt =
    Date.now() +
    (expiresIn - 60) * 1000;

  return accessToken;
}

function acquireGenerationLock() {
  if (
    generationInProgress &&
    Date.now() - generationStartedAt <
      GENERATION_LOCK_TIMEOUT
  ) {
    return false;
  }

  generationInProgress = true;
  generationStartedAt = Date.now();

  return true;
}

function releaseGenerationLock() {
  generationInProgress = false;
  generationStartedAt = 0;
}

function isContentPlan(contentType) {
  const type =
    String(contentType || "").toLowerCase();

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}

function getContentInstructions(contentType) {
  const type =
    String(contentType || "").toLowerCase();

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

ХУК:
первая цепляющая фраза.

СЦЕНАРИЙ:
короткий динамичный текст.

ФИНАЛ:
сильное завершение.

CTA:
призыв к действию.

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
- цель;
- тему;
- стиль.

Ответ только на русском языке.
`;
}

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
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

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

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
- Учитывай бизнес, аудиторию, цель и стиль.
- Контент должен быть практически применим.

КРИТИЧЕСКИ ВАЖНО:

Не выдумывай реальные факты о бизнесе.

Не придумывай:
- истории;
- кейсы;
- отзывы;
- клиентов;
- результаты;
- цены;
- скидки;
- цифры;
- даты;
- сроки;
- оборудование;
- помещения;
- сотрудников;
- технологии;
- процессы;
- свойства продукта;
- гарантии;
- достижения.

Если конкретной информации нет, используй:
- вопрос;
- условную рекомендацию;
- маркетинговый ракурс;
- метафору;
- сравнение;
- гиперболу;
- универсальный съёмочный или монтажный приём;
- содержательную абстракцию.

Метафоры, юмор, сравнения и гиперболы разрешены, если очевидно, что это образная формулировка, а не реальный факт.

Не используй незаполненные шаблоны вроде:
[сфера/продукт]
[результат]
[цена]
[адрес]
[название]

Выдай только готовый контент.
`;
}

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
4. Не используй безликие универсальные идеи.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Ответ только на русском языке.

====================
ФАКТОЛОГИЯ
====================

Не выдумывай реальные факты о бизнесе.

Не придумывай:
- цены;
- скидки;
- цифры;
- даты;
- сроки;
- клиентов;
- кейсы;
- отзывы;
- результаты;
- гарантии;
- историю бизнеса;
- личный опыт;
- оборудование;
- помещения;
- интерьер;
- сотрудников;
- локации;
- технологии;
- материалы;
- ингредиенты;
- упаковку;
- конкретные процессы;
- конкретные этапы работы.

Если конкретная деталь неизвестна, НЕ ЗАМЕНЯЙ ЕЁ ДРУГОЙ ВЫДУМАННОЙ ДЕТАЛЬЮ.

Вместо этого:
- сформулируй вопрос;
- предложи условный сценарий;
- используй маркетинговый ракурс;
- используй подтверждённые данные;
- подними уровень абстракции.

Метафоры, юмор, сравнения и эмоциональные образы разрешены.

Не оставляй плейсхолдеры:
[сфера/продукт]
[результат]
[цена]
[адрес]
[название]

====================
CTA
====================

Разрешены обычные CTA:

- написать комментарий;
- сохранить;
- поделиться;
- поставить реакцию;
- ответить на вопрос;
- выбрать вариант;
- рассказать о своём опыте.

Не обещай:
- чек-лист;
- гайд;
- консультацию;
- подарок;
- расчёт;
- кейс;
- скидку;
- личный разбор,

если наличие такого ресурса не указано во входных данных.

====================
ФОРМАТ
====================

День N — Формат

Тема: конкретная тема

Идея: что именно показать или раскрыть

Задача: какую реакцию или действие должна вызвать публикация

CTA: конкретный призыв к действию

Каждый пункт — короткий, но содержательный.

CTA не должны быть одинаковыми каждый день.

ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
`;
}

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
          Authorization:
            `Bearer ${token}`,
          "Content-Type":
            "application/json"
        }
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

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

    console.error(
      `[${label}] ERROR`
    );

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

function cleanJsonText(text) {
  let value =
    String(text || "").trim();

  value = value
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
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

/*
========================================
V4 DETERMINISTIC CONTENT CHECKER
========================================
*/

function normalizeForCheck(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDeterministicViolations({
  generatedContent,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  contentType
}) {
  const content =
    String(generatedContent || "");

  const normalized =
    normalizeForCheck(content);

  const violations = [];

  function addViolation(
    text,
    reason,
    support,
    repairType
  ) {
    if (!text) {
      return;
    }

    const exists =
      violations.some(
        item =>
          item.text === text
      );

    if (exists) {
      return;
    }

    violations.push({
      text,
      reason,
      support,
      repair_type:
        repairType || "abstract",
      source:
        "deterministic"
    });
  }

  /*
  ----------------------------------------
  1. PLACEHOLDERS
  ----------------------------------------
  */

  const placeholderRegex =
    /\[[^\]]+\]/g;

  const placeholders =
    content.match(
      placeholderRegex
    ) || [];

  placeholders.forEach(
    placeholder => {
      addViolation(
        placeholder,
        "Незаполненный плейсхолдер.",
        "Плейсхолдер не подтверждён входными данными.",
        "delete"
      );
    }
  );

  /*
  ----------------------------------------
  2. OBVIOUS NUMERIC FACTS
  ----------------------------------------
  */

  const numericRegex =
    /(?:\b\d+(?:[.,]\d+)?\s*(?:%|процент(?:а|ов)?|руб(?:\.|лей)?|₽|секунд(?:а|ы)?|минут(?:а|ы)?|час(?:а|ов)?|дн(?:я|ей)?|лет|года|год(?:а|ов)?|клиент(?:а|ов)?|продаж(?:а|и)?|раз(?:а|ов)?)\b?)/gi;

  const numericMatches =
    normalized.match(
      numericRegex
    ) || [];

  numericMatches.forEach(
    match => {
      const trimmed =
        match.trim();

      /*
      День 1 / Слайд 1 и подобные
      технические номера не считаем.
      */
      const contextIndex =
        normalized.indexOf(
          trimmed
        );

      const before =
        normalized.slice(
          Math.max(
            0,
            contextIndex - 20
          ),
          contextIndex
        );

      if (
        /(?:день|слайд|этап)\s*$/i.test(
          before
        )
      ) {
        return;
      }

      addViolation(
        trimmed,
        "Конкретное числовое утверждение требует подтверждения во входных данных.",
        `Во входных данных числа не подтверждены автоматически: ${businessInfo}`,
        "abstract"
      );
    }
  );

  /*
  ----------------------------------------
  3. STRONG PERSONAL FACT PATTERNS
  ----------------------------------------
  */

  const personalPatterns = [
    {
      regex:
        /\b(?:я|мы|у нас|у меня|мой|моя|моё|мои|наш|наша|наше|наши)\b[^.!?\n]{0,140}\b(?:клиент|клиента|клиентов|помог|помога|работа|работал|работали|использу|используем|делаю|делаем|создаю|создаём|провожу|проводим|гарантир|получа|достиг|сделал|сделали|заработ|продал|продали)\b/gi,
      reason:
        "Фраза содержит конкретное утверждение от имени бизнеса, но его фактическая опора не гарантирована входными данными.",
      repair:
        "anchor_to_known_fact"
    },
    {
      regex:
        /\b(?:после работы со мной|после работы с нами|после обращения ко мне|после обращения к нам)\b/gi,
      reason:
        "Утверждается конкретный результат взаимодействия с автором, который не подтверждён входными данными.",
      repair:
        "anchor_to_known_fact"
    },
    {
      regex:
        /\b(?:мы уже|я уже|у нас уже|я помог|мы помогли|мы сделали|я сделал|мы получили|я получил)\b[^.!?\n]{0,120}/gi,
      reason:
        "Утверждается конкретный прошлый опыт или результат бизнеса без подтверждения.",
      repair:
        "anchor_to_known_fact"
    }
  ];

  personalPatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 5)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              `Входные данные: бизнес="${businessInfo}", аудитория="${targetAudience}", цель="${contentGoal}", стиль="${contentStyle}". Конкретный факт не указан.`,
              pattern.repair
            );
          }
        );
    }
  );

  /*
  ----------------------------------------
  4. PROMISE / RESULT PATTERNS
  ----------------------------------------
  */

  const promisePatterns = [
    {
      regex:
        /\b(?:навсегда|гарантированно|гарантирует|гарантируем|гарантирую|точно получите|точно получишь|получите результат|получишь результат|обеспечит результат|обеспечит|решит проблему навсегда)\b/gi,
      reason:
        "Фраза содержит обещание гарантированного или конкретного результата, который не подтверждён входными данными.",
      repair:
        "abstract"
    },
    {
      regex:
        /\b(?:что вы получите после|что получает клиент после|результат работы со мной|результат работы с нами)\b/gi,
      reason:
        "Фраза утверждает конкретный результат работы с бизнесом без подтверждения такого результата во входных данных.",
      repair:
        "anchor_to_known_fact"
    }
  ];

  promisePatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 5)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              "Входные данные не содержат подтверждения конкретного обещанного результата.",
              pattern.repair
            );
          }
        );
    }
  );

  /*
  ----------------------------------------
  5. CTA RESOURCE PROMISES
  ----------------------------------------
  */

  const resourcePatterns = [
    {
      regex:
        /(?:пришлю|отправлю|дам|получите|получишь|выдам|скину)\s+(?:вам\s+)?(?:чек[- ]?лист|гайд|гайд[а-я]*|консультаци[а-я]*|расч[её]т|подарок|кейс|разбор|скидк[а-я]*|материал[а-я]*)/gi,
      reason:
        "CTA обещает конкретный ресурс, наличие которого не подтверждено входными данными.",
      repair:
        "replace_cta"
    }
  ];

  resourcePatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 5)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              "Во входных данных нет подтверждения наличия такого ресурса.",
              pattern.repair
            );
          }
        );
    }
  );

  /*
  ----------------------------------------
  6. PROCESS / WORKFLOW CLAIMS
  ----------------------------------------
  */

  const processPatterns = [
    {
      regex:
        /\b(?:этап[а-я]* работы|этап[а-я]* работы со мной|процесс работы со мной|процесс работы с нами|закулисье работы|изнутри работы|внутренний процесс|рабочий процесс)\b/gi,
      reason:
        "Утверждается наличие конкретного рабочего процесса или этапов работы, которые не описаны во входных данных.",
      repair:
        "conditional"
    }
  ];

  processPatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 5)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              "Во входных данных конкретный процесс работы не описан.",
              pattern.repair
            );
          }
        );
    }
  );

  /*
  ----------------------------------------
  7. CONCRETE OBJECT CLAIMS
  ----------------------------------------
  */

  const objectPatterns = [
    {
      regex:
        /\b(?:экран ноутбука|ноутбук|таблица|блокнот|кабинет|офис|стол|стул|команда|сотрудник|оборудование|упаковка|витрина|помещение|интерьер|цех|склад)\b/gi,
      reason:
        "Указан конкретный объект, наличие которого у бизнеса не подтверждено входными данными.",
      repair:
        "conditional"
    }
  ];

  objectPatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 10)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              "Во входных данных наличие этого объекта не подтверждено.",
              pattern.repair
            );
          }
        );
    }
  );

  /*
  ----------------------------------------
  8. UNCONFIRMED HISTORY / PERSONAL STORY
  ----------------------------------------
  */

  const historyPatterns = [
    {
      regex:
        /\b(?:когда я только начинал|когда мы только начинали|в начале своего пути|в начале нашего пути|мой первый клиент|наш первый клиент|однажды со мной|однажды мы|я столкнулся с|мы столкнулись с)\b/gi,
      reason:
        "Создаётся конкретная личная история или история бизнеса, которой нет во входных данных.",
      repair:
        "anchor_to_known_fact"
    }
  ];

  historyPatterns.forEach(
    pattern => {
      const matches =
        normalized.match(
          pattern.regex
        ) || [];

      matches
        .slice(0, 5)
        .forEach(
          match => {
            addViolation(
              match.trim(),
              pattern.reason,
              "Во входных данных нет соответствующей личной истории.",
              pattern.repair
            );
          }
        );
    }
  );

  return violations.slice(0, 25);
}

/*
========================================
V4 AI AUDITOR
========================================
*/

function buildAuditPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  deterministicViolations
}) {
  const deterministicBlock =
    deterministicViolations.length
      ? deterministicViolations
          .map(
            (item, index) =>
              `${index + 1}. Фрагмент: «${item.text}»
Причина предварительной проверки: ${item.reason}
Тип исправления: ${item.repair_type}`
          )
          .join("\n\n")
      : "Детерминированная проверка не обнаружила автоматических нарушений.";

  return `
Ты — сверхстрогий AI-фактчекер сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент НЕ НА КРАСОТУ И НЕ НА ПРОДАЮЩИЙ ЭФФЕКТ.

Твоя задача — определить, какие конкретные утверждения в нём НЕ ПОДТВЕРЖДЕНЫ входными данными клиента.

====================
ГЛАВНЫЙ ПРИНЦИП
====================

Для каждого конкретного утверждения мысленно задай вопрос:

«ГДЕ ИМЕННО В ИСХОДНЫХ ДАННЫХ КЛИЕНТА ЭТО ПОДТВЕРЖДЕНО?»

Если конкретного подтверждения нет — это нарушение.

Не рассуждай:

«Это наверняка бывает у такого бизнеса».

Не рассуждай:

«Это логично».

Не рассуждай:

«Скорее всего у эксперта есть это».

Не рассуждай:

«Это обычно происходит».

Нам нужно не то, что МОЖЕТ быть правдой.

Нам нужно то, что МОЖНО ОБОСНОВАТЬ входными данными.

====================
ДАННЫЕ КЛИЕНТА
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
${reelsTopic || "не задана"}

Стиль:
${contentStyle}

====================
КОНТЕНТ
====================

${generatedContent}

====================
ПРЕДВАРИТЕЛЬНЫЕ НАХОДКИ ПРОГРАММНОЙ ПРОВЕРКИ
====================

${deterministicBlock}

ВАЖНО:

Эти находки НЕ ЯВЛЯЮТСЯ автоматически правильными.

Проверь их самостоятельно.

Также обязательно ищи другие нарушения.

====================
ЧТО РАЗРЕШЕНО
====================

Разрешены:

1. Факты, прямо указанные клиентом.

2. Перефразирование подтверждённых фактов.

3. Обычные маркетинговые задачи.

4. Вопросы аудитории.

5. Условные рекомендации.

Например:

«Если у вас есть рабочее пространство, можно показать его».

6. Художественные сценарии:

«Представьте ситуацию...»

7. Метафоры.

8. Сравнения.

9. Юмор.

10. Гиперболы.

11. Эмоциональные образы.

12. Универсальные съёмочные приёмы:

- текст на экране;
- субтитры;
- монтаж;
- графика;
- голос за кадром;
- крупный план;
- переход;
- анимация.

====================
ЧТО НЕЛЬЗЯ
====================

Нельзя без подтверждения утверждать наличие:

- клиентов;
- сотрудников;
- команды;
- офиса;
- кабинета;
- помещения;
- оборудования;
- ноутбука;
- таблиц;
- блокнотов;
- упаковки;
- конкретного продукта;
- конкретной услуги;
- конкретных процессов;
- этапов работы;
- технологий;
- материалов;
- ингредиентов;
- отзывов;
- кейсов;
- достижений.

Нельзя без подтверждения утверждать:

- результаты;
- гарантии;
- эффективность;
- конкретные свойства;
- историю бизнеса;
- личную историю;
- прошлые события;
- конкретный опыт;
- конкретные цифры;
- цены;
- скидки;
- сроки;
- даты.

====================
ПЕРВОЕ ЛИЦО
====================

Особенно внимательно проверяй:

я
мы
у нас
у меня
мой
моя
мой бизнес
наш
наша
наше

Если после этого появляется конкретный факт — требуется подтверждение.

Например:

«Мы помогли 100 клиентам».

Если 100 клиентов нет во входных данных:

VIOLATION.

«Мы используем авторский подход».

Если авторский подход не описан:

VIOLATION.

====================
РЕЗУЛЬТАТЫ
====================

Особенно строго проверяй:

«получает клиент»,
«клиент получает»,
«после работы со мной»,
«после работы с нами»,
«решить проблему»,
«решить проблему навсегда»,
«получить результат»,
«гарантированный результат»,
«станет легче»,
«увеличится»,
«вырастет»,
«сэкономит»,
«заработает».

Если это утверждается как реальный результат конкретного бизнеса и подтверждения нет — VIOLATION.

====================
ЧИСЛА
====================

Любое конкретное число — потенциальный факт.

Исключения:

День 1
День 2
Слайд 1
Слайд 2

Остальные числа требуют проверки.

====================
CTA
====================

Разрешены:

- написать комментарий;
- сохранить;
- поделиться;
- поставить реакцию;
- ответить;
- выбрать вариант;
- рассказать о своём опыте.

Не разрешены неподтверждённые обещания:

- пришлю чек-лист;
- отправлю гайд;
- дам консультацию;
- сделаю расчёт;
- отправлю кейс;
- дам скидку;
- сделаю личный разбор.

====================
ПЛЕЙСХОЛДЕРЫ
====================

Любой незаполненный:

[сфера]
[продукт]
[результат]
[цена]
[адрес]
[название]

является нарушением.

====================
МЕТАФОРЫ
====================

НЕ СЧИТАЙ нарушением:

«антидепрессант дня»
«контентный двигатель»
«маркетинговый айсберг»
«старые грабли»

если очевидно, что это образная речь.

====================
КЛЮЧЕВОЕ РАЗЛИЧИЕ
====================

НАРУШЕНИЕ:

«Эксперт показывает свой кабинет».

Это утверждение о существующем объекте.

ДОПУСТИМО:

«Если у вас есть рабочее пространство, можно начать ролик с его общего плана».

Это условная рекомендация.

НАРУШЕНИЕ:

«После работы со мной клиент получает уверенность».

Это утверждение о результате.

ДОПУСТИМО:

«Можно раскрыть, какую ценность получает человек от решения своей задачи».

Это контентный ракурс без утверждения конкретного результата.

====================
НЕ НАКАЗЫВАЙ ЗА ОБЩНОСТЬ
====================

Фраза:

«Разберите распространённые ошибки при выборе решения».

может быть допустимой.

Но:

«Ваши клиенты постоянно совершают эти три ошибки».

требует подтверждения.

====================
ОБЯЗАТЕЛЬНЫЙ ФИНАЛЬНЫЙ ТЕСТ
====================

Перед ответом проверь:

1. Все ли конкретные факты имеют опору?
2. Все ли числа подтверждены?
3. Все ли результаты подтверждены?
4. Все ли личные истории подтверждены?
5. Все ли процессы подтверждены?
6. Все ли объекты подтверждены?
7. Все ли CTA-ресурсы существуют по входным данным?
8. Нет ли плейсхолдеров?
9. Не принял ли ты логичное предположение за факт?
10. Не перепутал ли ты условный сценарий с реальным утверждением?
11. Не является ли подозрительная фраза просто метафорой?

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON.

Если нарушений нет:

{
  "passed": true,
  "violations": []
}

Если есть хотя бы одно:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент",
      "reason": "почему нет фактической опоры",
      "support": "чего не хватает во входных данных",
      "repair_type": "delete | abstract | conditional | replace_cta | anchor_to_known_fact"
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:

Если violations НЕ пустой, passed ОБЯЗАТЕЛЬНО false.

Максимум 20 нарушений.
`;
}

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
      contentStyle,
      contentType
    });

  console.log(
    `[${label} V4] Deterministic violations: ${deterministicViolations.length}`
  );

  const prompt =
    buildAuditPrompt({
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent,
      deterministicViolations
    });

  try {
    const audit =
      await generateWithGigaChat({
        token,
        prompt,
        temperature: 0.05,
        maxTokens: 750,
        label:
          `${label} V4 AI AUDITOR`
      });

    const parsed =
      parseAuditorJson(
        audit.result
      );

    if (
      !parsed ||
      typeof parsed.passed !==
        "boolean" ||
      !Array.isArray(
        parsed.violations
      )
    ) {
      console.error(
        "[V4 AI AUDITOR] Invalid auditor response."
      );

      /*
      Если AI-аудитор сломался,
      детерминированные нарушения
      всё равно сохраняем.
      */

      return {
        available: false,
        passed:
          deterministicViolations.length ===
          0,
        violations:
          deterministicViolations,
        deterministicViolations,
        aiViolations: [],
        raw: audit.result
      };
    }

    const aiViolations =
      parsed.violations
        .filter(
          item =>
            item &&
            typeof item.text ===
              "string" &&
            typeof item.reason ===
              "string"
        )
        .slice(0, 20)
        .map(item => ({
          text:
            item.text.trim(),
          reason:
            item.reason.trim(),
          support:
            typeof item.support ===
            "string"
              ? item.support.trim()
              : "",
          repair_type:
            typeof item.repair_type ===
            "string"
              ? item.repair_type.trim()
              : "abstract",
          source:
            "ai"
        }))
        .filter(
          item =>
            item.text &&
            item.reason
        );

    /*
    Объединяем deterministic + AI,
    удаляя дубли.
    */

    const combined = [
      ...deterministicViolations,
      ...aiViolations
    ];

    const unique = [];

    combined.forEach(
      item => {
        const duplicate =
          unique.some(
            existing =>
              existing.text
                .toLowerCase() ===
                item.text
                  .toLowerCase()
          );

        if (!duplicate) {
          unique.push(item);
        }
      }
    );

    const violations =
      unique.slice(0, 25);

    const passed =
      violations.length === 0;

    console.log(
      `[V4 AUDITOR] AI passed: ${parsed.passed}`
    );

    console.log(
      `[V4 AUDITOR] AI violations: ${aiViolations.length}`
    );

    console.log(
      `[V4 AUDITOR] Combined violations: ${violations.length}`
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
      "[V4 AI AUDITOR] Failed:",
      error.message
    );

    /*
    Fail-open для AI,
    но НЕ fail-open для
    детерминированных проверок.
    */

    return {
      available: false,
      passed:
        deterministicViolations.length ===
        0,
      violations:
        deterministicViolations,
      deterministicViolations,
      aiViolations: [],
      error:
        error.message
    };
  }
}

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
          `${index + 1}. Фрагмент: «${item.text}»
Причина: ${item.reason}
Опора: ${item.support || "не указана"}
Тип исправления: ${item.repair_type || "abstract"}`
      )
      .join("\n\n");

  return `
Ты — финальный AI-редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Тебе дан контент, в котором найдено одно или несколько неподтверждённых утверждений.

Твоя задача:

НЕ ПРОСТО УДАЛИТЬ ОШИБКИ.

Нужно:

1. убрать неподтверждённые факты;
2. сохранить маркетинговую мысль;
3. сохранить полезность;
4. сохранить конкретность;
5. сохранить стиль;
6. НЕ ДОБАВИТЬ НОВЫХ ФАКТОВ.

====================
ДАННЫЕ КЛИЕНТА
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
${reelsTopic || "не задана"}

Стиль:
${contentStyle}

====================
НАРУШЕНИЯ
====================

${violationBlock}

====================
ИСХОДНЫЙ КОНТЕНТ
====================

${generatedContent}

====================
АЛГОРИТМ ИСПРАВЛЕНИЯ
====================

Для каждого нарушения:

ШАГ 1.

Попробуй привязать фразу к подтверждённому факту клиента.

ШАГ 2.

Если невозможно — преврати её в конкретный вопрос аудитории.

ШАГ 3.

Если невозможно — преврати её в условную рекомендацию.

ШАГ 4.

Если невозможно — сделай содержательную абстракцию.

ШАГ 5.

Только если ничего из этого невозможно — удали фрагмент.

====================
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО
====================

Не заменяй:

неизвестный объект → другим объектом.

Например:

«ноутбук» нельзя заменить на «телефон».

Не заменяй:

неизвестное число → другим числом.

Например:

«15 секунд» нельзя заменить на «10 секунд».

Не заменяй:

неизвестный результат → другим результатом.

Не придумывай:

- клиентов;
- кейсы;
- отзывы;
- процессы;
- этапы;
- оборудование;
- помещения;
- личные истории;
- цены;
- скидки;
- гарантии;
- результаты;
- продукты;
- свойства продукта.

====================
ПРИМЕРЫ
====================

Плохо:

«За 15–20 секунд покажите...»

Хорошо:

«Сделайте короткое динамичное видео...»

---

Плохо:

«Что получает клиент после работы со мной».

Хорошо:

«Разберите, какую ценность может дать клиенту решение его задачи».

---

Плохо:

«Решить проблему навсегда».

Хорошо:

«Разобрать проблему и показать возможный путь к её решению».

---

Плохо:

«Анатомия правильного выбора [услуги/продукта]».

Хорошо:

«Как выбрать подходящее решение: ключевые критерии».

---

Плохо:

«Мой личный стоп-лист: чего я никогда не делаю».

Хорошо:

«Какие принципы стоит учитывать при выборе специалиста».

---

Плохо:

«Экран ноутбука с таблицей и записи в блокноте».

Хорошо:

«Можно показать визуальные детали рабочего процесса, если они действительно есть у вас».

====================
CTA
====================

Разрешены:

- написать комментарий;
- сохранить;
- поделиться;
- поставить реакцию;
- ответить на вопрос;
- выбрать вариант;
- рассказать о своём опыте.

Не обещай:

- чек-лист;
- гайд;
- консультацию;
- подарок;
- расчёт;
- кейс;
- скидку;
- личный разбор;

если наличие такого ресурса не подтверждено.

====================
МЕТАФОРЫ
====================

Сохраняй:

- метафоры;
- юмор;
- сравнения;
- гиперболы;
- эмоциональные образы.

Например:

«антидепрессант дня»

может остаться.

====================
ПЛЕЙСХОЛДЕРЫ
====================

После исправления НЕ ДОЛЖНО ОСТАТЬСЯ:

[сфера]
[продукт]
[результат]
[цена]
[адрес]
[название]

или аналогичных незаполненных шаблонов.

====================
ФИНАЛЬНАЯ ПРОВЕРКА
====================

Перед ответом проверь:

- каждый конкретный факт;
- каждое число;
- каждый результат;
- каждую личную историю;
- каждый объект;
- каждый процесс;
- каждый CTA;
- каждый плейсхолдер.

Если факт неизвестен — НЕ ПРИДУМЫВАЙ.

Но постарайся сохранить исходную маркетинговую мысль.

Верни только исправленный готовый контент.

Не объясняй исправления.
`;
}

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
    temperature: 0.12,
    maxTokens: 1000,
    label:
      `${label} V4 REPAIR`
  });
}

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
    `[${label}] Starting V4 audit...`
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

  if (firstAudit.passed) {
    return {
      result:
        generatedContent,
      audit:
        firstAudit,
      repaired: false,
      secondAudit: null
    };
  }

  console.log(
    `[${label}] V4 violations detected: ${firstAudit.violations.length}`
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
      !secondAudit.passed
    ) {
      console.warn(
        `[${label}] Second V4 audit still found ${secondAudit.violations.length} violations.`
      );
    }

    return {
      result:
        repaired.result,
      audit:
        firstAudit,
      repaired: true,
      secondAudit
    };
  } catch (error) {
    console.error(
      `[${label}] Repair failed:`,
      error.message
    );

    return {
      result:
        generatedContent,
      audit:
        firstAudit,
      repaired: false,
      secondAudit: null,
      repair_error:
        error.message
    };
  }
}

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

function buildPostFilterResponse(
  result
) {
  return {
    auditor_available:
      result.audit?.available ||
      false,

    first_audit_passed:
      result.audit?.passed ??
      null,

    triggered:
      !(result.audit?.passed ??
        true),

    repaired:
      result.repaired ||
      false,

    violations_count:
      result.audit?.violations
        ?.length || 0,

    violations:
      result.audit?.violations ||
      [],

    deterministic_violations:
      result.audit
        ?.deterministicViolations ||
      [],

    ai_violations:
      result.audit
        ?.aiViolations ||
      [],

    repair_error:
      result.repair_error ||
      null,

    second_audit_available:
      result.secondAudit
        ?.available ??
      null,

    second_audit_passed:
      result.secondAudit
        ?.passed ??
      null,

    second_audit_violations_count:
      result.secondAudit
        ?.violations?.length ||
      0,

    second_audit_violations:
      result.secondAudit
        ?.violations ||
      [],

    first_audit_raw:
      result.audit?.raw ||
      null,

    second_audit_raw:
      result.secondAudit?.raw ||
      null,

    first_audit_error:
      result.audit?.error ||
      null,

    second_audit_error:
      result.secondAudit?.error ||
      null
  };
}

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
    !acquireGenerationLock()
  ) {
    return res.status(429).json({
      ok: false,
      error:
        "Generation already in progress. Please try again later."
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
    releaseGenerationLock();

    const status =
      validationError ===
        "Invalid bridge_key" ||
      validationError ===
        "bridge_key is required"
        ? 401
        : 400;

    return res.status(status).json({
      ok: false,
      error:
        validationError
    });
  }

  const safePreviousPlan =
    String(
      previous_plan || ""
    ).slice(-18000);

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

      post_filter:
        buildPostFilterResponse(
          result
        ),

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
    releaseGenerationLock();
  }
}

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
        generationInProgress
    });
  }
);

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

app.get(
  "/test-auth",
  async (req, res) => {
    try {
      const token =
        await getAccessToken();

      res.json({
        ok: true,
        stage:
          "auth",
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
        stage:
          "auth",
        error:
          error.message
      });
    }
  }
);

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
          ?.content ||
        "";

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

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    const startedAt =
      Date.now();

    if (
      !acquireGenerationLock()
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

        post_filter:
          buildPostFilterResponse(
            result
          ),

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
      releaseGenerationLock();
    }
  }
);

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
        bridge_key !==
        BRIDGE_KEY
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

        content_type,

        status:
          result.status,

        time_ms:
          Date.now() -
          startedAt,

        result_length:
          filtered.result.length,

        post_filter:
          buildPostFilterResponse(
            filtered
          ),

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
    }
  }
);

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

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
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
      "AUDITOR:",
      "V4"
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
