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

function acquireGenerationLock(source) {
  if (generationInProgress) {
    const age = Date.now() - generationStartedAt;

    if (age < GENERATION_LOCK_TIMEOUT) {
      return false;
    }

    console.warn(
      `[LOCK] Stale generation lock reset. Source: ${source}, age: ${age} ms`
    );
  }

  generationInProgress = true;
  generationStartedAt = Date.now();

  return true;
}

function releaseGenerationLock() {
  generationInProgress = false;
  generationStartedAt = 0;
}

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

function isContentPlan(contentType) {
  const type = String(contentType || "").toLowerCase();

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}

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

Формат: ${contentType}

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

Не придумывай факты о конкретном бизнесе.

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

====================
ЖЁСТКОЕ ПРАВИЛО ИСТОЧНИКА ПРАВДЫ
====================

Используй только сведения из блока ДАННЫЕ КЛИЕНТА.

Не превращай знания о типичной отраслевой практике в факты этого конкретного бизнеса.

Не рассуждай по принципу:

«раз это дизайнер, значит у него обязательно есть X».

Не рассуждай по принципу:

«раз это кафе, значит у него обязательно есть Y».

Не рассуждай по принципу:

«обычно такие специалисты делают Z».

Для конкретного бизнеса существует только то, что указано во входных данных.

====================
РАЗДЕЛЯЙ ТРИ УРОВНЯ
====================

1. ФАКТ КЛИЕНТА

Можно утверждать как реальность.

2. УНИВЕРСАЛЬНАЯ ОБРАЗОВАТЕЛЬНАЯ МЫСЛЬ

Можно использовать, но нельзя выдавать её за факт опыта, процесса или результата именно этого клиента.

3. УСЛОВНЫЙ СЦЕНАРИЙ

Можно предлагать как:

«можно показать...»
«если у вас есть...»
«например...»
«представьте...»
«можно разобрать ситуацию...»

Но нельзя превращать условный пример в утверждение о реальности бизнеса.

====================
ЗАПРЕЩЕНО БЕЗ ПРЯМОЙ ОПОРЫ
====================

Не придумывай:

- состав услуги;
- этапы работы;
- технологии;
- оборудование;
- реальные объекты;
- помещения;
- предметы;
- клиентов;
- кейсы;
- отзывы;
- истории;
- результаты;
- числа;
- сроки;
- цены;
- скидки;
- экономию;
- проценты;
- свойства продукта;
- свойства услуги;
- гарантии;
- личный опыт;
- процессы;
- дополнительные услуги;
- ресурсы;
- чек-листы;
- гайды;
- консультации;
- расчёты;
- подарки;
- вебинары;
- рассылки.

Не говори:

«мы используем...»

«мы делаем...»

«у нас есть...»

«мой клиент...»

«наши клиенты...»

если соответствующий факт не был сообщён клиентом.

====================
КРЕАТИВ РАЗРЕШЁН
====================

Разрешены:

- метафоры;
- юмор;
- сравнения;
- гиперболы;
- эмоциональные формулировки;
- образный язык;
- художественные заголовки;
- драматизация проблемы.

Но художественная формулировка не должна скрывать новый конкретный факт.

Например:

«Планировка — это скелет будущего интерьера»

можно.

Но:

«Наши клиенты постоянно теряют квадратные метры из-за неправильной планировки»

нельзя, если этого нет во входных данных.

====================
ЕСЛИ ДАННЫХ НЕДОСТАТОЧНО
====================

Не заполняй пробел выдумкой.

Лучше:

- сделать тему условным сценарием;
- задать вопрос аудитории;
- разобрать универсальную проблему;
- привязать идею к подтверждённой аудитории;
- привязать идею к подтверждённому продукту;
- привязать идею к подтверждённой цели;
- поднять уровень абстракции, но сохранить содержательность.

Не делай текст безликим.

====================
КОНТЕКСТ
====================

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
4. Не используй абстрактные универсальные идеи без связи с данными клиента.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Ответ только на русском языке.
13. Каждый день должен иметь понятную точку привязки к бизнесу, аудитории, продукту, цели или теме.
14. Не добавляй новые факты только ради большей конкретности.
15. Не используй незаполненные конструкции вида [название], [продукт], [результат].

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


// ============================================================
// DETERMINISTIC CONTENT CHECK
// ============================================================

function getDeterministicViolations(content) {
  const text = String(content || "");

  const violations = [];

  const add = (match, reason) => {
    const value = String(match || "").trim();

    if (!value) return;

    if (
      !violations.some(
        item => item.text === value
      )
    ) {
      violations.push({
        text: value,
        reason,
        support:
          "Детерминированная проверка: это требует подтверждения во входных данных."
      });
    }
  };

  const placeholderRe =
    /\[[^\]\n]{1,100}\]/g;

  for (const match of text.matchAll(
    placeholderRe
  )) {
    add(
      match[0],
      "Незаполненный шаблон или плейсхолдер."
    );
  }

  const numericRe =
    /\b\d+(?:[.,]\d+)?\s*(?:%|лет|года|год|дней|день|минут|минуты|часов|часа|руб(?:\.|лей)?|₽|тыс\.?|млн|раза?|клиент(?:а|ов)?|проект(?:а|ов)?)\b/gi;

  for (const match of text.matchAll(
    numericRe
  )) {
    add(
      match[0],
      "Конкретное число или измеримый показатель может быть фактом бизнеса и должен быть подтверждён входными данными."
    );
  }

  const forbiddenPatterns = [
    /\b\d+\s*(?:из|на)\s*\d+\b/gi,

    /\b(?:9 из 10|8 из 10|7 из 10|90%|80%|70%)\b/gi,

    /\b(?:за|в течение)\s+\d+\s*(?:минут|часов|дней|недель|месяцев|лет)\b/gi,

    /\b(?:один|одна)\s+(?:из\s+)?(?:моих|наших|ваших)\s+клиент/gi,

    /\b(?:мои|наши)\s+клиенты\b/gi,

    /\b(?:я|мы)\s+(?:уже|раньше|когда-то|за\s+\d+)\b/gi,

    /\b(?:мы|я)\s+(?:используем|использую|делаем|делаю|проводим|провожу|предлагаем|предлагаю)\b/gi,

    /\b(?:гарантир|гарантируем|гарантирую|обещаем|обещаю)\w*/gi,

    /\b(?:пришл(?:ю|ём)|отправ(?:лю|им)|дам|дадим|рассчита(?:ю|ем)|подбер(?:у|ём))\b[^\n]{0,80}\b(?:чек-лист|гайд|гид|расчёт|кейс|консультац)/gi
  ];

  for (const regex of forbiddenPatterns) {
    for (const match of text.matchAll(regex)) {
      add(
        match[0],
        "Фраза содержит утверждение о конкретном опыте, процессе, ресурсе или результате, который должен быть подтверждён данными клиента."
      );
    }
  }

  return violations.slice(0, 20);
}


// ============================================================
// AI CONTENT FACT AUDITOR
// ============================================================

function cleanJsonText(text) {
  let value = String(text || "").trim();

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    value = value.slice(
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
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent
}) {
  return `
Ты — строгий AI-редактор и фактчекер сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент на двух уровнях одновременно.

====================
УРОВЕНЬ A — ФАКТИЧЕСКАЯ ОПОРА
====================

Нельзя выдавать выдуманные сведения о конкретном бизнесе.

Главное правило:

НЕТ ПРЯМОЙ ИЛИ ОЧЕНЬ ЯВНОЙ СМЫСЛОВОЙ ОПОРЫ В ИСХОДНЫХ ДАННЫХ
→ ЗНАЧИТ КОНКРЕТНОЕ УТВЕРЖДЕНИЕ НЕПОДТВЕРЖДЕНО.

Не додумывай за клиента то, чего он не сообщил.

====================
УРОВЕНЬ B — ПОЛЕЗНАЯ КОНКРЕТИКА
====================

После исправления контент не должен превращаться в безликий набор фраз:

«расскажите о продукте»,
«покажите экспертность»,
«расскажите о проблеме».

Если конкретный факт нельзя подтвердить, его можно заменить:

- конкретной мыслью, основанной на известных данных;
- вопросом аудитории;
- условным сценарием;
- универсальным образовательным тезисом;
- маркетинговым ракурсом, связанным с подтверждённой целью;
- содержательной привязкой к продукту, аудитории или проблеме.

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
РАЗРЕШЁННАЯ ОПОРА
====================

Разрешено использовать:

- факты, прямо сообщённые клиентом;
- смысловые перефразирования этих фактов;
- выводы, которые не добавляют новых конкретных сведений о бизнесе;
- маркетинговые задачи;
- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- условные сценарии;
- рекомендации;
- вопросы аудитории;
- универсальные съёмочные приёмы.

Например:

«можно показать...»

«если у вас есть...»

«представьте...»

«например...»

«разберите условную ситуацию...»

могут быть допустимыми, потому что они не утверждают существование конкретного объекта.

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
- ошибки бизнеса;
- провалы;
- кейсы;
- клиенты;
- подписчики;
- комментарии;
- отзывы;
- продажи;
- результаты;
- гарантии;
- обещания;
- конкретные продукты;
- конкретные услуги;
- конкретные помещения;
- конкретные объекты;
- оборудование;
- локации;
- технологии;
- методы;
- этапы работы;
- свойства продукта;
- свойства услуги;
- рабочие процессы;
- дополнительные услуги;
- ресурсы;
- чек-листы;
- гайды;
- консультации;
- расчёты;
- подарки;
- вебинары;
- рассылки.

====================
КРИТИЧЕСКИ ВАЖНО
====================

Не делай вывод:

«это типично для такой ниши, значит клиент наверняка это делает».

Это ошибка.

Например:

Если известно только:

«дизайнер создаёт дизайн-проекты»

нельзя автоматически утверждать:

«он делает обмерный план»,
«он делает авторский надзор»,
«он создаёт рабочие чертежи»,
«он подбирает свет»,
«он использует 3D-визуализации»,

если соответствующие сведения отсутствуют.

Если известно:

«кафе продаёт кофе и десерты»,

нельзя автоматически утверждать:

«кофе свежеобжаренный»,
«десерты готовятся на месте»,
«клиенты приходят за атмосферой»,
«кофе увеличивает средний чек».

Если известно:

«эксперт продаёт услуги»,

нельзя автоматически утверждать:

«он проводит консультации»,
«делает разборы»,
«созванивается с клиентами»,
«использует определённую методику»,
«имеет кейсы».

====================
ФАКТ И СЦЕНАРИЙ
====================

Плохо:

«Эксперт открывает комментарии под прошлым постом».

Это утверждение о существующем прошлом посте.

Хорошо:

«Если под публикациями уже есть вопросы аудитории, можно выбрать один из них для разбора».

Плохо:

«Покажите экран ноутбука с таблицей».

Если существование ноутбука и таблицы не подтверждено.

Хорошо:

«Можно использовать текстовую графику или экранную схему, чтобы визуально показать этапы».

Плохо:

«Один из клиентов пришёл с этой проблемой».

Хорошо:

«Можно разобрать типичную ситуацию, в которой потенциальный клиент сталкивается с такой проблемой».

====================
МЕТАФОРЫ И ХУДОЖЕСТВЕННОСТЬ
====================

Не считай нарушением:

«эта проблема съедает внимание»;

«разберём тему под микроскопом»;

«такой подход может стать контентным антидепрессантом»;

«планировка — скелет интерьера».

Это художественные формулировки.

Но если художественная фраза одновременно утверждает конкретный факт бизнеса — проверяй её как факт.

====================
CTA
====================

Обычный CTA допустим:

- напишите в комментариях;
- сохраните пост;
- поделитесь мнением;
- ответьте на вопрос;
- поставьте +;
- выберите вариант.

Но нельзя обещать неподтверждённый ресурс:

«пришлю чек-лист»;

«дам расчёт»;

«отправлю кейс»;

«проведу консультацию»;

если наличие такого ресурса не подтверждено.

====================
ПЛЕЙСХОЛДЕРЫ
====================

Любой незаполненный шаблон:

[сфера]

[продукт]

[результат]

[адрес]

[название]

и аналогичный текст в квадратных скобках —

НАРУШЕНИЕ.

====================
СЛИШКОМ АБСТРАКТНЫЙ КОНТЕНТ
====================

Не ставь нарушение только потому, что фраза не является буквальным повторением входных данных.

Но если весь смысл дня можно применить практически к любому бизнесу без изменения текста, проверь:

есть ли хотя бы одна содержательная точка привязки к:

- бизнесу;
- продукту;
- аудитории;
- проблеме аудитории;
- цели;
- теме.

Если такой привязки нет, можно пометить:

type:
too_abstract

Но не называй слишком абстрактным контент только потому, что он использует универсальную образовательную мысль.

====================
ПРАВИЛО СОМНЕНИЯ
====================

Если конкретное утверждение можно трактовать и как факт, и как художественную формулировку, сначала проверь контекст.

Если оно звучит как утверждение о реальности конкретного бизнеса — проверяй.

Если это явно условная рекомендация или метафора — не помечай.

Не создавай нарушения только ради количества.

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON.

Без Markdown.

Без пояснений.

При отсутствии нарушений:

{
  "passed": true,
  "violations": []
}

При наличии нарушений:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из контента",
      "reason": "почему фрагмент не имеет достаточной опоры",
      "support": "какой факт отсутствует",
      "type": "fact | placeholder | unsupported_cta | conditionalize | too_abstract",
      "repair": "delete | abstract | conditional | replace_cta | anchor_to_known_fact"
    }
  ]
}

Критически важно:

если violations содержит хотя бы один элемент,
passed ДОЛЖЕН быть false.

Максимум 15 нарушений.

text должен быть точным фрагментом исходного контента.
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
  const prompt = buildAuditPrompt({
    contentType,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic,
    contentStyle,
    generatedContent
  });

  try {
    const audit = await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.1,
      maxTokens: 450,
      label: `${label} AI AUDITOR`
    });

    const parsed =
      parseAuditorJson(audit.result);

    if (
      !parsed ||
      typeof parsed.passed !== "boolean" ||
      !Array.isArray(parsed.violations)
    ) {
      console.error(
        "[AI AUDITOR] Invalid auditor response. Failing open."
      );

      return {
        available: false,
        passed: true,
        violations: [],
        raw: audit.result
      };
    }

    const violations =
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
              : "",
          type:
            typeof item.type === "string"
              ? item.type.trim()
              : "",
          repair:
            typeof item.repair === "string"
              ? item.repair.trim()
              : ""
        }))
        .filter(
          item =>
            item.text &&
            item.reason
        );

    console.log(
      `[AI AUDITOR] Passed: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] Violations: ${violations.length}`
    );

    return {
      available: true,
      passed:
        parsed.passed &&
        violations.length === 0,
      violations,
      raw: parsed
    };
  } catch (error) {
    console.error(
      "[AI AUDITOR] Failed. Failing open:",
      error.message
    );

    return {
      available: false,
      passed: true,
      violations: [],
      error: error.message
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
          `${index + 1}. Фрагмент: «${item.text}»\n` +
          `Причина: ${item.reason}` +
          (item.support
            ? `\nОпора: ${item.support}`
            : "") +
          (item.type
            ? `\nТип: ${item.type}`
            : "") +
          (item.repair
            ? `\nСпособ исправления: ${item.repair}`
            : "")
      )
      .join("\n\n");

  return `
Ты — финальный редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — исправить контент после строгого AI-фактчека.

Главный принцип:

СОХРАНИ МАКСИМУМ ПОЛЬЗЫ И КОНКРЕТИКИ,
НО НЕ ДОБАВЛЯЙ НИ ОДНОГО НОВОГО ФАКТА.

====================
ИСХОДНЫЕ ДАННЫЕ
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
ПРИОРИТЕТ ИСПРАВЛЕНИЯ
====================

Используй такой порядок:

1. ПРИВЯЗАТЬ К ИЗВЕСТНОМУ ФАКТУ
2. СДЕЛАТЬ УСЛОВНЫМ
3. ПОДНЯТЬ УРОВЕНЬ АБСТРАКЦИИ
4. ЗАМЕНИТЬ CTA
5. УДАЛИТЬ

Не удаляй полезную мысль целиком, если её можно сохранить безопасной переформулировкой.

====================
ПРАВИЛА
====================

1. Исправь все найденные нарушения.

2. НИКОГДА не добавляй новый реальный факт о клиенте.

3. Не придумывай:
- клиентов;
- истории;
- кейсы;
- отзывы;
- результаты;
- цифры;
- цены;
- сроки;
- скидки;
- процессы;
- технологии;
- оборудование;
- помещения;
- предметы;
- свойства продукта;
- свойства услуги;
- дополнительные услуги.

4. Если число не подтверждено — удали число.
Не заменяй его другим числом.

5. Если личная история не подтверждена — не создавай новую историю.

6. Если процесс работы не описан клиентом — не создавай этапы работы.

7. Если свойство или результат не подтверждены — не заменяй их другим неподтверждённым свойством или результатом.

8. Если конкретный объект нужен только для сценария, переведи его в условную форму:

«если у вас есть...»

«можно показать...»

«например...»

«представьте...»

9. Никогда не оставляй плейсхолдеры:

[сфера]

[продукт]

[результат]

[адрес]

и подобные конструкции.

10. Сохраняй метафоры.

11. Сохраняй юмор.

12. Сохраняй сравнения.

13. Сохраняй гиперболы.

14. Сохраняй эмоциональные формулировки.

15. Сохраняй универсальные съёмочные приёмы.

16. CTA должен быть выполнимым без неподтверждённого ресурса.

Предпочтительные безопасные CTA:

- комментарий;
- реакция;
- сохранение;
- вопрос;
- обсуждение;
- выбор варианта.

17. Не используй «я», «мы», «у нас», «мой», «наша» для неподтверждённого опыта или процесса.

18. Не превращай конкретную идею в пустую формулу:

«расскажите о продукте»,

«покажите экспертность»,

«расскажите о проблеме».

Сохраняй предмет разговора.

19. Если исходная идея слишком конкретна, но её конкретная деталь не подтверждена, сохрани маркетинговую мысль через условный сценарий.

20. Если исходная идея была:

«три мифа о [сфера/продукт]»

а конкретная сфера неизвестна,

не оставляй плейсхолдер.

Можно перестроить её вокруг:

«мифов, которые мешают потенциальному клиенту выбрать подходящее решение».

21. Не добавляй новый факт ради большей конкретности.

22. Не объясняй, что именно исправил.

23. Верни только готовый исправленный контент.

====================
ФИНАЛЬНАЯ ПРОВЕРКА
====================

Перед ответом проверь каждое предложение:

- факт подтверждён?
- число подтверждено?
- нет ли плейсхолдера?
- нет ли придуманного клиента?
- нет ли придуманной истории?
- нет ли придуманного кейса?
- нет ли придуманного результата?
- нет ли придуманного процесса?
- нет ли придуманной услуги?
- нет ли неподтверждённого ресурса?
- если деталь условная — оформлена ли она как условная?
- осталась ли связь с бизнесом или аудиторией?
- не стал ли контент безликим?

Если сомневаешься между конкретностью и безопасностью,
выбирай безопасную конкретность, основанную на известных данных клиента.

Верни только готовый исправленный контент.
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
  const prompt = buildRepairPrompt({
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
    label: `${label} REPAIR`
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
    `[${label}] Starting deterministic + AI fact audit...`
  );

  const deterministicFirst =
    getDeterministicViolations(
      generatedContent
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

  const mergedFirstViolations = [
    ...deterministicFirst,
    ...(firstAudit.violations || [])
  ]
    .filter(
      (item, index, arr) =>
        item?.text &&
        arr.findIndex(
          v => v.text === item.text
        ) === index
    )
    .slice(0, 15);

  const firstPassed =
    mergedFirstViolations.length === 0 &&
    (!firstAudit.available ||
      firstAudit.passed);

  const effectiveFirstAudit = {
    ...firstAudit,
    passed: firstPassed,
    violations: mergedFirstViolations
  };

  if (firstPassed) {
    return {
      result: generatedContent,
      audit: effectiveFirstAudit,
      repaired: false,
      secondAudit: null,
      finalPassed: true,
      finalDeterministicViolations: []
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
          mergedFirstViolations,
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
        label: `${label} SECOND`
      });

    const finalDeterministicViolations =
      getDeterministicViolations(
        repaired.result
      );

    const finalPassed =
      finalDeterministicViolations.length === 0 &&
      (!secondAudit.available ||
        secondAudit.passed);

    if (!finalPassed) {
      console.warn(
        `[${label}] Final validation still has violations. No additional repair loop will run.`
      );
    }

    return {
      result: repaired.result,
      audit: effectiveFirstAudit,
      repaired: true,
      secondAudit,
      finalPassed,
      finalDeterministicViolations
    };
  } catch (error) {
    console.error(
      `[${label}] Repair failed. Returning original content:`,
      error.message
    );

    return {
      result: generatedContent,
      audit: effectiveFirstAudit,
      repaired: false,
      secondAudit: null,
      finalPassed: false,
      finalDeterministicViolations:
        getDeterministicViolations(
          generatedContent
        ),
      repair_error: error.message
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
    result: filtered.result,
    audit: filtered.audit,
    repaired: filtered.repaired,
    secondAudit: filtered.secondAudit,
    finalPassed:
      filtered.finalPassed,
    finalDeterministicViolations:
      filtered.finalDeterministicViolations,
    repair_error:
      filtered.repair_error || null
  };
}

async function handlePlanChunk(
  req,
  res,
  startDay,
  endDay
) {
  const startedAt = Date.now();

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
        businessInfo: business_info,
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
      start_day: startDay,
      end_day: endDay,
      model: GIGACHAT_MODEL,
      status: result.status,
      time_ms:
        Date.now() - startedAt,
      result_length:
        result.result.length,
      post_filter: {
        auditor_available:
          result.audit?.available ||
          false,
        triggered:
          !(result.audit?.passed ??
            true),
        repaired:
          result.repaired || false,
        warnings:
          result.audit?.violations
            ?.length || 0,
        second_audit_passed:
          result.secondAudit?.passed ??
          null,
        final_passed:
          result.finalPassed ?? null
      },
      reels_result:
        result.result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      start_day: startDay,
      end_day: endDay,
      message: error.message,
      status:
        error.response?.status,
      response:
        error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  } finally {
    releaseGenerationLock();
  }
}

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
        ? Date.now() -
          generationStartedAt
        : 0
  });
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service:
      "content-constructor-gateway",
    message:
      "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",
    endpoints: {
      health: "/health",
      test_auth: "/test-auth",
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

app.get("/test-auth", async (req, res) => {
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
});

app.get("/test-generate", async (req, res) => {
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
        ?.message?.content ||
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
});

app.get("/test-plan-1-5", async (req, res) => {
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

        previousPlan: "",

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
            ?.violations
            ?.length || 0,

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
          null,

        final_passed:
          result.finalPassed ??
          null,

        final_deterministic_violations:
          result.finalDeterministicViolations ||
          []
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
    releaseGenerationLock();
  }
});

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

app.post("/generate", async (req, res) => {
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

  try {
    const {
      bridge_key,
      content_type,
      business_info,
      target_audience,
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
        temperature: 0.75,
        maxTokens: 1800,
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

      post_filter: {
        auditor_available:
          filtered.audit?.available ||
          false,

        triggered:
          !(filtered.audit?.passed ??
            true),

        repaired:
          filtered.repaired,

        warnings:
          filtered.audit?.violations
            ?.length || 0,

        second_audit_passed:
          filtered.secondAudit
            ?.passed ??
          null,

        final_passed:
          filtered.finalPassed ??
          null
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
    releaseGenerationLock();
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error:
      "Endpoint not found",
    path:
      req.path,
    method:
      req.method
  });
});

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
