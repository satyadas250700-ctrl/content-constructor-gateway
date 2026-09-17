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
// BUILD 15-DAY CONTENT PLAN PROMPT
// ============================================================

function buildPlanPartPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {
  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Создай часть контент-плана на 30 дней:
ДНИ ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

ЗАДАЧА:

Создай отдельную идею контента на каждый день.

Используй и чередуй форматы:
- Reels
- Пост
- Карусель
- Telegram-пост

ВАЖНЫЕ ТРЕБОВАНИЯ:

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть конкретным.
3. Темы должны соответствовать именно этому бизнесу.
4. Не используй абстрактные универсальные идеи.
5. Не повторяй одну и ту же тему.
6. Чередуй форматы.
7. Учитывай целевую аудиторию.
8. Учитывай цель контента.
9. Учитывай выбранный стиль.
10. Не пиши готовые длинные тексты.
11. Не пиши сценарии.
12. Не объясняй свои решения.
13. Не добавляй вступление или заключение.
14. Ответ только на русском языке.

ФОРМАТ КАЖДОГО ДНЯ:

День N — Формат
Тема: конкретная тема публикации
Идея: что именно показать или раскрыть

Пример структуры:

День 1 — Reels
Тема: ...
Идея: ...

День 2 — Пост
Тема: ...
Идея: ...

Продолжай до Дня ${endDay}.

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

        // Не увеличиваем этот timeout:
        // Salebot также имеет ограниченное время ожидания.
        timeout: 12000,

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
// GENERATE 30-DAY PLAN
// ============================================================

async function generateContentPlan({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {
  const startedAt = Date.now();

  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "STARTING PARALLEL 30-DAY PLAN"
  );
  console.log(
    "===================================="
  );

  // ----------------------------------------------------------
  // BUILD TWO PROMPTS
  // ----------------------------------------------------------

  const prompt1 =
    buildPlanPartPrompt({
      startDay: 1,
      endDay: 15,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle
    });

  const prompt2 =
    buildPlanPartPrompt({
      startDay: 16,
      endDay: 30,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle
    });

  // ----------------------------------------------------------
  // START BOTH REQUESTS AT THE SAME TIME
  // ----------------------------------------------------------

  console.log(
    "Starting days 1–15 and 16–30 in parallel..."
  );

  const [part1, part2] =
    await Promise.all([
      generateWithGigaChat({
        token,
        prompt: prompt1,
        temperature: 0.45,
        maxTokens: 750,
        label: "DAYS 1-15"
      }),

      generateWithGigaChat({
        token,
        prompt: prompt2,
        temperature: 0.45,
        maxTokens: 750,
        label: "DAYS 16-30"
      })
    ]);

  // ----------------------------------------------------------
  // COMBINE
  // ----------------------------------------------------------

  const combinedResult =
    `${part1.result.trim()}\n\n${part2.result.trim()}`;

  const totalTime =
    Date.now() - startedAt;

  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "30-DAY PLAN SUCCESS"
  );
  console.log(
    "===================================="
  );

  console.log(
    "Days 1-15 time:",
    part1.elapsed,
    "ms"
  );

  console.log(
    "Days 16-30 time:",
    part2.elapsed,
    "ms"
  );

  console.log(
    "Combined result length:",
    combinedResult.length
  );

  console.log(
    "Total parallel time:",
    totalTime,
    "ms"
  );

  console.log(
    "===================================="
  );

  return combinedResult;
}

// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {
  try {
    const token =
      await getAccessToken();

    res.json({
      ok: true,
      stage: "auth",
      token_received: !!token
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
          model: GIGACHAT_MODEL,

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
          timeout: 12000,

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
      stage: "generation",
      status: response.status,
      time_ms:
        Date.now() - startedAt,
      response: response.data,
      reels_result: result
    });

  } catch (error) {

    console.error(
      "TEST GENERATE ERROR"
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

    res.status(500).json({
      ok: false,
      stage: "generation",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  }
});

// ============================================================
// TEST 15-DAY PLAN
// ============================================================

app.get("/test-plan", async (req, res) => {
  const startedAt = Date.now();

  try {

    const token =
      await getAccessToken();

    const prompt =
      buildPlanPartPrompt({
        startDay: 1,
        endDay: 15,

        businessInfo:
          "эксперт или предприниматель, который продаёт свои услуги или продукты",

        targetAudience:
          "потенциальные клиенты этого бизнеса",

        contentGoal:
          "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

        contentStyle:
          "легко, уверенно, современно"
      });

    const result =
      await generateWithGigaChat({
        token,
        prompt,

        temperature: 0.4,

        maxTokens: 750,

        label: "TEST 15-DAY PLAN"
      });

    res.json({
      ok: true,
      test: "15-day-plan",
      status: result.status,
      time_ms:
        Date.now() - startedAt,
      result_length:
        result.result.length,
      model: GIGACHAT_MODEL,
      reels_result: result.result
    });

  } catch (error) {

    res.status(500).json({
      ok: false,
      test: "15-day-plan",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  }
});

// ============================================================
// MAIN GENERATE
// ============================================================

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

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
        error:
          "bridge_key is required"
      });
    }

    if (!BRIDGE_KEY) {

      console.log(
        "ERROR: BRIDGE_KEY not configured"
      );

      return res.status(500).json({
        ok: false,
        error:
          "BRIDGE_KEY is not configured"
      });
    }

    if (bridge_key !== BRIDGE_KEY) {

      console.log(
        "ERROR: invalid bridge_key"
      );

      return res.status(401).json({
        ok: false,
        error:
          "Invalid bridge_key"
      });
    }

    // --------------------------------------------------------
    // CONTENT PLAN?
    // --------------------------------------------------------

    const planRequest =
      isContentPlan(content_type);

    console.log(
      "Content plan:",
      planRequest
    );

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

    if (!planRequest && !reels_topic) {

      return res.status(400).json({
        ok: false,
        error:
          "reels_topic is required"
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

    if (!planRequest) {

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

    // ========================================================
    // CONTENT PLAN
    // ========================================================

    if (planRequest) {

      const result =
        await generateContentPlan({
          token,

          businessInfo:
            business_info,

          targetAudience:
            target_audience,

          contentGoal:
            content_goal,

          contentStyle:
            content_style
        });

      const totalTime =
        Date.now() - startedAt;

      console.log(
        "Final total request time:",
        totalTime,
        "ms"
      );

      console.log(
        "Returning 30-day plan to Salebot"
      );

      return res.json({
        ok: true,
        reels_result: result
      });
    }

    // ========================================================
    // STANDARD CONTENT
    // ========================================================

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

    console.log(
      "Using standard content generation"
    );

    const generated =
      await generateWithGigaChat({
        token,

        prompt,

        temperature: 0.75,

        maxTokens: 1800,

        label: "STANDARD CONTENT"
      });

    const totalTime =
      Date.now() - startedAt;

    console.log(
      "Total request time:",
      totalTime,
      "ms"
    );

    console.log(
      "GENERATION SUCCESS"
    );

    console.log(
      "===================================="
    );

    return res.json({
      ok: true,
      reels_result:
        generated.result
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
      status:
        error.response?.status,
      response:
        error.response?.data
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
      "Endpoint not found"
  });
});

// ============================================================
// SERVER START
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
