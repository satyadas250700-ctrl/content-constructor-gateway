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

  // Небольшой запас, чтобы токен не успел протухнуть во время запроса
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
ТЫ СОЗДАЁШЬ КОНТЕНТ-ПЛАН НА 30 ДНЕЙ.

Задача:
создать практичный план публикаций на 30 дней для предпринимателя или эксперта.

ВАЖНО:
- Не пиши длинные тексты.
- Не пиши готовые сценарии.
- Не объясняй свои решения.
- Каждый день должен быть коротким и конкретным.
- Не повторяй одну и ту же тему.
- Чередуй форматы.
- Учитывай бизнес, целевую аудиторию, цель и стиль пользователя.

Используй форматы:
Reels
Пост
Карусель
Telegram-пост

Для каждого дня укажи:

День N — формат
Тема: конкретная тема публикации
Идея: что именно раскрыть в публикации
CTA: короткий призыв к действию

Обязательно создай все 30 дней.

СТРУКТУРА:

День 1 — Reels
Тема: ...
Идея: ...
CTA: ...

День 2 — Пост
Тема: ...
Идея: ...
CTA: ...

и так далее до Дня 30.

Ответ должен содержать ТОЛЬКО готовый контент-план.
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
- соответствовать выбранному стилю;
- не выглядеть как текст нейросети.

Структура:
1. Сильное начало.
2. Основная мысль.
3. Полезное содержание.
4. Эмоциональный или смысловой акцент.
5. Призыв к действию.

Не объясняй процесс создания.
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
первая фраза, которая мгновенно привлекает внимание.

СЦЕНАРИЙ:
короткий, динамичный и естественный текст для видео.

ФИНАЛ:
сильное завершение.

CTA:
призыв к действию.

Сценарий должен:
- удерживать внимание;
- соответствовать целевой аудитории;
- учитывать бизнес;
- соответствовать цели;
- соответствовать выбранному стилю;
- звучать естественно;
- не выглядеть как текст нейросети.

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
- соответствие целевой аудитории;
- соответствие бизнесу;
- соответствие цели;
- выбранный стиль;
- хороший финальный CTA.

Не объясняй процесс.
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

Для каждого слайда укажи:

Слайд 1:
Заголовок: ...
Текст: ...

Слайд 2:
Заголовок: ...
Текст: ...

И так далее.

Первый слайд должен цеплять.
Последующие должны логично раскрывать тему.
Последний слайд должен содержать CTA.

Не объясняй процесс.
Выдай только готовую карусель.
`;
  }

  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  return `
Создай качественный контент для предпринимателя или эксперта.

Учитывай:
- бизнес;
- целевую аудиторию;
- цель;
- тему;
- стиль.

Ответ должен быть практичным, естественным и готовым к публикации.
`;
}

// ============================================================
// BUILD PROMPT
// ============================================================

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle
}) {
  const isContentPlan =
    String(contentType || "")
      .toLowerCase()
      .includes("контент-план") ||
    String(contentType || "")
      .toLowerCase()
      .includes("контент план") ||
    String(contentType || "")
      .toLowerCase()
      .includes("30 дней") ||
    String(contentType || "")
      .toLowerCase()
      .includes("30дней");

  const instructions =
    getContentInstructions(contentType);

  // ==========================================================
  // SPECIAL COMPACT PROMPT FOR 30-DAY PLAN
  // ==========================================================

  if (isContentPlan) {
    return `
Ты — профессиональный контент-стратег и контент-маркетолог.

Тебе необходимо создать КОНТЕНТ-ПЛАН НА 30 ДНЕЙ.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

${instructions}

КРИТИЧЕСКИ ВАЖНО:

1. Создай ровно 30 дней.
2. Каждый день должен быть коротким.
3. Не создавай длинные тексты.
4. Не создавай сценарии.
5. Не повторяй темы.
6. Учитывай специфику бизнеса.
7. Учитывай целевую аудиторию.
8. Учитывай цель контента.
9. Чередуй форматы.
10. Каждый день должен содержать конкретную идею, а не абстрактную тему.
11. Не пиши вступления перед планом.
12. Не пиши заключение после плана.
13. Не используй Markdown-таблицу.
14. Ответ только на русском языке.

ФОРМАТ:

День 1 — Reels
Тема: ...
Идея: ...
CTA: ...

День 2 — Пост
Тема: ...
Идея: ...
CTA: ...

День 3 — Карусель
Тема: ...
Идея: ...
CTA: ...

Продолжай до Дня 30.

Верни ТОЛЬКО готовый контент-план.
`;
  }

  // ==========================================================
  // NORMAL CONTENT PROMPT
  // ==========================================================

  return `
Ты — профессиональный российский контент-маркетолог,
контент-стратег и сценарист.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать качественный контент
для предпринимателей и экспертов.

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
${reelsTopic || "Определи наиболее подходящую тему самостоятельно."}

Стиль:
${contentStyle}

ИНСТРУКЦИЯ:

${instructions}

ОБЩИЕ ТРЕБОВАНИЯ:

- Пиши на русском языке.
- Пиши естественно.
- Не используй канцелярит.
- Не используй фразы вроде «в современном мире».
- Не говори, что ты искусственный интеллект.
- Не объясняй процесс генерации.
- Не добавляй лишние комментарии.
- Учитывай специфику бизнеса.
- Учитывай целевую аудиторию.
- Учитывай выбранную цель.
- Учитывай выбранный стиль.
- Контент должен быть практически применим.
- Ответ должен быть готов к использованию.

Выдай только готовый контент.
`;
}

// ============================================================
// HEALTH CHECK
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
// TEST GENERATE
// ============================================================

app.get("/test-generate", async (req, res) => {
  try {
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

    res.json({
      ok: true,
      stage: "generation",
      status: response.status,
      response: response.data,
      reels_result: result
    });
  } catch (error) {
    console.error("TEST GENERATE ERROR");
    console.error("Message:", error.message);
    console.error("Status:", error.response?.status);
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
// MAIN GENERATE ENDPOINT
// ============================================================

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

  try {
    // --------------------------------------------------------
    // READ BODY
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

    console.log("Content-Type:", content_type);
    console.log(
      "Body keys:",
      Object.keys(req.body || {})
    );

    // --------------------------------------------------------
    // BRIDGE KEY CHECK
    // --------------------------------------------------------

    if (!bridge_key) {
      console.log("ERROR: bridge_key missing");

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
      console.log("ERROR: invalid bridge_key");

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
      normalizedContentType.includes("контент-план") ||
      normalizedContentType.includes("контент план") ||
      normalizedContentType.includes("30 дней") ||
      normalizedContentType.includes("30дней");

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

    // Для обычных форматов тема обязательна.
    // Для контент-плана тема не нужна.
    if (!isContentPlan && !reels_topic) {
      return res.status(400).json({
        ok: false,
        error: "reels_topic is required"
      });
    }

    // --------------------------------------------------------
    // LOG INPUT
    // --------------------------------------------------------

    console.log("Business info:", business_info);
    console.log(
      "Target audience:",
      target_audience
    );
    console.log("Content goal:", content_goal);
    console.log("Content style:", content_style);

    if (!isContentPlan) {
      console.log("Reels topic:", reels_topic);
    }

    // --------------------------------------------------------
    // GET TOKEN
    // --------------------------------------------------------

    console.log("Getting GigaChat token...");

    const token = await getAccessToken();

    console.log("OAuth token received");

    // --------------------------------------------------------
    // BUILD PROMPT
    // --------------------------------------------------------

    const prompt = buildPrompt({
      contentType: content_type,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal,
      reelsTopic: reels_topic,
      contentStyle: content_style
    });

    // --------------------------------------------------------
    // DIFFERENT SETTINGS
    // --------------------------------------------------------

    let temperature;
    let maxTokens;

    if (isContentPlan) {
      // ======================================================
      // OPTIMIZED 30-DAY PLAN
      // ======================================================

      temperature = 0.45;
      maxTokens = 1400;

      console.log(
        "Using OPTIMIZED 30-DAY PLAN settings"
      );
      console.log(
        "Temperature:",
        temperature
      );
      console.log(
        "Max tokens:",
        maxTokens
      );
    } else {
      // ======================================================
      // STANDARD CONTENT
      // ======================================================

      temperature = 0.75;
      maxTokens = 1800;

      console.log(
        "Using STANDARD CONTENT settings"
      );
    }

    // --------------------------------------------------------
    // GIGACHAT REQUEST
    // --------------------------------------------------------

    console.log("Sending request to GigaChat...");

    const response = await axios.post(
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

        // Важно:
        // Salebot имеет ограниченное время ожидания,
        // поэтому не делаем здесь огромный timeout.
        timeout: 12000,

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    // --------------------------------------------------------
    // GET RESULT
    // --------------------------------------------------------

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

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
      Date.now() - startedAt,
      "ms"
    );

    // --------------------------------------------------------
    // EMPTY RESULT CHECK
    // --------------------------------------------------------

    if (!result) {
      console.log(
        "ERROR: Empty GigaChat result"
      );

      return res.status(500).json({
        ok: false,
        error: "GigaChat returned empty result"
      });
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    console.log("GENERATION SUCCESS");
    console.log("====================================");

    return res.json({
      ok: true,
      reels_result: result
    });

  } catch (error) {
    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    console.error("");
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
// SERVER START
// ============================================================

app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log(
    `Content Constructor Gateway started on port ${PORT}`
  );
  console.log("====================================");
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
});
