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

const MAX_PLAN_CHUNK_CHARS = 1700;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let accessToken = null;
let tokenExpiresAt = 0;
let generationInProgress = false;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (!GIGACHAT_KEY) throw new Error("GIGACHAT_KEY is not configured");

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({ scope: GIGACHAT_SCOPE }).toString(),
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
  const expiresIn = Number(response.data.expires_in) || 1800;
  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
  return accessToken;
}

function isContentPlan(contentType) {
  const type = String(contentType || "").toLowerCase();

  return type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней");
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
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель контента: ${contentGoal}
Тема: ${reelsTopic || "Определи подходящую тему самостоятельно."}
Стиль: ${contentStyle}

====================
ИНСТРУКЦИЯ
====================

${getContentInstructions(contentType)}

====================
ФАКТОЛОГИЧЕСКАЯ СТРОГОСТЬ
====================

Используй только информацию, которая реально дана во входных данных.

Не придумывай:
- клиентов;
- кейсы;
- отзывы;
- истории;
- цифры;
- цены;
- скидки;
- сроки;
- результаты;
- гарантии;
- процессы работы;
- этапы услуги;
- оборудование;
- помещения;
- локации;
- свойства продукта;
- технологии;
- ресурсы, которые бизнес якобы предоставляет.

Не превращай общую бизнес-категорию в конкретный факт.

Например:

«эксперт продаёт услуги»

НЕ означает автоматически:

- консультации;
- созвоны;
- анализ;
- сопровождение;
- правки;
- кейсы;
- гарантированный результат;
- конкретный процесс работы.

Если конкретной информации недостаточно, используй:
- вопрос;
- условный сценарий;
- аналитический ракурс;
- проблему аудитории;
- критерий выбора;
- универсальный съёмочный приём;
- метафору;
- сравнение;
- юмор;
- гиперболу.

Допустимы формулировки:

«можно показать...»
«если у вас есть...»
«представьте...»
«например...»
«разберём...»
«попробуйте посмотреть на проблему так...»

Но не выдавай условный объект или событие за реально существующий факт.

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
- Не используй неподтверждённые плейсхолдеры в квадратных скобках.

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

Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель контента: ${contentGoal}
Стиль: ${contentStyle}

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

2. Каждый день должен иметь:
- одну понятную тему;
- одну идею;
- одну задачу;
- один CTA.

3. Каждый день обязан иметь ПРЯМУЮ ОПОРУ на то, что реально известно о бизнесе, аудитории, цели или заданной теме.

4. Не заполняй пробелы правдоподобными деталями.

Правдоподобно — не значит подтверждено.

5. Не выдумывай:
- конкретные проблемы клиентов;
- процессы работы;
- этапы услуги;
- продукты;
- свойства;
- результаты;
- кейсы;
- истории;
- отзывы;
- цифры;
- цены;
- скидки;
- сроки;
- места;
- оборудование;
- помещения;
- ресурсы.

6. Не превращай общую нишу в конкретный факт.

Например:

«эксперт продаёт услуги»

НЕ означает автоматически:
- консультации;
- созвоны;
- анализ;
- правки;
- кейсы;
- гарантии;
- сопровождение;
- конкретный результат.

7. Не используй формулировки:

«самая частая ошибка»
«дорогая ошибка»
«9 из 10»
«это больше не работает»
«клиент получает»
«после работы со мной»
«я всегда»
«мы используем»
«пришлю»
«рассчитаю»

если это не подтверждено входными данными.

8. Если конкретики мало, НЕ придумывай её.

Подними уровень:

проблема аудитории
→ вопрос
→ критерий выбора
→ условный сценарий
→ универсальный приём контента.

9. Условные рекомендации допустимы:

«если у вас есть...»
«можно показать...»
«например...»
«представьте...»

Но не выдавай условный объект за существующий у клиента.

10. Метафоры, юмор, сравнения и гиперболы разрешены, если они не создают новый конкретный факт.

11. Не повторяй темы и идеи из предыдущей части.

12. Чередуй форматы.

13. Не пиши длинные готовые тексты.

14. Не пиши полный сценарий.

15. Не объясняй свои решения.

16. Не добавляй вступление или заключение.

17. Весь фрагмент ${startDay}–${endDay} должен помещаться примерно в ${MAX_PLAN_CHUNK_CHARS} символов.

Цель:
300–330 символов на один день.

18. Ответ только на русском языке.

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

  console.log(`[${label}] Sending request to GigaChat...`);

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
// AI CONTENT FACT AUDITOR V3
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

function getDeterministicViolations(content) {
  const text = String(content || "");

  const violations = [];

  const placeholderRegex =
    /\[[^\]\n]{1,80}\]/g;

  const placeholders =
    text.match(placeholderRegex) || [];

  for (
    const item of [...new Set(placeholders)].slice(0, 8)
  ) {
    violations.push({
      text: item,

      reason:
        "Незаполненный шаблон или плейсхолдер.",

      support:
        "Такой шаблон нельзя оставлять в готовом клиентском контенте.",

      type: "placeholder",

      repair: "delete"
    });
  }

  const numericRegex =
    /(?<!День\s)(?<!Слайд\s)\b\d+(?:[.,]\d+)?\s*(?:%|секунд(?:а|ы)?|минут(?:а|ы)?|час(?:а|ов)?|дн(?:я|ей)?|лет|руб(?:лей|ля)?|₽|клиент(?:а|ов)?|человек(?:а|ов)?)\b/gi;

  const numbers =
    text.match(numericRegex) || [];

  for (
    const item of [...new Set(numbers)].slice(0, 8)
  ) {
    violations.push({
      text: item,

      reason:
        "Конкретное число или количественное утверждение требует подтверждения во входных данных.",

      support:
        "Во входных данных такого числа нет.",

      type: "fact",

      repair: "delete"
    });
  }

  return violations;
}

function mergeViolations(
  deterministic,
  ai
) {
  const all = [
    ...deterministic,
    ...ai
  ];

  const seen = new Set();

  return all
    .filter(item => {
      const key =
        `${item.text}|${item.reason}`
          .toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .slice(0, 15);
}

function fitPlanChunkToLimit(
  content,
  maxChars = MAX_PLAN_CHUNK_CHARS
) {
  let text =
    String(content || "").trim();

  if (text.length <= maxChars) {
    return text;
  }

  const blocks =
    text
      .split(
        /(?=День\s+\d+\s*[—-])/i
      )
      .map(x => x.trim())
      .filter(Boolean);

  if (blocks.length === 0) {
    return text
      .slice(0, maxChars)
      .trim();
  }

  const budget =
    Math.max(
      250,
      Math.floor(
        (
          maxChars -
          (blocks.length - 1) * 2
        ) /
        blocks.length
      )
    );

  const shorten = (
    value,
    limit
  ) => {
    const clean =
      String(value || "")
        .replace(/\s+/g, " ")
        .trim();

    if (clean.length <= limit) {
      return clean;
    }

    const cut =
      clean.slice(
        0,
        Math.max(20, limit - 1)
      );

    const lastSpace =
      cut.lastIndexOf(" ");

    return `${(
      lastSpace > 20
        ? cut.slice(0, lastSpace)
        : cut
    ).trim()}…`;
  };

  const compactBlock = block => {
    const lines =
      block
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);

    const result = [];

    let used = 0;

    for (const line of lines) {
      let limit = 65;

      if (/^День\s+/i.test(line)) {
        limit = 55;
      } else if (/^Тема:/i.test(line)) {
        limit = 90;
      } else if (/^Идея:/i.test(line)) {
        limit = 120;
      } else if (/^Задача:/i.test(line)) {
        limit = 85;
      } else if (/^CTA:/i.test(line)) {
        limit = 90;
      }

      const shortened =
        shorten(line, limit);

      if (
        used +
        shortened.length +
        1 <=
        budget
      ) {
        result.push(shortened);

        used +=
          shortened.length + 1;
      }
    }

    return result.join("\n");
  };

  let compact =
    blocks
      .map(compactBlock)
      .join("\n\n");

  if (compact.length <= maxChars) {
    return compact;
  }

  const hardBudget =
    Math.max(
      220,
      Math.floor(
        (
          maxChars -
          (blocks.length - 1) * 2
        ) /
        blocks.length
      )
    );

  compact =
    blocks
      .map(block =>
        shorten(
          compactBlock(block)
            .replace(/\n+/g, " | "),
          hardBudget
        )
      )
      .join("\n\n");

  return compact
    .slice(0, maxChars)
    .trim();
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

====================
УРОВЕНЬ B — СОХРАНЕНИЕ ПОЛЕЗНОЙ КОНКРЕТИКИ
====================

После исправления контент не должен превращаться в безликий набор фраз:

«про продукт»
«про услугу»
«про аудиторию»

Если конкретный факт нельзя подтвердить, его нужно не просто удалить.

По возможности его нужно заменить на:

- конкретную мысль;
- вопрос;
- условный сценарий;
- маркетинговый ракурс;
- проблему аудитории;

которые напрямую связаны с подтверждёнными данными клиента.

====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================

Формат: ${contentType}
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель: ${contentGoal}
Тема: ${reelsTopic || "не задана отдельно"}
Стиль: ${contentStyle}

====================
ГОТОВЫЙ КОНТЕНТ
====================

${generatedContent}

====================
ЧТО СЧИТАЕТСЯ РАЗРЕШЁННОЙ ОПОРОЙ
====================

Разрешено использовать:

- факты, прямо сообщённые клиентом;
- смысловые перефразирования этих фактов;
- выводы, которые не добавляют новых конкретных сведений о бизнесе;
- маркетинговые формулировки, которые являются задачей/направлением контента, а не утверждением о реальности;
- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- условные сценарии;
- рекомендации;
- универсальные съёмочные приёмы;
- вопросы аудитории;
- CTA без неподтверждённого обещания.

Допустимы:

«можно показать...»

«представьте...»

«если у вас есть...»

«например...»

«разберём...»

«попробуйте посмотреть на проблему так...»

====================
ЧТО НУЖНО ПОМЕЧАТЬ КАК НАРУШЕНИЕ
====================

Помечай конкретное утверждение, если оно добавляет неподтверждённый факт о:

- клиенте;
- бизнесе;
- продукте;
- услуге;
- клиентах;
- процессе;
- результате.

Особенно проверяй:

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
- объекты;
- помещения;
- оборудование;
- локации;
- действия бизнеса;
- рабочие процессы;
- технологии;
- методы;
- этапы;
- свойства продукта;
- утверждения от первого лица;
- неподтверждённые ресурсы.

====================
НЕ ПУТАЙ ФАКТ И ТВОРЧЕСКУЮ ФОРМУЛИРОВКУ
====================

НЕ считать нарушением:

«эта проблема может съедать внимание»

«такой подход может стать контентным антидепрессантом»

«разберём тему под микроскопом»

«представьте, что...»

«можно снять...»

«покажите на экране...»

Это художественные или условные формулировки.

Считать нарушением:

«ваши клиенты уже устали от...»

если это не подтверждено.

«один из клиентов пришёл...»

если такого клиента не описывали.

«я за 10 лет понял...»

если стаж не указан.

«мы отправим вам чек-лист»

если чек-лист не указан.

«после этого клиент получает X»

если результат не указан.

«мы используем метод X»

если метод не указан.

====================
КОНТРОЛЬ ПЛЕЙСХОЛДЕРОВ
====================

Любой незаполненный шаблон вида:

[текст]
[сфера]
[продукт]
[результат]
[адрес]

и аналогичные конструкции — нарушение.

Не предлагай заменить его новым выдуманным фактом.

====================
КОНТРОЛЬ КОНКРЕТНОСТИ
====================

Не ставь нарушение только потому, что фраза не является буквальным повторением входных данных.

Но если весь смысл дня можно применить практически к любому бизнесу без изменения текста, проверь наличие хотя бы одной подтверждённой точки привязки к:

- бизнесу;
- аудитории;
- цели;
- теме.

Если такой точки привязки нет, это нарушение типа:

«СЛИШКОМ АБСТРАКТНО».

ВАЖНО:

Не требуй конкретной детали, которой клиент не сообщал.

Если конкретики объективно мало, допустима более широкая формулировка.

Но она должна опираться хотя бы на известную:

- бизнес-категорию;
- аудиторию;
- цель;
- тему.

====================
КОНТРОЛЬ CTA
====================

Разрешены CTA:

«Напишите в комментариях, какой вариант вам ближе»

«Сохраните, чтобы вернуться к теме»

«Напишите, сталкивались ли вы с этим»

«Поставьте +, если тема актуальна»

Другие CTA, которые:

- не обещают материал;
- не обещают консультацию;
- не обещают расчёт;
- не обещают скидку;
- не обещают результат.

Нарушение:

«Напишите “МИФ”, и я пришлю чек-лист»

если чек-лист не подтверждён.

Допустимо:

«Напишите “МИФ”, если хотите продолжение этой темы».

====================
КОНТРОЛЬ СЦЕНАРНЫХ ИДЕЙ
====================

Если сценарий утверждает наличие предмета или события:

«Эксперт берёт товар с полки»

нужен факт, что такой объект существует.

Если это условная рекомендация:

«Если у вас есть товар, можно снять момент...»

допустимо.

Если сценарий использует универсальный визуальный приём:

«Выведите ключевую мысль крупным текстом на экране»

допустимо.

====================
ПРОВЕРКА «ПРАВДОПОДОБНО, НО НЕ ДОКАЗАНО»
====================

Не считай фразу безопасной только потому, что она звучит естественно для маркетинга или логично для ниши.

Особенно внимательно проверяй утверждения вроде:

- «самая частая»;
- «главная»;
- «дорогая»;
- «типичная»;
- «обычно»;
- «всегда»;
- «никогда»;
- «раньше работало, а теперь не работает»;
- «клиент получает»;
- «после работы»;
- «это приводит к результату»;
- «помогает получить»;
- «гарантирует»;
- «экономит»;
- «увеличивает»;
- «снижает»;
- «эксперт знает»;
- «эксперт делает»;
- «мы используем»;
- «у нас есть»;
- «подписчики спрашивают»;
- «клиенты пишут»;
- «вам часто говорят»;
- «пришлю»;
- «отправлю»;
- «рассчитаю»;
- «дам чек-лист»;
- «покажу кейс»;
- «ссылка в профиле»;
- «в личных сообщениях».

Эти конструкции НЕ запрещены автоматически.

Нарушением они становятся тогда, когда содержат конкретное утверждение о бизнесе, клиентах, процессе, результате или ресурсе, которого нет во входных данных.

====================
ПРИМЕРЫ
====================

«Самая частая ошибка клиентов — ...»

→ нарушение без данных о частоте.

«Одна из возможных ошибок аудитории — ...»

→ допустимая гипотеза.

«После работы со мной клиент получает ...»

→ нарушение без подтверждённого результата.

«Можно разобрать, какого результата человек хочет достичь...»

→ допустимо.

«Я пришлю чек-лист в личку»

→ нарушение без подтверждённого ресурса.

«Если хотите продолжение темы, напишите...»

→ допустимый CTA.

«Раньше этот подход работал, а теперь нет»

→ нарушение без данных о времени и эффективности.

«Можно обсудить, почему привычный подход может перестать подходить в некоторых ситуациях»

→ допустимая аналитическая гипотеза.

====================
ГЛАВНЫЙ ТЕСТ
====================

Если убрать название бизнеса, фраза всё равно должна иметь подтверждение во входных данных.

Если она держится только на том, что:

«так обычно бывает в этой нише»

это НЕ подтверждение.

====================
ВАЖНО ДЛЯ ПОСЛЕДУЮЩЕГО РЕМОНТА
====================

Если находишь нарушение, объясни:

ПОЧЕМУ фраза запрещена.

И какой тип исправления нужен:

- УДАЛИТЬ;
- ПОДНЯТЬ УРОВЕНЬ;
- СДЕЛАТЬ УСЛОВНЫМ;
- ЗАМЕНИТЬ CTA;
- ПРИВЯЗАТЬ К ИЗВЕСТНОМУ ФАКТУ.

Никогда не предлагай конкретный новый факт, которого нет во входных данных.

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON без Markdown и без пояснений:

{
  "passed": true,
  "violations": []
}

или:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из контента",
      "reason": "почему фрагмент требует исправления",
      "support": "какой факт отсутствует или почему фрагмент слишком абстрактен",
      "type": "fact | placeholder | unsupported_cta | conditionalize | too_abstract",
      "repair": "delete | abstract | conditional | replace_cta | anchor_to_known_fact"
    }
  ]
}

Критически важно:

- если violations содержит хотя бы один элемент, passed ДОЛЖЕН быть false;
- не возвращай passed=true при наличии violations;
- максимум 15 нарушений;
- text должен быть точным фрагментом исходного контента;
- не создавай нарушение только ради количества.
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

          reason:
            item.reason.trim(),

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

    const deterministic =
      getDeterministicViolations(
        generatedContent
      );

    const mergedViolations =
      mergeViolations(
        deterministic,
        violations
      );

    console.log(
      `[AI AUDITOR] Passed: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] AI violations: ${violations.length}`
    );

    console.log(
      `[AI AUDITOR] Deterministic violations: ${deterministic.length}`
    );

    console.log(
      `[AI AUDITOR] Total violations: ${mergedViolations.length}`
    );

    return {
      available: true,

      passed:
        parsed.passed &&
        mergedViolations.length === 0,

      violations:
        mergedViolations,

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
          (
            item.support
              ? `\nОпора: ${item.support}`
              : ""
          ) +
          (
            item.type
              ? `\nТип: ${item.type}`
              : ""
          ) +
          (
            item.repair
              ? `\nСпособ исправления: ${item.repair}`
              : ""
          )
      )
      .join("\n\n");

  return `
Ты — финальный редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — исправить контент после AI-фактчека, сохранив максимум его пользы, конкретности, структуры и маркетинговой силы.

====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================

Формат: ${contentType}
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель: ${contentGoal}
Тема: ${reelsTopic || "не задана отдельно"}
Стиль: ${contentStyle}

====================
НАЙДЕННЫЕ НАРУШЕНИЯ
====================

${violationBlock}

====================
ИСХОДНЫЙ КОНТЕНТ
====================

${generatedContent}

====================
ГЛАВНЫЙ ПРИНЦИП V3
====================

НЕ ДЕЛАЙ КОНТЕНТ БЕЗЛИКИМ.

Если конкретная деталь не подтверждена, не нужно автоматически удалять всю мысль.

Выбери подходящий способ:

1. УДАЛИТЬ — только если неподтверждённая деталь не нужна для смысла.

2. ПОДНЯТЬ УРОВЕНЬ — заменить неподтверждённый конкретный факт на более общую, но содержательную мысль.

3. СДЕЛАТЬ УСЛОВНЫМ — если это идея для съёмки или сценария.

4. ЗАМЕНИТЬ CTA — если обещан чек-лист, консультация, кейс, расчёт, подарок или другой неподтверждённый ресурс.

5. ПРИВЯЗАТЬ К ИЗВЕСТНОМУ ФАКТУ — если после удаления контент стал слишком универсальным.

====================
ПРАВИЛА ИСПРАВЛЕНИЯ
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
- скидки;
- даты;
- сроки;
- оборудование;
- помещения;
- локации;
- процессы;
- технологии;
- свойства продукта.

4. Не придумывай наличие:
- чек-листа;
- гайда;
- консультации;
- расчёта;
- подарка;
- вебинара;
- рассылки;
- кейса;
- другого ресурса.

5. Если число не подтверждено — удали число.

Не заменяй его другим числом.

6. Если личная история не подтверждена — не создавай новую историю.

Переведи её в:
- универсальный вопрос;
- разбор типичной ситуации;
- условный сценарий.

7. Если процесс работы не описан — не создавай этапы работы.

Можно говорить о ценности на уровне известного продукта/услуги.

8. Если свойство или результат не подтверждены — убери конкретное свойство/результат.

Но постарайся сохранить исходную мысль через:
- пользу;
- вопрос;
- проблему аудитории;
- условный пример.

9. Если есть плейсхолдер в квадратных скобках — полностью замени его или перестрой предложение так, чтобы плейсхолдер исчез.

Никогда не оставляй:

[сфера]
[продукт]
[результат]

и подобные шаблоны.

10. Сохраняй:
- метафоры;
- юмор;
- сравнения;
- гиперболы;
- эмоциональные формулировки.

Если они не превращаются в конкретные факты.

11. Сохраняй универсальные съёмочные приёмы:

- текст на экране;
- графика;
- монтаж;
- субтитры;
- голос за кадром.

12. Если сценарная деталь не подтверждена, переводи её в условную рекомендацию:

«если у вас есть...»

«можно снять...»

«представьте...»

«например...»

13. CTA должен быть выполнимым без неподтверждённого ресурса.

Предпочтение:

- комментарий;
- реакция;
- сохранение;
- вопрос;
- обсуждение темы.

14. Не используй от первого лица для неподтверждённого опыта или процесса.

15. Не превращай конкретную идею в пустую формулу:

«расскажите о продукте».

Оставляй предмет разговора:

- проблему аудитории;
- известную бизнес-категорию;
- цель контента;
- заданную тему.

16. Если исходная идея была:

«три мифа о [сфера/продукт]»

а сфера неизвестна, допустимо сохранить конструкцию:

«три мифа о продукте или услуге»

только если это действительно относится к указанному бизнесу.

Если это слишком широко, лучше сделать тему:

«мифы, которые мешают потенциальному клиенту выбрать подходящее решение»

без выдуманного конкретного свойства.

17. Не добавляй новые факты только ради большей конкретности.

18. Не объясняй, что именно исправил.

19. Не заменяй выдуманный факт другим правдоподобным фактом.

Если нельзя написать:

«клиент получает уверенность»

не заменяй это на:

«клиент получает спокойствие».

Подними уровень до проверяемой мысли или условного сценария.

20. Не оставляй плейсхолдеры в квадратных скобках.

21. Не обещай действие от имени бизнеса:

«пришлю»
«рассчитаю»
«дам»
«отправлю»

если это не подтверждено.

22. Для контент-плана сохраняй все дни и держи весь фрагмент коротким.

23. Верни только готовый исправленный контент.

====================
КОНТРОЛЬ КАЧЕСТВА
====================

Проверь результат по пяти вопросам:

1. Каждый конкретный факт подтверждён исходными данными?

2. Нет ли плейсхолдеров?

3. Нет ли придуманных ресурсов, историй, клиентов, результатов или процессов?

4. Осталась ли у каждого дня/блока понятная связь с бизнесом, аудиторией, целью или темой?

5. Не стал ли текст настолько абстрактным, что его можно без изменений выдать любому бизнесу?

Если ответ на пункт 5 — «да», вернись к известным данным клиента и добавь содержательную привязку, НЕ добавляя нового факта.
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

  const fittedResult =
    fitPlanChunkToLimit(
      filtered.result,
      MAX_PLAN_CHUNK_CHARS
    );

  return {
    ...generated,

    result: fittedResult,

    audit: filtered.audit,

    repaired:
      filtered.repaired,

    secondAudit:
      filtered.secondAudit,

    length_limited:
      fittedResult.length <
      filtered.result.length,

    original_result_length:
      filtered.result.length
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

  if (generationInProgress) {
    return res
      .status(429)
      .json({
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
    const status =
      validationError === "Invalid bridge_key" ||
      validationError === "bridge_key is required"
        ? 401
        : 400;

    return res
      .status(status)
      .json({
        ok: false,
        error: validationError
      });
  }

  const safePreviousPlan =
    String(previous_plan || "")
      .slice(-18000);

  generationInProgress = true;

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

      start_day: startDay,

      end_day: endDay,

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
          result.audit?.violations?.length ||
          0,

        final_result_length:
          result.result.length,

        length_limit:
          MAX_PLAN_CHUNK_CHARS,

        length_limited:
          result.length_limited ||
          false,

        second_audit_passed:
          result.secondAudit?.passed ??
          null
      },

      reels_result:
        result.result
    });
  } catch (error) {
    return res
      .status(500)
      .json({
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
    generationInProgress =
      false;
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
        stage: "auth",
        token_received:
          !!token
      });
    } catch (error) {
      console.error(
        "AUTH ERROR:",
        error.message
      );

      res
        .status(500)
        .json({
          ok: false,
          stage: "auth",
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

      res
        .status(500)
        .json({
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

    if (generationInProgress) {
      return res
        .status(429)
        .json({
          ok: false,
          test: "plan-1-5",
          error:
            "Generation already in progress"
        });
    }

    generationInProgress =
      true;

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
            result.audit?.violations?.length ||
            0,

          violations:
            result.audit?.violations ||
            [],

          repair_error:
            result.repair_error ||
            null,

          second_audit_available:
            result.secondAudit?.available ??
            null,

          second_audit_passed:
            result.secondAudit?.passed ??
            null,

          second_audit_violations_count:
            result.secondAudit?.violations?.length ||
            0,

          second_audit_violations:
            result.secondAudit?.violations ||
            [],

          final_result_length:
            result.result.length,

          length_limit:
            MAX_PLAN_CHUNK_CHARS,

          length_limited:
            result.length_limited ||
            false,

          original_result_length:
            result.original_result_length ||
            result.result.length,

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
        },

        reels_result:
          result.result
      });
    } catch (error) {
      res
        .status(500)
        .json({
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
      generationInProgress =
        false;
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
        return res
          .status(401)
          .json({
            ok: false,
            error:
              "bridge_key is required"
          });
      }

      if (!BRIDGE_KEY) {
        return res
          .status(500)
          .json({
            ok: false,
            error:
              "BRIDGE_KEY is not configured"
          });
      }

      if (
        bridge_key !== BRIDGE_KEY
      ) {
        return res
          .status(401)
          .json({
            ok: false,
            error:
              "Invalid bridge_key"
          });
      }

      if (!content_type) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "content_type is required"
          });
      }

      if (!business_info) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "business_info is required"
          });
      }

      if (!target_audience) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "target_audience is required"
          });
      }

      if (!content_goal) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "content_goal is required"
          });
      }

      if (!content_style) {
        return res
          .status(400)
          .json({
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
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "Для контент-плана используй отдельные endpoints: /generate-plan-1-5, /generate-plan-6-10, /generate-plan-11-15, /generate-plan-16-20, /generate-plan-21-25, /generate-plan-26-30"
          });
      }

      if (!reels_topic) {
        return res
          .status(400)
          .json({
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
            filtered.audit?.violations?.length ||
            0,

          second_audit_passed:
            filtered.secondAudit?.passed ??
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

      return res
        .status(500)
        .json({
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
    res
      .status(404)
      .json({
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

    res
      .status(500)
      .json({
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
