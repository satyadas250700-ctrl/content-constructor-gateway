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

// ============================================================
// GET GIGACHAT TOKEN
// ============================================================

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const rqUid = crypto.randomUUID();

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
        RqUID: rqUid,
        "Content-Type":
          "application/x-www-form-urlencoded"
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
// CONTENT INSTRUCTIONS
// ============================================================

function getContentInstructions(contentType) {
  const type = String(contentType || "").toLowerCase();

  // ----------------------------------------------------------
  // 30-DAY CONTENT PLAN
  // ----------------------------------------------------------

  if (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  ) {
    return `
СОЗДАЙ КОНТЕНТ-ПЛАН.

Для каждого дня укажи:

День N — формат
Тема: конкретная тема
Идея: что раскрыть
CTA: короткий призыв

Не пиши длинные тексты.
Не пиши готовые сценарии.
Не объясняй свои решения.
Не повторяй темы.

Используй форматы:
Reels
Пост
Карусель
Telegram-пост

Ответ только на русском языке.
`;
  }

  // ----------------------------------------------------------
  // TELEGRAM POST
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
- выбранный стиль;
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

Для каждого слайда:

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

Учитывай бизнес,
целевую аудиторию,
цель,
тему и стиль.

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
  const instructions =
    getContentInstructions(contentType);

  return `
Ты — профессиональный российский
контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

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

${instructions}

ОБЩИЕ ТРЕБОВАНИЯ:

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
// BUILD 15-DAY TEST PROMPT
// ============================================================

function buildTestPlanPrompt(startDay, endDay) {
  return `
Ты — контент-стратег.

Создай компактную часть контент-плана
для предпринимателя.

Нужно создать дни ${startDay}–${endDay}.

Данные бизнеса:
эксперт или предприниматель, который продаёт
свои услуги или продукты.

Целевая аудитория:
потенциальные клиенты этого бизнеса.

Цель:
привлечь внимание, показать экспертность,
вызвать доверие и привести к покупке.

Стиль:
легко, уверенно, современно.

Используй форматы:
Reels, Пост, Карусель, Telegram-пост.

Для каждого дня используй только 3 строки:

День N — формат
Тема: ...
Идея: ...

Не пиши CTA.
Не пиши сценарии.
Не пиши длинные тексты.
Не объясняй свои решения.
Не повторяй темы.

Создай все дни от ${startDay} до ${endDay}.

Ответ только на русском языке.
`;
}

// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    gigachat_key_configured: !!GIGACHAT_KEY,
    bridge_key_configured: !!BRIDGE_KEY,
    model: GIGACHAT_MODEL
  });
});

// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {
  try {
    const token = await getAccessToken();

    res.json({
      ok: true,
      stage: "auth",
      token_received: !!token
    });
  } catch (error) {
    console.error("AUTH ERROR");
    console.error(error.message);

    res.status(500).json({
      ok: false,
      stage: "auth",
      error: error.message
    });
  }
});

// ============================================================
// TEST BASIC GENERATION
// ============================================================

app.get("/test-generate", async (req, res) => {
  try {
    const startedAt = Date.now();

    const token = await getAccessToken();

    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,

        messages: [
          {
            role: "user",
            content: "Ответь одним словом: Да"
          }
        ],

        temperature: 0.2,
        max_tokens: 10
      },
      {
        httpsAgent,
        timeout: 12000,

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

    const totalTime =
      Date.now() - startedAt;

    console.log(
      "TEST GENERATE TIME:",
      totalTime,
      "ms"
    );

    res.json({
      ok: true,
      stage: "generation",
      status: response.status,
      time_ms: totalTime,
      response: response.data,
      reels_result: result
    });

  } catch (error) {
    console.error("TEST GENERATE ERROR");
    console.error("Message:", error.message);
    console.error(
      "Status:",
      error.response?.status
    );
    console.error(
      "Response:",
      error.response?.data
    );

    res.status(500).json({
      ok: false,
      stage: "generation",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data
    });
  }
});

// ============================================================
// TEST 15-DAY PLAN
// ============================================================

app.get("/test-plan", async (req, res) => {
  const startedAt = Date.now();

  console.log("");
  console.log("====================================");
  console.log("TEST 15-DAY PLAN");
  console.log("====================================");

  try {
    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    console.log("Getting GigaChat token...");

    const token = await getAccessToken();

    console.log("OAuth token received");

    // --------------------------------------------------------
    // PROMPT
    // --------------------------------------------------------

    const prompt =
      buildTestPlanPrompt(1, 15);

    console.log(
      "Sending 15-day test request..."
    );

    // --------------------------------------------------------
    // REQUEST
    // --------------------------------------------------------

    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,

        messages: [
          {
            role: "system",
            content:
              "Ты профессиональный контент-стратег. Пиши кратко и конкретно."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.4,

        // Небольшой лимит специально
        // для измерения скорости
        max_tokens: 750
      },
      {
        httpsAgent,

        timeout: 12000,

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

    const totalTime =
      Date.now() - startedAt;

    console.log(
      "GigaChat HTTP status:",
      response.status
    );

    console.log(
      "Result length:",
      result.length
    );

    console.log(
      "Total request time:",
      totalTime,
      "ms"
    );

    console.log(
      "TEST 15-DAY PLAN SUCCESS"
    );

    console.log(
      "===================================="
    );

    res.json({
      ok: true,
      test: "15-day-plan",
      status: response.status,
      time_ms: totalTime,
      result_length: result.length,
      model: GIGACHAT_MODEL,
      reels_result: result
    });

  } catch (error) {

    const totalTime =
      Date.now() - startedAt;

    console.error(
      "TEST 15-DAY PLAN ERROR"
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

    console.error(
      "Total request time:",
      totalTime,
      "ms"
    );

    console.error(
      "===================================="
    );

    res.status(500).json({
      ok: false,
      test: "15-day-plan",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: totalTime
    });
  }
});

// ============================================================
// MAIN GENERATE
// ============================================================

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

  try {

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // BRIDGE KEY
    // --------------------------------------------------------

    if (!bridge_key) {
      console.log(
        "ERROR: bridge_key missing"
      );

      return res.status(401).json({
        ok: false,
        error: "bridge_key is required"
      });
    }

    if (!BRIDGE_KEY) {
      console.log(
        "ERROR: BRIDGE_KEY not configured"
      );

      return res.status(500).json({
        ok: false,
        error: "BRIDGE_KEY is not configured"
      });
    }

    if (bridge_key !== BRIDGE_KEY) {
      console.log(
        "ERROR: invalid bridge_key"
      );

      return res.status(401).json({
        ok: false,
        error: "Invalid bridge_key"
      });
    }

    // --------------------------------------------------------
    // DETECT CONTENT PLAN
    // --------------------------------------------------------

    const normalizedContentType =
      String(content_type || "").toLowerCase();

    const isContentPlan =
      normalizedContentType.includes(
        "контент-план"
      ) ||
      normalizedContentType.includes(
        "контент план"
      ) ||
      normalizedContentType.includes(
        "30 дней"
      ) ||
      normalizedContentType.includes(
        "30дней"
      );

    console.log(
      "Content plan:",
      isContentPlan
    );

    // --------------------------------------------------------
    // REQUIRED FIELDS
    // --------------------------------------------------------

    if (!content_type) {
      return res.status(400).json({
        ok: false,
        error: "content_type is required"
      });
    }

    if (!business_info) {
      return res.status(400).json({
        ok: false,
        error: "business_info is required"
      });
    }

    if (!target_audience) {
      return res.status(400).json({
        ok: false,
        error: "target_audience is required"
      });
    }

    if (!content_goal) {
      return res.status(400).json({
        ok: false,
        error: "content_goal is required"
      });
    }

    if (!content_style) {
      return res.status(400).json({
        ok: false,
        error: "content_style is required"
      });
    }

    if (!isContentPlan && !reels_topic) {
      return res.status(400).json({
        ok: false,
        error: "reels_topic is required"
      });
    }

    // --------------------------------------------------------
    // LOG DATA
    // --------------------------------------------------------

    console.log(
      "Business info:",
      business_info
    );

    console.log(
      "Target audience:",
      target_audience
    );

    console.log(
      "Content goal:",
      content_goal
    );

    console.log(
      "Content style:",
      content_style
    );

    if (!isContentPlan) {
      console.log(
        "Reels topic:",
        reels_topic
      );
    }

    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    console.log(
      "Getting GigaChat token..."
    );

    const token =
      await getAccessToken();

    console.log(
      "OAuth token received"
    );

    // --------------------------------------------------------
    // PROMPT
    // --------------------------------------------------------

    const prompt =
      buildPrompt({
        contentType: content_type,
        businessInfo: business_info,
        targetAudience: target_audience,
        contentGoal: content_goal,
        reelsTopic: reels_topic,
        contentStyle: content_style
      });

    // --------------------------------------------------------
    // SETTINGS
    // --------------------------------------------------------

    let temperature;
    let maxTokens;

    if (isContentPlan) {

      temperature = 0.45;

      maxTokens = 1400;

      console.log(
        "Using optimized content-plan settings"
      );

    } else {

      temperature = 0.75;

      maxTokens = 1800;

      console.log(
        "Using standard content settings"
      );
    }

    // --------------------------------------------------------
    // GIGACHAT
    // --------------------------------------------------------

    console.log(
      "Sending request to GigaChat..."
    );

    const response =
      await axios.post(
        CHAT_URL,

        {
          model: GIGACHAT_MODEL,

          messages: [
            {
              role: "system",
              content:
                "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Создавай только качественный готовый контент на русском языке."
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

          timeout: 12000,

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    // --------------------------------------------------------
    // RESULT
    // --------------------------------------------------------

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

    const totalTime =
      Date.now() - startedAt;

    console.log(
      "GigaChat HTTP status:",
      response.status
    );

    console.log(
      "Result length:",
      result.length
    );

    console.log(
      "Total request time:",
      totalTime,
      "ms"
    );

    // --------------------------------------------------------
    // EMPTY RESULT
    // --------------------------------------------------------

    if (!result) {

      console.log(
        "ERROR: Empty GigaChat result"
      );

      return res.status(500).json({
        ok: false,
        error:
          "GigaChat returned empty result"
      });
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    console.log(
      "GENERATION SUCCESS"
    );

    console.log(
      "===================================="
    );

    return res.json({
      ok: true,
      reels_result: result
    });

  } catch (error) {

    console.error("");
    console.error(
      "===================================="
    );

    console.error(
      "GENERATE ERROR"
    );

    console.error(
      "===================================="
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

    console.error(
      "Total request time:",
      Date.now() - startedAt,
      "ms"
    );

    console.error(
      "===================================="
    );

    return res.status(500).json({
      ok: false,
      error: error.message,
      status: error.response?.status,
      response: error.response?.data
    });
  }
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint not found"
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {

  console.log("");

  console.log(
    "===================================="
  );

  console.log(
    `Content Constructor Gateway started on port ${PORT}`
  );

  console.log(
    "===================================="
  );

  console.log(
    "GigaChat model:",
    GIGACHAT_MODEL
  );

  console.log(
    "Bridge key configured:",
    !!BRIDGE_KEY
  );

  console.log(
    "GigaChat key configured:",
    !!GIGACHAT_KEY
  );

  console.log(
    "===================================="
  );
});
