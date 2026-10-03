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

ХУК:
первая цепляющая фраза.

СЦЕНАРИЙ:
короткий динамичный текст.

ФИНАЛ:
сильное завершение.

CTA:
призыв к действию.

Текст должен быть естественным, интересным и соответствовать
бизнесу, аудитории, цели и стилю.

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
Создай качественный готовый контент
для предпринимателя или эксперта.

Учитывай бизнес, целевую аудиторию,
цель, тему и стиль.

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
Ты — профессиональный российский контент-маркетолог,
контент-стратег и сценарист.

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

====================
ФАКТОЛОГИЧЕСКАЯ ДИСЦИПЛИНА
====================

Используй только факты, которые прямо следуют
из данных клиента.

Нельзя самостоятельно придумывать:

- клиентов;
- отзывы;
- кейсы;
- истории;
- результаты;
- цифры;
- цены;
- скидки;
- акции;
- даты;
- сроки;
- помещения;
- оборудование;
- предметы;
- упаковку;
- сотрудников;
- конкретные процессы;
- технологии;
- свойства продукта;
- гарантии;
- обещания результата.

Не делай логических выводов за клиента.

Например:

Если клиент говорит:
«продаёт кофе и десерты»,

это НЕ означает автоматически:

«кофе свежий»,
«десерты домашние»,
«у клиентов повышается настроение»,
«есть уютная кофейня»,
«люди сидят за столиками»,
«есть витрина»,
«кофе пьют утром».

Это запрещено, если таких данных нет.

====================
РАЗРЕШЁННОЕ ТВОРЧЕСТВО
====================

Можно использовать:

- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- художественные формулировки;
- универсальные рекомендации по съёмке;
- монтаж;
- субтитры;
- текст на экране;
- графику;
- голос за кадром.

Но художественная формулировка не должна маскировать
новый конкретный факт.

Если для сценария не хватает конкретного объекта,
подними уровень абстракции.

Например вместо:

«Эксперт берёт упаковку продукта»

лучше:

«Сделайте визуальный акцент на продукте».

Или:

«Если у продукта есть упаковка, её можно использовать
как визуальный элемент».

====================
ПЛЕЙСХОЛДЕРЫ
====================

Не оставляй в готовом тексте незаполненные конструкции:

[ваша сфера]
[ваш продукт]
[тема вашей ниши]
[ресурс клиента]
[Адрес]
[Телефон]

Если конкретных данных нет,
замени их абстрактной формулировкой.

Выдай только готовый контент.
`;
}


// ============================================================
// PLAN PROMPT
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

Построй первые дни так,
чтобы человек постепенно переходил
от внимания к интересу и доверию.
`;

  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Создай часть единого контент-плана
на 30 дней.

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

Постепенно веди аудиторию:

внимание →
интерес →
экспертность →
доверие →
желание →
действие.

Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост

====================
ГЛАВНОЕ ПРАВИЛО
====================

План должен быть креативным,
но факты бизнеса можно использовать
ТОЛЬКО из исходных данных клиента.

Не додумывай отсутствующие детали.

Не придумывай:

- клиентов;
- истории;
- отзывы;
- кейсы;
- результаты;
- числа;
- цены;
- скидки;
- даты;
- помещения;
- оборудование;
- предметы;
- процессы;
- технологии;
- свойства продуктов;
- свойства услуг;
- конкретные события.

Не делай логических выводов.

Например, если известно только:

«эксперт или предприниматель,
который продаёт услуги или продукты»,

нельзя автоматически утверждать:

«эксперт проводит консультации»,
«у него есть клиенты»,
«у него есть кейсы»,
«он проводит созвоны»,
«у него есть команда»,
«он работает в офисе».

====================
ТВОРЧЕСТВО
====================

Разрешены:

- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные формулировки;
- художественные концепции;
- универсальные идеи съёмки;
- текст на экране;
- монтаж;
- графика;
- голос за кадром.

Если конкретная деталь не подтверждена,
не заменяй её другой выдуманной деталью.

Подними уровень абстракции.

====================
СЦЕНАРНЫЕ ИДЕИ
====================

Если пишешь идею съёмки,
не утверждай существование конкретного объекта.

Плохо:

«Эксперт появляется в кадре».

Лучше:

«Постройте ролик вокруг экспертного тезиса».

Плохо:

«Покажите упаковку».

Лучше:

«Если у продукта есть упаковка,
её можно использовать как визуальный акцент».

Плохо:

«Покажите отзывы клиентов».

Лучше:

«Если у вас есть отзывы клиентов,
можно использовать один из них».

====================
ПЛЕЙСХОЛДЕРЫ
====================

ЗАПРЕЩЕНО оставлять:

[ваша сфера]
[ваш продукт]
[тема вашей ниши]
[ресурс клиента: ...]
[процесс, где применяется услуга]
[Адрес]
[Телефон]

и любые другие незаполненные шаблоны
в квадратных скобках.

Если информации недостаточно —
переформулируй идею.

====================
ТРЕБОВАНИЯ
====================

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть содержательным.
3. Темы должны соответствовать именно этому бизнесу.
4. Не используй пустые универсальные идеи.
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

Каждый пункт —
короткий, но содержательный.

Не используй одинаковые CTA каждый день.

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
// AI FACT AUDITOR
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
Ты — СТРОГИЙ ФАКТ-АУДИТОР сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя единственная задача —
определить, какие утверждения
в готовом контенте подтверждены
входными данными клиента,
а какие придуманы моделью.

====================
КЛЮЧЕВОЙ ПРИНЦИП
====================

ИСТОЧНИКОМ ФАКТОВ ЯВЛЯЮТСЯ
ТОЛЬКО ВХОДНЫЕ ДАННЫЕ КЛИЕНТА.

Сам сгенерированный текст
НЕ ЯВЛЯЕТСЯ ДОКАЗАТЕЛЬСТВОМ.

Твои общие знания о бизнесе
НЕ ЯВЛЯЮТСЯ ДОКАЗАТЕЛЬСТВОМ.

Правдоподобие
НЕ ЯВЛЯЕТСЯ ДОКАЗАТЕЛЬСТВОМ.

Логический вывод
НЕ ЯВЛЯЕТСЯ ДОКАЗАТЕЛЬСТВОМ.

Если конкретное утверждение нельзя
напрямую подтвердить исходными данными —
считай его НЕПОДТВЕРЖДЁННЫМ.

Если сомневаешься —
считай, что подтверждения нет.

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
ГОТОВЫЙ КОНТЕНТ
====================

${generatedContent}

====================
ПРОВЕРКА ПО УТВЕРЖДЕНИЯМ
====================

Не оценивай текст целиком «на глаз».

Проверяй его
ПОУТВЕРЖДЕНИЙНО.

Шаг 1.

Найди каждое предложение или фрагмент,
который сообщает что-либо конкретное о:

- бизнесе;
- клиенте;
- продукте;
- услуге;
- людях;
- процессе;
- результате;
- прошлом опыте;
- реальном мире.

Шаг 2.

Для каждого такого фрагмента
задай вопрос:

«Какой именно фрагмент
исходных данных подтверждает это?»

Шаг 3.

Если прямой смысловой опоры нет —
это UNSUPPORTED FACT.

Шаг 4.

Не объединяй несколько слабых
косвенных намёков в доказательство.

Должна быть прямая опора.

Шаг 5.

Не считай контекст одного поля
разрешением придумывать детали
другого поля.

Например:

«эксперт или предприниматель,
который продаёт услуги»

НЕ подтверждает:

- наличие консультаций;
- наличие созвонов;
- наличие клиентов;
- наличие кейсов;
- наличие команды;
- наличие офиса;
- наличие сайта;
- наличие отзывов;
- конкретный процесс работы.

«Продаёт кофе и десерты»

НЕ подтверждает:

- вкус;
- температуру;
- аромат;
- свежесть;
- интерьер;
- столики;
- витрину;
- упаковку;
- время работы;
- популярность;
- средний чек;
- поведение покупателей.

====================
ОБЯЗАТЕЛЬНО ПРОВЕРЯЙ
====================

- любые числа;
- проценты;
- количества;
- сроки;
- длительности;
- даты;
- возраст;
- цены;
- скидки;
- акции;
- финансовые условия;
- реальные истории;
- личный опыт;
- прошлые события;
- клиентов;
- подписчиков;
- комментарии;
- отзывы;
- продажи;
- результаты;
- достижения;
- кейсы;
- обещания;
- гарантии;
- конкретные продукты;
- конкретные услуги;
- объекты;
- предметы;
- помещения;
- интерьер;
- оборудование;
- технику;
- реквизит;
- упаковку;
- локации;
- действия сотрудников;
- действия клиентов;
- действия автора;
- этапы;
- процессы;
- методы;
- технологии;
- свойства продуктов;
- свойства услуг;
- регулярность;
- причины и следствия;
- экономию;
- рост;
- увеличение продаж;
- профессиональные утверждения;
- медицинские утверждения;
- научные утверждения;
- технические утверждения.

====================
ЧТО РАЗРЕШЕНО
====================

Разрешены:

1. Метафоры.

2. Сравнения.

3. Юмор.

4. Гиперболы.

5. Эмоциональные образы.

6. Маркетинговые цели:
«привлечь внимание»,
«вызвать интерес»,
«показать экспертность».

7. Универсальные элементы подачи:
текст на экране,
титры,
субтитры,
монтаж,
графика,
голос за кадром,
крупный план.

8. Условные сценарные рекомендации:

«можно показать...»

«если у вас есть...»

«например...»

«представьте...»

«можно снять...»

Но если такая рекомендация
утверждает существование конкретного
объекта — это нарушение.

====================
СЦЕНАРНЫЕ ИДЕИ
====================

Нарушение:

«Эксперт появляется в кадре»

если наличие конкретного человека
не подтверждено.

Безопаснее:

«Постройте ролик вокруг
экспертного тезиса».

Нарушение:

«Покажите упаковку продукта»

если упаковка не подтверждена.

Безопаснее:

«Если у продукта есть упаковка,
её можно использовать
как визуальный акцент».

Нарушение:

«Покажите отзывы клиентов»

если отзывы не подтверждены.

Безопаснее:

«Если у вас есть отзывы клиентов,
можно использовать один из них».

====================
ПЛЕЙСХОЛДЕРЫ
====================

Любой незаполненный шаблон
в квадратных скобках — НАРУШЕНИЕ.

Например:

[ваша сфера]

[ваш продукт]

[ресурс клиента: время/деньги/энергия]

[процесс, где применяется услуга]

[тема вашей ниши]

[Адрес]

[Телефон]

Не считай такие шаблоны
творческой формулировкой.

====================
CTA
====================

CTA допустим,
если он просто предлагает действие.

Но CTA не должен утверждать
неподтверждённый результат.

Плохо:

«Если этот пост сэкономил вам время...»

если экономия времени
не подтверждена.

Плохо:

«Напишите — пришлю кейс»

если наличие кейса
не подтверждено.

Допустимо:

«Если тема вам откликается —
напишите...»

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON.

Если нарушений нет:

{
  "passed": true,
  "violations": []
}

Если найдено хотя бы одно нарушение:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из готового контента",
      "reason": "почему утверждение не подтверждено",
      "support": "какого подтверждения нет во входных данных"
    }
  ]
}

КРИТИЧЕСКИЕ ПРАВИЛА:

- text должен быть точной цитатой;
- support должен указывать на отсутствие опоры;
- готовый текст нельзя использовать как доказательство;
- если violations не пустой,
  passed ОБЯЗАТЕЛЬНО false;
- не скрывай сомнительные случаи;
- максимум 15 нарушений;
- не оценивай красоту;
- не оценивай маркетинговую силу;
- не оценивай стиль.

`;
}


// ============================================================
// PLACEHOLDER DETECTOR
// ============================================================

function findPlaceholderViolations(generatedContent) {
  const text = String(generatedContent || "");

  const matches =
    text.match(/\[[^\]\n]{2,120}\]/g) || [];

  const unique = [
    ...new Set(
      matches.map(item => item.trim())
    )
  ].slice(0, 15);

  return unique.map(item => ({
    text: item,
    reason:
      "В контенте остался незаполненный шаблон в квадратных скобках.",
    support:
      "Во входных данных нет подтверждения конкретному значению, которое должно заменить этот шаблон."
  }));
}


// ============================================================
// AUDIT
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

  const placeholderViolations =
    findPlaceholderViolations(
      generatedContent
    );

  try {
    const audit =
      await generateWithGigaChat({
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
        "[AI AUDITOR] Invalid auditor response."
      );

      return {
        available: false,
        passed:
          placeholderViolations.length === 0,
        violations: placeholderViolations,
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
        .slice(0, 15)
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

    const combined = [];
    const seen = new Set();

    for (
      const item of [
        ...aiViolations,
        ...placeholderViolations
      ]
    ) {
      const key =
        item.text.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      combined.push(item);

      if (combined.length >= 15) {
        break;
      }
    }

    const passed =
      parsed.passed === true &&
      combined.length === 0;

    console.log(
      `[AI AUDITOR] Passed by model: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] AI violations: ${aiViolations.length}`
    );

    console.log(
      `[AI AUDITOR] Placeholder violations: ${placeholderViolations.length}`
    );

    console.log(
      `[AI AUDITOR] Final violations: ${combined.length}`
    );

    return {
      available: true,
      passed,
      violations: combined,
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
        placeholderViolations.length === 0,
      violations: placeholderViolations,
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
Ты — финальный редактор сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача —
исправить готовый контент
после строгой факт-проверки.

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

3. Не придумывай замену
неподтверждённой детали.

4. Если факт не подтверждён —
удали его или подними уровень абстракции.

5. Если конкретный сценарий зависит
от существования объекта или события,
переведи его в условную рекомендацию:

«если у вас есть...»

«можно...»

«например...»

«представьте...»

6. Если число не подтверждено —
удали число.

Не заменяй его другим числом.

7. Если личная история
не подтверждена —
не создавай новую историю.

8. Если процесс работы
не описан клиентом —
не придумывай:

- этапы;
- консультации;
- анализ;
- правки;
- созвоны;
- оборудование;
- технологии.

9. Если есть неподтверждённое свойство
или результат —
убери его.

10. Не используй от первого лица
«я», «мы», «у нас», «мой», «наша»
для неподтверждённого опыта,
процесса или факта.

11. Сохрани полезность,
конкретность, структуру,
формат и стиль,
насколько это возможно
без выдуманных фактов.

12. Метафоры, юмор,
сравнения, гиперболы
и эмоциональные формулировки
сохраняй, если они не создают
новый конкретный факт.

13. Универсальные приёмы
съёмки и монтажа
можно сохранять.

14. Обычные CTA можно сохранять,
если они ничего не обещают
и не утверждают неподтверждённый ресурс.

15. Удали ВСЕ незаполненные шаблоны
в квадратных скобках.

Нельзя оставлять:

[ваша сфера]

[ваш продукт]

[тема]

[ресурс клиента]

[процесс]

[Адрес]

[Телефон]

и любые другие подобные placeholders.

16. После исправления проверь
весь текст заново.

Не только перечисленные нарушения,
но и соседние предложения.

17. Не объясняй,
что именно ты исправил.

18. Верни только готовый
исправленный контент.

====================
ФИНАЛЬНАЯ ПРОВЕРКА
====================

Перед выдачей текста проверь
каждое предложение:

- есть ли у факта прямая опора;
- нет ли выдуманных чисел;
- нет ли выдуманных историй;
- нет ли выдуманных клиентов;
- нет ли выдуманных отзывов;
- нет ли выдуманных результатов;
- нет ли выдуманного процесса;
- нет ли выдуманных объектов;
- нет ли выдуманного оборудования;
- нет ли выдуманных технологий;
- нет ли неподтверждённых свойств;
- нет ли неподтверждённых обещаний;
- нет ли квадратных скобок
  с незаполненным шаблоном.

Если сомневаешься —
выбирай более абстрактную формулировку.

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
    label: `${label} REPAIR`
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
    !firstAudit.available &&
    firstAudit.violations.length === 0
  ) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null
    };
  }

  if (
    firstAudit.available &&
    firstAudit.passed
  ) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null
    };
  }

  if (
    !firstAudit.available &&
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
        generatedContent:
          repaired.result,
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
    result: filtered.result,
    audit: filtered.audit,
    repaired: filtered.repaired,
    secondAudit: filtered.secondAudit,
    repair_error: filtered.repair_error || null
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
    String(previous_plan || "")
      .slice(-18000);

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

        violations:
          result.audit?.violations || [],

        second_audit_passed:
          result.secondAudit?.passed ?? null,

        second_audit_violations:
          result.secondAudit?.violations || [],

        repair_error:
          result.repair_error || null
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
      health: "/health",
      test_auth: "/test-auth",
      test_generate: "/test-generate",
      test_plan_1_5: "/test-plan-1-5",

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
        error: error.message
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
        stage: "generation",
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
        stage: "generation",
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

          violations:
            filtered.audit?.violations ||
            [],

          second_audit_passed:
            filtered.secondAudit?.passed ??
            null,

          second_audit_violations:
            filtered.secondAudit?.violations ||
            [],

          repair_error:
            filtered.repair_error ||
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
// START
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
