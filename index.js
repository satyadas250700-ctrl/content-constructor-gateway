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

// GigaChat certificates can cause problems in some environments.
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

  // Reuse cached token when possible.
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
// CONTENT DNA
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

  return `
Ты — профессиональный контент-стратег, маркетолог, сценарист коротких видео и редактор социальных сетей.

Ты работаешь внутри продукта «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать контент, который предприниматель или эксперт может практически сразу использовать в социальных сетях.

Главный принцип:

НЕ пиши шаблонный текст ради текста.

Сначала мысленно определи:
1. кто говорит;
2. кому он говорит;
3. какую проблему или желание аудитории затрагиваем;
4. зачем создаётся этот контент;
5. какой угол подачи лучше всего сработает;
6. какое действие должен совершить зритель после просмотра.

Используй предоставленные данные как основу.

==============================
ДАННЫЕ БИЗНЕСА
==============================

Тип контента:
${content_type}

Бизнес:
${business_info}

Целевая аудитория:
${target_audience}

Цель контента:
${content_goal}

Тема:
${reels_topic}

Стиль:
${content_style}

==============================
ОСНОВНЫЕ ПРАВИЛА
==============================

1. Пиши на естественном современном русском языке.

2. Не используй канцелярит.

3. Не используй фразы вроде:
«В современном мире»
«Важно понимать»
«Стоит отметить»
«Сегодня я расскажу вам»
«Давайте разберёмся»
«Как известно»
и другие очевидные шаблоны.

4. Не начинай ролик с длинного вступления.

5. Первые секунды должны сразу давать причину продолжить просмотр.

6. Учитывай конкретную целевую аудиторию.

7. Не придумывай факты о бизнесе, которых нет в исходных данных.

8. Не обещай невозможных результатов.

9. Если цель — продажи, не превращай ролик в навязчивую рекламу.

10. Если цель — экспертность, показывай её через конкретную мысль, пример, объяснение или наблюдение, а не через заявление «я эксперт».

11. Если стиль провокационный — допускается резкий, смелый и цепляющий заход, но без бессмысленного оскорбления аудитории.

12. Каждый элемент сценария должен выполнять функцию.

==============================
ДНК REELS
==============================

Для Reels используй структуру:

1. ХУК

Одна сильная первая фраза.

Она должна:
- вызвать любопытство;
- обозначить проблему;
- удивить;
- бросить вызов распространённому мнению;
или
- создать эмоциональное напряжение.

2. ОСНОВНАЯ ЧАСТЬ

Развивай одну главную мысль.

Не пытайся рассказать всё сразу.

Используй конкретику, примеры, контраст или короткую историю.

3. ФИНАЛ

Сделай вывод, который логично завершает мысль.

4. CTA

Призыв к действию должен соответствовать цели контента.

CTA не должен выглядеть как навязчивая реклама.

5. ИДЕЯ СЪЁМКИ

Дай простую практическую рекомендацию, как снять ролик.

==============================
ФОРМАТ ОТВЕТА
==============================

Верни ТОЛЬКО готовый контент.

Используй следующую структуру:

🔥 ГОТОВЫЙ СЦЕНАРИЙ REELS

🎯 ХУК:
[сильная первая фраза]

🎬 СЦЕНАРИЙ:

Кадр 1:
[что происходит в кадре]

Текст:
[что говорит автор]

Кадр 2:
[что происходит в кадре]

Текст:
[что говорит автор]

Кадр 3:
[что происходит в кадре]

Текст:
[что говорит автор]

Кадр 4:
[что происходит в кадре]

Текст:
[что говорит автор]

🎯 ФИНАЛ:
[завершающая мысль]

📢 CTA:
[призыв к действию]

💡 ИДЕЯ ДЛЯ СЪЁМКИ:
[как просто снять ролик]

==============================
ВАЖНО
==============================

Не добавляй никаких пояснений от себя.

Не пиши:
«Вот ваш сценарий»
«Надеюсь, вам понравится»
«При необходимости могу изменить»
и подобные фразы.

Сразу выдавай готовый результат.

Контент должен ощущаться так, будто его подготовил сильный российский контент-маркетолог, который понимает конкретный бизнес и его аудиторию.
`.trim();
}

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
    console.log("Sending test request to GigaChat...");

    const startTime = Date.now();

    const response = await http.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,
        messages: [
          {
            role: "user",
            content: "Ответь одним словом: Да",
          },
        ],
        temperature: 0.2,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const elapsed = Date.now() - startTime;

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
      response.data?.choices?.[0]?.message?.content ||
      "";

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
// MAIN GENERATE ENDPOINT
// ============================================================

app.post("/generate", async (req, res) => {
  const requestStartTime = Date.now();

  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
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
    // GET DATA
    // ========================================================

    const bridge_key =
      cleanText(req.body?.bridge_key);

    const content_type =
      cleanText(req.body?.content_type);

    const business_info =
      cleanText(req.body?.business_info);

    const target_audience =
      cleanText(req.body?.target_audience);

    const content_goal =
      cleanText(req.body?.content_goal);

    const reels_topic =
      cleanText(req.body?.reels_topic);

    const content_style =
      cleanText(req.body?.content_style);

    // ========================================================
    // LOG VARIABLES
    // ========================================================

    console.log("====================================");
    console.log("SALEBOT VARIABLES");
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
    // BRIDGE KEY VALIDATION
    // ========================================================

    if (!BRIDGE_KEY) {
      console.error(
        "BRIDGE_KEY is not configured"
      );

      return res.status(500).json({
        ok: false,
        error: "BRIDGE_KEY is not configured",
      });
    }

    if (!bridge_key) {
      console.error(
        "Bridge key was not provided"
      );

      return res.status(401).json({
        ok: false,
        error: "Bridge key is missing",
      });
    }

    if (bridge_key !== BRIDGE_KEY) {
      console.error(
        "Bridge key validation failed"
      );

      return res.status(401).json({
        ok: false,
        error: "Invalid bridge_key",
      });
    }

    console.log("Bridge key: VALID");

    // ========================================================
    // REQUIRED FIELDS
    // ========================================================

    const missingFields = [];

    if (!content_type) {
      missingFields.push("content_type");
    }

    if (!business_info) {
      missingFields.push("business_info");
    }

    if (!target_audience) {
      missingFields.push("target_audience");
    }

    if (!content_goal) {
      missingFields.push("content_goal");
    }

    if (!reels_topic) {
      missingFields.push("reels_topic");
    }

    if (!content_style) {
      missingFields.push("content_style");
    }

    if (missingFields.length > 0) {
      console.error(
        "Missing required fields:",
        missingFields
      );

      return res.status(400).json({
        ok: false,
        error: "Missing required fields",
        fields: missingFields,
      });
    }

    // ========================================================
    // GET GIGACHAT TOKEN
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );

    const token = await getAccessToken();

    console.log(
      "Access token obtained"
    );

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

    console.log(
      "Prompt length:",
      prompt.length,
      "characters"
    );

    // ========================================================
    // GENERATION
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );

    const generationStartTime =
      Date.now();

    const response = await http.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,

        messages: [
          {
            role: "system",
            content:
              "Ты работаешь как профессиональный контент-стратег и сценарист внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».",
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.75,

        max_tokens: 1800,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
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
    // EXTRACT RESULT
    // ========================================================

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

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

    // IMPORTANT:
    // Salebot expects this exact JSON field:
    // reels_result

    return res.json({
      ok: true,
      reels_result: result,
    });

  } catch (error) {
    console.error("====================================");
    console.error("GENERATE ERROR");
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
    error: "Endpoint not found",
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
