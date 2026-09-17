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
// BUILD 15-DAY PLAN PROMPT
// ============================================================

function buildPlanPartPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  const hasPreviousPlan =
    Boolean(
      previousPlan &&
      String(previousPlan).trim()
    );

  let continuationBlock = "";

  if (hasPreviousPlan) {
    continuationBlock = `
КОНТЕНТ, КОТОРЫЙ УЖЕ СОЗДАН ДЛЯ ДНЕЙ 1–15:

--------------------
${previousPlan}
--------------------

Это уже готовая первая половина месяца.

ТВОЯ ЗАДАЧА:

Создай продолжение контент-плана для дней ${startDay}–${endDay}.

ОБЯЗАТЕЛЬНО:

- не повторяй темы из дней 1–15;
- не повторяй одинаковые идеи;
- не повторяй одинаковые углы подачи;
- не дублируй одни и те же боли аудитории;
- не копируй формулировки из предыдущей части;
- продолжай общую стратегию месяца;
- постепенно двигай аудиторию от внимания и доверия к покупке;
- используй новые темы и новые механики;
`;
  } else {
    continuationBlock = `
Это первая часть контент-плана.

Создай дни ${startDay}–${endDay}
как фундамент контент-стратегии месяца.
`;
  }

  return `
Ты — профессиональный российский
контент-стратег и маркетолог.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Тебе необходимо создать
${hasPreviousPlan ? "продолжение" : "первую часть"}
контент-плана на 30 дней.

ПЕРИОД:
Дни ${startDay}–${endDay}

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}

${continuationBlock}

============================================================
СТРАТЕГИЯ
============================================================

Контент должен работать как единая система.

Учитывай путь аудитории:

ВНИМАНИЕ →
ИНТЕРЕС →
ЭКСПЕРТНОСТЬ →
ДОВЕРИЕ →
ВОВЛЕЧЕНИЕ →
ЖЕЛАНИЕ →
ПОКУПКА.

Не превращай каждый день в прямую продажу.

Чередуй:
- полезный контент;
- экспертный контент;
- вовлекающий контент;
- личный контент;
- демонстрацию продукта;
- кейсы;
- возражения;
- доверительный контент;
- продающие публикации.

============================================================
ФОРМАТЫ
============================================================

Используй и чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

Не используй один и тот же формат
несколько дней подряд без необходимости.

============================================================
ТРЕБОВАНИЯ
============================================================

1. Создай ВСЕ дни с ${startDay} по ${endDay}.

2. Каждый день должен иметь
конкретную тему.

3. Темы должны быть связаны
именно с данным бизнесом.

4. Учитывай реальную целевую аудиторию.

5. Учитывай выбранную цель.

6. Учитывай выбранный стиль.

7. Не используй абстрактные
универсальные идеи.

8. Не повторяй темы.

9. Не повторяй идеи.

10. Не делай все публикации продающими.

11. Не используй пустые темы
вроде «расскажите о себе».

12. Не используй искусственные
маркетинговые формулировки.

13. Идеи должны быть реально
выполнимыми предпринимателем.

14. Не пиши полноценные длинные
тексты публикаций.

15. Не добавляй вступление.

16. Не добавляй заключение.

17. Не объясняй свои решения.

18. Ответ только на русском языке.

============================================================
ФОРМАТ
============================================================

Каждый день оформляй строго так:

День N — Формат
Тема: конкретная тема
Идея: что именно показать, рассказать или раскрыть

Для Reels идея должна позволять
в дальнейшем создать полноценный сценарий.

Для Поста идея должна позволять
в дальнейшем написать полноценный пост.

Для Карусели идея должна позволять
разбить материал на слайды.

Для Telegram-поста идея должна
подходить под формат Telegram.

============================================================

Верни ТОЛЬКО контент-план.
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
// GENERATE FIRST 15 DAYS
// ============================================================

async function generateFirst15Days({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {
  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "STARTING DAYS 1-15 PLAN"
  );
  console.log(
    "===================================="
  );

  const prompt =
    buildPlanPartPrompt({
      startDay: 1,
      endDay: 15,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle,
      previousPlan: ""
    });

  const result =
    await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.4,
      maxTokens: 850,
      label: "DAYS 1-15"
    });

  console.log(
    "Days 1-15 generated successfully."
  );

  return result.result;
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
  console.log("");
  console.log(
    "===================================="
  );
  console.log(
    "STARTING DAYS 16-30 PLAN"
  );
  console.log(
    "===================================="
  );

  console.log(
    "Previous plan length:",
    String(previousPlan || "").length
  );

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

  const result =
    await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.4,
      maxTokens: 850,
      label: "DAYS 16-30"
    });

  console.log(
    "Days 16-30 generated successfully."
  );

  return result.result;
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
// TEST FIRST 15 DAYS
// ============================================================

app.get("/test-plan", async (req, res) => {
  const startedAt = Date.now();

  try {
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
      test: "first-15-day-plan",
      status: 200,
      time_ms:
        Date.now() - startedAt,
      result_length:
        result.length,
      model: GIGACHAT_MODEL,
      reels_result: result
    });

  } catch (error) {

    res.status(500).json({
      ok: false,
      test: "first-15-day-plan",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  }
});

// ============================================================
// TEST NEXT 15 DAYS
// ============================================================

app.get("/test-next-plan", async (req, res) => {
  const startedAt = Date.now();

  try {
    const token =
      await getAccessToken();

    const previousPlan = `
День 1 — Reels
Тема: Знакомство с бизнесом
Идея: Показать историю создания бизнеса и главную ценность продукта.

День 2 — Пост
Тема: Главная проблема клиента
Идея: Разобрать распространённую проблему аудитории.

День 3 — Карусель
Тема: Ошибки клиентов
Идея: Показать пять ошибок и способы их избежать.

День 4 — Telegram-пост
Тема: Личное мнение
Идея: Высказать экспертную позицию по теме ниши.

День 5 — Reels
Тема: Полезный совет
Идея: Показать практический совет, который можно применить сразу.

День 6 — Пост
Тема: Кейс клиента
Идея: Показать ситуацию до работы и результат после.

День 7 — Карусель
Тема: Инструкция
Идея: Дать пошаговый алгоритм решения конкретной задачи.

День 8 — Telegram-пост
Тема: Вопрос аудитории
Идея: Задать вопрос и предложить поделиться опытом.

День 9 — Reels
Тема: Миф в нише
Идея: Разобрать популярное заблуждение.

День 10 — Пост
Тема: Возражение клиента
Идея: Разобрать одно из главных сомнений перед покупкой.

День 11 — Карусель
Тема: Чек-лист
Идея: Дать список критериев выбора продукта или услуги.

День 12 — Telegram-пост
Тема: Закулисье
Идея: Показать внутреннюю сторону работы бизнеса.

День 13 — Reels
Тема: Демонстрация продукта
Идея: Показать продукт в действии.

День 14 — Пост
Тема: Ценности бизнеса
Идея: Рассказать о принципах, которые влияют на качество работы.

День 15 — Карусель
Тема: Частые вопросы
Идея: Ответить на основные вопросы потенциальных клиентов.
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
      test: "next-15-day-plan",
      status: 200,
      time_ms:
        Date.now() - startedAt,
      result_length:
        result.length,
      model: GIGACHAT_MODEL,
      reels_result: result
    });

  } catch (error) {

    res.status(500).json({
      ok: false,
      test: "next-15-day-plan",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms:
        Date.now() - startedAt
    });
  }
});

// ============================================================
// MAIN GENERATE — FIRST 15 DAYS / STANDARD CONTENT
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
    // FIRST 15 DAYS
    // ========================================================

    if (planRequest) {

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
        "First 15 days total time:",
        totalTime,
        "ms"
      );

      console.log(
        "Returning days 1-15 to Salebot"
      );

      return res.json({
        ok: true,
        plan_part: "1-15",
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
// GENERATE NEXT 15 DAYS
// ============================================================

app.post("/generate-next-15", async (req, res) => {
  const startedAt = Date.now();

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
      content_type,
      business_info,
      target_audience,
      content_goal,
      content_style,
      previous_plan
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

      console.log(
        "ERROR: previous_plan missing"
      );

      return res.status(400).json({
        ok: false,
        error:
          "previous_plan is required"
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

    console.log(
      "Previous plan length:",
      String(previous_plan).length
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
    // GENERATE DAYS 16-30
    // --------------------------------------------------------

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
      "Days 16-30 total time:",
      totalTime,
      "ms"
    );

    console.log(
      "Returning days 16-30 to Salebot"
    );

    console.log(
      "===================================="
    );

    return res.json({
      ok: true,
      plan_part: "16-30",
      reels_result: result
    });

  } catch (error) {

    console.error("");
    console.error(
      "===================================="
    );

    console.error(
      "NEXT 15 DAYS GENERATE ERROR"
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
