const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const https = require("https");

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================================================
// НАСТРОЙКИ
// ======================================================

const PORT = process.env.PORT || 10000;

const BRIDGE_KEY = process.env.BRIDGE_KEY;
const GIGACHAT_KEY = process.env.GIGACHAT_KEY;

const MODEL = "GigaChat-3-Ultra";

// Актуальный endpoint GigaChat
const CHAT_URL =
  "https://api.giga.chat/v1/chat/completions";

// OAuth endpoint
const OAUTH_URL =
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

// HTTPS agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// ======================================================
// ГЛОБАЛЬНАЯ ОЧЕРЕДЬ GIGACHAT
// ======================================================
//
// Для физических лиц GigaChat разрешает один
// одновременный поток.
//
// Поэтому абсолютно ВСЕ запросы к GigaChat
// проходят через одну очередь.
//
// Это касается:
// - обычного /generate
// - plan 1-5
// - plan 6-10
// - plan 11-15
// - plan 16-20
// - plan 21-25
// - plan 26-30
// - тестовых запросов
//
// ======================================================

let gigaChatQueue = Promise.resolve();

function runInGigaQueue(task) {
  const nextTask = gigaChatQueue.then(
    () => task(),
    () => task()
  );

  gigaChatQueue = nextTask.catch(() => {});

  return nextTask;
}

// ======================================================
// КЭШ ACCESS TOKEN
// ======================================================

let cachedAccessToken = null;
let tokenExpiresAt = 0;

// Отдельная блокировка получения токена,
// чтобы два запроса одновременно не пытались
// получать новый token.
let tokenPromise = null;

// ======================================================
// ПОЛУЧЕНИЕ ACCESS TOKEN
// ======================================================

async function getAccessToken() {
  const now = Date.now();

  // Используем существующий токен,
  // пока до его окончания больше 60 секунд.
  if (
    cachedAccessToken &&
    tokenExpiresAt > now + 60000
  ) {
    return cachedAccessToken;
  }

  // Если другой запрос уже получает токен —
  // ждём его, а не создаём второй запрос.
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    if (!GIGACHAT_KEY) {
      throw new Error(
        "GIGACHAT_KEY не найден в Environment Variables"
      );
    }

    const rqUid = crypto.randomUUID();

    console.log("Получаем новый GigaChat access token...");

    const response = await axios.post(
      OAUTH_URL,
      "scope=GIGACHAT_API_PERS",
      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          Accept: "application/json",

          RqUID: rqUid,

          Authorization:
            `Basic ${GIGACHAT_KEY}`,
        },

        httpsAgent,

        timeout: 10000,
      }
    );

    if (
      !response.data ||
      !response.data.access_token
    ) {
      throw new Error(
        "GigaChat не вернул access_token"
      );
    }

    cachedAccessToken =
      response.data.access_token;

    // Токен действует 30 минут.
    // Мы считаем его действующим 29 минут,
    // чтобы не использовать почти истёкший токен.
    tokenExpiresAt =
      Date.now() + 29 * 60 * 1000;

    console.log(
      "Новый access token получен."
    );

    return cachedAccessToken;
  })();

  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

// ======================================================
// ВСПОМОГАТЕЛЬНАЯ ЗАДЕРЖКА
// ======================================================

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// ======================================================
// ЗАПРОС К GIGACHAT
// ======================================================

async function askGigaChatInternal(
  prompt,
  maxTokens = 800
) {
  const startedAt = Date.now();

  let lastError = null;

  // Максимум 3 попытки.
  // Особенно важно для 429.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(
        `GigaChat request. Attempt ${attempt}/3`
      );

      const accessToken =
        await getAccessToken();

      const response = await axios.post(
        CHAT_URL,
        {
          model: MODEL,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.35,

          max_tokens: maxTokens,
        },
        {
          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            Authorization:
              `Bearer ${accessToken}`,

            // Для api.giga.chat документация
            // рекомендует передавать User-Agent.
            "User-Agent":
              "content-constructor-gateway",
          },

          httpsAgent,

          timeout: 12000,
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
        response.data?.usage || null;

      console.log(
        "========================================"
      );

      console.log(
        "GIGACHAT RESPONSE"
      );

      console.log(
        "status:",
        response.status
      );

      console.log(
        "model:",
        response.data?.model
      );

      console.log(
        "finish_reason:",
        finishReason
      );

      console.log(
        "result_length:",
        content.length
      );

      console.log(
        "time_ms:",
        elapsed
      );

      console.log(
        "usage:",
        usage
      );

      console.log(
        "========================================"
      );

      return {
        content: content.trim(),

        finishReason,

        usage,

        elapsed,

        model:
          response.data?.model ||
          MODEL,

        status:
          response.status,
      };

    } catch (error) {
      lastError = error;

      const status =
        error.response?.status;

      const errorData =
        error.response?.data;

      console.error(
        "GIGACHAT REQUEST ERROR"
      );

      console.error(
        "attempt:",
        attempt
      );

      console.error(
        "status:",
        status
      );

      console.error(
        "data:",
        errorData ||
        error.message
      );

      // ==========================================
      // 401
      // ==========================================
      //
      // Токен мог истечь.
      // Сбрасываем его и получаем новый.
      //
      if (status === 401) {
        cachedAccessToken = null;
        tokenExpiresAt = 0;

        if (attempt < 3) {
          await sleep(1000);
          continue;
        }
      }

      // ==========================================
      // 429
      // ==========================================
      //
      // Слишком много запросов.
      //
      // Мы уже используем очередь,
      // но дополнительно делаем паузу.
      //
      if (status === 429) {
        if (attempt < 3) {
          const delay =
            attempt === 1
              ? 3000
              : 6000;

          console.log(
            `Получен 429. Ждём ${delay} ms...`
          );

          await sleep(delay);

          continue;
        }
      }

      // ==========================================
      // Остальные ошибки
      // ==========================================

      break;
    }
  }

  throw lastError;
}

// ======================================================
// ПУБЛИЧНАЯ ФУНКЦИЯ GIGACHAT
// ======================================================
//
// Здесь запрос помещается в глобальную очередь.
//
// В результате:
// запрос №1 → выполняется
// запрос №2 → ждёт
// запрос №3 → ждёт
// и т.д.
//
// ======================================================

async function askGigaChat(
  prompt,
  maxTokens = 800
) {
  return runInGigaQueue(() =>
    askGigaChatInternal(
      prompt,
      maxTokens
    )
  );
}

// ======================================================
// ПРОВЕРКА BRIDGE KEY
// ======================================================

function checkBridgeKey(receivedKey) {
  if (!BRIDGE_KEY) {
    throw new Error(
      "BRIDGE_KEY не найден в Environment Variables"
    );
  }

  if (!receivedKey) {
    throw new Error(
      "bridge_key отсутствует в запросе"
    );
  }

  if (receivedKey !== BRIDGE_KEY) {
    throw new Error(
      "Invalid bridge_key"
    );
  }
}

// ======================================================
// PROMPT ОБЫЧНОГО КОНТЕНТА
// ======================================================

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  reelsTopic,
  contentStyle,
}) {
  const type =
    contentType || "контент";

  const offerText =
    offer && offer.trim()
      ? offer
      : "Информация о конкретном продукте не указана. Не выдумывай факты.";

  const topicText =
    reelsTopic && reelsTopic.trim()
      ? reelsTopic
      : "Тема не указана. Выбери логичную тему исходя из бизнеса.";

  const styleText =
    contentStyle && contentStyle.trim()
      ? contentStyle
      : "Экспертный, живой и естественный стиль.";

  return `
Ты — профессиональный контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать готовый контент для предпринимателей и экспертов.

ВАЖНО:

- Пиши только готовый контент.
- Не объясняй, как ты его создавал.
- Не пиши «вот пример».
- Не пиши «можно сделать так».
- Не используй шаблонные фразы нейросети.
- Не выдумывай факты о бизнесе.
- Не выдумывай характеристики продукта, которых нет во входных данных.
- Текст должен звучать естественно.
- Избегай канцелярита.
- Избегай чрезмерной рекламности.
- Используй конкретику из данных пользователя.

========================================

ДАННЫЕ БИЗНЕСА

Чем занимается бизнес:
${businessInfo || "Не указано"}

Целевая аудитория:
${targetAudience || "Не указана"}

Что именно продвигаем:
${offerText}

Цель контента:
${contentGoal || "Не указана"}

Тема:
${topicText}

Стиль:
${styleText}

Формат:
${type}

========================================

ЕСЛИ ЭТО REELS:

Сделай:

🔥 ХУК

Короткая фраза, которая заставляет остановить просмотр.

🎬 СЦЕНАРИЙ

Пошаговый сценарий ролика.

Формулировки должны быть готовыми для произнесения человеком.

🎯 ФИНАЛ

Сильное завершение.

👉 CTA

Конкретное действие для зрителя.

Не пиши длинную теорию.

========================================

ЕСЛИ ЭТО ПОСТ:

Сделай полностью готовый пост.

Структура:

- сильное начало;
- раскрытие проблемы;
- конкретика;
- вывод;
- естественный CTA.

Не добавляй комментарии от себя.

========================================

ЕСЛИ ЭТО КАРУСЕЛЬ:

Сделай структуру слайдов.

Слайд 1 — сильный заголовок.

Слайды 2–7 — содержание.

Последний слайд — вывод и CTA.

Каждый слайд должен быть коротким и понятным.

========================================

ЕСЛИ ЭТО TELEGRAM-ПОСТ:

Напиши готовый пост для Telegram.

Стиль:

- живой;
- разговорный;
- экспертный;
- без лишней воды.

Используй абзацы и логичную структуру.

========================================

Верни только готовый результат.
`.trim();
}

// ======================================================
// PROMPT 5-ДНЕВНОЙ ЧАСТИ КОНТЕНТ-ПЛАНА
// ======================================================

function buildPlanChunkPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  contentStyle,
  previousPlan,
}) {
  const offerText =
    offer && offer.trim()
      ? offer
      : "Не указан. Не выдумывай характеристики продукта.";

  let previousContext = "";

  if (
    previousPlan &&
    previousPlan.trim()
  ) {
    previousContext = `
ПРЕДЫДУЩИЕ 5 ДНЕЙ:

${previousPlan.slice(-9000)}

Используй предыдущие дни только для того, чтобы:

- не повторять темы;
- соблюдать логику;
- постепенно раскрывать экспертность;
- чередовать форматы;
- сохранять единый контент-маршрут.

Не переписывай предыдущие дни.
`;
  } else {
    previousContext = `
Это первая часть контент-плана.
Предыдущих дней нет.
`;
  }

  return `
Ты — профессиональный контент-стратег и маркетолог.

Ты создаёшь контент-план внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создать дни ${startDay}–${endDay}.

ВАЖНО:

1. Создай РОВНО 5 дней.
2. Не создавай больше 5 дней.
3. Не создавай меньше 5 дней.
4. Каждый день должен быть самостоятельным.
5. Не повторяй темы из предыдущих дней.
6. Не выдумывай факты о бизнесе.
7. Не используй абстрактные темы.
8. Каждая публикация должна иметь конкретную задачу.
9. План должен быть реально выполнимым предпринимателем.
10. Не пиши длинные сценарии.
11. Не пиши огромные тексты самих постов.
12. На каждый день достаточно идеи, формата, темы, основной мысли и CTA.
13. Используй разные форматы.
14. Сохраняй последовательную логику продвижения.
15. Пиши по-русски.
16. Не объясняй свою работу.
17. Не добавляй вступление или заключение вне структуры дней.

========================================

ИНФОРМАЦИЯ О БИЗНЕСЕ:

${businessInfo || "Не указано"}

ЦЕЛЕВАЯ АУДИТОРИЯ:

${targetAudience || "Не указана"}

ЧТО ПРОДВИГАЕМ:

${offerText}

ЦЕЛЬ КОНТЕНТА:

${contentGoal || "Не указана"}

СТИЛЬ:

${contentStyle || "Экспертный, живой, естественный"}

========================================

${previousContext}

========================================

СТРУКТУРА КАЖДОГО ДНЯ:

ДЕНЬ N

Формат:
[Reels / Пост / Карусель / Telegram]

Тема:
[конкретная тема]

Задача:
[зачем публикуем этот контент]

Основная мысль:
[что должен понять человек]

CTA:
[конкретное действие]

========================================

ВАЖНО:

Один день должен занимать примерно 60–90 слов.

Не пиши полноценные посты и длинные сценарии.

Нужен именно компактный КОНТЕНТ-ПЛАН.

Создай только дни ${startDay}–${endDay}.
`.trim();
}

// ======================================================
// ГЕНЕРАЦИЯ ЧАСТИ ПЛАНА
// ======================================================

async function generatePlanChunk({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  offer,
  contentGoal,
  contentStyle,
  previousPlan,
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
      previousPlan,
    });

  console.log(
    "========================================"
  );

  console.log(
    `PLAN ${startDay}-${endDay}`
  );

  console.log(
    "prompt_length:",
    prompt.length
  );

  console.log(
    "previous_plan_length:",
    previousPlan?.length || 0
  );

  console.log(
    "========================================"
  );

  return await askGigaChat(
    prompt,
    700
  );
}

// ======================================================
// ОБЫЧНЫЙ /generate
// ======================================================

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  console.log(
    "========================================"
  );

  console.log(
    "GENERATE REQUEST RECEIVED"
  );

  console.log(
    "========================================"
  );

  try {
    const {
      bridge_key,
      content_type,
      business_info,
      target_audience,
      offer,
      content_goal,
      reels_topic,
      content_style,
    } = req.body || {};

    console.log(
      "content_type:",
      content_type
    );

    console.log(
      "business_info:",
      !!business_info
    );

    console.log(
      "target_audience:",
      !!target_audience
    );

    console.log(
      "offer:",
      !!offer
    );

    console.log(
      "content_goal:",
      !!content_goal
    );

    console.log(
      "reels_topic:",
      !!reels_topic
    );

    console.log(
      "content_style:",
      !!content_style
    );

    checkBridgeKey(
      bridge_key
    );

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
          content_style,
      });

    console.log(
      "prompt_length:",
      prompt.length
    );

    const result =
      await askGigaChat(
        prompt,
        800
      );

    console.log(
      "GENERATE FINISHED"
    );

    console.log(
      "time_ms:",
      Date.now() - startedAt
    );

    console.log(
      "result_length:",
      result.content.length
    );

    console.log(
      "finish_reason:",
      result.finishReason
    );

    if (!result.content) {
      return res.status(200).json({
        ok: false,

        reels_result:
          "Не удалось получить готовый контент. Попробуй ещё раз.",

        finish_reason:
          result.finishReason,
      });
    }

    return res.status(200).json({
      ok: true,

      reels_result:
        result.content,

      finish_reason:
        result.finishReason,

      result_length:
        result.content.length,

      model:
        result.model,

      time_ms:
        result.elapsed,
    });

  } catch (error) {
    console.error(
      "GENERATE ERROR:"
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    return res.status(200).json({
      ok: false,

      reels_result:
        "Произошла ошибка при генерации. Попробуй ещё раз через несколько секунд.",

      error: {
        status:
          error.response?.status ||
          500,

        message:
          error.response?.data ||
          error.message ||
          "Unknown error",
      },
    });
  }
});

// ======================================================
// ОБЩИЙ HANDLER ПЛАНА
// ======================================================

async function handlePlanChunk(
  req,
  res,
  startDay,
  endDay
) {
  const startedAt = Date.now();

  console.log(
    "========================================"
  );

  console.log(
    `PLAN REQUEST ${startDay}-${endDay}`
  );

  console.log(
    "========================================"
  );

  try {
    const {
      bridge_key,
      business_info,
      target_audience,
      offer,
      content_goal,
      content_style,
      previous_plan,
    } = req.body || {};

    console.log(
      "business_info:",
      !!business_info
    );

    console.log(
      "target_audience:",
      !!target_audience
    );

    console.log(
      "offer:",
      !!offer
    );

    console.log(
      "content_goal:",
      !!content_goal
    );

    console.log(
      "content_style:",
      !!content_style
    );

    console.log(
      "previous_plan_length:",
      previous_plan?.length || 0
    );

    checkBridgeKey(
      bridge_key
    );

    const result =
      await generatePlanChunk({
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
          previous_plan,
      });

    console.log(
      "========================================"
    );

    console.log(
      `PLAN ${startDay}-${endDay} FINISHED`
    );

    console.log(
      "time_ms:",
      Date.now() - startedAt
    );

    console.log(
      "result_length:",
      result.content.length
    );

    console.log(
      "finish_reason:",
      result.finishReason
    );

    console.log(
      "========================================"
    );

    if (!result.content) {
      return res.status(200).json({
        ok: false,

        reels_result:
          `Не удалось сгенерировать дни ${startDay}–${endDay}. Попробуй ещё раз.`,

        finish_reason:
          result.finishReason,
      });
    }

    return res.status(200).json({
      ok: true,

      reels_result:
        result.content,

      finish_reason:
        result.finishReason,

      result_length:
        result.content.length,

      model:
        result.model,

      time_ms:
        result.elapsed,
    });

  } catch (error) {
    console.error(
      "PLAN ERROR:"
    );

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    return res.status(200).json({
      ok: false,

      reels_result:
        `Не удалось сгенерировать дни ${startDay}–${endDay}. Попробуй ещё раз.`,

      error: {
        status:
          error.response?.status ||
          500,

        message:
          error.response?.data ||
          error.message ||
          "Unknown error",
      },
    });
  }
}

// ======================================================
// ПЛАН 1–5
// ======================================================

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

// ======================================================
// ПЛАН 6–10
// ======================================================

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

// ======================================================
// ПЛАН 11–15
// ======================================================

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

// ======================================================
// ПЛАН 16–20
// ======================================================

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

// ======================================================
// ПЛАН 21–25
// ======================================================

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

// ======================================================
// ПЛАН 26–30
// ======================================================

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

// ======================================================
// ROOT
// ======================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    model:
      MODEL,

    status:
      "running",
  });
});

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    model:
      MODEL,

    token_cached:
      !!cachedAccessToken,

    token_valid:
      cachedAccessToken &&
      tokenExpiresAt >
        Date.now(),

    time:
      new Date().toISOString(),
  });
});

// ======================================================
// TEST AUTH
// ======================================================

app.get(
  "/test-auth",
  async (req, res) => {
    try {
      const startedAt =
        Date.now();

      const token =
        await getAccessToken();

      return res.json({
        ok: true,

        status: 200,

        token_received:
          !!token,

        token_length:
          token?.length || 0,

        cached:
          !!cachedAccessToken,

        time_ms:
          Date.now() -
          startedAt,
      });

    } catch (error) {
      console.error(
        "TEST AUTH ERROR:"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );

      return res.status(200).json({
        ok: false,

        error: {
          status:
            error.response?.status ||
            500,

          message:
            error.response?.data ||
            error.message ||
            "Unknown error",
        },
      });
    }
  }
);

// ======================================================
// TEST GENERATE
// ======================================================

app.get(
  "/test-generate",
  async (req, res) => {
    try {
      const startedAt =
        Date.now();

      const result =
        await askGigaChat(
          "Напиши короткий тестовый ответ на русском языке: «Контент-конструктор работает».",
          100
        );

      return res.json({
        ok: true,

        status:
          result.status,

        time_ms:
          Date.now() -
          startedAt,

        result_length:
          result.content.length,

        model:
          result.model,

        finish_reason:
          result.finishReason,

        reels_result:
          result.content,
      });

    } catch (error) {
      console.error(
        "TEST GENERATE ERROR:"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );

      return res.status(200).json({
        ok: false,

        error: {
          status:
            error.response?.status ||
            500,

          message:
            error.response?.data ||
            error.message ||
            "Unknown error",
        },
      });
    }
  }
);

// ======================================================
// TEST PLAN 1–5
// ======================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    try {
      const startedAt =
        Date.now();

      const result =
        await generatePlanChunk({
          startDay: 1,
          endDay: 5,

          businessInfo:
            "Эксперт по продвижению малого бизнеса в Instagram и Telegram.",

          targetAudience:
            "Предприниматели и эксперты, которые хотят получать клиентов из социальных сетей.",

          offer:
            "Консультации и помощь с контентом для Instagram и Telegram.",

          contentGoal:
            "Привлечь внимание целевой аудитории и показать экспертность.",

          contentStyle:
            "Живой, уверенный, экспертный, без инфобизнесового пафоса.",

          previousPlan:
            "",
        });

      return res.json({
        ok: true,

        test:
          "plan-1-5",

        status:
          result.status,

        time_ms:
          Date.now() -
          startedAt,

        result_length:
          result.content.length,

        model:
          result.model,

        finish_reason:
          result.finishReason,

        usage:
          result.usage,

        reels_result:
          result.content,
      });

    } catch (error) {
      console.error(
        "TEST PLAN ERROR:"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );

      return res.status(200).json({
        ok: false,

        error: {
          status:
            error.response?.status ||
            500,

          message:
            error.response?.data ||
            error.message ||
            "Unknown error",
        },
      });
    }
  }
);

// ======================================================
// 404
// ======================================================

app.use(
  (req, res) => {
    res.status(404).json({
      ok: false,

      error:
        "Endpoint not found",

      path:
        req.path,

      method:
        req.method,
    });
  }
);

// ======================================================
// ЗАПУСК
// ======================================================

app.listen(
  PORT,
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "CONTENT CONSTRUCTOR GATEWAY"
    );

    console.log(
      "========================================"
    );

    console.log(
      "PORT:",
      PORT
    );

    console.log(
      "MODEL:",
      MODEL
    );

    console.log(
      "CHAT URL:",
      CHAT_URL
    );

    console.log(
      "OAUTH URL:",
      OAUTH_URL
    );

    console.log(
      "BRIDGE KEY:",
      BRIDGE_KEY
        ? "SET"
        : "NOT SET"
    );

    console.log(
      "GIGACHAT KEY:",
      GIGACHAT_KEY
        ? "SET"
        : "NOT SET"
    );

    console.log(
      "GIGACHAT QUEUE:",
      "ENABLED"
    );

    console.log(
      "TOKEN CACHE:",
      "ENABLED"
    );

    console.log(
      "========================================"
    );
  }
);
