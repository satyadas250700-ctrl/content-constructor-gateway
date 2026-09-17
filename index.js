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
//
// Не позволяем нашему серверу одновременно отправлять
// несколько больших запросов в GigaChat.
//
// Это дополнительная защита от 429.
//

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

      timeout: 8000,

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
// CONTENT TYPE HELPERS
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
${reelsTopic ||
  "Определи подходящую тему самостоятельно."}

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
// BUILD 15-DAY PLAN PROMPT
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
  const hasPreviousPlan =
    Boolean(
      String(previousPlan || "").trim()
    );

  const previousSection =
    hasPreviousPlan
      ? `
ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan}

Эта часть уже была показана клиенту.

Твоя задача — НЕ повторять её.

Не повторяй:
- темы;
- идеи;
- боли;
- возражения;
- углы подачи;
- формулировки;
- одинаковые механики;
- одинаковые CTA.

Дни ${startDay}–${endDay} должны логично ПРОДОЛЖАТЬ
предыдущие 15 дней и развивать контентную стратегию дальше.
`
      : `
Это первая часть контент-плана.

Дни 1–15 должны сформировать фундамент
контентной стратегии.
`;

  return `
Ты — профессиональный российский
контент-стратег, который создаёт
контент-планы для предпринимателей и экспертов.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

ЗАДАЧА:

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

${previousSection}

==================================================
КОНТЕНТНАЯ СТРАТЕГИЯ
==================================================

Построй последовательное движение аудитории:

внимание
→ интерес
→ экспертность
→ доверие
→ вовлечение
→ желание
→ действие / покупка.

Не превращай каждый день в прямую продажу.

Используй разные задачи контента:

- привлечь внимание;
- вызвать узнавание;
- показать проблему;
- разрушить миф;
- показать экспертность;
- дать практическую пользу;
- показать личность;
- вызвать доверие;
- разобрать возражение;
- показать кейс;
- вовлечь аудиторию;
- сформировать желание;
- мягко подвести к покупке.

==================================================
ФОРМАТЫ
==================================================

Используй и чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

Не ставь один и тот же формат слишком часто подряд.

==================================================
ТРЕБОВАНИЯ К КАЖДОМУ ДНЮ
==================================================

Создай ВСЕ дни с ${startDay} по ${endDay}.

Каждый день должен быть конкретным
и адаптированным именно под бизнес клиента.

Не используй абстрактные идеи,
которые подходят абсолютно любому бизнесу.

Каждый день должен отвечать на вопрос:

«Зачем клиенту публиковать именно этот материал
и какую реакцию аудитории он должен вызвать?»

Не повторяй темы.

Не повторяй одну и ту же мысль разными словами.

Не пиши длинные готовые тексты.

Не пиши полноценные сценарии.

Но идея должна быть достаточно подробной,
чтобы после этого по ней можно было
легко создать полноценный материал.

==================================================
ФОРМАТ ОТВЕТА
==================================================

Используй строго такую структуру:

День 1 — Reels
Тема: конкретная тема
Идея: что именно показать и раскрыть
Задача: какую реакцию аудитории вызвать
CTA: что предложить сделать аудитории

День 2 — Пост
Тема: конкретная тема
Идея: что именно показать и раскрыть
Задача: какую реакцию аудитории вызвать
CTA: что предложить сделать аудитории

Продолжай до Дня ${endDay}.

ВАЖНО:

Не добавляй вступление.

Не добавляй заключение.

Не объясняй свои решения.

Не пиши ничего кроме контент-плана.

Только русский язык.
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
  const startedAt =
    Date.now();

  console.log("");
  console.log(
    `[${label}] Sending request to GigaChat...`
  );

  try {
    const response =
      await axios.post(
        CHAT_URL,
        {
          model:
            GIGACHAT_MODEL,

          messages: [
            {
              role: "system",
              content:
                "Ты профессиональный российский контент-маркетолог и контент-стратег. Создавай только качественный готовый контент на русском языке."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature,

          max_tokens:
            maxTokens
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
        ?.message?.content ||
      "";

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

    if (!result) {
      throw new Error(
        `${label}: GigaChat returned empty result`
      );
    }

    return {
      result,
      elapsed,
      status:
        response.status
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

    temperature: 0.4,

    maxTokens: 700,

    label:
      "PLAN DAYS 1-15"
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

    temperature: 0.4,

    maxTokens: 700,

    label:
      "PLAN DAYS 16-30"
  });
}

// ============================================================
// GENERATION LOCK HELPER
// ============================================================

function tryStartGeneration() {

  if (generationInProgress) {
    return false;
  }

  generationInProgress = true;

  return true;
}

function finishGeneration() {
  generationInProgress = false;
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

    bridge_key_configured:
      !!BRIDGE_KEY,

    gigachat_key_configured:
      !!GIGACHAT_KEY,

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
      "МОЙ КОНТЕНТ-КОНСТРУКТОР",

    message:
      "Content Constructor Gateway is running",

    endpoints: {
      health:
        "GET /health",

      test_auth:
        "GET /test-auth",

      test_generate:
        "GET /test-generate",

      test_plan:
        "GET /test-plan",

      test_next_plan:
        "GET /test-next-plan",

      generate:
        "POST /generate",

      generate_next_15:
        "POST /generate-next-15"
    }
  });
});

// ============================================================
// TEST AUTH
// ============================================================

app.get(
  "/test-auth",
  async (req, res) => {

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
              12000,

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
          ?.message?.content ||
        "";

      res.json({
        ok: true,

        stage:
          "generation",

        status:
          response.status,

        time_ms:
          Date.now() -
          startedAt,

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
          Date.now() -
          startedAt
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

    if (!tryStartGeneration()) {

      return res.status(429).json({
        ok: false,

        test:
          "first-15-day-plan",

        status:
          429,

        message:
          "Another generation is already in progress"
      });
    }

    try {

      console.log("");
      console.log(
        "===================================="
      );

      console.log(
        "TEST FIRST 15-DAY PLAN"
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

      res.json({
        ok: true,

        test:
          "first-15-day-plan",

        status:
          result.status,

        time_ms:
          Date.now() -
          startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

        reels_result:
          result.result
      });

    } catch (error) {

      console.error(
        "TEST PLAN ERROR"
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

        test:
          "first-15-day-plan",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() -
          startedAt
      });

    } finally {

      finishGeneration();
    }
  }
);

// ============================================================
// TEST NEXT 15 DAYS
// ============================================================

app.get(
  "/test-next-plan",
  async (req, res) => {

    const startedAt =
      Date.now();

    if (!tryStartGeneration()) {

      return res.status(429).json({
        ok: false,

        test:
          "next-15-day-plan",

        status:
          429,

        message:
          "Another generation is already in progress"
      });
    }

    try {

      console.log("");
      console.log(
        "===================================="
      );

      console.log(
        "TEST NEXT 15-DAY PLAN"
      );

      console.log(
        "===================================="
      );

      const token =
        await getAccessToken();

      const previousPlan = `
День 1 — Reels
Тема: Главная ошибка новичков в моей нише
Идея: Показать типичную ошибку и объяснить, как её избежать
Задача: вызвать узнавание проблемы
CTA: предложить сохранить видео

День 2 — Пост
Тема: Как понять, что вам действительно нужен специалист
Идея: разобрать несколько признаков
Задача: помочь аудитории определить свою ситуацию
CTA: предложить написать вопрос

День 3 — Карусель
Тема: 5 заблуждений клиентов
Идея: разобрать распространённые мифы
Задача: показать экспертность
CTA: предложить поделиться своим мнением

День 4 — Telegram-пост
Тема: История из практики
Идея: рассказать о конкретной ситуации клиента
Задача: вызвать доверие
CTA: задать вопрос аудитории

День 5 — Reels
Тема: Практический совет
Идея: дать один инструмент, который можно применить сразу
Задача: дать быструю пользу
CTA: сохранить видео
`;

      const result =
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

          previousPlan
        });

      res.json({
        ok: true,

        test:
          "next-15-day-plan",

        status:
          result.status,

        time_ms:
          Date.now() -
          startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

        reels_result:
          result.result
      });

    } catch (error) {

      console.error(
        "TEST NEXT PLAN ERROR"
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

        test:
          "next-15-day-plan",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() -
          startedAt
      });

    } finally {

      finishGeneration();
    }
  }
);

// ============================================================
// MAIN GENERATE
// ============================================================
//
// /generate теперь:
//
// обычный контент → обычная генерация
//
// контент-план → ТОЛЬКО ДНИ 1–15
//
// Дни 16–30 генерируются отдельным endpoint:
// /generate-next-15
//

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

      if (
        bridge_key !==
        BRIDGE_KEY
      ) {

        return res.status(401).json({
          ok: false,

          error:
            "Invalid bridge_key"
        });
      }

      // --------------------------------------------------------
      // CONTENT PLAN CHECK
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
      // GENERATION LOCK
      // --------------------------------------------------------

      if (!tryStartGeneration()) {

        console.log(
          "Generation already in progress"
        );

        return res.status(429).json({
          ok: false,

          error:
            "Another generation is already in progress. Please wait."
        });
      }

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

        // ======================================================
        // FIRST 15 DAYS
        // ======================================================

        if (planRequest) {

          console.log(
            "Generating ONLY days 1-15"
          );

          const generated =
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
            Date.now() -
            startedAt;

          console.log(
            "First 15 days generated"
          );

          console.log(
            "Total request time:",
            totalTime,
            "ms"
          );

          return res.json({
            ok: true,

            plan_part:
              "1-15",

            reels_result:
              generated.result
          });
        }

        // ======================================================
        // STANDARD CONTENT
        // ======================================================

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
              "STANDARD CONTENT"
          });

        const totalTime =
          Date.now() -
          startedAt;

        console.log(
          "Total request time:",
          totalTime,
          "ms"
        );

        console.log(
          "GENERATION SUCCESS"
        );

        return res.json({
          ok: true,

          reels_result:
            generated.result
        });

      } finally {

        finishGeneration();
      }

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
        Date.now() -
        startedAt,
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
//
// Этот endpoint получает:
//
// - бизнес
// - аудиторию
// - цель
// - стиль
// - ПЕРВЫЕ 15 ДНЕЙ
//
// и создаёт ДНИ 16–30 как продолжение.
//

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
      "GENERATE NEXT 15 DAYS REQUEST"
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

      if (
        bridge_key !==
        BRIDGE_KEY
      ) {

        return res.status(401).json({
          ok: false,

          error:
            "Invalid bridge_key"
        });
      }

      // --------------------------------------------------------
      // REQUIRED FIELDS
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

      console.log(
        "Previous plan length:",
        String(
          previous_plan
        ).length
      );

      // --------------------------------------------------------
      // GENERATION LOCK
      // --------------------------------------------------------

      if (!tryStartGeneration()) {

        console.log(
          "Generation already in progress"
        );

        return res.status(429).json({
          ok: false,

          error:
            "Another generation is already in progress. Please wait."
        });
      }

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
        // GENERATE 16-30
        // ------------------------------------------------------

        const generated =
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
          Date.now() -
          startedAt;

        console.log(
          "Days 16-30 generated"
        );

        console.log(
          "Result length:",
          generated.result.length
        );

        console.log(
          "Total request time:",
          totalTime,
          "ms"
        );

        return res.json({
          ok: true,

          plan_part:
            "16-30",

          reels_result:
            generated.result
        });

      } finally {

        finishGeneration();
      }

    } catch (error) {

      console.error("");
      console.error(
        "===================================="
      );

      console.error(
        "GENERATE NEXT 15 ERROR"
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
        Date.now() -
        startedAt,
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
      "Generation lock:",
      "ENABLED"
    );

    console.log(
      "30-day plan architecture:",
      "1-15 + 16-30"
    );

    console.log(
      "===================================="
    );
  }
);
