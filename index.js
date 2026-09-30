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

==================================================
ДАННЫЕ КЛИЕНТА
==================================================

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

==================================================
ИНСТРУКЦИЯ ПО ФОРМАТУ
==================================================

${getContentInstructions(contentType)}

==================================================
ОБЩИЕ ТРЕБОВАНИЯ
==================================================

1. Только русский язык.

2. Естественный человеческий язык.

3. Без канцелярита.

4. Не используй шаблонные фразы вроде:
«В современном мире»
«Важно понимать»
«Стоит отметить»
«Давайте разберёмся»
«Сегодня я расскажу вам».

5. Не говори, что ты искусственный интеллект.

6. Не объясняй процесс создания.

7. Учитывай бизнес, аудиторию, цель и стиль.

8. Контент должен быть практически применим.

9. Не придумывай реальные факты о бизнесе.

10. Не придумывай:
- цены;
- скидки;
- акции;
- отзывы;
- достижения;
- конкретные результаты;
- сотрудников;
- клиентов;
- помещения;
- оборудование;
- продукты;
- ингредиенты;
- технологии;
- процессы;
- даты;
- сроки;
- адреса;
- номера;
- статистику;
если этого нет во входных данных.

11. При этом разрешены:
- метафоры;
- сравнения;
- юмор;
- гипербола;
- эмоциональные формулировки;
- художественная подача;
- образные выражения.

12. Творческая формулировка не должна превращаться в новый конкретный факт.

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

==================================================
ДАННЫЕ КЛИЕНТА
==================================================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

${contextBlock}

==================================================
ЛОГИКА ПЛАНА
==================================================

Постепенно веди аудиторию по пути:

внимание → интерес → экспертность → доверие → желание → действие.

Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост

==================================================
КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ФАКТОВ
==================================================

1. Каждый день должен опираться на реальные данные клиента.

2. Не добавляй конкретные факты, которых нет во входных данных.

3. Не придумывай:
- людей;
- сотрудников;
- клиентов;
- предметы;
- продукты;
- блюда;
- оборудование;
- интерьер;
- мебель;
- помещения;
- локации;
- упаковку;
- технологии;
- процессы;
- ингредиенты;
- свойства товаров;
- цены;
- скидки;
- акции;
- сроки;
- даты;
- числа;
- результаты;
- отзывы;
- достижения;
- историю бизнеса.

4. Не делай логических предположений фактом.

Например:

Если клиент написал:
«Продаю кофе и десерты»

нельзя автоматически писать:

«Клиенты приходят за атмосферой».

Нельзя писать:

«Кофе отлично сочетается с десертом».

Нельзя писать:

«Люди утром берут кофе по дороге на работу».

Нельзя писать:

«Десерт увеличивает средний чек».

Потому что этих фактов клиент не сообщал.

5. Разрешены творческие метафоры.

Например:
«Этот пост — антидепрессант понедельника».

Это творческая формулировка, а не утверждение о реальном медицинском эффекте.

6. Разрешены художественные сравнения, юмор и гипербола.

7. Если для конкретного сценария не хватает реального объекта, НЕ придумывай новый объект.

Вместо этого используй:
- текст на экране;
- типографику;
- монтаж;
- абстрактную графику;
- голос за кадром;
- крупный план уже подтверждённого объекта;
- универсальную визуальную подачу.

8. Фраза «можно снять» НЕ разрешает придумывать физические объекты.

9. Если не хватает информации — повышай уровень абстракции.

Не заменяй отсутствующий факт другим выдуманным фактом.

==================================================
ТРЕБОВАНИЯ К ПЛАНУ
==================================================

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

==================================================
ФОРМАТ
==================================================

День N — Формат

Тема:
конкретная тема публикации.

Идея:
что именно показать или раскрыть.

Задача:
какую реакцию или действие должна вызвать публикация.

CTA:
конкретный призыв к действию.

Каждый пункт — короткий, но содержательный.

Не используй одинаковые CTA каждый день.

==================================================
ФИНАЛЬНАЯ ПРОВЕРКА
==================================================

Перед ответом проверь каждый день:

- Есть ли у него опора на данные клиента?
- Не появился ли новый конкретный объект?
- Не появился ли новый человек?
- Не появилась ли новая услуга или продукт?
- Не появились ли новые свойства товара?
- Не появились ли цены или скидки?
- Не появились ли придуманные действия сотрудников?
- Не появились ли придуманные помещения или локации?
- Не появились ли придуманные процессы?
- Не превратилась ли метафора в конкретное утверждение?

Если информации недостаточно — используй более абстрактную творческую подачу.

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


// ============================================================
// AI CONTENT FACT AUDITOR V2
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

==================================================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
==================================================

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

==================================================
ГОТОВЫЙ КОНТЕНТ
==================================================

${generatedContent}

==================================================
ЧТО ПРОВЕРЯТЬ
==================================================

Найди только реальные нарушения фактической опоры.

НАРУШЕНИЕ — это когда контент добавляет конкретный факт, которого нет во входных данных и который нельзя считать просто творческой формулировкой.

Проверяй особенно:

- конкретных людей, персонажей и сотрудников;
- конкретные предметы, продукты, блюда, оборудование, интерьер и локации;
- конкретные действия, процессы и технологии;
- цены, скидки, акции, сроки, даты, числа и финансовые условия;
- конкретные свойства продукта или услуги;
- утверждения о результатах, отзывах, клиентах, продажах и достижениях;
- конкретные обстоятельства бизнеса, которых клиент не сообщал.

==================================================
ВАЖНЫЕ ПРАВИЛА
==================================================

1. Не требуй буквального совпадения каждого слова.

Учитывай:
- разные формы слова;
- склонения;
- однокоренные формы;
- очевидные смысловые эквиваленты.

2. Если клиент написал «продаю кофе», слово «кофе» разрешено.

3. Если клиент написал конкретный продукт, этот продукт разрешён.

4. Если клиент написал конкретную услугу, эта услуга разрешена.

5. Если клиент сообщил конкретного сотрудника или человека, его можно использовать.

6. Если клиент сообщил конкретную локацию, её можно использовать.

7. Если клиент сообщил цену, скидку, срок или число, это можно использовать.

8. НЕ считай нарушением обычные творческие конструкции.

Например:

«Этот пост — антидепрессант понедельника».

Это метафора.

Её НЕ нужно считать медицинским утверждением.

9. НЕ считай нарушением:
- эмоциональные формулировки;
- метафоры;
- сравнения;
- гиперболу;
- юмор;
- образный язык;
- художественные названия;
- абстрактные визуальные приёмы.

10. НЕ считай нарушением универсальные способы съёмки или монтажа, если они сами по себе не утверждают существование конкретного объекта.

Например:
- крупный план;
- общий план;
- монтаж;
- текст на экране;
- графика;
- титры;
- голос за кадром;
- смена кадров.

11. Но если внутри такого сценария появляется конкретный неподтверждённый объект, человек или действие — это нарушение.

Например:

«Покажи бариста».

Если бариста не указан клиентом — нарушение.

«Покажи круассан».

Если круассан не указан клиентом — нарушение.

«Покажи клавиатуру».

Если клавиатура не указана клиентом — нарушение.

12. Не делай логических выводов за клиента.

Если клиент продаёт кофе, нельзя автоматически считать подтверждёнными:
- кофейню;
- бариста;
- кофемашину;
- столики;
- посетителей;
- утро;
- интерьер;
- атмосферу;
- аромат;
- вкус;
- свежесть;
- способ приготовления.

13. Не считай само слово «контент», «пост», «Reels», «карусель», «CTA», «текст», «экран», «кадр» нарушением.

14. Не считай творческую интерпретацию бизнеса новым фактом, если она не утверждает конкретное событие, объект, свойство или результат.

==================================================
КЛАССИФИКАЦИЯ
==================================================

Для каждого нарушения укажи:

"text":
точный фрагмент из результата.

"reason":
краткое объяснение, почему это новый неподтверждённый факт.

Не перечисляй всё подряд.

Добавляй только реальные нарушения.

Если нарушений нет:

{
  "passed": true,
  "violations": []
}

Если нарушения есть:

{
  "passed": false,
  "violations": [
    {
      "text": "круассан",
      "reason": "конкретный продукт не указан во входных данных"
    }
  ]
}

==================================================
КРИТИЧЕСКОЕ ПРАВИЛО
==================================================

Лучше пропустить творческую метафору, чем ошибочно назвать её выдуманным фактом.

Но нельзя пропускать конкретные неподтверждённые:
- продукты;
- услуги;
- людей;
- объекты;
- процессы;
- цены;
- скидки;
- сроки;
- результаты;
- свойства.

Отвечай ТОЛЬКО валидным JSON.

Не используй Markdown.
Не используй пояснения вне JSON.
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

    const response =
      await axios.post(
        CHAT_URL,
        {
          model: GIGACHAT_MODEL,

          messages: [
            {
              role: "system",
              content:
                "Ты строгий фактчекер. Возвращай только валидный JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.1,
          max_tokens: 900
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

    const raw =
      response.data?.choices?.[0]?.message?.content ||
      "";

    const parsed =
      parseAuditorJson(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      console.error(
        `[AI AUDITOR] ${label}: invalid response`
      );

      return {
        available: false,
        passed: true,
        violations: [],
        raw
      };
    }

    const violations =
      Array.isArray(parsed.violations)
        ? parsed.violations
        : [];

    const passed =
      parsed.passed === true ||
      violations.length === 0;

    console.log(
      `[AI AUDITOR] ${label}: passed=${passed}, violations=${violations.length}`
    );

    if (violations.length) {
      console.log(
        "[AI AUDITOR] Violations:",
        JSON.stringify(
          violations,
          null,
          2
        )
      );
    }

    return {
      available: true,
      passed,
      violations,
      raw
    };

  } catch (error) {

    console.error(
      `[AI AUDITOR] ${label} ERROR:`,
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
  return `
Ты — профессиональный редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Нужно исправить готовый контент после фактчека.

==================================================
ДАННЫЕ КЛИЕНТА
==================================================

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

==================================================
ИСХОДНЫЙ КОНТЕНТ
==================================================

${generatedContent}

==================================================
НАЙДЕННЫЕ НАРУШЕНИЯ
==================================================

${JSON.stringify(
  violations,
  null,
  2
)}

==================================================
ЗАДАЧА
==================================================

Исправь ТОЛЬКО проблемные места.

Не переписывай материал без необходимости.

Сохрани:
- исходную идею;
- структуру;
- стиль;
- эмоциональность;
- метафоры;
- юмор;
- сильные формулировки;
- полезность.

Но убери или замени конкретные факты, которых нет во входных данных.

==================================================
ПРАВИЛА
==================================================

1. Не добавляй новые конкретные факты.

2. Не заменяй один неподтверждённый объект другим неподтверждённым объектом.

Например:

Нельзя заменить:
«круассан»

на:
«торт».

Если ни один продукт не подтверждён.

3. Если конкретный объект нельзя подтвердить, используй:
- абстрактную формулировку;
- подтверждённый объект;
- текст на экране;
- монтаж;
- графику;
- голос за кадром;
- универсальную визуальную подачу.

4. Не удаляй метафоры только потому, что они образные.

5. Не превращай текст в сухой или безликий.

6. Не добавляй цены, акции, скидки, результаты, отзывы, сроки или числа.

7. Не добавляй людей или сотрудников.

8. Не добавляй интерьер, мебель, оборудование или помещение.

9. Не добавляй новые продукты или услуги.

10. Ответ должен содержать ТОЛЬКО исправленный контент.

Никаких комментариев.
Никаких объяснений.
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
    temperature: 0.2,
    maxTokens: 1800,
    label
  });
}


// ============================================================
// POST FILTER PIPELINE V2
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
    `[POST-FILTER] Starting AI fact audit: ${label}`
  );

  const audit =
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

  if (!audit.available) {

    console.log(
      `[POST-FILTER] Auditor unavailable. Keeping original result.`
    );

    return {
      result: generatedContent,
      audit,
      repaired: false,
      secondAudit: null
    };
  }

  if (audit.passed) {

    console.log(
      `[POST-FILTER] Content passed audit.`
    );

    return {
      result: generatedContent,
      audit,
      repaired: false,
      secondAudit: null
    };
  }

  console.log(
    `[POST-FILTER] Violations found. Starting one repair pass.`
  );

  let repairedContent =
    generatedContent;

  let repaired =
    false;

  try {

    const repair =
      await repairGeneratedContent({
        token,
        contentType,
        businessInfo,
        targetAudience,
        contentGoal,
        reelsTopic,
        contentStyle,
        generatedContent,
        violations: audit.violations,
        label: `${label} REPAIR`
      });

    if (repair.result) {
      repairedContent =
        repair.result;

      repaired = true;
    }

  } catch (error) {

    console.error(
      `[POST-FILTER] Repair failed:`,
      error.message
    );

    return {
      result: generatedContent,
      audit,
      repaired: false,
      secondAudit: null
    };
  }

  if (!repaired) {

    return {
      result: generatedContent,
      audit,
      repaired: false,
      secondAudit: null
    };
  }

  console.log(
    `[POST-FILTER] Starting second audit.`
  );

  const secondAudit =
    await auditGeneratedContent({
      token,
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent: repairedContent,
      label: `${label} SECOND AUDIT`
    });

  if (!secondAudit.available) {

    console.log(
      `[POST-FILTER] Second auditor unavailable. Keeping repaired result.`
    );

    return {
      result: repairedContent,
      audit,
      repaired: true,
      secondAudit
    };
  }

  if (!secondAudit.passed) {

    console.log(
      `[POST-FILTER] Second audit still found violations.`
    );

    console.log(
      "[POST-FILTER] Final result kept after one repair pass."
    );
  } else {

    console.log(
      `[POST-FILTER] Second audit passed.`
    );
  }

  return {
    result: repairedContent,
    audit,
    repaired: true,
    secondAudit
  };
}


// ============================================================
// PLAN GENERATION
// ============================================================

function validatePlanData({
  bridge_key,
  business_info,
  target_audience,
  content_goal,
  content_style
}) {
  if (!bridge_key)
    return "bridge_key is required";

  if (!BRIDGE_KEY)
    return "BRIDGE_KEY is not configured";

  if (bridge_key !== BRIDGE_KEY)
    return "Invalid bridge_key";

  if (!business_info)
    return "business_info is required";

  if (!target_audience)
    return "target_audience is required";

  if (!content_goal)
    return "content_goal is required";

  if (!content_style)
    return "content_style is required";

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
        `Контент-план: дни ${startDay}-${endDay}`,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic:
        "Контент-план на 30 дней",
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
      filtered.secondAudit
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

        second_audit_passed:
          result.secondAudit?.passed ??
          null
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

    generationInProgress =
      false;
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
          ?.message?.content ||
        "";

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


// ============================================================
// TEST PLAN 1-5
// ============================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {
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

    generationInProgress =
      true;

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
          Date.now() - startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

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

          second_audit_passed:
            result.secondAudit?.passed ??
            null
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

      generationInProgress =
        false;
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
// NORMAL GENERATION
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
            filtered.audit?.available ||
            false,

          triggered:
            !(filtered.audit?.passed ?? true),

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
