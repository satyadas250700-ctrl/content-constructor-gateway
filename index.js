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

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const http = axios.create({
  httpsAgent,
  timeout: 11000,
});

// ============================================================
// STARTUP
// ============================================================

console.log("====================================");
console.log("CONTENT CONSTRUCTOR GATEWAY");
console.log("====================================");

console.log(
  "GIGACHAT_KEY:",
  GIGACHAT_KEY ? "CONFIGURED" : "MISSING"
);

console.log(
  "BRIDGE_KEY:",
  BRIDGE_KEY ? "CONFIGURED" : "MISSING"
);

console.log("GIGACHAT_SCOPE:", GIGACHAT_SCOPE);
console.log("GIGACHAT_MODEL:", GIGACHAT_MODEL);
console.log("CHAT_URL:", CHAT_URL);
console.log("PORT:", PORT);

// ============================================================
// TOKEN CACHE
// ============================================================

let cachedToken = null;
let tokenExpiresAt = 0;

// ============================================================
// HELPERS
// ============================================================

function generateRqUID() {
  return crypto.randomUUID();
}

function cleanText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

// ============================================================
// GIGACHAT AUTH
// ============================================================

async function getAccessToken() {
  console.log("====================================");
  console.log("GIGACHAT AUTH STARTED");
  console.log("====================================");

  if (
    cachedToken &&
    Date.now() < tokenExpiresAt - 30000
  ) {
    console.log("Using cached GigaChat access token");
    return cachedToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const rqUID = generateRqUID();

  console.log("RqUID:", rqUID);
  console.log("Requesting GigaChat OAuth token...");

  const startTime = Date.now();

  const response = await http.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE,
    }).toString(),
    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: rqUID,
        Authorization: `Basic ${GIGACHAT_KEY}`,
      },
    }
  );

  const elapsed = Date.now() - startTime;

  console.log(
    "OAuth response status:",
    response.status
  );

  console.log(
    "OAuth time:",
    elapsed,
    "ms"
  );

  if (!response.data || !response.data.access_token) {
    throw new Error(
      "GigaChat OAuth response does not contain access_token"
    );
  }

  cachedToken = response.data.access_token;

  const expiresIn =
    Number(response.data.expires_in) || 1800;

  tokenExpiresAt =
    Date.now() + expiresIn * 1000;

  console.log(
    "GigaChat OAuth token received successfully"
  );

  return cachedToken;
}

// ============================================================
// CONTENT INSTRUCTIONS
// ============================================================

function getContentInstructions(contentType) {
  const type = cleanText(contentType).toLowerCase();

  // ----------------------------------------------------------
  // CONTENT PLAN — 30 DAYS
  // ----------------------------------------------------------

  if (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  ) {
    return `
ФОРМАТ: КОНТЕНТ-ПЛАН НА 30 ДНЕЙ

Создай стратегический контент-план ровно на 30 дней.

Это НЕ должен быть список из 30 случайных тем.

Каждый день должен логично продолжать общую контентную стратегию.

Построй план по следующей логике:

ДНИ 1–4:
ВНИМАНИЕ

Задача:
Зацепить целевую аудиторию, вызвать узнавание проблемы, интерес или эмоциональную реакцию.

ДНИ 5–8:
ИНТЕРЕС

Задача:
Показать, что автор понимает проблемы и желания аудитории.

ДНИ 9–13:
ЭКСПЕРТНОСТЬ

Задача:
Продемонстрировать компетентность через конкретные знания, разборы, ошибки, примеры и практические советы.

ДНИ 14–17:
ДОВЕРИЕ

Задача:
Создать ощущение близости, прозрачности и человеческого доверия к бизнесу/эксперту.

ДНИ 18–21:
ВОЗРАЖЕНИЯ

Задача:
Разобрать сомнения, страхи, распространённые ошибки и причины, по которым потенциальный клиент откладывает решение.

ДНИ 22–25:
ЖЕЛАНИЕ

Задача:
Показать желаемый результат, выгоды, изменения и ценность продукта или услуги.

ДНИ 26–28:
ПРОДАЖА

Задача:
Мягко подвести аудиторию к покупке или обращению.

ДНИ 29–30:
ПОВТОРНОЕ ВОВЛЕЧЕНИЕ

Задача:
Вернуть внимание аудитории, вызвать обсуждение, комментарии, сохранения или повторное взаимодействие.

Для каждого из 30 дней укажи:

ДЕНЬ X

Формат:
Один из:
Reels
Пост
Карусель
Telegram-пост

Цель:
Конкретная цель публикации.

ТЕМА:
Конкретная тема, а не общее направление.

ИДЕЯ:
Что именно раскрыть в этом контенте.

ХУК:
Короткая цепляющая первая фраза или идея захода.

CTA:
Какое действие предложить аудитории.

Важно:

1. Учитывай конкретный бизнес пользователя.
2. Учитывай конкретную целевую аудиторию.
3. Учитывай выбранную цель.
4. Учитывай выбранный стиль.
5. Не повторяй одинаковые темы.
6. Чередуй форматы.
7. Не делай все 30 дней продажными.
8. Не придумывай факты о бизнесе.
9. Не придумывай цены, акции, отзывы или достижения.
10. Темы должны быть реально пригодны для создания контента.
11. Каждый день должен иметь самостоятельную ценность.
12. При этом весь месяц должен ощущаться как единая стратегия.

Верни ровно 30 дней.
`;
  }

  // ----------------------------------------------------------
  // TELEGRAM
  // ----------------------------------------------------------

  if (
    type.includes("telegram") ||
    type.includes("телеграм") ||
    type.includes("тг")
  ) {
    return `
ФОРМАТ: TELEGRAM-ПОСТ

Создай готовый пост для Telegram.

Структура:

✈️ ЗАГОЛОВОК:
Короткий, цепляющий заголовок.

🔥 ПЕРВЫЙ АБЗАЦ:
Сильное начало, которое вызывает желание читать дальше.

📖 ОСНОВНАЯ ЧАСТЬ:
Раскрой тему живым разговорным языком.

Можно использовать:
- короткие абзацы;
- списки;
- вопросы;
- примеры;
- личные наблюдения;
- контраст;
- эмоциональные акценты.

🎯 ГЛАВНАЯ МЫСЛЬ:
Что читатель должен понять.

📢 CTA:
Естественный призыв к действию или вопрос аудитории.

Telegram-пост должен выглядеть естественно именно для Telegram, а не как рекламная статья.
`;
  }

  // ----------------------------------------------------------
  // REELS
  // ----------------------------------------------------------

  if (
    type.includes("reels") ||
    type.includes("рилс") ||
    type.includes("reel")
  ) {
    return `
ФОРМАТ: REELS

Создай готовый сценарий короткого вертикального видео.

Структура:

🔥 ХУК:
Одна сильная первая фраза, которая заставляет продолжить просмотр.

🎬 СЦЕНАРИЙ:

Кадр 1:
Что происходит в кадре.

Текст:
Что говорит автор.

Кадр 2:
Что происходит в кадре.

Текст:
Что говорит автор.

Кадр 3:
Что происходит в кадре.

Текст:
Что говорит автор.

Кадр 4:
Что происходит в кадре.

Текст:
Что говорит автор.

🎯 ФИНАЛ:
Главный вывод.

📢 CTA:
Естественный призыв к действию.

💡 ИДЕЯ ДЛЯ СЪЁМКИ:
Как просто снять этот ролик без сложного оборудования.

Сценарий должен быть динамичным, разговорным и пригодным для реальной съёмки.
`;
  }

  // ----------------------------------------------------------
  // POST
  // ----------------------------------------------------------

  if (
    type.includes("пост") ||
    type.includes("post")
  ) {
    return `
ФОРМАТ: ПОСТ

Создай полностью готовый пост для социальной сети.

Структура:

📝 ЗАГОЛОВОК:
Короткий и цепляющий заголовок.

🔥 ВСТУПЛЕНИЕ:
Первые несколько предложений должны заставить человека читать дальше.

📖 ОСНОВНОЙ ТЕКСТ:
Раскрой тему конкретно и понятно.

Используй:
- реальные ситуации;
- конкретные примеры;
- понятные наблюдения;
- контраст;
- практические выводы.

Не превращай текст в лекцию.

🎯 ГЛАВНАЯ МЫСЛЬ:
Чётко сформулируй основной вывод.

📢 CTA:
Естественный призыв к действию.

Пост должен быть готов к публикации без дополнительного редактирования.
`;
  }

  // ----------------------------------------------------------
  // CAROUSEL
  // ----------------------------------------------------------

  if (
    type.includes("карусел") ||
    type.includes("carousel")
  ) {
    return `
ФОРМАТ: КАРУСЕЛЬ

Создай полностью готовую структуру карусели.

Используй 7–9 слайдов.

Структура:

🎠 ОБЛОЖКА:
Главная фраза для первого слайда.

СЛАЙД 1:
Текст.

СЛАЙД 2:
Текст.

СЛАЙД 3:
Текст.

СЛАЙД 4:
Текст.

СЛАЙД 5:
Текст.

СЛАЙД 6:
Текст.

СЛАЙД 7:
Текст.

При необходимости добавь СЛАЙД 8 и СЛАЙД 9.

🎯 ФИНАЛ:
Главный вывод.

📢 CTA:
Что человек должен сделать после просмотра карусели.

Каждый слайд должен быть понятным сам по себе и при этом логично вести к следующему.
Не перегружай слайды длинными абзацами.
`;
  }

  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  return `
ФОРМАТ КОНТЕНТА: ${contentType}

Создай наиболее подходящий готовый формат контента исходя из указанного типа.

Сохрани профессиональную структуру, сильное начало, основную мысль, вывод и CTA.
`;
}

// ============================================================
// UNIVERSAL PROMPT
// ============================================================

function buildPrompt(data) {
  const {
    content_type,
    business_info,
    target_audience,
    content_goal,
    reels_topic,
    content_style,
  } = data;

  const contentInstructions =
    getContentInstructions(content_type);

  const isContentPlan =
    cleanText(content_type)
      .toLowerCase()
      .includes("контент-план") ||
    cleanText(content_type)
      .toLowerCase()
      .includes("30 дней");

  return `
Ты — профессиональный контент-стратег, маркетолог, сценарист и редактор социальных сетей.

Ты работаешь внутри продукта:

«МОЙ КОНТЕНТ-КОНСТРУКТОР»

Твоя задача — создавать контент и контент-стратегии для предпринимателей и экспертов.

Ты не просто генерируешь текст.

Ты сначала анализируешь:

1. Бизнес.
2. Целевую аудиторию.
3. Цель.
4. Тему, если она предоставлена.
5. Стиль.
6. Формат.

После этого выбираешь правильный угол подачи.

==================================================
ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
==================================================

ТИП:
${content_type}

БИЗНЕС:
${business_info}

ЦЕЛЕВАЯ АУДИТОРИЯ:
${target_audience}

ЦЕЛЬ:
${content_goal}

ТЕМА:
${reels_topic || "Не задана. Для контент-плана темы необходимо придумать самостоятельно."}

СТИЛЬ:
${content_style}

==================================================
ОБЩИЕ ПРАВИЛА
==================================================

1. Пиши на естественном современном русском языке.

2. Контент должен звучать как работа сильного российского контент-маркетолога.

3. Не используй канцелярит.

4. Не используй шаблонные вступления вроде:

«В современном мире»
«Важно понимать»
«Стоит отметить»
«Сегодня я расскажу вам»
«Давайте разберёмся»
«Как известно»
«Ни для кого не секрет»

5. Не придумывай факты о бизнесе.

6. Не придумывай несуществующие акции, цены, отзывы, достижения или результаты.

7. Используй только информацию, которую можно логично вывести из предоставленных данных.

8. Не перегружай материал информацией.

9. Учитывай именно указанную целевую аудиторию.

10. Не обращайся к аудитории слишком общими словами, если можно говорить конкретнее.

11. Цель должна влиять на структуру и подачу.

12. Если цель — продажи, не превращай материал в агрессивную рекламу.

13. Если цель — экспертность, показывай компетентность через конкретные мысли, объяснения, примеры и наблюдения.

14. Если цель — внимание, делай сильный эмоциональный или интеллектуальный заход.

15. Если стиль провокационный, используй смелую подачу, но не превращай её в бессмысленное оскорбление.

16. Не повторяй одну и ту же мысль разными словами.

17. Не добавляй пояснения о своей работе.

18. Не пиши, что ты искусственный интеллект.

==================================================
КОНТЕНТ-СТРАТЕГИЯ
==================================================

Перед созданием результата мысленно ответь:

- Что действительно волнует эту аудиторию?
- Почему эта тема должна быть ей интересна?
- Какую конкретную мысль человек должен унести?
- Почему он должен дочитать или досмотреть?
- Какой эмоциональный триггер подходит?
- Какой CTA логично соответствует цели?

Не показывай эти рассуждения пользователю.

==================================================
СПЕЦИАЛЬНО ДЛЯ КОНТЕНТ-ПЛАНА
==================================================

${
  isContentPlan
    ? `
Это стратегический план на 30 дней.

Не создавай 30 случайных публикаций.

Представь, что ты отвечаешь за контент-маркетинг этого бизнеса целый месяц.

Построй последовательное движение аудитории:

ВНИМАНИЕ
↓
ИНТЕРЕС
↓
ЭКСПЕРТНОСТЬ
↓
ДОВЕРИЕ
↓
РАБОТА С ВОЗРАЖЕНИЯМИ
↓
ЖЕЛАНИЕ
↓
ПРОДАЖА
↓
ПОВТОРНОЕ ВОВЛЕЧЕНИЕ

Следи за разнообразием тем и форматов.

Не используй одну и ту же идею несколько раз.

Каждая тема должна иметь практический смысл и быть достаточно конкретной, чтобы по ней можно было сразу создать полноценный контент.
`
    : ""
}

==================================================
ФОРМАТ
==================================================

${contentInstructions}

==================================================
ФИНАЛЬНЫЕ ТРЕБОВАНИЯ
==================================================

Верни ТОЛЬКО готовый результат.

Не добавляй:

«Вот ваш контент»
«Надеюсь, вам понравится»
«При необходимости могу изменить»
«Как искусственный интеллект...»
«Ниже представлен...»

Не объясняй, почему ты выбрал такую структуру.

Сразу начинай с результата.

Контент должен быть практически готов к использованию.
`.trim();
}

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    message: "Gateway is working",
    endpoints: {
      health: "GET /health",
      testAuth: "GET /test-auth",
      testGenerate: "GET /test-generate",
      generate: "POST /generate",
    },
  });
});

// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working",
    gigaChatKey: GIGACHAT_KEY
      ? "CONFIGURED"
      : "MISSING",
    bridgeKey: BRIDGE_KEY
      ? "CONFIGURED"
      : "MISSING",
    model: GIGACHAT_MODEL,
    time: new Date().toISOString(),
  });
});

// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {
  try {
    console.log("====================================");
    console.log("TEST AUTH STARTED");
    console.log("====================================");

    const token = await getAccessToken();

    res.json({
      ok: true,
      stage: "authentication",
      message:
        "GigaChat authentication successful",
      tokenReceived: Boolean(token),
    });
  } catch (error) {
    console.error(
      "TEST AUTH ERROR:",
      error.response?.data ||
        error.message ||
        error
    );

    res.status(500).json({
      ok: false,
      stage: "authentication",
      error:
        error.response?.data ||
        error.message ||
        String(error),
    });
  }
});

// ============================================================
// TEST GENERATE
// ============================================================

app.get("/test-generate", async (req, res) => {
  try {
    console.log("====================================");
    console.log("TEST GENERATE STARTED");
    console.log("====================================");

    const token = await getAccessToken();

    console.log("Access token obtained");
    console.log(
      "Sending test request to GigaChat..."
    );

    const startTime = Date.now();

    const response = await http.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,
        messages: [
          {
            role: "user",
            content:
              "Ответь одним словом: Да",
          },
        ],
        temperature: 0.2,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type":
            "application/json",
          Accept: "application/json",
        },
      }
    );

    const elapsed =
      Date.now() - startTime;

    console.log(
      "GigaChat status:",
      response.status
    );

    console.log(
      "Generation time:",
      elapsed,
      "ms"
    );

    console.log(
      "GigaChat response:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    const result =
      response.data?.choices?.[0]?.message
        ?.content || "";

    res.json({
      ok: true,
      stage: "generation",
      status: response.status,
      response: response.data,
      reels_result: result,
    });
  } catch (error) {
    console.error(
      "TEST GENERATE ERROR:",
      error.response?.data ||
        error.message ||
        error
    );

    res.status(500).json({
      ok: false,
      stage: "generation",
      error:
        error.response?.data ||
        error.message ||
        String(error),
    });
  }
});

// ============================================================
// MAIN GENERATE
// ============================================================

app.post("/generate", async (req, res) => {
  const requestStartTime =
    Date.now();

  console.log("====================================");
  console.log(
    "GENERATE REQUEST RECEIVED"
  );
  console.log("====================================");

  console.log(
    "Time:",
    new Date().toISOString()
  );

  console.log(
    "Content-Type:",
    req.headers["content-type"]
  );

  console.log(
    "Body exists:",
    Boolean(req.body)
  );

  console.log(
    "Body keys:",
    Object.keys(req.body || {})
  );

  try {
    // ========================================================
    // VARIABLES FROM SALEBOT
    // ========================================================

    const bridge_key =
      cleanText(
        req.body?.bridge_key
      );

    const content_type =
      cleanText(
        req.body?.content_type
      );

    const business_info =
      cleanText(
        req.body?.business_info
      );

    const target_audience =
      cleanText(
        req.body?.target_audience
      );

    const content_goal =
      cleanText(
        req.body?.content_goal
      );

    const reels_topic =
      cleanText(
        req.body?.reels_topic
      );

    const content_style =
      cleanText(
        req.body?.content_style
      );

    // ========================================================
    // LOG SALESBOT VARIABLES
    // ========================================================

    console.log("====================================");
    console.log(
      "SALEBOT VARIABLES"
    );
    console.log("====================================");

    console.log(
      "content_type:",
      JSON.stringify(content_type)
    );

    console.log(
      "business_info:",
      JSON.stringify(business_info)
    );

    console.log(
      "target_audience:",
      JSON.stringify(target_audience)
    );

    console.log(
      "content_goal:",
      JSON.stringify(content_goal)
    );

    console.log(
      "reels_topic:",
      JSON.stringify(reels_topic)
    );

    console.log(
      "content_style:",
      JSON.stringify(content_style)
    );

    // ========================================================
    // BRIDGE KEY
    // ========================================================

    if (!BRIDGE_KEY) {
      console.error(
        "BRIDGE_KEY is not configured"
      );

      return res.status(500).json({
        ok: false,
        error:
          "BRIDGE_KEY is not configured",
      });
    }

    if (!bridge_key) {
      console.error(
        "Bridge key was not provided"
      );

      return res.status(401).json({
        ok: false,
        error:
          "Bridge key is missing",
      });
    }

    if (bridge_key !== BRIDGE_KEY) {
      console.error(
        "Bridge key validation failed"
      );

      return res.status(401).json({
        ok: false,
        error:
          "Invalid bridge_key",
      });
    }

    console.log(
      "Bridge key: VALID"
    );

    // ========================================================
    // CONTENT PLAN DETECTION
    // ========================================================

    const typeLower =
      content_type.toLowerCase();

    const isContentPlan =
      typeLower.includes("контент-план") ||
      typeLower.includes("контент план") ||
      typeLower.includes("30 дней") ||
      typeLower.includes("30дней");

    // ========================================================
    // REQUIRED FIELDS
    // ========================================================

    const missingFields = [];

    if (!content_type) {
      missingFields.push(
        "content_type"
      );
    }

    if (!business_info) {
      missingFields.push(
        "business_info"
      );
    }

    if (!target_audience) {
      missingFields.push(
        "target_audience"
      );
    }

    if (!content_goal) {
      missingFields.push(
        "content_goal"
      );
    }

    // --------------------------------------------------------
    // Для контент-плана тема НЕ обязательна
    // --------------------------------------------------------

    if (!isContentPlan) {
      if (!reels_topic) {
        missingFields.push(
          "reels_topic"
        );
      }
    }

    if (!content_style) {
      missingFields.push(
        "content_style"
      );
    }

    if (
      missingFields.length > 0
    ) {
      console.error(
        "Missing required fields:",
        missingFields
      );

      return res.status(400).json({
        ok: false,
        error:
          "Missing required fields",
        fields:
          missingFields,
      });
    }

    // ========================================================
    // GET TOKEN
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );

    const token =
      await getAccessToken();

    console.log(
      "Access token obtained"
    );

    // ========================================================
    // BUILD PROMPT
    // ========================================================

    const prompt =
      buildPrompt({
        content_type,
        business_info,
        target_audience,
        content_goal,
        reels_topic,
        content_style,
      });

    console.log(
      "Prompt length:",
      prompt.length,
      "characters"
    );

    console.log(
      "Generation mode:",
      isContentPlan
        ? "30-DAY CONTENT PLAN"
        : "SINGLE CONTENT"
    );

    // ========================================================
    // GENERATION
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );

    const generationStartTime =
      Date.now();

    const response =
      await http.post(
        CHAT_URL,
        {
          model:
            GIGACHAT_MODEL,

          messages: [
            {
              role: "system",
              content:
                "Ты работаешь как профессиональный контент-стратег внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР». Всегда строго соблюдай выбранный пользователем формат. Если выбран контент-план на 30 дней, создай именно стратегический план ровно на 30 дней.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: isContentPlan
            ? 0.65
            : 0.75,

          max_tokens: isContentPlan
            ? 3200
            : 1800,
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },
        }
      );

    const generationTime =
      Date.now() -
      generationStartTime;

    console.log(
      "GigaChat HTTP status:",
      response.status
    );

    console.log(
      "GigaChat generation time:",
      generationTime,
      "ms"
    );

    // ========================================================
    // RESULT
    // ========================================================

    const result =
      response.data?.choices?.[0]
        ?.message?.content || "";

    if (!result) {
      console.error(
        "GigaChat returned empty content"
      );

      return res.status(502).json({
        ok: false,
        error:
          "GigaChat returned empty content",
      });
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("====================================");
    console.log(
      "CONTENT GENERATED SUCCESSFULLY"
    );
    console.log("====================================");

    console.log(
      "Content type:",
      content_type
    );

    console.log(
      "Generation mode:",
      isContentPlan
        ? "30-DAY CONTENT PLAN"
        : "SINGLE CONTENT"
    );

    console.log(
      "Result length:",
      result.length,
      "characters"
    );

    console.log(
      "Total request time:",
      Date.now() -
        requestStartTime,
      "ms"
    );

    // ========================================================
    // SALEBOT RESPONSE
    // ========================================================

    return res.json({
      ok: true,

      // IMPORTANT:
      // НЕ МЕНЯЕМ НАЗВАНИЕ ПОЛЯ.
      //
      // Salebot сейчас сохраняет:
      // reels_result -> reels_result

      reels_result: result,
    });

  } catch (error) {
    console.error("====================================");
    console.error(
      "GENERATE ERROR"
    );
    console.error("====================================");

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

    console.error(
      "Total request time:",
      Date.now() -
        requestStartTime,
      "ms"
    );

    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        String(error),
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
    method: req.method,
    url: req.originalUrl,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
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

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Internal server error",
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log("====================================");
  console.log(
    "Content Constructor Gateway running on port",
    PORT
  );
  console.log("====================================");
});
