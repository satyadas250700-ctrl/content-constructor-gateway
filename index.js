const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

// ======================================================
// ENV
// ======================================================

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
  "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// ======================================================
// HTTPS AGENT
// ======================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// ======================================================
// TOKEN CACHE
// ======================================================

let accessToken = null;
let accessTokenExpiresAt = 0;

// ======================================================
// GENERATION LOCK
// ======================================================

let generationInProgress = false;

// ======================================================
// BASIC HELPERS
// ======================================================

function now() {
  return new Date().toISOString();
}

function safeString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function limitText(value, maxLength) {
  const text = safeString(value);

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(-maxLength);
}

function isContentPlan(contentType) {
  const value = safeString(contentType).toLowerCase();

  return (
    value.includes("план") ||
    value.includes("30") ||
    value.includes("контент-план") ||
    value.includes("контент план")
  );
}

// ======================================================
// GIGACHAT AUTH
// ======================================================

async function getAccessToken() {
  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  if (
    accessToken &&
    Date.now() < accessTokenExpiresAt - 60000
  ) {
    return accessToken;
  }

  const rqUid = crypto.randomUUID();

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${GIGACHAT_KEY}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
        RqUID: rqUid
      },
      httpsAgent,
      timeout: 8000
    }
  );

  accessToken = response.data.access_token;

  const expiresIn =
    Number(response.data.expires_in) || 1800;

  accessTokenExpiresAt =
    Date.now() + expiresIn * 1000;

  console.log(
    `[${now()}] GigaChat access token received`
  );

  return accessToken;
}

// ======================================================
// CONTENT INSTRUCTIONS
// ======================================================

function getContentInstructions(contentType) {
  const type = safeString(contentType).toLowerCase();

  if (
    type.includes("reels") ||
    type.includes("рилс")
  ) {
    return `
ФОРМАТ: REELS

Создай готовую идею Reels.

Структура:
1. Хук
2. Сценарий
3. Финальная мысль
4. CTA

Текст должен быть практичным, живым и пригодным для публикации.
`;
  }

  if (
    type.includes("карусел") ||
    type.includes("carousel")
  ) {
    return `
ФОРМАТ: КАРУСЕЛЬ

Создай готовую карусель.

Структура:
1. Заголовок первого слайда
2. Слайды по порядку
3. Финальный слайд
4. CTA

Не объясняй процесс создания.
`;
  }

  if (
    type.includes("телеграм") ||
    type.includes("telegram") ||
    type.includes("тг")
  ) {
    return `
ФОРМАТ: TELEGRAM-ПОСТ

Создай готовый пост для Telegram.

Структура:
- сильное начало;
- основная мысль;
- полезное содержание;
- завершение;
- CTA.

Не добавляй пояснения от себя.
`;
  }

  return `
ФОРМАТ: ПОСТ

Создай готовый экспертный пост.

Текст должен быть живым, конкретным и пригодным для публикации.
В конце добавь естественный CTA.
`;
}

// ======================================================
// NORMAL CONTENT PROMPT
// ======================================================

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  reelsTopic,
  contentStyle
}) {
  const offerText =
    safeString(offer) ||
    "Конкретное предложение не указано. Не придумывай его.";

  return `
Ты — профессиональный контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри Telegram-бота
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать готовый контент для предпринимателей и экспертов.

ВАЖНО:
- пиши только готовый результат;
- не объясняй, как ты его создавал;
- не упоминай искусственный интеллект;
- не используй шаблонные фразы;
- не придумывай факты о бизнесе;
- не используй placeholders вроде [название компании], [имя эксперта] и т.п.;
- пиши естественным современным русским языком.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${safeString(businessInfo)}

Целевая аудитория:
${safeString(targetAudience)}

Что именно продвигаем:
${offerText}

Цель контента:
${safeString(contentGoal)}

Тема:
${safeString(reelsTopic)}

Стиль:
${safeString(contentStyle)}

${getContentInstructions(contentType)}

Верни только готовый контент.
`;
}

// ======================================================
// PLAN CHUNK PROMPT
// ======================================================

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
    safeString(offer) ||
    "Конкретное предложение не указано. Не придумывай его.";

  const previousText = limitText(
    previousPlan,
    9000
  );

  let previousSection = "";

  if (previousText) {
    previousSection = `
ПРЕДЫДУЩИЕ 5 ДНЕЙ:

${previousText}

Используй их только для понимания логики контент-плана.
Не копируй темы и не повторяй формулировки.
`;
  } else {
    previousSection = `
Это первый блок контент-плана.
Предыдущих дней нет.
`;
  }

  return `
Ты — профессиональный контент-стратег.

Ты создаёшь контент-план для Telegram-бота
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Нужно создать дни ${startDay}-${endDay} включительно.

ДАННЫЕ БИЗНЕСА:

Бизнес:
${safeString(businessInfo)}

Целевая аудитория:
${safeString(targetAudience)}

Что именно продвигаем:
${offerText}

Цель контента:
${safeString(contentGoal)}

Стиль:
${safeString(contentStyle)}

${previousSection}

ЗАДАЧА:

Создай следующие 5 дней контент-плана.

Контент должен последовательно вести аудиторию по воронке:

внимание → интерес → экспертность → доверие → желание → действие.

Используй разные форматы:
- Reels
- пост
- карусель
- Telegram-пост

Не обязательно использовать каждый формат одинаковое количество раз.

КАЖДЫЙ ДЕНЬ ОБЯЗАТЕЛЬНО ОФОРМИ ТАК:

День N
Формат:
Тема:
Идея:
Задача:
CTA:

ВАЖНЫЕ ПРАВИЛА:

1. Обязательно создай ВСЕ 5 дней:
${startDay}, ${startDay + 1}, ${startDay + 2}, ${startDay + 3}, ${endDay}.

2. Никогда не заканчивай ответ посреди дня.

3. Каждый день делай компактным:
примерно 60–90 слов.

4. Не пиши длинные сценарии.

5. Не добавляй вступление перед первым днём.

6. Не добавляй заключение после последнего дня.

7. Не используй placeholders:
[название], [имя], [ссылка], [продукт] и т.п.

8. Не придумывай факты о бизнесе.

9. Не повторяй предыдущие темы.

10. Ответ должен содержать ровно 5 дней.

Верни только контент-план.
`;
}

// ======================================================
// GIGACHAT GENERATION
// ======================================================

async function generateWithGigaChat(
  prompt,
  {
    maxTokens = 800,
    temperature = 0.35
  } = {}
) {
  const token = await getAccessToken();

  const startedAt = Date.now();

  console.log(
    `[${now()}] Sending request to GigaChat`
  );

  console.log(
    `[${now()}] Prompt length: ${prompt.length} chars`
  );

  console.log(
    `[${now()}] max_tokens: ${maxTokens}`
  );

  const response = await axios.post(
    CHAT_URL,
    {
      model: GIGACHAT_MODEL,

      messages: [
        {
          role: "system",
          content:
            "Ты профессиональный русскоязычный контент-маркетолог. Отвечай только готовым результатом без пояснений."
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
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },

      httpsAgent,

      timeout: 9000
    }
  );

  const elapsed =
    Date.now() - startedAt;

  const choice =
    response.data?.choices?.[0];

  const content =
    choice?.message?.content || "";

  const finishReason =
    choice?.finish_reason || null;

  const usage =
    response.data?.usage || {};

  console.log(
    `[${now()}] GigaChat response received in ${elapsed} ms`
  );

  console.log(
    `[${now()}] finish_reason: ${finishReason}`
  );

  console.log(
    `[${now()}] usage:`,
    JSON.stringify(usage)
  );

  console.log(
    `[${now()}] result length: ${content.length} chars`
  );

  if (finishReason === "length") {
    console.warn(
      `[${now()}] WARNING: GigaChat stopped because token limit was reached`
    );
  }

  return {
    content: safeString(content),
    finishReason,
    usage,
    elapsed
  };
}

// ======================================================
// PLAN GENERATOR
// ======================================================

async function generatePlanChunk({
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

  return generateWithGigaChat(
    prompt,
    {
      maxTokens: 700,
      temperature: 0.35
    }
  );
}

// ======================================================
// PLAN VALIDATION
// ======================================================

function validatePlanData(
  result,
  startDay,
  endDay
) {
  const text = safeString(result);

  if (!text) {
    return {
      valid: false,
      reason: "empty_result"
    };
  }

  for (
    let day = startDay;
    day <= endDay;
    day++
  ) {
    const dayPattern =
      new RegExp(
        `День\\s*${day}\\b`,
        "i"
      );

    if (!dayPattern.test(text)) {
      return {
        valid: false,
        reason: `missing_day_${day}`
      };
    }
  }

  return {
    valid: true,
    reason: null
  };
}

// ======================================================
// PLAN HANDLER
// ======================================================

async function handlePlanChunk(
  req,
  res,
  {
    startDay,
    endDay
  }
) {
  console.log(
    `\n==================================================`
  );

  console.log(
    `[${now()}] PLAN REQUEST ${startDay}-${endDay}`
  );

  console.log(
    `[${now()}] Body received:`,
    JSON.stringify(req.body)
  );

  // --------------------------------------------------
  // BRIDGE KEY
  // --------------------------------------------------

  if (
    !BRIDGE_KEY ||
    req.body?.bridge_key !== BRIDGE_KEY
  ) {
    console.error(
      `[${now()}] Invalid bridge_key`
    );

    return res.status(403).json({
      ok: false,
      error: "Invalid bridge_key"
    });
  }

  // --------------------------------------------------
  // LOCK
  // --------------------------------------------------

  if (generationInProgress) {
    console.warn(
      `[${now()}] Generation already in progress`
    );

    return res.status(429).json({
      ok: false,
      error:
        "Another generation is already in progress"
    });
  }

  generationInProgress = true;

  try {
    const {
      business_info,
      target_audience,
      offer,
      content_goal,
      content_style,
      previous_plan
    } = req.body;

    // ------------------------------------------------
    // LOG INPUT
    // ------------------------------------------------

    console.log(
      `[${now()}] business_info length:`,
      safeString(business_info).length
    );

    console.log(
      `[${now()}] target_audience length:`,
      safeString(target_audience).length
    );

    console.log(
      `[${now()}] offer length:`,
      safeString(offer).length
    );

    console.log(
      `[${now()}] content_goal length:`,
      safeString(content_goal).length
    );

    console.log(
      `[${now()}] content_style length:`,
      safeString(content_style).length
    );

    console.log(
      `[${now()}] previous_plan length:`,
      safeString(previous_plan).length
    );

    // ------------------------------------------------
    // GENERATE
    // ------------------------------------------------

    const result =
      await generatePlanChunk({
        startDay,
        endDay,
        businessInfo: business_info,
        targetAudience: target_audience,
        offer,
        contentGoal: content_goal,
        contentStyle: content_style,

        // ВАЖНО:
        // передаём только предыдущий блок,
        // а не весь накопленный план
        previousPlan: previous_plan
      });

    // ------------------------------------------------
    // VALIDATE
    // ------------------------------------------------

    const validation =
      validatePlanData(
        result.content,
        startDay,
        endDay
      );

    console.log(
      `[${now()}] Validation:`,
      JSON.stringify(validation)
    );

    // ------------------------------------------------
    // RETURN
    // ------------------------------------------------

    if (!validation.valid) {
      console.error(
        `[${now()}] PLAN VALIDATION FAILED: ${validation.reason}`
      );

      return res.status(500).json({
        ok: false,
        error: validation.reason,
        finish_reason: result.finishReason,
        usage: result.usage,
        time_ms: result.elapsed,
        reels_result: result.content
      });
    }

    return res.status(200).json({
      ok: true,

      start_day: startDay,
      end_day: endDay,

      reels_result: result.content,

      finish_reason:
        result.finishReason,

      truncated:
        result.finishReason === "length",

      usage: result.usage,

      time_ms: result.elapsed,

      model: GIGACHAT_MODEL
    });

  } catch (error) {
    console.error(
      `[${now()}] PLAN GENERATION ERROR`
    );

    console.error(
      error?.response?.data ||
      error?.message ||
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        error?.response?.data ||
        error?.message ||
        "Unknown generation error"
    });

  } finally {
    generationInProgress = false;

    console.log(
      `[${now()}] PLAN REQUEST ${startDay}-${endDay} FINISHED`
    );

    console.log(
      `==================================================\n`
    );
  }
}

// ======================================================
// ROOT
// ======================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    status: "online",
    model: GIGACHAT_MODEL,
    time: now()
  });
});

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    time: now()
  });
});

// ======================================================
// TEST AUTH
// ======================================================

app.get("/test-auth", async (req, res) => {
  try {
    const token =
      await getAccessToken();

    res.json({
      ok: true,
      token_received: Boolean(token),
      time: now()
    });

  } catch (error) {
    console.error(
      "[TEST-AUTH ERROR]",
      error?.response?.data ||
      error?.message ||
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error?.response?.data ||
        error?.message ||
        "Auth error"
    });
  }
});

// ======================================================
// TEST GENERATE
// ======================================================

app.get("/test-generate", async (req, res) => {
  try {
    const result =
      await generateWithGigaChat(
        `
Напиши короткий пример одного
маркетингового поста для эксперта.

Только готовый текст.
`,
        {
          maxTokens: 300,
          temperature: 0.35
        }
      );

    res.json({
      ok: true,

      reels_result:
        result.content,

      finish_reason:
        result.finishReason,

      usage:
        result.usage,

      time_ms:
        result.elapsed,

      model:
        GIGACHAT_MODEL
    });

  } catch (error) {
    console.error(
      "[TEST-GENERATE ERROR]",
      error?.response?.data ||
      error?.message ||
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error?.response?.data ||
        error?.message ||
        "Generation error"
    });
  }
});

// ======================================================
// TEST PLAN 1-5
// ======================================================

app.get("/test-plan-1-5", async (req, res) => {
  try {
    const result =
      await generatePlanChunk({
        startDay: 1,
        endDay: 5,

        businessInfo:
          "Экспертный блог о маркетинге и контенте",

        targetAudience:
          "Предприниматели и эксперты, которым нужен поток клиентов из социальных сетей",

        offer:
          "Консультации и помощь в создании контент-системы",

        contentGoal:
          "Привлечение внимания и получение заявок",

        contentStyle:
          "Экспертный, простой, живой",

        previousPlan: ""
      });

    const validation =
      validatePlanData(
        result.content,
        1,
        5
      );

    res.json({
      ok: validation.valid,

      test: "plan-1-5",

      status: 200,

      time_ms:
        result.elapsed,

      result_length:
        result.content.length,

      finish_reason:
        result.finishReason,

      truncated:
        result.finishReason === "length",

      usage:
        result.usage,

      validation,

      model:
        GIGACHAT_MODEL,

      reels_result:
        result.content
    });

  } catch (error) {
    console.error(
      "[TEST-PLAN ERROR]",
      error?.response?.data ||
      error?.message ||
      error
    );

    res.status(500).json({
      ok: false,

      error:
        error?.response?.data ||
        error?.message ||
        "Plan test error"
    });
  }
});

// ======================================================
// PLAN 1-5
// ======================================================

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 1,
        endDay: 5
      }
    );
  }
);

// ======================================================
// PLAN 6-10
// ======================================================

app.post(
  "/generate-plan-6-10",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 6,
        endDay: 10
      }
    );
  }
);

// ======================================================
// PLAN 11-15
// ======================================================

app.post(
  "/generate-plan-11-15",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 11,
        endDay: 15
      }
    );
  }
);

// ======================================================
// PLAN 16-20
// ======================================================

app.post(
  "/generate-plan-16-20",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 16,
        endDay: 20
      }
    );
  }
);

// ======================================================
// PLAN 21-25
// ======================================================

app.post(
  "/generate-plan-21-25",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 21,
        endDay: 25
      }
    );
  }
);

// ======================================================
// PLAN 26-30
// ======================================================

app.post(
  "/generate-plan-26-30",
  async (req, res) => {
    await handlePlanChunk(
      req,
      res,
      {
        startDay: 26,
        endDay: 30
      }
    );
  }
);

// ======================================================
// NORMAL CONTENT GENERATOR
// ======================================================

app.post("/generate", async (req, res) => {
  console.log(
    `\n==================================================`
  );

  console.log(
    `[${now()}] GENERATE REQUEST RECEIVED`
  );

  console.log(
    `[${now()}] Body exists:`,
    Boolean(req.body)
  );

  console.log(
    `[${now()}] Keys:`,
    Object.keys(req.body || {})
  );

  console.log(
    `[${now()}] Content-Type header:`,
    req.headers["content-type"]
  );

  console.log(
    `==================================================`
  );

  // --------------------------------------------------
  // BRIDGE KEY
  // --------------------------------------------------

  if (
    !BRIDGE_KEY ||
    req.body?.bridge_key !== BRIDGE_KEY
  ) {
    console.error(
      `[${now()}] Invalid bridge_key`
    );

    return res.status(403).json({
      ok: false,
      error: "Invalid bridge_key"
    });
  }

  // --------------------------------------------------
  // LOCK
  // --------------------------------------------------

  if (generationInProgress) {
    console.warn(
      `[${now()}] Generation already in progress`
    );

    return res.status(429).json({
      ok: false,
      error:
        "Another generation is already in progress"
    });
  }

  generationInProgress = true;

  try {
    const {
      content_type,
      business_info,
      target_audience,
      offer,
      content_goal,
      reels_topic,
      content_style
    } = req.body;

    // ------------------------------------------------
    // LOG DATA
    // ------------------------------------------------

    console.log(
      `[${now()}] content_type:`,
      content_type
    );

    console.log(
      `[${now()}] business_info length:`,
      safeString(business_info).length
    );

    console.log(
      `[${now()}] target_audience length:`,
      safeString(target_audience).length
    );

    console.log(
      `[${now()}] offer length:`,
      safeString(offer).length
    );

    console.log(
      `[${now()}] content_goal:`,
      content_goal
    );

    console.log(
      `[${now()}] reels_topic length:`,
      safeString(reels_topic).length
    );

    console.log(
      `[${now()}] content_style:`,
      content_style
    );

    // ------------------------------------------------
    // BUILD PROMPT
    // ------------------------------------------------

    const prompt =
      buildPrompt({
        contentType: content_type,
        businessInfo: business_info,
        targetAudience: target_audience,
        offer,
        contentGoal: content_goal,
        reelsTopic: reels_topic,
        contentStyle: content_style
      });

    // ------------------------------------------------
    // GENERATE
    // ------------------------------------------------

    const result =
      await generateWithGigaChat(
        prompt,
        {
          maxTokens: 800,
          temperature: 0.45
        }
      );

    // ------------------------------------------------
    // EMPTY RESULT
    // ------------------------------------------------

    if (!result.content) {
      throw new Error(
        "GigaChat returned an empty result"
      );
    }

    // ------------------------------------------------
    // RESPONSE
    // ------------------------------------------------

    return res.status(200).json({
      ok: true,

      reels_result:
        result.content,

      finish_reason:
        result.finishReason,

      truncated:
        result.finishReason === "length",

      usage:
        result.usage,

      time_ms:
        result.elapsed,

      model:
        GIGACHAT_MODEL
    });

  } catch (error) {
    console.error(
      `[${now()}] GENERATE ERROR`
    );

    console.error(
      error?.response?.data ||
      error?.message ||
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        error?.response?.data ||
        error?.message ||
        "Unknown generation error"
    });

  } finally {
    generationInProgress = false;
  }
});

// ======================================================
// 404
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint not found",
    path: req.path,
    method: req.method
  });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
  console.error(
    `[${now()}] GLOBAL ERROR`,
    err
  );

  res.status(500).json({
    ok: false,
    error:
      err?.message ||
      "Internal server error"
  });
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(
    `==================================================`
  );

  console.log(
    `CONTENT CONSTRUCTOR GATEWAY`
  );

  console.log(
    `Server started on port ${PORT}`
  );

  console.log(
    `Model: ${GIGACHAT_MODEL}`
  );

  console.log(
    `Bridge key configured: ${Boolean(BRIDGE_KEY)}`
  );

  console.log(
    `GigaChat key configured: ${Boolean(GIGACHAT_KEY)}`
  );

  console.log(
    `==================================================`
  );
});
