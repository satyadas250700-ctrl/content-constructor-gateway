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
// GENERATION LOCK
// ============================================================

let generationInProgress = false;

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
// CONTENT TYPE HELPERS
// ============================================================

function isContentPlan(contentType) {
  const type =
    String(contentType || "").toLowerCase();

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
  const type =
    String(contentType || "").toLowerCase();

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

Учитывай:

бизнес,
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
// BUILD 5-DAY CONTENT PLAN PROMPT
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

Используй её как контекст.

Не повторяй темы и идеи.
Продолжай общую логику контент-воронки.
`
    : `
Это начало контент-плана.

Построй первые дни так, чтобы человек постепенно
переходил от внимания к интересу и доверию.
`;

  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Создай часть единого контент-плана на 30 дней.

ТОЛЬКО ДНИ ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

${contextBlock}

ЛОГИКА ПЛАНА:

Постепенно веди аудиторию по пути:

внимание → интерес → экспертность → доверие → желание → действие.

Используй и чередуй форматы:

- Reels
- Пост
- Карусель
- Telegram-пост

ТРЕБОВАНИЯ:

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть конкретным.
3. Темы должны соответствовать именно этому бизнесу.
4. Не используй абстрактные универсальные идеи.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай целевую аудиторию.
8. Учитывай цель контента.
9. Учитывай стиль.
10. Не пиши длинные готовые тексты.
11. Не пиши полный сценарий.
12. Не объясняй свои решения.
13. Не добавляй вступление или заключение.
14. Ответ только на русском языке.

ФОРМАТ:

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

        // Оставляем запас до таймаута Salebot.
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
// VALIDATE PLAN DATA
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
// GENERATE ONE 5-DAY CHUNK
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

  return await generateWithGigaChat({
    token,
    prompt,

    temperature: 0.35,

    maxTokens: 550,

    label
  });
}

// ============================================================
// GENERIC PLAN CHUNK HANDLER
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

  // Ограничиваем размер предыдущего контекста.
  const safePreviousPlan =
    String(previous_plan || "").slice(-18000);

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

      // Salebot сохраняет именно это поле.
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
// TEST BASIC GENERATION
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
      response.data?.choices?.[0]?.message?.content ||
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
});

// ============================================================
// TEST 1-5 PLAN
// ============================================================

app.get("/test-plan-1-5", async (req, res) => {
  const startedAt = Date.now();

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

// DAYS 1-5

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      1,
      5
    );
  }
);

// DAYS 6-10

app.post(
  "/generate-plan-6-10",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      6,
      10
    );
  }
);

// DAYS 11-15

app.post(
  "/generate-plan-11-15",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      11,
      15
    );
  }
);

// DAYS 16-20

app.post(
  "/generate-plan-16-20",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      16,
      20
    );
  }
);

// DAYS 21-25

app.post(
  "/generate-plan-21-25",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      21,
      25
    );
  }
);

// DAYS 26-30

app.post(
  "/generate-plan-26-30",
  async (req, res) => {
    return handlePlanChunk(
      req,
      res,
      26,
      30
    );
  }
);

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

    // --------------------------------------------------------
    // REQUIRED FIELDS
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // CONTENT PLAN
    // --------------------------------------------------------

    if (isContentPlan(content_type)) {
      return res.status(400).json({
        ok: false,

        error:
          "Для контент-плана используй отдельные endpoints: /generate-plan-1-5, /generate-plan-6-10, /generate-plan-11-15, /generate-plan-16-20, /generate-plan-21-25, /generate-plan-26-30"
      });
    }

    // --------------------------------------------------------
    // NORMAL CONTENT
    // --------------------------------------------------------

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

    return res.json({
      ok: true,

      content_type:
        content_type,

      status:
        result.status,

      time_ms:
        Date.now() - startedAt,

      result_length:
        result.result.length,

      reels_result:
        result.result
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
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
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
});

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

  console.log("");

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

  console.log("====================================");
});
