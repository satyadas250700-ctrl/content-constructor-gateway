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

// Не разрешаем одновременно запускать несколько
// тяжёлых генераций контент-плана на одном Render instance.

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
- соответствовать выбранному стилю;
- быть связанным с конкретным предложением, если оно указано.

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

Если указано конкретное предложение,
органично учитывай его в содержании.

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
- хороший CTA;
- если указано конкретное предложение, учитывай его.

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

Если указано конкретное предложение,
органично учитывай его.

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
- конкретное предложение;
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
  offer,
  contentGoal,
  reelsTopic,
  contentStyle
}) {
  const instructions =
    getContentInstructions(contentType);

  const offerText =
    offer && String(offer).trim()
      ? offer
      : "Конкретное предложение не указано.";

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

КОНКРЕТНОЕ ПРЕДЛОЖЕНИЕ:
${offerText}

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
- Учитывай конкретное предложение.
- Учитывай цель.
- Учитывай стиль.
- Контент должен быть практически применим.
- Не придумывай факты о бизнесе, которых клиент не сообщал.
- Не выдавай непроверенные обвинения в адрес конкурентов за факты.
- Не используй вымышленные цены, акции, гарантии или результаты, если клиент их не указал.

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
  offer,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  const offerText =
    offer && String(offer).trim()
      ? offer
      : "Конкретное предложение не указано.";

  const previousPlanText =
    previousPlan && String(previousPlan).trim()
      ? String(previousPlan).slice(-18000)
      : "Предыдущих дней нет. Это начало контент-плана.";

  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Сейчас нужно создать ТОЛЬКО дни
${startDay}–${endDay}
из общего контент-плана на 30 дней.

==================================================
ДАННЫЕ КЛИЕНТА
==================================================

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Конкретное предложение:
${offerText}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

==================================================
УЖЕ СОЗДАННЫЕ ДНИ
==================================================

${previousPlanText}

==================================================
ЗАДАЧА
==================================================

Продолжи существующий контент-план.

Создай ВСЕ дни:
${startDay}, ${startDay + 1}, ${startDay + 2}, ${startDay + 3}, ${endDay}.

Не начинай новый план с нуля.

Учитывай темы и форматы уже созданных дней.

Не повторяй уже использованные темы.

Постепенно веди аудиторию по логике:

внимание
→ интерес
→ экспертность
→ доверие
→ желание
→ действие.

При этом не обязательно жёстко соблюдать одну стадию
на каждый отдельный день — контент должен выглядеть
естественно и разнообразно.

==================================================
ФОРМАТЫ
==================================================

Используй и чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

Не используй один и тот же формат подряд,
если для этого нет явной причины.

==================================================
ТРЕБОВАНИЯ К КАЖДОМУ ДНЮ
==================================================

Каждый день должен содержать:

День N — Формат
Тема: конкретная тема публикации
Идея: что именно показать или раскрыть
Задача: какую реакцию или действие должна вызвать публикация
CTA: конкретный призыв к действию

==================================================
ВАЖНЫЕ ТРЕБОВАНИЯ
==================================================

1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть конкретным.
3. Темы должны соответствовать именно этому бизнесу.
4. Учитывай конкретное предложение.
5. Не используй абстрактные универсальные идеи.
6. Не повторяй одну и ту же тему.
7. Чередуй форматы.
8. Учитывай целевую аудиторию.
9. Учитывай цель контента.
10. Учитывай выбранный стиль.
11. Не пиши готовые длинные тексты.
12. Не пиши полноценные сценарии.
13. Не объясняй свои решения.
14. Не добавляй вступление.
15. Не добавляй заключение.
16. Ответ только на русском языке.
17. Не придумывай факты о бизнесе.
18. Не придумывай отзывы, кейсы, цифры, цены или результаты.
19. Не делай неподтверждённых обвинений в адрес конкурентов.
20. Не используй placeholders вроде:
   [название],
   [продукт],
   [месяц],
   [город],
   если конкретные данные неизвестны.
21. CTA должен быть реалистичным для данного бизнеса.
22. CTA должны разнообразиться.
23. Продолжай логику предыдущих дней.

==================================================
ПРИМЕР СТРУКТУРЫ
==================================================

День 1 — Reels
Тема: конкретная тема
Идея: конкретная идея
Задача: конкретная задача
CTA: конкретный призыв

День 2 — Пост
Тема: конкретная тема
Идея: конкретная идея
Задача: конкретная задача
CTA: конкретный призыв

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

        // Важно для совместимости
        // с лимитом ожидания Salebot.
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
// GENERATE PLAN CHUNK
// ============================================================

async function generatePlanChunk({
  token,
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  const prompt =
    buildPlanChunkPrompt({
      startDay,
      endDay,
      businessInfo,
      targetAudience,
      offer,
      contentGoal,
      contentStyle,
      previousPlan
    });

  return await generateWithGigaChat({
    token,
    prompt,
    temperature: 0.35,
    maxTokens: 550,
    label:
      `DAYS ${startDay}-${endDay}`
  });
}

// ============================================================
// VALIDATE PLAN DATA
// ============================================================

function validatePlanData({
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {
  if (!businessInfo) {
    return "business_info is required";
  }

  if (!targetAudience) {
    return "target_audience is required";
  }

  if (!contentGoal) {
    return "content_goal is required";
  }

  if (!contentStyle) {
    return "content_style is required";
  }

  return null;
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
  const startedAt = Date.now();

  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    `PLAN REQUEST ${startDay}-${endDay}`
  );
  console.log(
    "===================================="
  );

  if (generationInProgress) {
    console.log(
      "PLAN GENERATION ALREADY IN PROGRESS"
    );

    return res.status(429).json({
      ok: false,
      error:
        "Another content plan generation is already in progress. Please try again shortly.",
      start_day: startDay,
      end_day: endDay
    });
  }

  generationInProgress = true;

  try {
    const {
      bridge_key,
      business_info,
      target_audience,
      offer,
      content_goal,
      content_style,
      previous_plan
    } = req.body || {};

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
    // REQUIRED DATA
    // --------------------------------------------------------

    const validationError =
      validatePlanData({
        businessInfo:
          business_info,
        targetAudience:
          target_audience,
        contentGoal:
          content_goal,
        contentStyle:
          content_style
      });

    if (validationError) {
      return res.status(400).json({
        ok: false,
        error: validationError
      });
    }

    // --------------------------------------------------------
    // LOG
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
      "Offer:",
      offer || "(not provided)"
    );

    console.log(
      "Content goal:",
      content_goal
    );

    console.log(
      "Content style:",
      content_style
    );

    console.log(
      "Previous plan length:",
      previous_plan
        ? String(previous_plan).length
        : 0
    );

    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    const token =
      await getAccessToken();

    // --------------------------------------------------------
    // GENERATE
    // --------------------------------------------------------

    const result =
      await generatePlanChunk({
        token,

        startDay,
        endDay,

        businessInfo:
          business_info,

        targetAudience:
          target_audience,

        offer,

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
      `PLAN ${startDay}-${endDay} SUCCESS`
    );

    console.log(
      "Total time:",
      totalTime,
      "ms"
    );

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
        totalTime,

      result_length:
        result.result.length,

      reels_result:
        result.result
    });

  } catch (error) {
    console.error("");

    console.error(
      "===================================="
    );

    console.error(
      `PLAN ${startDay}-${endDay} ERROR`
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
      "===================================="
    );

    return res.status(500).json({
      ok: false,

      start_day:
        startDay,

      end_day:
        endDay,

      error:
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
// ROOT
// ============================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service:
      "content-constructor-gateway",
    model:
      GIGACHAT_MODEL,
    status:
      "online"
  });
});

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

    bridge_key_configured:
      !!BRIDGE_KEY,

    gigachat_key_configured:
      !!GIGACHAT_KEY,

    generation_in_progress:
      generationInProgress
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
        Date.now() - startedAt,

      response:
        response.data,

      reels_result:
        result
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
// TEST PLAN 1-5
// ============================================================

app.get("/test-plan-1-5", async (req, res) => {
  const startedAt = Date.now();

  try {
    const token =
      await getAccessToken();

    const prompt =
      buildPlanChunkPrompt({
        startDay: 1,
        endDay: 5,

        businessInfo:
          "эксперт или предприниматель, который продаёт свои услуги или продукты",

        targetAudience:
          "потенциальные клиенты этого бизнеса",

        offer:
          "конкретная услуга или продукт бизнеса",

        contentGoal:
          "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

        contentStyle:
          "легко, уверенно, современно",

        previousPlan:
          ""
      });

    const result =
      await generateWithGigaChat({
        token,

        prompt,

        temperature: 0.35,

        maxTokens: 550,

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
  }
});

// ============================================================
// PLAN 1-5
// ============================================================

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      1,
      5
    );
  }
);

// ============================================================
// PLAN 6-10
// ============================================================

app.post(
  "/generate-plan-6-10",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      6,
      10
    );
  }
);

// ============================================================
// PLAN 11-15
// ============================================================

app.post(
  "/generate-plan-11-15",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      11,
      15
    );
  }
);

// ============================================================
// PLAN 16-20
// ============================================================

app.post(
  "/generate-plan-16-20",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      16,
      20
    );
  }
);

// ============================================================
// PLAN 21-25
// ============================================================

app.post(
  "/generate-plan-21-25",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      21,
      25
    );
  }
);

// ============================================================
// PLAN 26-30
// ============================================================

app.post(
  "/generate-plan-26-30",
  async (req, res) => {
    await handlePlanChunk(
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
      offer,
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
    // CONTENT PLAN
    // --------------------------------------------------------

    const planRequest =
      isContentPlan(content_type);

    console.log(
      "Content plan:",
      planRequest
    );

    if (planRequest) {

      return res.status(400).json({
        ok: false,

        error:
          "Content plan must use the dedicated plan endpoints."
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

    if (!reels_topic) {

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
      "Offer:",
      offer || "(not provided)"
    );

    console.log(
      "Content goal:",
      content_goal
    );

    console.log(
      "Content style:",
      content_style
    );

    console.log(
      "Reels topic:",
      reels_topic
    );

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
    // STANDARD CONTENT
    // --------------------------------------------------------

    const prompt =
      buildPrompt({
        contentType:
          content_type,

        businessInfo:
          business_info,

        targetAudience:
          target_audience,

        offer,

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

        label:
          "STANDARD CONTENT"
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
  }
);
