const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const https = require("https");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const BRIDGE_KEY = process.env.BRIDGE_KEY;
const GIGACHAT_KEY = process.env.GIGACHAT_KEY;

const MODEL = "GigaChat-3-Ultra";

const CHAT_URL = "https://api.giga.chat/v1/chat/completions";

const OAUTH_URL =
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});


// ======================================================
// GIGACHAT REQUEST QUEUE
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
// ACCESS TOKEN CACHE
// ======================================================

let cachedAccessToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

async function getAccessToken() {
  const now = Date.now();

  // Используем существующий токен, если до окончания осталось
  // больше одной минуты.
  if (
    cachedAccessToken &&
    tokenExpiresAt > now + 60000
  ) {
    return cachedAccessToken;
  }

  // Защита от параллельного получения нескольких токенов.
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      if (!GIGACHAT_KEY) {
        throw new Error("GIGACHAT_KEY is not configured");
      }

      const response = await axios.post(
        OAUTH_URL,
        new URLSearchParams({
          scope: "GIGACHAT_API_PERS"
        }).toString(),
        {
          headers: {
            Authorization: `Basic ${GIGACHAT_KEY}`,
            "Content-Type":
              "application/x-www-form-urlencoded",
            Accept: "application/json",
            RqUID: crypto.randomUUID()
          },
          httpsAgent,
          timeout: 10000
        }
      );

      cachedAccessToken = response.data.access_token;

      // Токен GigaChat живёт около 30 минут.
      // Используем запас и считаем его действительным 29 минут.
      tokenExpiresAt = Date.now() + 29 * 60 * 1000;

      return cachedAccessToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}


// ======================================================
// GIGACHAT INTERNAL REQUEST
// ======================================================

async function askGigaChatInternal(
  messages,
  options = {}
) {
  const {
    temperature = 0.35,
    max_tokens = 800
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const response = await axios.post(
        CHAT_URL,
        {
          model: MODEL,
          messages,
          temperature,
          max_tokens
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "content-constructor-gateway"
          },
          httpsAgent,
          timeout: 12000
        }
      );

      const result =
        response.data?.choices?.[0]?.message?.content || "";

      const finishReason =
        response.data?.choices?.[0]?.finish_reason;

      const usage =
        response.data?.usage || {};

      console.log("GIGACHAT SUCCESS", {
        model:
          response.data?.model || MODEL,
        finish_reason: finishReason,
        usage,
        result_length: result.length
      });

      return {
        text: result,
        finish_reason: finishReason,
        usage
      };

    } catch (error) {
      lastError = error;

      const status = error.response?.status;

      console.error("GIGACHAT ERROR", {
        attempt,
        status,
        message: error.message,
        data: error.response?.data
      });

      // Если токен протух — сбрасываем его.
      if (status === 401) {
        cachedAccessToken = null;
        tokenExpiresAt = 0;

        if (attempt < 3) {
          continue;
        }
      }

      // GigaChat может вернуть 429 при слишком частых
      // одновременных запросах.
      if (status === 429) {
        if (attempt < 3) {
          const delay =
            attempt === 1 ? 3000 : 6000;

          console.log(
            `GIGACHAT 429. Waiting ${delay} ms...`
          );

          await new Promise(resolve =>
            setTimeout(resolve, delay)
          );

          continue;
        }
      }

      break;
    }
  }

  throw lastError || new Error("GigaChat request failed");
}


// ======================================================
// GIGACHAT PUBLIC REQUEST
// Все запросы проходят через одну очередь.
// Это предотвращает 429 при генерации плана.
// ======================================================

async function askGigaChat(
  messages,
  options = {}
) {
  return runInGigaQueue(() =>
    askGigaChatInternal(messages, options)
  );
}


// ======================================================
// BRIDGE KEY
// ======================================================

function checkBridgeKey(req) {
  if (!BRIDGE_KEY) {
    return {
      ok: false,
      message: "BRIDGE_KEY is not configured"
    };
  }

  if (req.body?.bridge_key !== BRIDGE_KEY) {
    return {
      ok: false,
      message: "Invalid bridge_key"
    };
  }

  return {
    ok: true
  };
}


// ======================================================
// NORMAL CONTENT GENERATOR PROMPT
// ======================================================

function buildPrompt(data) {
  const {
    content_type,
    business_info,
    target_audience,
    offer,
    content_goal,
    reels_topic,
    content_style
  } = data;

  return `
Ты — профессиональный контент-маркетолог, стратег
и сценарист внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать готовый к публикации контент
для предпринимателей и экспертов.

Пиши на русском языке.

Главный принцип:
контент должен быть живым, естественным,
человеческим и конкретным.

Не пиши объяснения о том, как ты создавал текст.
Выдавай только готовый контент.

ДАННЫЕ БИЗНЕСА:

Тип контента:
${content_type || "не указан"}

Чем занимается бизнес:
${business_info || "не указано"}

Целевая аудитория:
${target_audience || "не указана"}

Продукт / предложение:
${offer || "не указано"}

Цель контента:
${content_goal || "не указана"}

Тема:
${reels_topic || "не указана"}

Стиль:
${content_style || "не указан"}


ВАЖНЫЕ ПРАВИЛА:

1. Используй факты из входных данных.

2. Не придумывай реальные факты о бизнесе:
   - цены;
   - скидки;
   - акции;
   - адреса;
   - телефоны;
   - ссылки;
   - приложения;
   - отзывы;
   - количество клиентов;
   - результаты;
   - сертификаты;
   - состав продукта;
   - характеристики;
   - сроки;
   - статистику;
   - гарантии.

3. Если какого-то факта нет, не выдавай
   выдумку за факт.

4. При этом тебе разрешено быть креативным.

5. Разрешены:
   - метафоры;
   - сравнения;
   - гиперболы;
   - яркие рекламные формулировки;
   - эмоциональные образы;
   - неожиданные ассоциации;
   - игровые формулировки;
   - юмор;
   - художественная подача.

6. Очевидная метафора не считается фактическим утверждением.
Например:
«маленький отпуск посреди рабочего дня»,
«антидепрессант дня»,
«шоколадная лавина»,
«билет в маленький гастрономический праздник»
могут использоваться как образные рекламные формулировки.

7. Но не представляй медицинские, финансовые,
юридические или иные существенные утверждения
как реальные факты, если они не были предоставлены
пользователем.

8. Не придумывай фиктивные отзывы и не выдавай
вымышленный опыт клиентов за настоящий.

9. CTA должен соответствовать реально доступным
действиям пользователя. Если конкретный канал
связи не указан, используй универсальный CTA.

10. Не используй шаблонный язык.
Текст должен звучать так, будто его написал
живой сильный контент-маркетолог.

11. Не злоупотребляй одинаковыми конструкциями.

12. Если пользователь дал конкретную тему,
не уходи от неё.

13. Сохраняй заданный стиль.


ФОРМАТ:
${content_type}

Создай максимально сильный вариант контента
по этим данным.
`;
}


// ======================================================
// NORMAL GENERATION
// ======================================================

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  try {
    console.log("GENERATE REQUEST RECEIVED");

    const keyCheck = checkBridgeKey(req);

    if (!keyCheck.ok) {
      return res.status(200).json({
        ok: false,
        error: keyCheck.message,
        reels_result:
          "Не удалось выполнить генерацию."
      });
    }

    console.log("REQUEST BODY KEYS:", Object.keys(req.body || {}));

    const prompt = buildPrompt(req.body);

    const result = await askGigaChat(
      [
        {
          role: "system",
          content:
            "Ты профессиональный контент-маркетолог. " +
            "Отвечай только готовым контентом."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      {
        temperature: 0.55,
        max_tokens: 800
      }
    );

    console.log("GENERATE FINISHED", {
      elapsed_ms: Date.now() - startedAt,
      result_length: result.text.length,
      finish_reason: result.finish_reason
    });

    return res.status(200).json({
      ok: true,
      status: 200,
      model: MODEL,
      finish_reason: result.finish_reason,
      usage: result.usage,
      reels_result: result.text
    });

  } catch (error) {
    console.error("GENERATE ERROR", error);

    return res.status(200).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        "Generation failed",
      reels_result:
        "Не удалось выполнить генерацию. Попробуйте ещё раз."
    });
  }
});


// ======================================================
// 30-DAY CONTENT PLAN PROMPT
// ======================================================

function buildPlanChunkPrompt({
  business_info,
  target_audience,
  offer,
  content_goal,
  content_style,
  previous_plan,
  startDay
}) {

  const endDay = startDay + 4;

  return `
Ты создаёшь часть контент-плана для сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Нужно создать ровно 5 дней контент-плана:
ДЕНЬ ${startDay} — ДЕНЬ ${endDay}.

Это НЕ готовые сценарии.
Это продуманные контент-идеи, которые пользователь
позже сможет превратить в полноценный пост, Reels,
карусель или Telegram-пост.

ДАННЫЕ БИЗНЕСА:

Чем занимается бизнес:
${business_info || "не указано"}

Целевая аудитория:
${target_audience || "не указана"}

Продукт / предложение:
${offer || "не указано"}

Цель контента:
${content_goal || "не указана"}

Стиль:
${content_style || "не указан"}


ПРЕДЫДУЩИЕ 5 ДНЕЙ:

${previous_plan || "Это первые 5 дней. Предыдущего плана нет."}


ЗАДАЧА:

Создай ровно 5 новых дней.

Для каждого дня используй только эту структуру:

ДЕНЬ X

Формат: ...
Тема: ...
Цель: ...
Идея: ...
CTA: ...


ТРЕБОВАНИЯ К ПЛАНУ:

1. Каждый день должен отличаться от остальных.

2. Чередуй форматы и типы контента:
   Reels, пост, карусель, Telegram-пост,
   Stories и другие подходящие форматы.

3. Учитывай целевую аудиторию,
   бизнес, продукт и цель.

4. Не превращай день в готовый сценарий.
Дай сильную основу, которую потом можно
развернуть в полноценный контент.

5. Идея должна быть достаточно конкретной,
чтобы по ней можно было сразу создать публикацию.

6. Не повторяй темы из предыдущих дней.

7. Не придумывай реальные факты о бизнесе.

ОСОБЕННО ВАЖНО:

Нельзя самостоятельно выдумывать:

- цены;
- скидки;
- акции;
- промокоды;
- адреса;
- телефоны;
- ссылки;
- приложения;
- реальные отзывы;
- количество клиентов;
- количество товара;
- сроки;
- результаты;
- статистику;
- сертификаты;
- состав продуктов;
- происхождение ингредиентов;
- характеристики товаров;
- факты о производстве;
- реальные события;
- наличие конкретных услуг;
- гарантии;
- реальные условия доставки или заказа.

Если такого факта нет во входных данных —
не используй его как факт.

Вместо этого придумай контентную идею,
которая не требует этого факта.

ПРИМЕР:

Плохо:
«Скидка 20% на десерт сегодня».

Если пользователь не сообщил о скидке,
это нельзя придумывать.

Хорошо:
«Покажите десерт через формат
“3 причины попробовать его”».

Плохо:
«Наши гости уже оставили сотни положительных отзывов».

Хорошо:
«Сделайте пост на основе реального отзыва,
если такой отзыв есть у бизнеса».

КРЕАТИВНОСТЬ:

При этом не делай план сухим.

Разрешены:
- метафоры;
- яркие образы;
- сравнения;
- гиперболы;
- эмоциональная подача;
- юмор;
- игра слов;
- неожиданные концепции;
- атмосферные формулировки.

Например:

«маленький отпуск посреди рабочего дня»

«антидепрессант дня»

«шоколадная лавина»

«билет в маленький гастрономический праздник»

подобные выражения допустимы как очевидные
метафоры и рекламная образность.

Главное — не выдавать метафору за реальный
медицинский, финансовый или иной существенный факт.

CTA:

CTA должен быть реалистичным.

Если конкретный канал связи,
акция или специальное предложение
не указаны пользователем, используй
универсальные CTA:

- сохранить;
- поделиться;
- написать своё мнение;
- ответить в комментариях;
- задать вопрос;
- подписаться;
- рассказать о своём опыте;
- выбрать вариант;
- отметить человека.

Не придумывай ссылки, телефоны,
промокоды или специальные акции.


КАЧЕСТВО:

Каждый день должен отвечать на вопрос:

«Зачем аудитории это смотреть или читать?»

Не делай 30 дней просто набором
рекламных публикаций.

Используй разные задачи:

- привлечение;
- вовлечение;
- доверие;
- экспертность;
- демонстрация продукта;
- работа с возражениями;
- история;
- личность бренда;
- польза;
- развлечение;
- диалог;
- социальное доказательство,
  но только если реальные доказательства
  предоставлены пользователем;
- мягкая продажа.


ОГРАНИЧЕНИЕ ОБЪЁМА:

Каждый день должен быть компактным.

Не пиши полноценный сценарий.
Не пиши длинные тексты.

Нужно создать именно контент-план.


ВАЖНО:

Не добавляй вступление.
Не добавляй заключение.
Не пиши пояснения.

Верни только:

ДЕНЬ ${startDay}
...
ДЕНЬ ${endDay}
`;
}


// ======================================================
// PLAN CHUNK GENERATION
// ======================================================

async function generatePlanChunk(data) {

  const prompt = buildPlanChunkPrompt(data);

  const result = await askGigaChat(
    [
      {
        role: "system",
        content:
          "Ты сильный контент-стратег и креативный " +
          "маркетолог. Создавай конкретные идеи " +
          "для контент-плана. Не выдумывай реальные " +
          "факты о бизнесе, но используй яркую " +
          "метафорическую и образную подачу."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    {
      temperature: 0.35,
      max_tokens: 700
    }
  );

  return result;
}


// ======================================================
// COMMON PLAN REQUEST HANDLER
// ======================================================

async function handlePlanRequest(
  req,
  res,
  startDay,
  previousVariable
) {
  const startedAt = Date.now();

  try {
    console.log(
      `PLAN ${startDay}-${startDay + 4} REQUEST RECEIVED`
    );

    const keyCheck = checkBridgeKey(req);

    if (!keyCheck.ok) {
      return res.status(200).json({
        ok: false,
        error: keyCheck.message,
        reels_result: ""
      });
    }

    const body = req.body || {};

    console.log(
      `PLAN ${startDay}-${startDay + 4} BODY KEYS:`,
      Object.keys(body)
    );

    const result = await generatePlanChunk({
      business_info: body.business_info,
      target_audience: body.target_audience,
      offer: body.offer,
      content_goal: body.content_goal,
      content_style: body.content_style,
      previous_plan:
        body.previous_plan || body[previousVariable] || "",
      startDay
    });

    console.log(
      `PLAN ${startDay}-${startDay + 4} FINISHED`,
      {
        elapsed_ms: Date.now() - startedAt,
        result_length: result.text.length,
        finish_reason: result.finish_reason,
        usage: result.usage
      }
    );

    return res.status(200).json({
      ok: true,
      status: 200,
      model: MODEL,
      finish_reason: result.finish_reason,
      usage: result.usage,
      reels_result: result.text
    });

  } catch (error) {

    console.error(
      `PLAN ${startDay}-${startDay + 4} ERROR`,
      error
    );

    return res.status(200).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        "Plan generation failed",
      reels_result: ""
    });
  }
}


// ======================================================
// PLAN 1-5
// ======================================================

app.post("/generate-plan-1-5", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    1,
    "previous_plan"
  );
});


// ======================================================
// PLAN 6-10
// ======================================================

app.post("/generate-plan-6-10", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    6,
    "previous_plan"
  );
});


// ======================================================
// PLAN 11-15
// ======================================================

app.post("/generate-plan-11-15", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    11,
    "previous_plan"
  );
});


// ======================================================
// PLAN 16-20
// ======================================================

app.post("/generate-plan-16-20", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    16,
    "previous_plan"
  );
});


// ======================================================
// PLAN 21-25
// ======================================================

app.post("/generate-plan-21-25", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    21,
    "previous_plan"
  );
});


// ======================================================
// PLAN 26-30
// ======================================================

app.post("/generate-plan-26-30", async (req, res) => {
  return handlePlanRequest(
    req,
    res,
    26,
    "previous_plan"
  );
});


// ======================================================
// ROOT
// ======================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    model: MODEL,
    status: "online"
  });
});


// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    model: MODEL,
    queue: "enabled"
  });
});


// ======================================================
// TEST AUTH
// ======================================================

app.get("/test-auth", async (req, res) => {

  const startedAt = Date.now();

  try {

    const token = await getAccessToken();

    return res.status(200).json({
      ok: true,
      status: 200,
      token_received: !!token,
      elapsed_ms: Date.now() - startedAt
    });

  } catch (error) {

    return res.status(200).json({
      ok: false,
      status: error.response?.status || 500,
      error:
        error.response?.data ||
        error.message
    });
  }
});


// ======================================================
// TEST GENERATE
// ======================================================

app.get("/test-generate", async (req, res) => {

  const startedAt = Date.now();

  try {

    const result = await askGigaChat(
      [
        {
          role: "system",
          content:
            "Ты кратко отвечаешь на русском языке."
        },
        {
          role: "user",
          content:
            "Напиши одну короткую фразу " +
            "для рекламного Reels кофейни."
        }
      ],
      {
        temperature: 0.5,
        max_tokens: 200
      }
    );

    return res.status(200).json({
      ok: true,
      status: 200,
      model: MODEL,
      finish_reason: result.finish_reason,
      usage: result.usage,
      elapsed_ms: Date.now() - startedAt,
      result: result.text
    });

  } catch (error) {

    return res.status(200).json({
      ok: false,
      status: error.response?.status || 500,
      error:
        error.response?.data ||
        error.message
    });
  }
});


// ======================================================
// TEST PLAN 1-5
// ======================================================

app.get("/test-plan-1-5", async (req, res) => {

  const startedAt = Date.now();

  try {

    const result = await generatePlanChunk({
      business_info:
        "Небольшая кофейня в Новомосковске " +
        "с кофе и десертами",

      target_audience:
        "Жители города 20–40 лет, " +
        "которые любят кофе, уютные места " +
        "и красивые десерты",

      offer:
        "Кофе и десерты",

      content_goal:
        "Привлечь новую аудиторию, показать " +
        "продукт и повысить интерес к кофейне",

      content_style:
        "Тёплый, живой, современный, " +
        "немного ироничный",

      previous_plan: "",

      startDay: 1
    });

    return res.status(200).json({
      ok: true,
      test: "plan-1-5",
      status: 200,
      time_ms: Date.now() - startedAt,
      result_length: result.text.length,
      model: MODEL,
      finish_reason: result.finish_reason,
      usage: result.usage,
      reels_result: result.text
    });

  } catch (error) {

    return res.status(200).json({
      ok: false,
      test: "plan-1-5",
      status: error.response?.status || 500,
      time_ms: Date.now() - startedAt,
      error:
        error.response?.data ||
        error.message
    });
  }
});


// ======================================================
// 404
// ======================================================

app.use((req, res) => {

  res.status(404).json({
    ok: false,
    error: "Endpoint not found"
  });

});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {

  console.log(
    `Content Constructor Gateway running on port ${PORT}`
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    `Chat URL: ${CHAT_URL}`
  );

  console.log(
    `GigaChat queue: ENABLED`
  );

});
