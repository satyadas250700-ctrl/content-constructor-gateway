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

  if (
    cachedAccessToken &&
    tokenExpiresAt > now + 60000
  ) {
    return cachedAccessToken;
  }

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

      tokenExpiresAt =
        Date.now() + 29 * 60 * 1000;

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

      const accessToken =
        await getAccessToken();

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
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
            "User-Agent":
              "content-constructor-gateway"
          },
          httpsAgent,
          timeout: 12000
        }
      );

      const result =
        response.data?.choices?.[0]?.message?.content ||
        "";

      const finishReason =
        response.data?.choices?.[0]?.finish_reason;

      const usage =
        response.data?.usage || {};

      console.log(
        "GIGACHAT SUCCESS",
        {
          model:
            response.data?.model || MODEL,
          finish_reason:
            finishReason,
          usage,
          result_length:
            result.length
        }
      );

      return {
        text: result,
        finish_reason:
          finishReason,
        usage
      };

    } catch (error) {

      lastError = error;

      const status =
        error.response?.status;

      console.error(
        "GIGACHAT ERROR",
        {
          attempt,
          status,
          message:
            error.message,
          data:
            error.response?.data
        }
      );

      if (status === 401) {

        cachedAccessToken = null;
        tokenExpiresAt = 0;

        if (attempt < 3) {
          continue;
        }
      }

      if (status === 429) {

        if (attempt < 3) {

          const delay =
            attempt === 1
              ? 3000
              : 6000;

          console.log(
            `GIGACHAT 429. Waiting ${delay} ms...`
          );

          await new Promise(
            resolve =>
              setTimeout(resolve, delay)
          );

          continue;
        }
      }

      break;
    }
  }

  throw (
    lastError ||
    new Error(
      "GigaChat request failed"
    )
  );
}


// ======================================================
// GIGACHAT PUBLIC REQUEST
// ======================================================

async function askGigaChat(
  messages,
  options = {}
) {
  return runInGigaQueue(
    () =>
      askGigaChatInternal(
        messages,
        options
      )
  );
}


// ======================================================
// BRIDGE KEY
// ======================================================

function checkBridgeKey(req) {

  if (!BRIDGE_KEY) {

    return {
      ok: false,
      message:
        "BRIDGE_KEY is not configured"
    };
  }

  if (
    req.body?.bridge_key !==
    BRIDGE_KEY
  ) {

    return {
      ok: false,
      message:
        "Invalid bridge_key"
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
Ты — профессиональный контент-маркетолог,
контент-стратег и сценарист внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать сильный,
живой и готовый к публикации контент
для предпринимателей и экспертов.

Пиши на русском языке.

Не объясняй процесс создания.
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

Цель:
${content_goal || "не указана"}

Тема:
${reels_topic || "не указана"}

Стиль:
${content_style || "не указан"}


ПРАВИЛА ДОСТОВЕРНОСТИ:

Используй факты, предоставленные пользователем.

Не придумывай реальные факты о бизнесе.

Нельзя самостоятельно придумывать:

- цены;
- скидки;
- акции;
- промокоды;
- адреса;
- телефоны;
- ссылки;
- приложения;
- отзывы;
- количество клиентов;
- статистику;
- результаты;
- гарантии;
- сертификаты;
- сроки;
- условия доставки;
- условия оплаты;
- характеристики продукта;
- состав продукта;
- происхождение ингредиентов;
- технологию производства;
- конкретные услуги;
- конкретные позиции меню;
- наличие товара;
- ассортимент.


ОСОБОЕ ПРАВИЛО ОБ АССОРТИМЕНТЕ:

Если пользователь не назвал конкретный
товар, блюдо, услугу или позицию,
не придумывай её.

Например, если известно только:

«кофейня с кофе и десертами»,

нельзя самостоятельно добавлять:

«капучино»,
«флэт-уайт»,
«американо»,
«чизкейк»,
«фондан»,
«круассан»,
«тарт»,
«вафля»,
«трайфл»,
«сироп» и т.д.

Используй общие понятия:

«кофе»,
«напиток»,
«десерт»,
«позиция меню»,
«новинка»,
«продукт».

Если конкретный продукт был указан пользователем,
его использовать можно.


ВАЖНО:

Запрет касается именно фактов.

КРЕАТИВ НЕ ОГРАНИЧИВАЙ.

Разрешены:

- метафоры;
- сравнения;
- гиперболы;
- юмор;
- игра слов;
- эмоциональные образы;
- художественные формулировки;
- необычные ассоциации;
- драматизация;
- рекламная образность.

Например:

«антидепрессант дня»,
«маленький отпуск посреди рабочего дня»,
«шоколадная лавина»,
«билет в гастрономический праздник»,
«опасно вкусная привычка»

могут использоваться как очевидные
рекламные метафоры.

Но метафора не должна превращаться
в неподтверждённое фактическое утверждение.


CTA:

Используй только реалистичные действия.

Если пользователь не указал конкретный
канал связи или специальное предложение,
используй универсальные CTA:

- сохранить;
- поделиться;
- написать мнение;
- задать вопрос;
- ответить в комментариях;
- подписаться;
- рассказать о своём опыте;
- выбрать вариант;
- отметить человека.

Не придумывай ссылки,
телефоны, акции или промокоды.


КАЧЕСТВО:

Текст должен звучать естественно,
современно и по-человечески.

Избегай:

- канцелярита;
- одинаковых конструкций;
- чрезмерного количества эмодзи;
- банальных маркетинговых клише;
- искусственного «продающего» тона.

Используй заданный стиль.

Создай сильный вариант контента.
`;
}


// ======================================================
// NORMAL GENERATION
// ======================================================

app.post("/generate", async (req, res) => {

  const startedAt =
    Date.now();

  try {

    console.log(
      "GENERATE REQUEST RECEIVED"
    );

    const keyCheck =
      checkBridgeKey(req);

    if (!keyCheck.ok) {

      return res.status(200).json({
        ok: false,
        error:
          keyCheck.message,
        reels_result:
          "Не удалось выполнить генерацию."
      });
    }

    console.log(
      "REQUEST BODY KEYS:",
      Object.keys(
        req.body || {}
      )
    );

    const prompt =
      buildPrompt(req.body);

    const result =
      await askGigaChat(
        [
          {
            role: "system",
            content:
              "Ты профессиональный " +
              "контент-маркетолог. " +
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

    console.log(
      "GENERATE FINISHED",
      {
        elapsed_ms:
          Date.now() - startedAt,
        result_length:
          result.text.length,
        finish_reason:
          result.finish_reason
      }
    );

    return res.status(200).json({
      ok: true,
      status: 200,
      model: MODEL,
      finish_reason:
        result.finish_reason,
      usage:
        result.usage,
      reels_result:
        result.text
    });

  } catch (error) {

    console.error(
      "GENERATE ERROR",
      error
    );

    return res.status(200).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        "Generation failed",
      reels_result:
        "Не удалось выполнить генерацию. " +
        "Попробуйте ещё раз."
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

  const endDay =
    startDay + 4;

  return `
Ты создаёшь часть контент-плана
для сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Создай ровно 5 новых дней:

ДЕНЬ ${startDay}
ДЕНЬ ${startDay + 1}
ДЕНЬ ${startDay + 2}
ДЕНЬ ${startDay + 3}
ДЕНЬ ${endDay}

Это НЕ готовые сценарии.

Это продуманные идеи,
которые позже можно превратить
в полноценный Reels, пост,
карусель, Telegram-пост или Stories.


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

${previous_plan || "Предыдущих дней нет. Это начало плана."}


ФОРМАТ КАЖДОГО ДНЯ:

ДЕНЬ X

Формат: ...
Тема: ...
Цель: ...
Идея: ...
CTA: ...


ОБЪЁМ:

Каждый день — примерно 45–70 слов.

Не создавай полноценный сценарий.

Не пиши длинные тексты,
реплики, раскадровки или готовые посты.

Дай именно идею,
которую потом можно развернуть.


==================================================
ГЛАВНОЕ ПРАВИЛО — ФАКТЫ
==================================================

Используй только те реальные факты,
которые присутствуют во входных данных.

Никогда не выдавай придуманные тобой
сведения за реальные сведения о бизнесе.


ЗАПРЕЩЕНО САМОСТОЯТЕЛЬНО ПРИДУМЫВАТЬ:

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
- статистику;
- результаты;
- гарантии;
- сертификаты;
- сроки;
- условия доставки;
- условия оплаты;
- наличие товара;
- ассортимент;
- конкретные услуги;
- конкретные продукты;
- конкретные блюда;
- ингредиенты;
- происхождение ингредиентов;
- характеристики товара;
- технологию производства;
- факты о команде;
- факты об истории компании;
- реальные события;
- реальные достижения.


==================================================
ОСОБОЕ ПРАВИЛО ОБ АССОРТИМЕНТЕ
==================================================

Никогда не добавляй конкретные товары,
блюда, услуги или позиции меню,
которых нет во входных данных.

Например:

Если известно:

«кофейня с кофе и десертами»,

нельзя самостоятельно писать:

«капучино»,
«американо»,
«флэт-уайт»,
«чизкейк»,
«круассан»,
«фондан»,
«трайфл»,
«тарт»,
«вафля»,
«сироп»,
«лимонад».

Это относится даже к типичным
для данной ниши продуктам.

Используй:

«кофе»,
«напиток»,
«десерт»,
«продукт»,
«позиция меню»,
«новинка».

Если конкретный продукт указан
пользователем — использовать его можно.


==================================================
ЧТО МОЖНО ПРИДУМЫВАТЬ
==================================================

Креативность НЕ ограничивай.

Можно свободно придумывать:

- метафоры;
- сравнения;
- яркие образы;
- гиперболы;
- игру слов;
- юмор;
- эмоциональную драматургию;
- атмосферу;
- художественные концепции;
- необычные ракурсы;
- креативные названия рубрик;
- визуальные концепции.


Например:

«антидепрессант дня»

«маленький отпуск посреди рабочего дня»

«шоколадная лавина»

«опасно вкусная привычка»

«билет в гастрономический праздник»

допустимы как рекламные метафоры.

Не нужно делать контент сухим
только ради достоверности.


==================================================
МЕТАФОРА ≠ ФАКТ
==================================================

Можно написать:

«Этот десерт — маленький отпуск
посреди рабочего дня».

Нельзя писать:

«Этот десерт снижает уровень
кортизола на 30%».

Если медицинский, финансовый,
юридический или иной существенный
факт не был предоставлен пользователем,
не создавай его самостоятельно.


==================================================
CTA
==================================================

CTA должен быть реалистичным.

Если конкретный канал связи,
акция или предложение неизвестны,
используй универсальные CTA:

- сохранить;
- поделиться;
- написать мнение;
- ответить;
- задать вопрос;
- выбрать вариант;
- рассказать историю;
- отметить человека;
- подписаться.


==================================================
РАЗНООБРАЗИЕ
==================================================

Не превращай 30-дневный план
в 30 рекламных публикаций.

Чередуй задачи:

- привлечение;
- вовлечение;
- экспертность;
- доверие;
- демонстрация продукта;
- работа с возражениями;
- история бренда;
- личность бренда;
- польза;
- развлечение;
- диалог;
- эмоциональный контент;
- мягкая продажа.

Не повторяй темы из предыдущих дней.


==================================================
ПРЕДЫДУЩИЕ ДНИ
==================================================

Используй предыдущие 5 дней
только для того, чтобы:

1. не повторять темы;
2. сохранять логичное развитие плана;
3. чередовать форматы;
4. продолжать контентные линии,
   если это действительно уместно.


==================================================
ФИНАЛЬНОЕ ПРАВИЛО
==================================================

Если для идеи тебе хочется добавить
какой-то конкретный факт о бизнесе,
но этого факта нет во входных данных —

НЕ ДОБАВЛЯЙ ЕГО.

Замени его на творческую идею,
которая работает без этого факта.

При этом сохраняй яркость,
образность и маркетинговую силу.


Не добавляй вступление.

Не добавляй заключение.

Не объясняй свои решения.

Верни только 5 дней
в указанной структуре.
`;
}


// ======================================================
// PLAN CHUNK GENERATION
// ======================================================

async function generatePlanChunk(data) {

  const prompt =
    buildPlanChunkPrompt(data);

  const result =
    await askGigaChat(
      [
        {
          role: "system",
          content:
            "Ты сильный контент-стратег " +
            "и креативный маркетолог. " +
            "Создавай конкретные идеи " +
            "для контент-плана. " +
            "Не выдумывай реальные факты " +
            "о бизнесе. " +
            "Не выдумывай ассортимент. " +
            "При этом сохраняй яркую " +
            "метафорическую и образную подачу."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      {
        temperature: 0.38,
        max_tokens: 550
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
  startDay
) {

  const startedAt =
    Date.now();

  try {

    console.log(
      `PLAN ${startDay}-${startDay + 4} REQUEST RECEIVED`
    );

    const keyCheck =
      checkBridgeKey(req);

    if (!keyCheck.ok) {

      return res.status(200).json({
        ok: false,
        error:
          keyCheck.message,
        reels_result: ""
      });
    }

    const body =
      req.body || {};

    console.log(
      `PLAN ${startDay}-${startDay + 4} BODY KEYS:`,
      Object.keys(body)
    );

    const result =
      await generatePlanChunk({

        business_info:
          body.business_info,

        target_audience:
          body.target_audience,

        offer:
          body.offer,

        content_goal:
          body.content_goal,

        content_style:
          body.content_style,

        previous_plan:
          body.previous_plan || "",

        startDay
      });

    console.log(
      `PLAN ${startDay}-${startDay + 4} FINISHED`,
      {
        elapsed_ms:
          Date.now() - startedAt,

        result_length:
          result.text.length,

        finish_reason:
          result.finish_reason,

        usage:
          result.usage
      }
    );

    return res.status(200).json({
      ok: true,
      status: 200,
      model: MODEL,
      finish_reason:
        result.finish_reason,
      usage:
        result.usage,
      reels_result:
        result.text
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
// PLAN ENDPOINTS
// ======================================================

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      1
    );
  }
);

app.post(
  "/generate-plan-6-10",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      6
    );
  }
);

app.post(
  "/generate-plan-11-15",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      11
    );
  }
);

app.post(
  "/generate-plan-16-20",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      16
    );
  }
);

app.post(
  "/generate-plan-21-25",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      21
    );
  }
);

app.post(
  "/generate-plan-26-30",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      26
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

app.get(
  "/test-auth",
  async (req, res) => {

    const startedAt =
      Date.now();

    try {

      const token =
        await getAccessToken();

      return res.status(200).json({
        ok: true,
        status: 200,
        token_received:
          !!token,
        elapsed_ms:
          Date.now() - startedAt
      });

    } catch (error) {

      return res.status(200).json({
        ok: false,
        status:
          error.response?.status ||
          500,
        error:
          error.response?.data ||
          error.message
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

    const startedAt =
      Date.now();

    try {

      const result =
        await askGigaChat(
          [
            {
              role: "system",
              content:
                "Ты кратко отвечаешь " +
                "на русском языке."
            },
            {
              role: "user",
              content:
                "Напиши одну короткую " +
                "фразу для рекламного " +
                "Reels кофейни."
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
        finish_reason:
          result.finish_reason,
        usage:
          result.usage,
        elapsed_ms:
          Date.now() - startedAt,
        result:
          result.text
      });

    } catch (error) {

      return res.status(200).json({
        ok: false,
        status:
          error.response?.status ||
          500,
        error:
          error.response?.data ||
          error.message
      });
    }
  }
);


// ======================================================
// TEST PLAN 1-5
// ======================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {

    const startedAt =
      Date.now();

    try {

      const result =
        await generatePlanChunk({

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
            "Привлечь новую аудиторию, " +
            "показать продукт и повысить " +
            "интерес к кофейне",

          content_style:
            "Тёплый, живой, современный, " +
            "немного ироничный",

          previous_plan: "",

          startDay: 1
        });

      return res.status(200).json({
        ok: true,
        test:
          "plan-1-5",
        status: 200,
        time_ms:
          Date.now() - startedAt,
        result_length:
          result.text.length,
        model:
          MODEL,
        finish_reason:
          result.finish_reason,
        usage:
          result.usage,
        reels_result:
          result.text
      });

    } catch (error) {

      return res.status(200).json({
        ok: false,
        test:
          "plan-1-5",
        status:
          error.response?.status ||
          500,
        time_ms:
          Date.now() - startedAt,
        error:
          error.response?.data ||
          error.message
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
        "Endpoint not found"
    });

  }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Content Constructor Gateway ` +
      `running on port ${PORT}`
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

  }
);
