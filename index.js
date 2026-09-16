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

// ВАЖНО:
// Salebot ждёт ответ ограниченное время,
// поэтому не ставим слишком большой таймаут.
const http = axios.create({
  httpsAgent,
  timeout: 13000,
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

  if (
    !response.data ||
    !response.data.access_token
  ) {
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

Создай стратегический контент-план РОВНО НА 30 ДНЕЙ.

Это не список случайных тем.
Весь месяц должен представлять единую контентную стратегию.

Этапы:

ДНИ 1–4 — ВНИМАНИЕ
Зацепить аудиторию, вызвать узнавание проблемы и интерес.

ДНИ 5–8 — ИНТЕРЕС
Показать понимание проблем, желаний и потребностей аудитории.

ДНИ 9–13 — ЭКСПЕРТНОСТЬ
Дать конкретные знания, разборы, ошибки, советы и примеры.

ДНИ 14–17 — ДОВЕРИЕ
Создать человеческую связь и доверие к эксперту/бизнесу.

ДНИ 18–21 — ВОЗРАЖЕНИЯ
Разобрать страхи, сомнения, ошибки и причины откладывания покупки.

ДНИ 22–25 — ЖЕЛАНИЕ
Показать ценность, выгоды и желаемый результат.

ДНИ 26–28 — ПРОДАЖА
Мягко подвести к обращению или покупке.

ДНИ 29–30 — ПОВТОРНОЕ ВОВЛЕЧЕНИЕ
Вернуть внимание, вызвать комментарии, сохранения и повторное взаимодействие.

Для КАЖДОГО дня используй:

ДЕНЬ X

Формат:
Reels / Пост / Карусель / Telegram-пост

Цель:
Конкретная цель публикации.

ТЕМА:
Конкретная тема.

ИДЕЯ:
Что именно раскрыть.

ХУК:
Цепляющая первая фраза или заход.

CTA:
Какое действие предложить аудитории.

ТРЕБОВАНИЯ:

1. Ровно 30 дней.
2. Не повторяй темы и идеи.
3. Чередуй форматы.
4. Учитывай бизнес и целевую аудиторию.
5. Учитывай выбранную цель и стиль.
6. Не делай все публикации продажными.
7. Не придумывай факты о бизнесе.
8. Не придумывай цены, акции, отзывы, достижения или результаты.
9. Каждая публикация должна иметь самостоятельную ценность.
10. Все 30 дней должны ощущаться как единая стратегия.
11. Пиши компактно и конкретно.
12. Не добавляй вступлений и пояснений.

Верни только 30 дней.
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
Короткий цепляющий заголовок.

🔥 ПЕРВЫЙ АБЗАЦ:
Сильное начало.

📖 ОСНОВНАЯ ЧАСТЬ:
Живой разговорный текст.
Используй короткие абзацы, списки, вопросы,
примеры, контраст и эмоциональные акценты.

🎯 ГЛАВНАЯ МЫСЛЬ:
Основной вывод.

📢 CTA:
Естественный призыв к действию или вопрос.

Пост должен выглядеть естественно именно для Telegram.
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

🔥 ХУК:
Сильная первая фраза.

🎬 СЦЕНАРИЙ:

Кадр 1:
Что происходит.

Текст:
Что говорит автор.

Кадр 2:
Что происходит.

Текст:
Что говорит автор.

Кадр 3:
Что происходит.

Текст:
Что говорит автор.

Кадр 4:
Что происходит.

Текст:
Что говорит автор.

🎯 ФИНАЛ:
Главный вывод.

📢 CTA:
Естественный призыв к действию.

💡 ИДЕЯ ДЛЯ СЪЁМКИ:
Как просто снять ролик.

Сценарий должен быть динамичным,
разговорным и пригодным для реальной съёмки.
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

Создай полностью готовый пост.

📝 ЗАГОЛОВОК:
Короткий цепляющий заголовок.

🔥 ВСТУПЛЕНИЕ:
Сильное начало.

📖 ОСНОВНОЙ ТЕКСТ:
Конкретное раскрытие темы.
Используй ситуации, примеры, наблюдения,
контраст и практические выводы.

🎯 ГЛАВНАЯ МЫСЛЬ:
Основной вывод.

📢 CTA:
Естественный призыв к действию.

Пост должен быть готов к публикации.
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

Создай готовую структуру карусели.

Используй 7–9 слайдов.

🎠 ОБЛОЖКА:
Главная фраза.

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

При необходимости:
СЛАЙД 8
СЛАЙД 9

🎯 ФИНАЛ:
Главный вывод.

📢 CTA:
Что сделать после просмотра.

Не перегружай слайды.
Каждый слайд должен логично вести к следующему.
`;
  }

  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  return `
ФОРМАТ КОНТЕНТА: ${contentType}

Создай наиболее подходящий готовый формат.

Используй сильное начало,
основную мысль, вывод и CTA.
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

  const typeLower =
    cleanText(content_type).toLowerCase();

  const isContentPlan =
    typeLower.includes("контент-план") ||
    typeLower.includes("контент план") ||
    typeLower.includes("30 дней") ||
    typeLower.includes("30дней");

  return `
Ты — профессиональный контент-стратег, маркетолог,
сценарист и редактор социальных сетей.

Ты работаешь внутри продукта:

«МОЙ КОНТЕНТ-КОНСТРУКТОР»

Твоя задача — создавать контент и контент-стратегии
для предпринимателей и экспертов.

Ты анализируешь:

1. Бизнес.
2. Целевую аудиторию.
3. Цель.
4. Тему.
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
${
  reels_topic ||
  "Не задана. Для контент-плана темы придумай самостоятельно."
}

СТИЛЬ:
${content_style}

==================================================
ОБЩИЕ ПРАВИЛА
==================================================

1. Пиши естественным современным русским языком.
2. Контент должен звучать как работа сильного российского
контент-маркетолога.
3. Не используй канцелярит.
4. Не используй шаблонные вступления.
5. Не придумывай факты о бизнесе.
6. Не придумывай цены, акции, отзывы или достижения.
7. Используй только предоставленные данные и логичные выводы.
8. Учитывай конкретную целевую аудиторию.
9. Цель должна влиять на структуру.
10. Не повторяй одну мысль разными словами.
11. Не объясняй пользователю свою работу.
12. Не упоминай искусственный интеллект.

==================================================
КОНТЕНТ-СТРАТЕГИЯ
==================================================

Перед созданием результата мысленно определи:

- что волнует аудиторию;
- почему тема ей интересна;
- какую мысль она должна получить;
- какой эмоциональный триггер подходит;
- какой CTA соответствует цели.

Не показывай эти рассуждения.

==================================================
СПЕЦИАЛЬНО ДЛЯ КОНТЕНТ-ПЛАНА
==================================================

${
  isContentPlan
    ? `
Это месячная контент-стратегия.

Построй движение аудитории:

ВНИМАНИЕ
↓
ИНТЕРЕС
↓
ЭКСПЕРТНОСТЬ
↓
ДОВЕРИЕ
↓
ВОЗРАЖЕНИЯ
↓
ЖЕЛАНИЕ
↓
ПРОДАЖА
↓
ПОВТОРНОЕ ВОВЛЕЧЕНИЕ

Каждый день должен быть конкретным,
полезным и отличаться от остальных.

Не создавай 30 случайных публикаций.
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
«Как искусственный интеллект»
«Ниже представлен»

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
      content_type
    );

    console.log(
      "business_info:",
      business_info
    );

    console.log(
      "target_audience:",
      target_audience
    );

    console.log(
      "content_goal:",
      content_goal
    );

    console.log(
      "reels_topic:",
      reels_topic
    );

    console.log(
      "content_style:",
      content_style
    );

    // ========================================================
    // BRIDGE KEY CHECK
    // ========================================================

    if (!BRIDGE_KEY) {
      throw new Error(
        "BRIDGE_KEY is not configured on Render"
      );
    }

    if (bridge_key !== BRIDGE_KEY) {
      throw new Error(
        "Invalid bridge_key"
      );
    }

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

    console.log(
      "Content plan:",
      isContentPlan
    );

    // ========================================================
    // REQUIRED FIELDS
    // ========================================================

    if (!content_type) {
      throw new Error(
        "content_type is required"
      );
    }

    if (!business_info) {
      throw new Error(
        "business_info is required"
      );
    }

    if (!target_audience) {
      throw new Error(
        "target_audience is required"
      );
    }

    if (!content_goal) {
      throw new Error(
        "content_goal is required"
      );
    }

    if (!content_style) {
      throw new Error(
        "content_style is required"
      );
    }

    // reels_topic нужен для обычного контента,
    // но НЕ нужен для контент-плана.

    if (
      !isContentPlan &&
      !reels_topic
    ) {
      throw new Error(
        "reels_topic is required"
      );
    }

    // ========================================================
    // BUILD PROMPT
    // ========================================================

    const prompt = buildPrompt({
      content_type,
      business_info,
      target_audience,
      content_goal,
      reels_topic,
      content_style,
    });

    console.log("====================================");
    console.log(
      "PROMPT BUILT"
    );
    console.log(
      "Prompt length:",
      prompt.length,
      "characters"
    );
    console.log("====================================");

    // ========================================================
    // GIGACHAT TOKEN
    // ========================================================

    const token =
      await getAccessToken();

    console.log(
      "Access token obtained"
    );

    // ========================================================
    // GENERATION SETTINGS
    // ========================================================

    const temperature =
      isContentPlan
        ? 0.55
        : 0.75;

    // Для 30-дневного плана специально
    // уменьшаем максимальный объём ответа,
    // чтобы ускорить генерацию и успеть
    // в лимит ожидания Salebot.

    const max_tokens =
      isContentPlan
        ? 2400
        : 1800;

    console.log("====================================");
    console.log(
      "GENERATION SETTINGS"
    );
    console.log(
      "Temperature:",
      temperature
    );
    console.log(
      "Max tokens:",
      max_tokens
    );
    console.log("====================================");

    // ========================================================
    // SEND TO GIGACHAT
    // ========================================================

    const generationStart =
      Date.now();

    console.log(
      "Sending request to GigaChat..."
    );

    const response =
      await http.post(
        CHAT_URL,
        {
          model: GIGACHAT_MODEL,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature,
          max_tokens,
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
      generationStart;

    console.log(
      "GigaChat status:",
      response.status
    );

    console.log(
      "GigaChat generation time:",
      generationTime,
      "ms"
    );

    // ========================================================
    // EXTRACT RESULT
    // ========================================================

    const result =
      response.data
        ?.choices?.[0]
        ?.message?.content
        ?.trim() || "";

    if (!result) {
      throw new Error(
        "GigaChat returned an empty result"
      );
    }

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

      // НЕ МЕНЯЕМ НАЗВАНИЕ ПОЛЯ.
      // Salebot сохраняет:
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
