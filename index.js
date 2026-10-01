const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

// ============================================================
// CONFIG
// ============================================================

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

// ============================================================
// HTTPS AGENT
// ============================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// ============================================================
// TOKEN CACHE
// ============================================================

let accessToken = null;
let tokenExpiresAt = 0;

// Защита от параллельных генераций
let generationInProgress = false;

// ============================================================
// GIGACHAT AUTH
// ============================================================

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

        RqUID:
          crypto.randomUUID(),

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

// ============================================================
// CONTENT TYPE HELPERS
// ============================================================

function isContentPlan(contentType) {
  const type =
    String(contentType || "")
      .toLowerCase();

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

function getContentInstructions(
  contentType
) {
  const type =
    String(contentType || "")
      .toLowerCase();

  // ----------------------------------------------------------
  // TELEGRAM
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // REELS
  // ----------------------------------------------------------

  if (
    type.includes("reels")
  ) {
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

Текст должен быть естественным,
интересным и соответствовать бизнесу,
аудитории, цели и стилю.

Выдай только готовый материал.
`;
  }

  // ----------------------------------------------------------
  // POST
  // ----------------------------------------------------------

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
- соответствие бизнесу;
- соответствие аудитории;
- соответствие цели;
- соответствие выбранному стилю;
- хороший CTA.

Выдай только готовый пост.
`;
  }

  // ----------------------------------------------------------
  // CAROUSEL
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  return `
Создай качественный готовый контент
для предпринимателя или эксперта.

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
// BUILD NORMAL PROMPT
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
Ты — профессиональный российский
контент-маркетолог, контент-стратег
и сценарист.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

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
${reelsTopic}

Стиль:
${contentStyle}

====================
ИНСТРУКЦИЯ
====================

${getContentInstructions(contentType)}

====================
ФАКТИЧЕСКАЯ ТОЧНОСТЬ
====================

Используй только факты,
которые содержатся во входных данных.

НЕ ПРИДУМЫВАЙ:

- клиентов;
- кейсы;
- результаты;
- отзывы;
- цифры;
- цены;
- скидки;
- сроки;
- количество клиентов;
- количество мест;
- личный опыт;
- стаж;
- достижения;
- оборудование;
- помещения;
- сотрудников;
- конкретные процессы;
- технологии;
- ссылки;
- способы связи;
- свойства продукта;
- гарантии.

Если конкретного факта нет,
не заменяй его другим выдуманным фактом.

Вместо этого используй
более абстрактную формулировку.

====================
ТВОРЧЕСТВО
====================

РАЗРЕШЕНЫ:

- метафоры;
- сравнения;
- гиперболы;
- юмор;
- ирония;
- эмоциональные образы;
- художественная подача;
- универсальные приёмы монтажа;
- текст на экране;
- субтитры;
- графика;
- смена кадров;
- голос за кадром.

Творческая формулировка
не должна превращаться
в неподтверждённый факт.

====================
ОБЩИЕ ТРЕБОВАНИЯ
====================

- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без фраз вроде «в современном мире».
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Учитывай бизнес.
- Учитывай аудиторию.
- Учитывай цель.
- Учитывай стиль.
- Контент должен быть практически применим.

Выдай только готовый контент.
`;
}

// ============================================================
// BUILD PLAN CHUNK PROMPT
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
  const contextBlock =
    previousPlan
      ? `
ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan}

Используй её только как контекст.

Не повторяй темы и идеи.

Продолжай общую логику
контент-воронки.
`
      : `
Это начало контент-плана.

Построй первые дни так,
чтобы человек постепенно
переходил от внимания
к интересу и доверию.
`;

  return `
Ты — профессиональный
контент-стратег для предпринимателей
и экспертов.

Создай часть единого
контент-плана на 30 дней.

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

Постепенно веди аудиторию
по пути:

внимание
→ интерес
→ экспертность
→ доверие
→ желание
→ действие.

Используй и чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

====================
ФАКТИЧЕСКАЯ ТОЧНОСТЬ
====================

Очень важно:

Входные данные клиента —
единственный источник
фактической информации
о его бизнесе.

НЕ ПРИДУМЫВАЙ:

- клиентов;
- кейсы;
- отзывы;
- результаты;
- цифры;
- цены;
- скидки;
- акции;
- сроки;
- количество мест;
- количество клиентов;
- личный опыт;
- стаж;
- достижения;
- конкретные истории;
- сотрудников;
- помещения;
- оборудование;
- конкретные технологии;
- конкретные процессы;
- ссылки;
- сайты;
- Telegram-каналы;
- наличие свободных мест;
- гарантии.

Не превращай типичную
для ниши ситуацию
в утверждение о конкретном клиенте.

Например:

Если клиент сказал,
что настраивает рекламу,
нельзя автоматически утверждать,
что у него есть команда,
офис, реальные кейсы,
100 клиентов или определённый
опыт работы.

Если клиент продаёт услугу,
это не означает автоматически,
что у него есть отзывы,
гарантии, результаты
или свободные места.

====================
ТВОРЧЕСКАЯ ПОДАЧА
====================

РАЗРЕШЕНЫ:

- метафоры;
- сравнения;
- юмор;
- ирония;
- гиперболы;
- эмоциональные формулировки;
- художественные концепции;
- универсальные идеи съёмки;
- текст на экране;
- графика;
- монтаж;
- субтитры;
- голос за кадром.

Творчество разрешено,
но не должно создавать
новые реальные факты
о бизнесе клиента.

====================
ТРЕБОВАНИЯ
====================

1. Создай ВСЕ дни
с ${startDay} по ${endDay}.

2. Каждый день должен быть
конкретным.

3. Темы должны соответствовать
именно этому бизнесу.

4. Не используй абстрактные
универсальные идеи.

5. Не повторяй темы и идеи
из предыдущей части.

6. Чередуй форматы.

7. Учитывай аудиторию,
цель и стиль.

8. Не пиши длинные
готовые тексты.

9. Не пиши полный сценарий.

10. Не объясняй свои решения.

11. Не добавляй вступление
или заключение.

12. Ответ только
на русском языке.

13. Не добавляй факты,
которых нет во входных данных.

14. ОБЯЗАТЕЛЬНО ЗАВЕРШИ
ВСЕ ${endDay - startDay + 1} ДНЕЙ ЧАСТИ.

15. НИКОГДА НЕ ОБРЫВАЙ
последний день, предложение,
CTA или пункт посреди текста.

16. Если объём приближается
к лимиту, СНАЧАЛА СОКРАЩАЙ
ФОРМУЛИРОВКИ, а не количество дней.

17. Каждый день должен иметь
полностью законченные:
Тему, Идею, Задачу и CTA.

18. Не выдумывай личный опыт
автора бизнеса.

19. Не выдумывай наличие
свободных мест.

20. Не выдумывай ссылки
и способы связи.

====================
ФОРМАТ
====================

День N — Формат

Тема:
конкретная тема

Идея:
что именно показать
или раскрыть

Задача:
какую реакцию или действие
должна вызвать публикация

CTA:
конкретный призыв к действию

Каждый пункт —
короткий, но содержательный.

Не используй одинаковые CTA
каждый день.

====================
КРИТИЧЕСКИ ВАЖНО
====================

Ты обязан закончить
все дни от ${startDay} до ${endDay}.

НЕ ОСТАНАВЛИВАЙСЯ
ПОСЕРЕДИНЕ ПОСЛЕДНЕГО ДНЯ.

Если не хватает места,
сократи каждую формулировку,
но верни полностью
все дни.

ВЕРНИ ТОЛЬКО
КОНТЕНТ-ПЛАН.
`;
}

// ============================================================
// GIGACHAT REQUEST
// ============================================================

async function generateWithGigaChat({
  token,
  prompt,
  temperature,
  maxTokens,
  label
}) {
  const startedAt =
    Date.now();

  console.log(
    `[${label}] Sending request to GigaChat...`
  );

  try {
    const response =
      await axios.post(
        CHAT_URL,
        {
          model:
            GIGACHAT_MODEL,

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

          max_tokens:
            maxTokens
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
      status:
        response.status
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
    String(text || "")
      .trim();

  value =
    value
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

// ============================================================
// AUDITOR PROMPT
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
Ты — строгий редактор-фактчекер
сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент
НЕ по списку запрещённых слов,
а по исходным данным
конкретного клиента.

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
ГЛАВНЫЙ ПРИНЦИП
====================

НАРУШЕНИЕ — это конкретный
неподтверждённый факт,
которого нет во входных данных
и который нельзя считать
просто творческой формулировкой.

Проверяй контент именно
относительно данных клиента.

====================
ПРОВЕРЯЙ ОСОБЕННО
====================

- конкретных людей;
- персонажей;
- сотрудников;
- клиентов;
- конкретные продукты;
- предметы;
- блюда;
- оборудование;
- интерьер;
- помещения;
- локации;
- конкретные действия;
- процессы;
- технологии;
- платформы;
- цены;
- скидки;
- акции;
- сроки;
- даты;
- числа;
- финансовые условия;
- свойства продукта;
- свойства услуги;
- гарантии;
- результаты;
- отзывы;
- продажи;
- достижения;
- кейсы;
- личный опыт;
- стаж;
- количество клиентов;
- количество мест;
- конкретные обстоятельства бизнеса.

ОСОБЕННО ПРОВЕРЯЙ
ВЫДУМАННЫЙ ЛИЧНЫЙ ОПЫТ:

«мои клиенты»

«мои кейсы»

«мои прошлые клиенты»

«я увеличил»

«я привёл»

«я заработал»

«я работал с...»

«у меня X лет опыта»

«у меня свободно X мест»

«я помог X клиентам»

и любые смысловые аналоги.

Если этого нет
во входных данных —
это нарушение.

====================
CTA
====================

Сам CTA не является нарушением.

Но CTA является нарушением,
если он утверждает наличие
неподтверждённого ресурса:

- ссылки;
- сайта;
- конкретного канала связи;
- свободного места;
- акции;
- скидки;
- бесплатной услуги;
- конкретного продукта;
- гарантии.

Например:

«Напишите мне в комментариях»
— допустимо.

«Перейдите по ссылке
в шапке профиля»
— нарушение,
если ссылка не была указана.

«У меня осталось
одно свободное место»
— нарушение,
если наличие места
не было подтверждено.

====================
ЧТО НЕ ЯВЛЯЕТСЯ НАРУШЕНИЕМ
====================

НЕ СЧИТАЙ нарушением:

- метафоры;
- сравнения;
- гиперболы;
- юмор;
- иронию;
- эмоциональные образы;
- художественную подачу;
- абстрактные формулировки;
- универсальные приёмы съёмки;
- текст на экране;
- монтаж;
- крупный план;
- общий план;
- смену кадров;
- графику;
- субтитры;
- голос за кадром.

Например:

«антидепрессант дня»

«разбудить интерес»

«попасть в боль»

могут быть нормальной
творческой подачей.

====================
ВАЖНЫЕ ПРАВИЛА
====================

1. Не требуй буквального
совпадения каждого слова.

Учитывай нормальные формы
одного понятия и смысловые
эквиваленты.

2. Если клиент написал
«продаю кофе»,
слово «кофе» разрешено.

3. Если клиент написал
«настраиваю рекламу»,
упоминание рекламы разрешено.

Но нельзя автоматически
добавлять:

- команду;
- офис;
- количество клиентов;
- кейсы;
- стаж;
- результаты;
- конкретные бюджеты;
- конкретные инструменты.

4. Не считай нарушение
только потому, что идея
маркетингово сильная.

5. Не считай нарушение
только потому, что фраза
может быть спорной.

6. Если фраза является
очевидной метафорой,
не помечай её.

7. Если есть сомнение
и фраза может быть
творческой интерпретацией,
не помечай её как нарушение.

8. Проверяй именно факты,
а не качество текста.

9. Отдельно проверяй,
не превратил ли генератор
типичную ситуацию ниши
в утверждение о конкретном
клиенте.

10. Фраза от первого лица
считается фактическим
утверждением, если сообщает
об опыте, клиентах,
результатах, ресурсах,
доступности, сроках,
ценах или действиях автора.

Без подтверждения
во входных данных
такое утверждение
является нарушением.

11. Не считай нарушением
явно гипотетический пример,
если он обозначен как:

«например»

«представим»

«допустим»

«если»

«гипотетически».

Но если гипотетическая
ситуация подаётся как
реальный факт конкретного
бизнеса — это нарушение.

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

Если нарушения есть:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из контента",
      "reason": "почему этот факт не подтверждён входными данными"
    }
  ]
}

Не включай в violations:

- метафоры;
- стилистические решения;
- допустимые универсальные
  приёмы съёмки;
- нормальные CTA.

Не придумывай нарушения.
`;
}

// ============================================================
// RUN AUDITOR
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
        maxTokens: 650,
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
          text:
            item.text.trim(),

          reason:
            item.reason.trim()
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
      error:
        error.message
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
          `${index + 1}. Фрагмент: «${item.text}»\nПричина: ${item.reason}`
      )
      .join("\n\n");

  return `
Ты — редактор сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Нужно аккуратно исправить
готовый контент после
факт-проверки.

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
ГОТОВЫЙ КОНТЕНТ
====================

${generatedContent}

====================
ПРАВИЛА ИСПРАВЛЕНИЯ
====================

1. Удали или перепиши
ТОЛЬКО неподтверждённые
фактические детали.

2. Не удаляй:

- метафоры;
- сравнения;
- юмор;
- иронию;
- эмоциональную подачу;
- художественные формулировки.

3. Не заменяй
неподтверждённый объект
другим неподтверждённым
объектом.

4. Если конкретная деталь
не подтверждена,
подними уровень абстракции.

5. Используй подтверждённую
информацию клиента.

6. Не добавляй новых
фактов во время исправления.

7. Не придумывай:

- клиентов;
- кейсы;
- результаты;
- цены;
- сроки;
- опыт;
- стаж;
- ссылки;
- места;
- гарантии;
- цифры;
- инструменты;
- оборудование;
- сотрудников.

8. Сохрани:

- структуру;
- смысл;
- формат;
- стиль;
- маркетинговую задачу.

9. Не объясняй изменения.

10. Верни только
исправленный готовый контент.
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
    maxTokens: 1800,
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
      result:
        generatedContent,

      audit:
        firstAudit,

      repaired:
        false,

      secondAudit:
        null
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
      result:
        repaired.result,

      audit:
        firstAudit,

      repaired:
        true,

      secondAudit
    };

  } catch (error) {
    console.error(
      `[${label}] Repair failed. Returning original content:`,
      error.message
    );

    return {
      result:
        generatedContent,

      audit:
        firstAudit,

      repaired:
        false,

      secondAudit:
        null,

      repair_error:
        error.message
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

  // ВАЖНО:
  // Было 550.
  // Стало 900, чтобы 5 дней
  // полностью помещались в ответ.

  const generated =
    await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.35,
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

      reelsTopic:
        "",

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

// ============================================================
// HANDLE PLAN CHUNK
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

    return res
      .status(status)
      .json({
        ok: false,
        error:
          validationError
      });
  }

  const safePreviousPlan =
    String(
      previous_plan || ""
    ).slice(-18000);

  generationInProgress =
    true;

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
    generationInProgress =
      false;
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
        generationInProgress
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
// TEST BASIC GENERATION
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

        post_filter: {
          auditor_available:
            filtered.audit?.available ||
            false,

          triggered:
            !(filtered.audit?.passed ?? true),

          repaired:
            filtered.repaired,

          warnings:
            filtered.audit?.violations
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
