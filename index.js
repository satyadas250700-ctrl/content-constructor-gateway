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

ДАННЫЕ КЛИЕНТА:

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


ИНСТРУКЦИЯ:

${getContentInstructions(contentType)}


ОБЩИЕ ТРЕБОВАНИЯ:

- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без фраз вроде «в современном мире».
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Учитывай бизнес, аудиторию, цель и стиль.
- Контент должен быть практически применим.


============================================================
КРИТИЧЕСКОЕ ПРАВИЛО ФАКТОВ
============================================================

Используй реальные факты только из данных клиента.

НЕ ПРИДУМЫВАЙ:
- клиентов;
- сотрудников;
- истории бизнеса;
- личный опыт;
- реальные кейсы;
- результаты клиентов;
- отзывы;
- цифры;
- цены;
- скидки;
- акции;
- даты;
- сроки;
- адреса;
- помещения;
- интерьер;
- оборудование;
- предметы;
- продукты;
- ингредиенты;
- характеристики;
- технологии;
- процессы;
- достижения;
- статистику;
- факты о рынке;
- факты о компании.

Если конкретный факт неизвестен — НЕ ЗАМЕНЯЙ его другим выдуманным фактом.

Вместо этого подними уровень абстракции и сформулируй мысль универсально.


============================================================
ТВОРЧЕСКАЯ ПОДАЧА РАЗРЕШЕНА
============================================================

Можно использовать:
- метафоры;
- сравнения;
- гиперболу;
- юмор;
- эмоциональные образы;
- игру слов;
- художественные формулировки;
- необычные концепции.

Например, выражение вроде «антидепрессант дня» допустимо как творческий образ и не является фактом.

Творческая формулировка НЕ должна превращаться в конкретное утверждение о реальном бизнесе.


============================================================
СЪЁМКА И ВИЗУАЛ
============================================================

Можно использовать универсальные приёмы:
- крупный план;
- общий план;
- смену кадров;
- монтаж;
- текст на экране;
- субтитры;
- графику;
- анимацию;
- голос за кадром;
- демонстрацию текста;
- визуальную метафору.

Но нельзя придумывать конкретные физические объекты, которых нет во входных данных.

Например:

Допустимо:
«На экране появляется крупная фраза».

Недопустимо:
«Эксперт берёт чашку кофе со стола»,
если чашка и стол не указаны клиентом.


============================================================
ЗАПРЕТ НА ШАБЛОННЫЕ ЗАГЛУШКИ
============================================================

НИКОГДА не используй незаполненные шаблоны.

Запрещены конструкции вроде:

[Услуга]
[Продукт]
[Услуга/Продукт]
[сфера]
[ресурс]
[название]
[имя]
[город]
[сумма]
[результат]
X
Х
N
XXX
???
<что-то>

Также нельзя писать:

«задача Х»
«тема N»
«результат X»
«вставьте название»
«подставьте значение»
«укажите услугу»

Если конкретная деталь неизвестна — просто сформулируй текст без неё.


============================================================
ЗАПРЕТ НА ВЫДУМАННЫЕ КЕЙСЫ
============================================================

Если клиент НЕ предоставил реальный кейс, нельзя писать:

«наш клиент»
«мы сделали»
«мы помогли клиенту»
«до/после»
«получили результат»
«реальный кейс»
«как мы решили задачу»
«история клиента»

Нельзя создавать видимость реального опыта.

Если нужен образовательный пример, он должен быть явно обозначен как гипотетический пример.


============================================================
ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ОТВЕТОМ
============================================================

Перед отправкой проверь:

1. Нет ли придуманных фактов?
2. Нет ли придуманных клиентов или кейсов?
3. Нет ли придуманных результатов?
4. Нет ли придуманных объектов?
5. Нет ли придуманных цен, скидок или цифр?
6. Нет ли квадратных скобок?
7. Нет ли X / Х / N / XXX / ??? как незаполненных значений?
8. Нет ли фраз «задача Х», «результат X» и подобных?
9. Не заменил ли ты неизвестный факт другим неизвестным фактом?
10. Сохранилась ли творческая и эмоциональная подача?

Если информации недостаточно — используй универсальную формулировку.

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


============================================================
ДАННЫЕ КЛИЕНТА
============================================================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}


${contextBlock}


============================================================
ЛОГИКА ПЛАНА
============================================================

Постепенно веди аудиторию по пути:

внимание → интерес → экспертность → доверие → желание → действие.


Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост


============================================================
СТРОГИЕ ПРАВИЛА ФАКТОВ
============================================================

Используй только факты, которые действительно есть во входных данных.

НЕ ПРИДУМЫВАЙ:

- клиентов;
- сотрудников;
- реальные кейсы;
- личную историю;
- опыт;
- отзывы;
- результаты;
- продажи;
- достижения;
- помещения;
- интерьер;
- оборудование;
- предметы;
- продукты;
- блюда;
- ингредиенты;
- технологии;
- процессы;
- цены;
- скидки;
- акции;
- даты;
- сроки;
- числа;
- адреса;
- ссылки;
- ресурсы;
- конкретные свойства товаров или услуг;
- медицинские;
- научные;
- технические;
- профессиональные факты.

Не делай логических выводов, которые не были сообщены клиентом.

Например:

Если клиент продаёт кофе и десерты,
нельзя автоматически писать:

«кофе и десерты идеально сочетаются»,
«люди приходят утром за кофе»,
«десерт увеличивает средний чек»,
«гости сидят за столиками».

Это неподтверждённые факты.


============================================================
ТВОРЧЕСКАЯ ПОДАЧА
============================================================

Разрешены:

- метафоры;
- сравнения;
- гипербола;
- юмор;
- эмоциональные образы;
- игра слов;
- художественные концепции.

Например:

«антидепрессант дня»

можно использовать как творческий образ.

Творческая формулировка разрешена, если она не создаёт конкретный неподтверждённый факт.


============================================================
УНИВЕРСАЛЬНЫЕ СЪЁМОЧНЫЕ ПРИЁМЫ
============================================================

Можно использовать:

- текст на экране;
- монтаж;
- крупный план;
- общий план;
- смену кадров;
- графику;
- субтитры;
- голос за кадром;
- визуальную метафору;
- работу с текстом.

Но нельзя придумывать конкретные физические объекты.

Если неизвестно, что именно находится у клиента, не придумывай предмет.

Используй абстрактную визуализацию.


============================================================
ЗАПРЕТ НА ШАБЛОНЫ
============================================================

Никогда не используй:

[Услуга]
[Продукт]
[Услуга/Продукт]
[сфера]
[ресурс]
[название]
[имя]
[город]
[результат]
X
Х
N
XXX
???
<что-то>

Также запрещены:

«задача Х»
«результат X»
«тема N»
«вставьте название»
«подставьте значение»
«укажите услугу»

Если конкретная деталь неизвестна — сформулируй мысль без неё.


============================================================
ЗАПРЕТ НА ВЫДУМАННЫЕ КЕЙСЫ
============================================================

Если во входных данных нет реального кейса, НЕ СОЗДАВАЙ:

- «наш клиент»;
- «мы сделали»;
- «мы помогли»;
- «до/после»;
- «реальный кейс»;
- «как мы решили задачу»;
- «получили результат»;
- «история клиента».

Не создавай видимость реального опыта.

Если нужен пример, он должен быть явно обозначен как гипотетический.


============================================================
ТРЕБОВАНИЯ К ДНЯМ
============================================================

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
11. Не добавляй вступление.
12. Не добавляй заключение.
13. Ответ только на русском языке.
14. Каждый день должен иметь подтверждённую смысловую опору.
15. Не используй выдуманные кейсы.
16. Не используй незаполненные шаблоны.
17. Если конкретного факта недостаточно — повышай уровень абстракции.


============================================================
ФОРМАТ
============================================================

День N — Формат

Тема: конкретная тема

Идея: что именно показать или раскрыть

Задача: какую реакцию или действие должна вызвать публикация

CTA: конкретный призыв к действию


Каждый пункт — короткий, но содержательный.

Не используй одинаковые CTA каждый день.


============================================================
КРИТИЧЕСКОЕ ПРАВИЛО ЗАВЕРШЕНИЯ
============================================================

ОБЯЗАТЕЛЬНО СОЗДАЙ КАЖДЫЙ ДЕНЬ ДО ДНЯ ${endDay} ВКЛЮЧИТЕЛЬНО.

Не останавливайся раньше.

Если приближаешься к лимиту токенов — сокращай формулировки, но НЕ пропускай последние дни.

День ${endDay} должен быть полностью завершён и содержать:

Тема:
Идея:
Задача:
CTA:

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
    console.error(`[${label}] Status:`, error.response?.status);
    console.error(
      `[${label}] Response:`,
      error.response?.data
    );
    console.error(`[${label}] Time:`, elapsed, "ms");

    throw error;
  }
}


// ============================================================
// TECHNICAL PLACEHOLDER DETECTOR
// ============================================================

function detectTemplatePlaceholders(text) {
  const content = String(text || "");

  const violations = [];

  const addViolation = (match, reason) => {
    if (!match) return;

    const normalized = String(match).trim();

    if (!normalized) return;

    const exists = violations.some(
      item => item.text === normalized
    );

    if (!exists) {
      violations.push({
        text: normalized,
        reason
      });
    }
  };


  // ----------------------------------------------------------
  // Квадратные скобки
  // ----------------------------------------------------------

  const squareBrackets =
    content.match(/\[[^\]\r\n]{1,120}\]/g) || [];

  for (const match of squareBrackets) {
    addViolation(
      match,
      "Незаполненная шаблонная конструкция в квадратных скобках."
    );
  }


  // ----------------------------------------------------------
  // Угловые скобки
  // ----------------------------------------------------------

  const angleBrackets =
    content.match(/<[^>\r\n]{1,120}>/g) || [];

  for (const match of angleBrackets) {
    addViolation(
      match,
      "Незаполненная шаблонная конструкция в угловых скобках."
    );
  }


  // ----------------------------------------------------------
  // Универсальные маркеры
  // ----------------------------------------------------------

  const universalMarkers =
    content.match(
      /(?:^|[\s(])(?:XXX|xxx|\?\?\?|N{1,3})(?=$|[\s),.!?:;])/g
    ) || [];

  for (const match of universalMarkers) {
    const clean = match.trim();

    addViolation(
      clean,
      "Незаполненный шаблонный маркер."
    );
  }


  // ----------------------------------------------------------
  // Фразы типа «задача X / задача Х»
  // ----------------------------------------------------------

  const taskMarkers =
    content.match(
      /\bзадач[ауы]\s+[XХ]\b/gi
    ) || [];

  for (const match of taskMarkers) {
    addViolation(
      match,
      "Фраза содержит незаполненный шаблон «задача X/Х»."
    );
  }


  // ----------------------------------------------------------
  // Результат X / результат Х
  // ----------------------------------------------------------

  const resultMarkers =
    content.match(
      /\bрезультат\s+[XХ]\b/gi
    ) || [];

  for (const match of resultMarkers) {
    addViolation(
      match,
      "Фраза содержит незаполненный шаблон «результат X/Х»."
    );
  }


  // ----------------------------------------------------------
  // Тема N
  // ----------------------------------------------------------

  const topicMarkers =
    content.match(
      /\bтема\s+N\b/gi
    ) || [];

  for (const match of topicMarkers) {
    addViolation(
      match,
      "Фраза содержит незаполненный шаблон «тема N»."
    );
  }


  // ----------------------------------------------------------
  // Типовые инструкции для заполнения шаблона
  // ----------------------------------------------------------

  const instructionMarkers =
    content.match(
      /\b(?:вставьте|подставьте|укажите)\s+(?:название|имя|услугу|продукт|значение|сферу|результат)\b/gi
    ) || [];

  for (const match of instructionMarkers) {
    addViolation(
      match,
      "Контент содержит инструкцию для последующего заполнения шаблона."
    );
  }


  return violations.slice(0, 20);
}


// ============================================================
// JSON HELPERS
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


// ============================================================
// AI FACT AUDITOR
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

Твоя задача — проверить готовый контент НЕ по списку запрещённых слов, а по исходным данным конкретного клиента.


============================================================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
============================================================

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


============================================================
ГОТОВЫЙ КОНТЕНТ
============================================================

${generatedContent}


============================================================
ЧТО ПРОВЕРЯТЬ
============================================================

Найди только реальные нарушения фактической опоры.

НАРУШЕНИЕ — это когда контент добавляет конкретный факт, которого нет во входных данных и который нельзя считать просто творческой формулировкой.


Проверяй особенно:

- конкретных людей;
- персонажей;
- сотрудников;
- клиентов;
- конкретные предметы;
- продукты;
- блюда;
- оборудование;
- интерьер;
- локации;
- конкретные действия;
- процессы;
- технологии;
- цены;
- скидки;
- акции;
- сроки;
- даты;
- числа;
- финансовые условия;
- конкретные свойства продукта или услуги;
- результаты;
- отзывы;
- продажи;
- достижения;
- историю бизнеса;
- личный опыт;
- реальные кейсы;
- утверждения о клиентах;
- утверждения о результатах клиентов;
- конкретные обстоятельства бизнеса.


============================================================
ВАЖНЫЕ ПРАВИЛА
============================================================

1. Не требуй буквального совпадения каждого слова.

Учитывай нормальные формы одного и того же понятия и смысловой эквивалент.


2. Если клиент написал «продаю кофе», слово «кофе» разрешено.


3. Если клиент написал «барбершоп», само упоминание стрижки может быть допустимо, если оно не создаёт новый конкретный факт о помещении, сотруднике, оборудовании или процессе.


4. Творческие метафоры, сравнения, гиперболы, эмоциональные образы, юмор и художественная подача НЕ являются нарушением сами по себе.


5. Фразы вроде:

«антидепрессант дня»
«разбудить интерес»
«попасть в боль»
«зацепить внимание»

допустимы как творческие формулировки.


6. Не считай нарушением универсальные элементы создания контента:

- текст на экране;
- монтаж;
- крупный план;
- общий план;
- смена кадров;
- графика;
- субтитры;
- голос за кадром;
- визуальная метафора.

Если они не утверждают наличие конкретного физического объекта у клиента.


7. Не считай нарушением сам CTA.


8. Не считай нарушением общую маркетинговую цель:

«показать экспертность»,
«вызвать доверие»,
«привлечь внимание»,
«помочь принять решение».

Это задачи контента, а не факты бизнеса.


9. Не считай нарушением гипотетическую ситуацию, если она явно обозначена как пример или возможный сценарий.


10. Особое внимание уделяй словам:

«мы»,
«наш клиент»,
«у нас»,
«мы сделали»,
«мы помогли»,
«получили результат»,
«реальный кейс»,
«до/после»,
«наш опыт».

Если они создают впечатление реального события, которого нет во входных данных, это нарушение.


11. Если информации недостаточно, это НЕ означает автоматически нарушение.

Проверяй только конкретные неподтверждённые факты.


12. Не придумывай нарушения.

Если сомневаешься и фраза может быть творческой интерпретацией — не помечай её.


13. Проверяй именно факты, а не качество, стиль или маркетинговую силу текста.


============================================================
ФОРМАТ ОТВЕТА
============================================================

Верни ТОЛЬКО JSON без Markdown и без пояснений.

Если всё хорошо:

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
      "reason": "почему этот конкретный факт не подтверждён входными данными"
    }
  ]
}

Не включай в violations метафоры, стилистические решения или допустимые универсальные приёмы съёмки.
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
      maxTokens: 650,
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
          reason: item.reason.trim()
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
  const violationBlock = violations
    .map(
      (item, index) =>
        `${index + 1}. Фрагмент: «${item.text}»\nПричина: ${item.reason}`
    )
    .join("\n\n");

  return `
Ты — редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Нужно аккуратно исправить готовый контент после двухуровневой проверки.


============================================================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
============================================================

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


============================================================
НАЙДЕННЫЕ НАРУШЕНИЯ
============================================================

${violationBlock}


============================================================
ГОТОВЫЙ КОНТЕНТ
============================================================

${generatedContent}


============================================================
ПРАВИЛА ИСПРАВЛЕНИЯ
============================================================

1. Удали или перепиши только неподтверждённые фактические детали.

2. Обязательно убери все технические шаблонные заглушки:

- [что-то]
- [Услуга]
- [Продукт]
- [сфера]
- [ресурс]
- X
- Х
- N
- XXX
- ???
- <что-то>

3. Не оставляй квадратные или угловые скобки как незаполненные шаблоны.

4. Не оставляй фразы:

«задача Х»
«результат X»
«тема N»
«вставьте название»
«подставьте значение»
«укажите услугу»

5. Не удаляй творческие метафоры, сравнения, юмор и эмоциональную подачу.

6. Не заменяй неподтверждённый объект другим неподтверждённым объектом.

7. Если конкретная деталь не подтверждена, подними уровень абстракции.

8. Опирайся на подтверждённую тему или бизнес.

9. Сохрани структуру.

10. Сохрани смысл.

11. Сохрани формат.

12. Сохрани стиль.

13. Сохрани маркетинговую задачу.

14. Не добавляй новых фактов во время исправления.

15. Не создавай выдуманные кейсы.

16. Не создавай выдуманных клиентов.

17. Не создавай выдуманных результатов.

18. Не объясняй изменения.

19. Верни только исправленный готовый контент.
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
    maxTokens: 1800,
    label: `${label} REPAIR`
  });
}


// ============================================================
// TWO-LEVEL POST FILTER
// ============================================================

function combineViolations(
  technicalViolations,
  aiViolations
) {
  const result = [];

  for (const item of technicalViolations || []) {
    result.push({
      ...item,
      source: "technical"
    });
  }

  for (const item of aiViolations || []) {
    const duplicate = result.some(
      existing =>
        existing.text.toLowerCase() ===
        item.text.toLowerCase()
    );

    if (!duplicate) {
      result.push({
        ...item,
        source: "ai"
      });
    }
  }

  return result.slice(0, 20);
}


function makeCombinedAudit({
  aiAudit,
  technicalViolations
}) {
  const combinedViolations =
    combineViolations(
      technicalViolations,
      aiAudit?.violations || []
    );

  return {
    available:
      Boolean(aiAudit?.available) ||
      technicalViolations.length > 0,

    passed:
      combinedViolations.length === 0 &&
      (aiAudit?.available !== false),

    violations: combinedViolations,

    ai_available:
      aiAudit?.available || false,

    technical_violations:
      technicalViolations
  };
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
    `[${label}] Starting TWO-LEVEL content audit...`
  );


  // ==========================================================
  // LEVEL 1 — TECHNICAL PLACEHOLDER CHECK
  // ==========================================================

  const technicalViolations =
    detectTemplatePlaceholders(
      generatedContent
    );

  console.log(
    `[${label}] Technical placeholder violations: ${technicalViolations.length}`
  );


  // ==========================================================
  // LEVEL 2 — AI FACT AUDIT
  // ==========================================================

  const aiAudit =
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


  const firstAudit =
    makeCombinedAudit({
      aiAudit,
      technicalViolations
    });


  // ==========================================================
  // EVERYTHING CLEAN
  // ==========================================================

  if (firstAudit.passed) {
    console.log(
      `[${label}] TWO-LEVEL AUDIT PASSED`
    );

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null,
      technicalViolations
    };
  }


  // ==========================================================
  // REPAIR
  // ==========================================================

  console.log(
    `[${label}] Violations detected. Starting ONE repair pass...`
  );

  console.log(
    `[${label}] Total violations: ${firstAudit.violations.length}`
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


    // ========================================================
    // SECOND TECHNICAL CHECK
    // ========================================================

    const secondTechnicalViolations =
      detectTemplatePlaceholders(
        repaired.result
      );


    // ========================================================
    // SECOND AI CHECK
    // ========================================================

    const secondAiAudit =
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


    const secondAudit =
      makeCombinedAudit({
        aiAudit: secondAiAudit,
        technicalViolations:
          secondTechnicalViolations
      });


    if (secondAudit.passed) {
      console.log(
        `[${label}] SECOND TWO-LEVEL AUDIT PASSED`
      );
    } else {
      console.warn(
        `[${label}] SECOND AUDIT STILL FOUND VIOLATIONS`
      );

      console.warn(
        `[${label}] Returning repaired version without another loop.`
      );
    }


    return {
      result: repaired.result,

      audit: firstAudit,

      repaired: true,

      secondAudit,

      technicalViolations,

      secondTechnicalViolations
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

      technicalViolations,

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
// GENERATE PLAN CHUNK
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

      // ВАЖНО:
      // 900 оставляем, потому что именно это
      // исправило обрезание 5-го дня.
      maxTokens: 900,

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

    technicalViolations:
      filtered.technicalViolations,

    secondTechnicalViolations:
      filtered.secondTechnicalViolations
  };
}


// ============================================================
// PLAN ENDPOINT HANDLER
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
          result.audit?.ai_available || false,

        triggered:
          !(result.audit?.passed ?? true),

        repaired:
          result.repaired || false,

        warnings:
          result.audit?.violations?.length || 0,

        technical_warnings:
          result.audit?.technical_violations?.length || 0,

        second_audit_passed:
          result.secondAudit?.passed ?? null,

        second_technical_warnings:
          result.secondAudit?.technical_violations?.length || 0
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
    generationInProgress = false;
  }
}


// ============================================================
// HEALTH
// ============================================================

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
      generationInProgress
  });
});


// ============================================================
// ROOT
// ============================================================

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


// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {
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
});


// ============================================================
// TEST GENERATE
// ============================================================

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
});


// ============================================================
// TEST PLAN 1-5
// ============================================================

app.get("/test-plan-1-5", async (req, res) => {
  const startedAt =
    Date.now();


  if (generationInProgress) {
    return res.status(429).json({
      ok: false,

      test:
        "plan-1-5",

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
          result.audit?.ai_available || false,

        triggered:
          !(result.audit?.passed ?? true),

        repaired:
          result.repaired || false,

        warnings:
          result.audit?.violations?.length || 0,

        technical_warnings:
          result.audit?.technical_violations?.length || 0,

        second_audit_passed:
          result.secondAudit?.passed ?? null,

        second_technical_warnings:
          result.secondAudit?.technical_violations?.length || 0
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
    generationInProgress = false;
  }
});


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

app.post("/generate", async (req, res) => {
  const startedAt =
    Date.now();

  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");


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
        Date.now() - startedAt,

      result_length:
        filtered.result.length,

      post_filter: {
        auditor_available:
          filtered.audit?.ai_available || false,

        triggered:
          !(filtered.audit?.passed ?? true),

        repaired:
          filtered.repaired,

        warnings:
          filtered.audit?.violations?.length || 0,

        technical_warnings:
          filtered.audit?.technical_violations?.length || 0,

        second_audit_passed:
          filtered.secondAudit?.passed ?? null,

        second_technical_warnings:
          filtered.secondAudit?.technical_violations?.length || 0
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
});


// ============================================================
// 404
// ============================================================

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
  console.log("====================================");
  console.log("МОЙ КОНТЕНТ-КОНСТРУКТОР");
  console.log("Gateway started");
  console.log("====================================");

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
    "TWO-LEVEL FILTER:",
    "ENABLED"
  );

  console.log(
    "PLAN MAX TOKENS:",
    900
  );

  console.log("PLAN ENDPOINTS:");

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

  console.log("====================================");
});
