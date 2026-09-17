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
// PLAN GENERATION LOCK
// ============================================================

let generationInProgress = false;

// ============================================================
// GET GIGACHAT TOKEN
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

  const rqUid = crypto.randomUUID();

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      httpsAgent,

      timeout: 7000,

      headers: {
        Authorization:
          `Basic ${GIGACHAT_KEY}`,

        RqUID: rqUid,

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
// CONTENT TYPE CHECK
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

function getContentInstructions(contentType) {
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
// BUILD FAST 15-DAY PLAN PROMPT
// ============================================================

function buildPlanPartPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan = ""
}) {

  const previousContext =
    previousPlan
      ? `
ПЕРВЫЕ 15 ДНЕЙ УЖЕ СОЗДАНЫ.
Не повторяй их темы и форматы.

ПРЕДЫДУЩИЙ ПЛАН:
${previousPlan}
`
      : "";

  return `
Ты — сильный контент-стратег
для предпринимателей и экспертов.

Создай дни ${startDay}–${endDay}
единого контент-плана на 30 дней.

БИЗНЕС:
${businessInfo}

ЦЕЛЕВАЯ АУДИТОРИЯ:
${targetAudience}

ЦЕЛЬ:
${contentGoal}

СТИЛЬ:
${contentStyle}

${previousContext}

ЛОГИКА КОНТЕНТА:

Двигай аудиторию по этапам:
внимание → интерес → экспертность →
доверие → желание → действие.

Чередуй форматы:
Reels → Пост → Карусель → Telegram-пост.

ВАЖНО:

- Создай ВСЕ дни от ${startDay} до ${endDay}.
- Не повторяй темы.
- Не повторяй форматы подряд слишком часто.
- Каждая идея должна быть конкретной.
- Идеи должны подходить именно этому бизнесу.
- Не пиши готовые длинные тексты.
- Не пиши сценарии.
- Не объясняй решения.
- Только русский язык.

ФОРМАТ:

День 1 — Reels
Тема: ...
Идея: ...
Задача: ...
CTA: ...

День 2 — Пост
Тема: ...
Идея: ...
Задача: ...
CTA: ...

Продолжай до Дня ${endDay}.

ВАЖНО:
Пиши максимально кратко.
Каждый пункт — 1 короткое предложение.

Верни только план.
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
  label,
  timeout = 9000
}) {

  const startedAt = Date.now();

  console.log("");
  console.log(
    `[${label}] Sending request to GigaChat...`
  );

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
                "Ты профессиональный контент-маркетолог и контент-стратег. Отвечай кратко, конкретно и только на русском языке."
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

          timeout,

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
        ?.choices
        ?.[0]
        ?.message
        ?.content || "";

    const elapsed =
      Date.now() - startedAt;

    console.log(
      `[${label}] HTTP status:`,
      response.status
    );

    console.log(
      `[${label}] Result length:`,
      result.length
    );

    console.log(
      `[${label}] Time:`,
      elapsed,
      "ms"
    );

    if (!result.trim()) {
      throw new Error(
        `${label}: GigaChat returned empty result`
      );
    }

    return {
      result: result.trim(),
      elapsed,
      status: response.status
    };

  } catch (error) {

    const elapsed =
      Date.now() - startedAt;

    console.error("");
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
// GENERATE FIRST 15 DAYS
// ============================================================

async function generateFirst15Days({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {

  const prompt =
    buildPlanPartPrompt({
      startDay: 1,
      endDay: 15,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle
    });

  return await generateWithGigaChat({
    token,
    prompt,

    // Низкая температура = быстрее
    // и меньше лишнего текста.
    temperature: 0.3,

    // Критически важно для Salebot:
    // короткий ответ.
    maxTokens: 650,

    label: "FIRST 15 DAYS",

    // Оставляем запас времени
    // до таймаута Salebot.
    timeout: 9000
  });
}

// ============================================================
// GENERATE NEXT 15 DAYS
// ============================================================

async function generateNext15Days({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {

  const prompt =
    buildPlanPartPrompt({
      startDay: 16,
      endDay: 30,

      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle,

      previousPlan
    });

  return await generateWithGigaChat({
    token,
    prompt,

    temperature: 0.3,

    maxTokens: 650,

    label: "NEXT 15 DAYS",

    timeout: 9000
  });
}

// ============================================================
// TEST AUTH
// ============================================================

app.get(
  "/test-auth",
  async (req, res) => {

    const startedAt =
      Date.now();

    try {

      const token =
        await getAccessToken();

      return res.json({
        ok: true,
        stage: "auth",
        token_received: !!token,
        time_ms:
          Date.now() - startedAt
      });

    } catch (error) {

      console.error(
        "AUTH ERROR:",
        error.message
      );

      return res.status(500).json({
        ok: false,
        stage: "auth",
        error: error.message,
        status:
          error.response?.status,
        response:
          error.response?.data
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
          ?.choices
          ?.[0]
          ?.message
          ?.content || "";

      return res.json({
        ok: true,
        stage: "generation",
        status: response.status,

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

      return res.status(500).json({
        ok: false,
        stage: "generation",
        message: error.message,
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
// TEST FIRST 15 DAYS
// ============================================================

app.get(
  "/test-plan",
  async (req, res) => {

    const startedAt =
      Date.now();

    if (generationInProgress) {

      return res.status(429).json({
        ok: false,
        error:
          "Plan generation already in progress. Try again later."
      });
    }

    generationInProgress = true;

    try {

      console.log("");
      console.log(
        "===================================="
      );

      console.log(
        "TEST: FIRST 15 DAYS"
      );

      console.log(
        "===================================="
      );

      const token =
        await getAccessToken();

      const result =
        await generateFirst15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно"
        });

      return res.json({
        ok: true,

        test:
          "first-15-day-plan",

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

      return res.status(500).json({
        ok: false,

        test:
          "first-15-day-plan",

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
// TEST FULL SEQUENTIAL PLAN
// ============================================================

app.get(
  "/test-full-plan",
  async (req, res) => {

    const startedAt =
      Date.now();

    if (generationInProgress) {

      return res.status(429).json({
        ok: false,
        error:
          "Plan generation already in progress. Try again later."
      });
    }

    generationInProgress = true;

    try {

      console.log("");
      console.log(
        "===================================="
      );

      console.log(
        "TEST: FULL SEQUENTIAL PLAN"
      );

      console.log(
        "===================================="
      );

      const token =
        await getAccessToken();

      // --------------------------------------------------------
      // FIRST 15
      // --------------------------------------------------------

      const first =
        await generateFirst15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно"
        });

      console.log(
        "First 15 generated."
      );

      // --------------------------------------------------------
      // NEXT 15
      // --------------------------------------------------------

      const second =
        await generateNext15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно",

          previousPlan:
            first.result
        });

      console.log(
        "Next 15 generated."
      );

      const combined =
        `${first.result}\n\n${second.result}`;

      return res.json({

        ok: true,

        test:
          "full-sequential-plan",

        time_ms:
          Date.now() - startedAt,

        first_15_time_ms:
          first.elapsed,

        next_15_time_ms:
          second.elapsed,

        first_15_length:
          first.result.length,

        next_15_length:
          second.result.length,

        combined_length:
          combined.length,

        reels_result:
          combined
      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        test:
          "full-sequential-plan",

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
// MAIN GENERATE
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
        Object.keys(
          req.body || {}
        )
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
      // CONTENT PLAN?
      // --------------------------------------------------------

      const planRequest =
        isContentPlan(
          content_type
        );

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

      if (
        !planRequest &&
        !reels_topic
      ) {

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
      // FIRST 15 DAYS OF CONTENT PLAN
      // ========================================================

      if (planRequest) {

        if (generationInProgress) {

          console.log(
            "PLAN GENERATION ALREADY IN PROGRESS"
          );

          return res.status(429).json({
            ok: false,
            error:
              "Another content plan is currently being generated. Please try again shortly."
          });
        }

        generationInProgress = true;

        try {

          console.log(
            "Generating FIRST 15 DAYS only..."
          );

          const result =
            await generateFirst15Days({

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
            "First 15 days generated."
          );

          console.log(
            "Total request time:",
            totalTime,
            "ms"
          );

          console.log(
            "Returning first 15 days to Salebot."
          );

          return res.json({

            ok: true,

            reels_result:
              result.result

          });

        } finally {

          generationInProgress = false;
        }
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

          temperature:
            0.75,

          maxTokens:
            1800,

          label:
            "STANDARD CONTENT",

          timeout:
            11000
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

        error:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data
      });
    }
  }
);

// ============================================================
// GENERATE NEXT 15 DAYS
// ============================================================

app.post(
  "/generate-next-15",
  async (req, res) => {

    const startedAt =
      Date.now();

    console.log("");
    console.log(
      "===================================="
    );

    console.log(
      "NEXT 15 DAYS REQUEST RECEIVED"
    );

    console.log(
      "===================================="
    );

    try {

      const {
        bridge_key,
        business_info,
        target_audience,
        content_goal,
        content_style,
        previous_plan
      } = req.body || {};

      console.log(
        "Body keys:",
        Object.keys(
          req.body || {}
        )
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
      // REQUIRED DATA
      // --------------------------------------------------------

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

      if (!previous_plan) {

        return res.status(400).json({
          ok: false,
          error:
            "previous_plan is required"
        });
      }

      // --------------------------------------------------------
      // PREVENT DUPLICATE SIMULTANEOUS GENERATION
      // --------------------------------------------------------

      if (generationInProgress) {

        console.log(
          "PLAN GENERATION ALREADY IN PROGRESS"
        );

        return res.status(429).json({
          ok: false,
          error:
            "Another content plan is currently being generated. Please try again shortly."
        });
      }

      generationInProgress = true;

      try {

        // ------------------------------------------------------
        // TOKEN
        // ------------------------------------------------------

        console.log(
          "Getting GigaChat token..."
        );

        const token =
          await getAccessToken();

        console.log(
          "OAuth token received"
        );

        // ------------------------------------------------------
        // GENERATE DAYS 16-30
        // ------------------------------------------------------

        console.log(
          "Generating DAYS 16-30..."
        );

        const result =
          await generateNext15Days({

            token,

            businessInfo:
              business_info,

            targetAudience:
              target_audience,

            contentGoal:
              content_goal,

            contentStyle:
              content_style,

            previousPlan:
              previous_plan
          });

        const totalTime =
          Date.now() - startedAt;

        console.log(
          "Days 16-30 generated."
        );

        console.log(
          "Total request time:",
          totalTime,
          "ms"
        );

        console.log(
          "Returning next 15 days to Salebot."
        );

        return res.json({

          ok: true,

          reels_result:
            result.result

        });

      } finally {

        generationInProgress = false;
      }

    } catch (error) {

      console.error("");
      console.error(
        "===================================="
      );

      console.error(
        "NEXT 15 DAYS ERROR"
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

        error:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data
      });
    }
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

      status:
        "running",

      model:
        GIGACHAT_MODEL,

      endpoints: {

        health:
          "/health",

        testAuth:
          "/test-auth",

        testGenerate:
          "/test-generate",

        testPlan:
          "/test-plan",

        testFullPlan:
          "/test-full-plan",

        generate:
          "POST /generate",

        generateNext15:
          "POST /generate-next-15"
      }

    });
  }
);

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

      status:
        "healthy",

      model:
        GIGACHAT_MODEL,

      bridge_key_configured:
        !!BRIDGE_KEY,

      gigachat_key_configured:
        !!GIGACHAT_KEY,

      generation_in_progress:
        generationInProgress

    });
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
        "Endpoint not found"

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
      "Plan architecture:",
      "15 + 15 sequential"
    );

    console.log(
      "Plan max tokens:",
      650
    );

    console.log(
      "Plan timeout:",
      "9000 ms"
    );

    console.log(
      "===================================="
    );
  }
);
