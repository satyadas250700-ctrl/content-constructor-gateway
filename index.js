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

  const expiresIn = Number(response.data.expires_in) || 1800;

  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;

  return accessToken;
}


// ============================================================
// HELPERS
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


// ============================================================
// NORMAL CONTENT PROMPT
// ============================================================

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
- Не выдумывай реальные факты о бизнесе.
- Не придумывай истории, кейсы, отзывы, цены, скидки, результаты или процессы работы.
- Если конкретной информации нет, используй содержательную абстракцию или условный сценарий.
- Метафоры, юмор, сравнения и гиперболы разрешены, если они не выдаются за реальные факты.

Выдай только готовый контент.
`;
}


// ============================================================
// CONTENT PLAN PROMPT
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
4. Не используй безликие универсальные идеи.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Ответ только на русском языке.
13. Не выдумывай реальные факты о бизнесе.
14. Не придумывай цены, скидки, цифры, кейсы, отзывы, истории, клиентов, результаты, оборудование, помещения, технологии или процессы работы.
15. Если конкретная деталь неизвестна, используй условную формулировку или более высокий уровень абстракции.
16. Метафоры, юмор, сравнения и эмоциональные образы разрешены.
17. Не превращай каждый день в одинаковую конструкцию.

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

Не обещай аудитории материал, чек-лист, консультацию, подарок, расчёт или другой ресурс, если его наличие не указано во входных данных.

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

    console.log(`[${label}] HTTP status: ${response.status}`);
    console.log(`[${label}] Result length: ${result.length}`);
    console.log(`[${label}] Time: ${elapsed} ms`);

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
    console.error(`[${label}] Message:`, error.message);
    console.error(
      `[${label}] Status:`,
      error.response?.status
    );
    console.error(
      `[${label}] Response:`,
      error.response?.data
    );
    console.error(`[${label}] Time:`, elapsed, "ms");

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
    return JSON.parse(cleanJsonText(text));
  } catch (error) {
    console.error(
      "[AI AUDITOR] JSON parse error:",
      error.message
    );

    return null;
  }
}


// ============================================================
// V3 AUDITOR PROMPT
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
Ты — строгий AI-редактор и фактчекер сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент на ДВУХ уровнях одновременно.

====================
УРОВЕНЬ A — ФАКТОЛОГИЯ
====================

Нельзя выдавать выдуманные сведения о конкретном бизнесе.

Главное правило:

ЕСЛИ КОНКРЕТНОЕ УТВЕРЖДЕНИЕ НЕ ИМЕЕТ ПРЯМОЙ ИЛИ ОЧЕВИДНОЙ СМЫСЛОВОЙ ОПОРЫ В ДАННЫХ КЛИЕНТА — ОНО НЕ ДОЛЖНО ВЫДАВАТЬСЯ ЗА ФАКТ.

====================
УРОВЕНЬ B — ПОЛЕЗНАЯ КОНКРЕТИКА
====================

После исправления контент не должен превращаться в безликий набор фраз:

«про продукт»,
«про услугу»,
«про аудиторию»,
«покажите ценность»,
«вызовите доверие».

Если конкретный факт нельзя подтвердить, его можно заменить на:

- конкретный вопрос;
- маркетинговый ракурс;
- условный сценарий;
- наблюдение общего характера;
- сравнение;
- метафору;
- практический способ раскрыть подтверждённую тему;
- содержательную рекомендацию.

То есть:

НЕ ПРИДУМЫВАЙ ФАКТ.

НО И НЕ УБИВАЙ СМЫСЛ.

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
ЧТО МОЖНО СЧИТАТЬ ПОДТВЕРЖДЁННЫМ
====================

Разрешено:

1. Факты, прямо сообщённые клиентом.

2. Корректные смысловые перефразирования этих фактов.

3. Очевидные логические связи, которые НЕ добавляют новый конкретный факт.

4. Маркетинговые задачи:
- привлечь внимание;
- вызвать интерес;
- показать экспертность;
- вызвать доверие;
- побудить к действию.

5. Метафоры.

6. Сравнения.

7. Юмор.

8. Гиперболы.

9. Эмоциональные образы.

10. Условные рекомендации:
- «можно показать...»;
- «представьте...»;
- «если у вас есть...»;
- «например...»;
- «попробуйте снять...».

11. Универсальные съёмочные и монтажные приёмы:
- текст на экране;
- субтитры;
- графика;
- монтаж;
- голос за кадром;
- крупный план;
- смена кадров;
- анимация текста.

Но съёмочный приём НЕ должен утверждать, что конкретный объект уже существует у клиента.

====================
ЧТО ОБЯЗАТЕЛЬНО ПРОВЕРЯТЬ
====================

Особенно строго проверяй:

- цены;
- стоимость;
- скидки;
- акции;
- проценты;
- количество;
- сроки;
- даты;
- возраст;
- длительность;
- результаты;
- гарантии;
- кейсы;
- отзывы;
- клиентов;
- подписчиков;
- продажи;
- достижения;
- историю бизнеса;
- личный опыт;
- прошлые события;
- ошибки бизнеса;
- провалы;
- конкретные продукты;
- конкретные свойства продукта;
- конкретные услуги;
- конкретные этапы работы;
- конкретные процессы;
- оборудование;
- помещения;
- интерьер;
- сотрудников;
- локации;
- технологии;
- методы;
- материалы;
- ингредиенты;
- упаковку;
- конкретные действия бизнеса;
- конкретные обещания.

====================
ОСОБОЕ ПРАВИЛО ПЕРВОГО ЛИЦА
====================

Особенно внимательно проверяй:

«я»,
«мы»,
«у нас»,
«мой»,
«наш»,
«наша».

Если после них появляется конкретный факт, которого нет во входных данных, это нарушение.

Например:

«Мы уже помогли 100 клиентам» — нарушение, если числа нет.

«Мы используем такой подход» — нарушение, если подход не указан.

«Я столкнулся с этой проблемой» — нарушение, если такая история не дана.

====================
ЧИСЛА
====================

Любое конкретное число считается фактом, если оно не относится к технической нумерации:

- День 1;
- День 2;
- Слайд 1;
- Слайд 2.

Например:

«15 секунд»,
«5 ошибок»,
«90% клиентов»,
«3 этапа»,
«10 лет опыта»

нельзя считать подтверждёнными без соответствующей информации во входных данных.

====================
CTA
====================

Обычный CTA разрешён:

- написать комментарий;
- сохранить;
- поделиться;
- поставить реакцию;
- ответить на вопрос;
- выбрать вариант;
- рассказать о своём опыте.

Но нельзя обещать неподтверждённый ресурс:

- «пришлю чек-лист»;
- «отправлю гайд»;
- «дам консультацию»;
- «сделаю расчёт»;
- «пришлю кейс»;
- «дам скидку»;
- «отправлю подарок».

Если такого ресурса нет во входных данных — это нарушение.

====================
СЦЕНАРНЫЕ ИДЕИ
====================

Важно различать:

1. СУЩЕСТВУЮЩИЙ ФАКТ.

«Эксперт показывает свой кабинет».

Если наличие кабинета не подтверждено — нарушение.

2. УСЛОВНУЮ РЕКОМЕНДАЦИЮ.

«Если у вас есть рабочее пространство, можно начать ролик с его общего плана».

Это допустимо.

3. ХУДОЖЕСТВЕННЫЙ ПРИЁМ.

«Представьте ситуацию, в которой клиент откладывает решение».

Это допустимо, если понятно, что это пример/сценарий, а не реальный клиент.

====================
ВАЖНЫЙ БАЛАНС
====================

НЕ считай нарушением сам факт того, что формулировка является общей.

Например:

«Разберите три распространённых заблуждения аудитории о выборе решения».

Это может быть нормальной контентной идеей.

Но:

«Ваши клиенты уже три года считают, что...» —

это конкретное утверждение о клиентах и требует подтверждения.

====================
ПЛЕЙСХОЛДЕРЫ
====================

Любой незаполненный плейсхолдер:

[сфера/продукт]
[результат]
[адрес]
[цена]
[название]

является нарушением.

Но НЕ нужно заменять его другим выдуманным значением.

====================
КАК РЕШАТЬ СПОРНЫЕ СЛУЧАИ
====================

Если фраза может быть прочитана одновременно как:

1. реальный факт;

или

2. условная творческая рекомендация,

проверь контекст.

Если она звучит как утверждение о конкретном бизнесе — проверяй как факт.

Если явно обозначена как условный пример, рекомендация, метафора или художественный сценарий — не считай её нарушением.

====================
НЕ ОЦЕНИВАЙ
====================

Не проверяй:

- насколько идея хорошая;
- насколько текст продающий;
- насколько красив стиль;
- насколько сильный хук;
- насколько интересна тема.

Проверяй только:

1. фактологическую опору;
2. наличие неподтверждённых конкретных деталей;
3. наличие незаполненных плейсхолдеров;
4. наличие неподтверждённых обещаний;
5. потерю связи с данными клиента.

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON.

Если всё допустимо:

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
      "reason": "почему это неподтверждённый факт",
      "support": "какого подтверждения не хватает",
      "repair_type": "delete | abstract | conditional | replace_cta | anchor_to_known_fact"
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:

Если violations содержит хотя бы один элемент,
passed ДОЛЖЕН быть false.

Не возвращай passed=true при наличии violations.

Максимум 15 нарушений.
`;
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
      maxTokens: 550,
      label: `${label} AI AUDITOR`
    });

    const parsed = parseAuditorJson(audit.result);

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

    const violations = parsed.violations
      .filter(
        item =>
          item &&
          typeof item.text === "string" &&
          typeof item.reason === "string"
      )
      .slice(0, 15)
      .map(item => ({
        text: item.text.trim(),
        reason: item.reason.trim(),
        support:
          typeof item.support === "string"
            ? item.support.trim()
            : "",
        repair_type:
          typeof item.repair_type === "string"
            ? item.repair_type.trim()
            : "abstract"
      }))
      .filter(item => item.text && item.reason);

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


// ============================================================
// REPAIR PROMPT V3
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
  const violationBlock = violations
    .map(
      (item, index) =>
        `${index + 1}. Фрагмент: «${item.text}»\n` +
        `Причина: ${item.reason}\n` +
        `Опора: ${item.support || "не указана"}\n` +
        `Тип исправления: ${item.repair_type || "abstract"}`
    )
    .join("\n\n");

  return `
Ты — финальный AI-редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — исправить готовый контент после фактологического аудита.

ГЛАВНАЯ ЦЕЛЬ:

НЕ ПРОСТО УДАЛИТЬ НАРУШЕНИЯ.

Нужно одновременно:

1. Убрать неподтверждённые факты.
2. Сохранить исходную маркетинговую мысль.
3. Сохранить конкретность.
4. Сохранить полезность.
5. Сохранить стиль.
6. Не добавить новых фактов.

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
ПРАВИЛА ИСПРАВЛЕНИЯ
====================

1. Исправь каждое найденное нарушение.

2. НЕ ДОБАВЛЯЙ НИКАКИХ НОВЫХ РЕАЛЬНЫХ ФАКТОВ.

3. Никогда не заменяй неизвестную информацию выдуманной информацией.

4. Если конкретный факт не подтверждён, сначала попробуй сохранить мысль через более безопасную формулировку.

5. Если возможно — привяжи мысль к уже подтверждённым данным клиента.

6. Если это невозможно — переведи конкретику в условную рекомендацию.

7. Если невозможно и это — подними уровень абстракции.

8. Удаляй деталь только в том случае, если сохранить её смысл без выдумывания невозможно.

====================
ПРИОРИТЕТЫ ЗАМЕНЫ
====================

Используй следующий порядок:

ПРИОРИТЕТ 1:
Привязать к подтверждённому факту клиента.

ПРИОРИТЕТ 2:
Сохранить мысль как конкретный вопрос аудитории.

ПРИОРИТЕТ 3:
Сделать условный сценарий.

ПРИОРИТЕТ 4:
Сделать содержательную абстракцию.

ПРИОРИТЕТ 5:
Удалить фрагмент.

====================
ПРИМЕРЫ
====================

Плохо:

«Напишите “МИФ”, и я отправлю вам чек-лист».

Если чек-лист не подтверждён.

Лучше:

«Напишите в комментариях, какой из этих мифов вы встречаете чаще всего».

---

Плохо:

«Эксперт открывает комментарии под прошлым постом».

Лучше:

«Если под публикациями уже есть вопросы аудитории, можно выбрать один из них для короткого разбора».

---

Плохо:

«За 15 секунд покажите три этапа работы».

Если 15 секунд и три этапа не подтверждены.

Лучше:

«Сделайте короткое динамичное видео, в котором последовательно раскрывается логика работы».

---

Плохо:

«Мы помогли десяткам клиентов».

Лучше:

«Покажите, какую задачу помогает решать ваш продукт или услуга».

---

Плохо:

«Если отметили 5 пунктов...»

Если пять пунктов не обоснованы.

Лучше:

«Если вы узнали себя в нескольких пунктах, предложите аудитории поделиться своим опытом».

====================
ПРАВИЛА CTA
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
- скидку;
- расчёт;
- кейс;
- личный разбор;

если соответствующий ресурс не подтверждён.

====================
МЕТАФОРЫ И ТВОРЧЕСТВО
====================

НЕ УДАЛЯЙ:

- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- яркие формулировки.

Например:

«антидепрессант дня»

может остаться, если это очевидная образная формулировка, а не медицинское утверждение.

====================
СЪЁМКА
====================

Можно использовать:

- текст на экране;
- субтитры;
- графику;
- монтаж;
- голос за кадром;
- крупные планы;
- переходы;
- условные сцены.

Но нельзя утверждать наличие у клиента:

- кабинета;
- офиса;
- команды;
- оборудования;
- продукта в конкретной упаковке;
- конкретного помещения;
- отзывов;
- комментариев;
- клиентов;
- кейсов.

Если хочется использовать объект, которого нет во входных данных:

«Если у вас есть такой объект, можно снять...»

или:

«Представьте такой кадр...»

====================
ЧИСЛА
====================

Если число не подтверждено:

НЕ заменяй его другим числом.

Например:

«5 ошибок»

не превращай в:

«3 ошибки».

Лучше:

«несколько распространённых ошибок»

или

«ключевые ошибки».

====================
ЛИЧНЫЕ ИСТОРИИ
====================

Если история не дана клиентом:

НЕ СОЗДАВАЙ новую историю.

Вместо:

«Когда я только начинал...»

используй:

«Разберите распространённую ситуацию...»

или:

«Покажите, с какой проблемой может столкнуться человек...»

====================
ПРОЦЕССЫ
====================

Если клиент не сообщил этапы работы:

НЕ ПРИДУМЫВАЙ:

- консультации;
- созвоны;
- анализ;
- правки;
- согласования;
- оборудование;
- технологии;
- внутренние процессы.

Лучше говорить о задаче, результате, выборе или проблеме на уровне, который подтверждается данными.

====================
ПЛЕЙСХОЛДЕРЫ
====================

Никогда не оставляй:

[сфера/продукт]
[результат]
[адрес]
[цена]
[название]

Если значение неизвестно — перепиши фразу без плейсхолдера.

====================
САМОПРОВЕРКА
====================

Перед выдачей результата проверь:

- Не появился ли новый факт?
- Не появилось ли новое число?
- Не появилась ли новая история?
- Не появился ли новый клиент или кейс?
- Не появился ли новый процесс?
- Не появился ли новый объект?
- Не появился ли новый ресурс для CTA?
- Не появился ли плейсхолдер?
- Не потерялась ли связь с бизнесом?
- Не стал ли текст слишком общим?
- Сохранилась ли исходная маркетинговая мысль?
- Сохранился ли стиль?

Если можно сохранить конкретность без выдумывания — ОБЯЗАТЕЛЬНО сохраняй её.

Верни только исправленный готовый контент.

Не объясняй свои исправления.
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


// ============================================================
// POST FILTER V3
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
    `[${label}] Violations detected. Starting one V3 repair pass...`
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
        violations: firstAudit.violations,
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
        generatedContent: repaired.result,
        label: `${label} SECOND`
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
// VALIDATION
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
  const token = await getAccessToken();

  const prompt = buildPlanChunkPrompt({
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
      generatedContent: generated.result,
      label
    });

  return {
    ...generated,
    result: filtered.result,
    audit: filtered.audit,
    repaired: filtered.repaired,
    secondAudit: filtered.secondAudit,
    repair_error: filtered.repair_error || null
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
  const startedAt = Date.now();

  console.log("");
  console.log("====================================");
  console.log(
    `PLAN CHUNK REQUEST: ${startDay}-${endDay}`
  );
  console.log("====================================");

  if (generationInProgress) {
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
    String(previous_plan || "").slice(-18000);

  generationInProgress = true;

  try {
    const result =
      await generatePlanChunk({
        startDay,
        endDay,
        businessInfo: business_info,
        targetAudience: target_audience,
        contentGoal: content_goal,
        contentStyle: content_style,
        previousPlan: safePreviousPlan,
        label:
          `PLAN DAYS ${startDay}-${endDay}`
      });

    return res.json({
      ok: true,
      start_day: startDay,
      end_day: endDay,
      model: GIGACHAT_MODEL,
      status: result.status,
      time_ms: Date.now() - startedAt,
      result_length: result.result.length,

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

        first_audit_raw:
          result.audit?.raw || null,

        second_audit_raw:
          result.secondAudit?.raw || null,

        first_audit_error:
          result.audit?.error || null,

        second_audit_error:
          result.secondAudit?.error || null
      },

      reels_result: result.result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      start_day: startDay,
      end_day: endDay,
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: Date.now() - startedAt
    });
  } finally {
    generationInProgress = false;
  }
}


// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    model: GIGACHAT_MODEL,
    gigachat_key_configured: !!GIGACHAT_KEY,
    bridge_key_configured: !!BRIDGE_KEY,
    generation_in_progress:
      generationInProgress
  });
});


// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    message:
      "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",

    endpoints: {
      health: "/health",
      test_auth: "/test-auth",
      test_generate: "/test-generate",
      test_plan_1_5: "/test-plan-1-5",

      generate: "POST /generate",

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


// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {
  try {
    const token =
      await getAccessToken();

    res.json({
      ok: true,
      stage: "auth",
      token_received: !!token
    });
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error.message
    );

    res.status(500).json({
      ok: false,
      stage: "auth",
      error: error.message
    });
  }
});


// ============================================================
// TEST GENERATE
// ============================================================

app.get("/test-generate", async (req, res) => {
  const startedAt = Date.now();

  try {
    const token =
      await getAccessToken();

    const response =
      await axios.post(
        CHAT_URL,
        {
          model: GIGACHAT_MODEL,

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
      response.data?.choices?.[0]?.message?.content ||
      "";

    res.json({
      ok: true,
      stage: "generation",
      status: response.status,
      time_ms:
        Date.now() - startedAt,
      response: response.data,
      reels_result: result
    });
  } catch (error) {
    console.error(
      "TEST GENERATE ERROR:",
      error.message
    );

    res.status(500).json({
      ok: false,
      stage: "generation",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  }
});


// ============================================================
// TEST PLAN 1-5
// ============================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    const startedAt = Date.now();

    if (generationInProgress) {
      return res.status(429).json({
        ok: false,
        test: "plan-1-5",
        error:
          "Generation already in progress"
      });
    }

    generationInProgress = true;

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
        test: "plan-1-5",
        status: result.status,
        time_ms:
          Date.now() - startedAt,
        result_length:
          result.result.length,
        model: GIGACHAT_MODEL,

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
        test: "plan-1-5",
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
        time_ms:
          Date.now() - startedAt
      });
    } finally {
      generationInProgress = false;
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
    const startedAt = Date.now();

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
        Object.keys(req.body || {})
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

      if (bridge_key !== BRIDGE_KEY) {
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

      if (isContentPlan(content_type)) {
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
          Date.now() - startedAt,

        result_length:
          filtered.result.length,

        post_filter: {
          auditor_available:
            filtered.audit?.available ||
            false,

          first_audit_passed:
            filtered.audit?.passed ??
            null,

          triggered:
            !(filtered.audit?.passed ??
              true),

          repaired:
            filtered.repaired,

          violations_count:
            filtered.audit?.violations?.length ||
            0,

          violations:
            filtered.audit?.violations ||
            [],

          repair_error:
            filtered.repair_error ||
            null,

          second_audit_available:
            filtered.secondAudit?.available ??
            null,

          second_audit_passed:
            filtered.secondAudit?.passed ??
            null,

          second_audit_violations_count:
            filtered.secondAudit?.violations?.length ||
            0,

          second_audit_violations:
            filtered.secondAudit?.violations ||
            []
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
    }
  }
);


// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error:
      "Endpoint not found",
    path: req.path,
    method: req.method
  });
});


// ============================================================
// GLOBAL ERROR
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
// START SERVER
// ============================================================

app.listen(PORT, () => {
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
});
