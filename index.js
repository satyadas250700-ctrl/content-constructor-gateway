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
  rejectUnauthorized: false,
});

/* =========================================================
   GIGACHAT QUEUE
   ========================================================= */

let gigaChatQueue = Promise.resolve();

function runInGigaQueue(task) {
  const nextTask = gigaChatQueue.then(
    () => task(),
    () => task()
  );

  gigaChatQueue = nextTask.catch(() => {});

  return nextTask;
}

/* =========================================================
   TOKEN CACHE
   ========================================================= */

let cachedAccessToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

async function getAccessToken() {
  if (
    cachedAccessToken &&
    tokenExpiresAt > Date.now() + 60 * 1000
  ) {
    return cachedAccessToken;
  }

  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      const response = await axios.post(
        OAUTH_URL,
        new URLSearchParams({
          scope: "GIGACHAT_API_PERS",
        }).toString(),
        {
          headers: {
            Authorization: `Basic ${GIGACHAT_KEY}`,
            "Content-Type":
              "application/x-www-form-urlencoded",
            Accept: "application/json",
            RqUID: crypto.randomUUID(),
          },
          httpsAgent,
          timeout: 10000,
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

/* =========================================================
   GIGACHAT REQUEST
   ========================================================= */

async function askGigaChatInternal(
  messages,
  options = {},
  retryAttempt = 0
) {
  const token = await getAccessToken();

  const temperature =
    options.temperature !== undefined
      ? options.temperature
      : 0.55;

  const maxTokens =
    options.max_tokens !== undefined
      ? options.max_tokens
      : 800;

  const startedAt = Date.now();

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent":
            "content-constructor-gateway",
        },
        httpsAgent,
        timeout: 12000,
      }
    );

    const elapsed = Date.now() - startedAt;

    const choice =
      response.data &&
      response.data.choices &&
      response.data.choices[0];

    const result =
      choice &&
      choice.message &&
      choice.message.content
        ? choice.message.content.trim()
        : "";

    console.log(
      "GIGACHAT SUCCESS",
      JSON.stringify({
        elapsed_ms: elapsed,
        model:
          response.data.model || MODEL,
        finish_reason:
          choice && choice.finish_reason
            ? choice.finish_reason
            : null,
        usage: response.data.usage || null,
        prompt_length:
          JSON.stringify(messages).length,
        result_length: result.length,
      })
    );

    return {
      text: result,
      raw: response.data,
    };
  } catch (error) {
    const status =
      error.response &&
      error.response.status;

    const errorData =
      error.response &&
      error.response.data;

    console.error(
      "GIGACHAT ERROR",
      JSON.stringify({
        status,
        message: error.message,
        data: errorData || null,
        retryAttempt,
      })
    );

    if (
      status === 401 &&
      retryAttempt < 1
    ) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;

      return askGigaChatInternal(
        messages,
        options,
        retryAttempt + 1
      );
    }

    if (
      status === 429 &&
      retryAttempt < 2
    ) {
      const delay =
        retryAttempt === 0
          ? 3000
          : 6000;

      console.log(
        `GIGACHAT 429. Retry after ${delay} ms`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );

      return askGigaChatInternal(
        messages,
        options,
        retryAttempt + 1
      );
    }

    throw error;
  }
}

/* =========================================================
   PUBLIC GIGACHAT FUNCTION
   ========================================================= */

async function askGigaChat(
  messages,
  options = {}
) {
  return runInGigaQueue(() =>
    askGigaChatInternal(
      messages,
      options
    )
  );
}

/* =========================================================
   BRIDGE KEY
   ========================================================= */

function checkBridgeKey(body) {
  if (!BRIDGE_KEY) {
    return false;
  }

  return (
    body &&
    body.bridge_key &&
    body.bridge_key === BRIDGE_KEY
  );
}

/* =========================================================
   NORMAL CONTENT GENERATOR
   ========================================================= */

function buildPrompt(body) {
  const contentType =
    body.content_type || "";

  const businessInfo =
    body.business_info || "";

  const targetAudience =
    body.target_audience || "";

  const offer =
    body.offer || "";

  const contentGoal =
    body.content_goal || "";

  const reelsTopic =
    body.reels_topic || "";

  const contentStyle =
    body.content_style || "";

  return `
Ты — профессиональный контент-маркетолог, стратег
и сценарист внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать готовый к публикации
русскоязычный контент на основе информации пользователя.

ВАЖНО:
Ты работаешь НЕ с вымышленным бизнесом.
Ты должен опираться только на факты, которые
передал пользователь.

ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Продукт / услуга / предложение:
${offer}

Цель контента:
${contentGoal}

Тема:
${reelsTopic}

Стиль:
${contentStyle}

Формат:
${contentType}


КРИТИЧЕСКОЕ ПРАВИЛО ФАКТОВ:

Не придумывай реальные факты о бизнесе.

Запрещено самостоятельно придумывать:
- цены;
- скидки;
- акции;
- промокоды;
- адреса;
- телефоны;
- ссылки;
- приложения;
- способы оплаты;
- условия доставки;
- гарантии;
- сертификаты;
- количество клиентов;
- отзывы;
- результаты клиентов;
- статистику;
- сроки;
- команду;
- историю бизнеса;
- реальные события;
- достижения;
- технологии производства;
- характеристики товара;
- ингредиенты;
- происхождение продукта;
- наличие товара;
- ассортимент;
- конкретные товары или услуги,
  которых пользователь не называл.


ОСОБОЕ ПРАВИЛО ОБ АССОРТИМЕНТЕ:

Если пользователь написал только что-то вроде:
«кофейня с кофе и десертами»,

это НЕ означает, что у бизнеса обязательно есть:
капучино, латте, американо, флэт-уайт,
чизкейк, фондан, круассан, тарт, вафля,
трайфл, сиропы и другие конкретные позиции.

Не добавляй такие конкретные названия.

Используй только:
«кофе»,
«напиток»,
«десерт»,
«позиция меню»,
«новинка»
и другие обобщённые формулировки.

Если пользователь сам назвал конкретный продукт,
его можно использовать.


ПРАВИЛО ИСТОЧНИКА:

Любое конкретное существительное,
которое выглядит как товар, услуга, характеристика
или реальный атрибут бизнеса, должно быть подтверждено
данными пользователя.

Если такого подтверждения нет —
не превращай его в утверждение о реальном бизнесе.


ПРИ ЭТОМ ТВОРЧЕСТВО РАЗРЕШЕНО.

Можно использовать:
- метафоры;
- сравнения;
- гиперболу;
- юмор;
- игру слов;
- эмоциональные образы;
- художественные концепции;
- придуманные сценарные ситуации;
- атмосферные описания.

Например:
«антидепрессант дня»,
«маленький отпуск посреди рабочего дня»,
«шоколадная лавина»,
«опасно вкусная привычка»,
«билет в гастрономический праздник».

Такие выражения допустимы как рекламная образность,
но они не должны выдавать выдумку за реальный факт бизнеса.


Если нужно придумать сцену для контента,
представляй её как ИДЕЮ или СЦЕНАРИЙ,
а не как утверждение, что именно так
реально происходит в бизнесе.


ТРЕБОВАНИЯ К РЕЗУЛЬТАТУ:

Пиши естественно, живо и современно.
Не пиши объяснения от лица ИИ.
Не говори, что ты нейросеть.
Не добавляй предупреждения.

Результат должен быть сразу пригоден
для использования в контенте.

Для Reels используй:
- сильный hook;
- сценарий;
- основную мысль;
- CTA.

Для поста:
- заголовок;
- основной текст;
- CTA.

Для карусели:
- структуру слайдов;
- текст каждого слайда;
- CTA.

Для Telegram-поста:
- сильное начало;
- основной текст;
- CTA.

Не используй канцелярит.
Не делай текст безликим.
Избегай повторяющихся шаблонов.
`.trim();
}

/* =========================================================
   NORMAL /generate
   ========================================================= */

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  console.log(
    "GENERATE REQUEST RECEIVED"
  );

  console.log(
    JSON.stringify({
      content_type:
        req.body &&
        req.body.content_type,
      has_body: !!req.body,
      keys: req.body
        ? Object.keys(req.body)
        : [],
    })
  );

  if (!checkBridgeKey(req.body)) {
    console.error(
      "INVALID BRIDGE KEY"
    );

    return res.status(200).json({
      ok: false,
      reels_result:
        "Ошибка авторизации шлюза.",
    });
  }

  try {
    const prompt =
      buildPrompt(req.body);

    const result =
      await askGigaChat(
        [
          {
            role: "system",
            content:
              "Ты профессиональный русскоязычный контент-маркетолог и сценарист.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        {
          temperature: 0.55,
          max_tokens: 800,
        }
      );

    console.log(
      "GENERATE COMPLETE",
      JSON.stringify({
        elapsed_ms:
          Date.now() - startedAt,
        result_length:
          result.text.length,
      })
    );

    return res.status(200).json({
      ok: true,
      reels_result: result.text,
      model: MODEL,
    });
  } catch (error) {
    console.error(
      "GENERATE FAILED",
      error.message
    );

    return res.status(200).json({
      ok: false,
      reels_result:
        "Не удалось сгенерировать контент. Попробуй ещё раз.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
    });
  }
});

/* =========================================================
   30-DAY CONTENT PLAN PROMPT
   ========================================================= */

function buildPlanChunkPrompt(body) {
  const startDay =
    Number(body.start_day) || 1;

  const endDay =
    Number(body.end_day) || 5;

  const businessInfo =
    body.business_info || "";

  const targetAudience =
    body.target_audience || "";

  const offer =
    body.offer || "";

  const contentGoal =
    body.content_goal || "";

  const contentStyle =
    body.content_style || "";

  const previousPlan =
    body.previous_plan || "";

  return `
Ты — профессиональный контент-стратег
и маркетолог внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Создай часть контент-плана на 30 дней:
ДНИ ${startDay}–${endDay}.

Это НЕ набор выдуманных сцен о том,
как якобы работает бизнес.

Это набор КОНТЕНТНЫХ КОНЦЕПЦИЙ:
что показать, о чём рассказать,
какую эмоцию вызвать,
какой вопрос задать аудитории,
какую мысль донести.


ИНФОРМАЦИЯ О БИЗНЕСЕ:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Продукт / услуга / предложение:
${offer}

Цель контента:
${contentGoal}

Стиль:
${contentStyle}


ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan || "Это первая часть плана."}


ЗАДАЧА:

Создай ровно 5 дней:
с ${startDay} по ${endDay}.

Каждый день должен содержать:

ДЕНЬ X

Формат:
Тема:
Цель:
Идея:
CTA:


ОБЪЁМ:

Ориентир — примерно 45–70 слов
на один день.

Не пиши длинные сценарии.
Не расписывай каждый кадр подробно.
Не превращай план в готовую статью.

Но идея должна быть достаточно конкретной,
чтобы предприниматель сразу понял,
что ему нужно создать.


==================================================
ГЛАВНЫЙ ПРИНЦИП: КОНТЕНТНАЯ КОНЦЕПЦИЯ
==================================================

Не пытайся самостоятельно придумывать,
КАК именно устроен бизнес внутри.

Вместо этого создавай идеи,
которые можно реализовать на основе
того, что уже есть у пользователя.

Например, вместо:

«Покажите руки бариста,
как он готовит напиток».

лучше:

«Постройте Reels вокруг момента
первого глотка: до него — спешка,
после — ощущение, будто день
нажал кнопку “пауза”.»

Вместо:

«Снимите столик у окна
с десертом и чашкой кофе».

лучше:

«Покажите идею личной паузы:
момент, когда человек на несколько минут
откладывает дела и выбирает себя.»

Вместо:

«Покажите вашу кофемашину».

лучше:

«Сделайте короткий Reels о звуках
и ощущениях, которые ассоциируются
с долгожданной кофейной паузой.»

То есть:

КОНЦЕПЦИЯ — можно придумывать.

КОНКРЕТНЫЙ АТРИБУТ БИЗНЕСА —
только если он подтверждён пользователем.


==================================================
КРИТИЧЕСКОЕ ПРАВИЛО ФАКТОВ
==================================================

Источник конкретных фактов о бизнесе —
ТОЛЬКО данные, которые передал пользователь.

Нельзя самостоятельно придумывать
реальные факты.


ЗАПРЕЩЕНО ВЫДУМЫВАТЬ:

- цены;
- скидки;
- акции;
- промокоды;
- адреса;
- телефоны;
- ссылки;
- приложения;
- способы оплаты;
- доставку;
- условия заказа;
- гарантии;
- сертификаты;
- отзывы;
- количество клиентов;
- статистику;
- результаты;
- обещания;
- реальные события;
- достижения;
- историю бизнеса;
- команду;
- сотрудников;
- оборудование;
- технологии производства;
- происхождение товара;
- ингредиенты;
- характеристики;
- наличие;
- ассортимент;
- конкретные товары;
- конкретные услуги,
если пользователь их не называл.


==================================================
ОСОБОЕ ПРАВИЛО ОБ АССОРТИМЕНТЕ
==================================================

Никогда не расширяй ассортимент
на основании собственных знаний
о типичном бизнесе.

Например, если пользователь написал:

«кофейня с кофе и десертами»

нельзя самостоятельно добавлять:

капучино,
латте,
американо,
флэт-уайт,
раф,
матча,
чизкейк,
фондан,
круассан,
тарт,
вафлю,
трайфл,
сироп,
сэндвич,
завтрак
и любые другие конкретные позиции.

Даже если такие продукты типичны
для кофеен.

Используй обобщения:

«кофе»,
«напиток»,
«десерт»,
«позиция меню»,
«продукт»,
«новинка».

Конкретную позицию можно использовать
ТОЛЬКО если она прямо указана
в информации пользователя.


==================================================
НЕ ПРИДУМЫВАЙ АТРИБУТЫ БИЗНЕСА
==================================================

Если пользователь сообщил только
«кофейня с кофе и десертами»,
не утверждай наличие:

- бариста;
- кофемашины;
- витрины;
- столиков у окна;
- фарфоровых чашек;
- упаковки навынос;
- доставки;
- музыки;
- Wi-Fi;
- розеток;
- террасы;
- кухни;
- собственной выпечки;
- определённого интерьера.

Если пользователь этого не сообщил,
это не является известным фактом.


==================================================
СЦЕНАРНЫЕ ДЕТАЛИ
==================================================

Можно предлагать действия,
которые являются частью ИДЕИ контента,
но формулируй их как предложение
для создания материала.

Например:

«Можно построить видео на контрасте:
спешка → пауза → удовольствие».

Можно:

«Снимите человека, который откладывает
телефон и делает паузу».

Но не нужно писать:

«Наши гости всегда откладывают телефоны
после первого глотка».

Первое — сценарная идея.

Второе — выдуманный факт.


==================================================
ТВОРЧЕСТВО НЕ ОГРАНИЧИВАЙ
==================================================

Разрешены:

- метафоры;
- сравнения;
- гипербола;
- юмор;
- ирония;
- эмоциональные образы;
- художественные концепции;
- рекламные формулировки;
- игровые механики;
- придуманные сюжетные ситуации.

Например:

«антидепрессант дня»,
«маленький отпуск посреди рабочего дня»,
«шоколадная лавина»,
«опасно вкусная привычка»,
«билет в гастрономический праздник».

Такие выражения МОЖНО использовать.

Это художественная подача,
а не утверждение факта.


==================================================
РАЗНООБРАЗИЕ
==================================================

Не делай пять одинаковых рекламных публикаций.

Чередуй задачи:

- привлечение внимания;
- вовлечение;
- доверие;
- экспертность;
- знакомство с брендом;
- работа с возражениями;
- эмоциональный контент;
- продажи;
- комьюнити;
- демонстрация ценности.

Используй разные форматы:

Reels,
пост,
карусель,
Stories,
Telegram-пост
и другие подходящие форматы.

Не делай каждый день прямой продажей.


==================================================
ПОСЛЕДОВАТЕЛЬНОСТЬ 30 ДНЕЙ
==================================================

Если передан предыдущий блок плана,
учитывай его.

Не повторяй темы предыдущих дней.

Не повторяй одну и ту же идею
разными словами.

Не повторяй один и тот же CTA
несколько раз подряд.

Новый блок должен ощущаться
как продолжение предыдущего,
а не как случайный список.


==================================================
ВАЖНО
==================================================

Если тебе не хватает конкретного факта,
НЕ ПРИДУМЫВАЙ ЕГО.

Лучше используй более универсальную
и креативную формулировку.

Креативность должна появляться
из идеи и подачи,
а не из выдумывания фактов.


==================================================
ФОРМАТ ОТВЕТА
==================================================

Строго:

ДЕНЬ 1

Формат: ...
Тема: ...
Цель: ...
Идея: ...
CTA: ...

ДЕНЬ 2

...

И так далее.

Не добавляй вступление.
Не добавляй заключение.
Не добавляй комментарии от себя.
`.trim();
}

/* =========================================================
   PLAN CHUNK GENERATOR
   ========================================================= */

async function generatePlanChunk(body) {
  const prompt =
    buildPlanChunkPrompt(body);

  const result =
    await askGigaChat(
      [
        {
          role: "system",
          content:
            "Ты профессиональный русскоязычный контент-стратег. Создавай практичные и креативные контент-планы. Факты бизнеса бери только из данных пользователя. Креативность выражай через идеи, подачу, метафоры и сценарные концепции, а не через выдумывание характеристик бизнеса.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        temperature: 0.38,
        max_tokens: 700,
      }
    );

  return result;
}

/* =========================================================
   PLAN REQUEST HANDLER
   ========================================================= */

async function handlePlanRequest(
  req,
  res,
  startDay,
  endDay
) {
  const startedAt = Date.now();

  console.log(
    `PLAN REQUEST ${startDay}-${endDay}`
  );

  if (!checkBridgeKey(req.body)) {
    console.error(
      "INVALID BRIDGE KEY FOR PLAN"
    );

    return res.status(200).json({
      ok: false,
      reels_result:
        "Ошибка авторизации шлюза.",
    });
  }

  try {
    const result =
      await generatePlanChunk({
        ...req.body,
        start_day: startDay,
        end_day: endDay,
      });

    console.log(
      `PLAN ${startDay}-${endDay} COMPLETE`,
      JSON.stringify({
        elapsed_ms:
          Date.now() - startedAt,
        result_length:
          result.text.length,
      })
    );

    return res.status(200).json({
      ok: true,
      reels_result: result.text,
      model: MODEL,
      start_day: startDay,
      end_day: endDay,
    });
  } catch (error) {
    console.error(
      `PLAN ${startDay}-${endDay} FAILED`,
      error.message
    );

    return res.status(200).json({
      ok: false,
      reels_result:
        "Не удалось сгенерировать эту часть контент-плана. Попробуй ещё раз.",
      start_day: startDay,
      end_day: endDay,
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
    });
  }
}

/* =========================================================
   SIX PLAN ENDPOINTS
   ========================================================= */

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      1,
      5
    );
  }
);

app.post(
  "/generate-plan-6-10",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      6,
      10
    );
  }
);

app.post(
  "/generate-plan-11-15",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      11,
      15
    );
  }
);

app.post(
  "/generate-plan-16-20",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      16,
      20
    );
  }
);

app.post(
  "/generate-plan-21-25",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      21,
      25
    );
  }
);

app.post(
  "/generate-plan-26-30",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      26,
      30
    );
  }
);

/* =========================================================
   ROOT
   ========================================================= */

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service:
      "content-constructor-gateway",
    model: MODEL,
    status: "online",
  });
});

/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    model: MODEL,
    queue:
      gigaChatQueue
        ? "active"
        : "unknown",
  });
});

/* =========================================================
   TEST AUTH
   ========================================================= */

app.get("/test-auth", async (req, res) => {
  try {
    const token =
      await getAccessToken();

    res.status(200).json({
      ok: true,
      token_received: !!token,
      token_length: token
        ? token.length
        : 0,
    });
  } catch (error) {
    console.error(
      "TEST AUTH FAILED",
      error.message
    );

    res.status(200).json({
      ok: false,
      error: error.message,
    });
  }
});

/* =========================================================
   TEST GENERATE
   ========================================================= */

app.get(
  "/test-generate",
  async (req, res) => {
    const startedAt = Date.now();

    try {
      const result =
        await askGigaChat(
          [
            {
              role: "system",
              content:
                "Ты помощник для проверки API. Отвечай кратко на русском.",
            },
            {
              role: "user",
              content:
                "Напиши короткое приветствие для теста Telegram-бота.",
            },
          ],
          {
            temperature: 0.4,
            max_tokens: 100,
          }
        );

      res.status(200).json({
        ok: true,
        test: "generate",
        status: 200,
        time_ms:
          Date.now() - startedAt,
        model: MODEL,
        finish_reason:
          result.raw &&
          result.raw.choices &&
          result.raw.choices[0]
            ? result.raw.choices[0]
                .finish_reason
            : null,
        usage:
          result.raw &&
          result.raw.usage
            ? result.raw.usage
            : null,
        answer: result.text,
      });
    } catch (error) {
      console.error(
        "TEST GENERATE FAILED",
        error.message
      );

      res.status(200).json({
        ok: false,
        test: "generate",
        status:
          error.response &&
          error.response.status
            ? error.response.status
            : 500,
        time_ms:
          Date.now() - startedAt,
        error: error.message,
        data:
          error.response &&
          error.response.data
            ? error.response.data
            : null,
      });
    }
  }
);

/* =========================================================
   TEST PLAN 1-5
   ========================================================= */

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    const startedAt = Date.now();

    try {
      const demoBody = {
        start_day: 1,
        end_day: 5,

        business_info:
          "Небольшая кофейня в Новомосковске. Основные направления — кофе и десерты.",

        target_audience:
          "Жители Новомосковска, которые любят кофе, десерты и хотят сделать приятную паузу в течение дня.",

        offer:
          "Кофе и десерты.",

        content_goal:
          "Привлекать внимание, повышать вовлечённость и формировать желание посетить кофейню.",

        content_style:
          "Живой, тёплый, современный, с юмором и лёгкой рекламной образностью.",

        previous_plan: "",
      };

      const result =
        await generatePlanChunk(
          demoBody
        );

      res.status(200).json({
        ok: true,
        test: "plan-1-5",
        status: 200,
        time_ms:
          Date.now() - startedAt,
        result_length:
          result.text.length,
        model: MODEL,
        finish_reason:
          result.raw &&
          result.raw.choices &&
          result.raw.choices[0]
            ? result.raw.choices[0]
                .finish_reason
            : null,
        usage:
          result.raw &&
          result.raw.usage
            ? result.raw.usage
            : null,
        reels_result:
          result.text,
      });
    } catch (error) {
      console.error(
        "TEST PLAN FAILED",
        error.message
      );

      res.status(200).json({
        ok: false,
        test: "plan-1-5",
        status:
          error.response &&
          error.response.status
            ? error.response.status
            : 500,
        time_ms:
          Date.now() - startedAt,
        error: error.message,
        data:
          error.response &&
          error.response.data
            ? error.response.data
            : null,
      });
    }
  }
);

/* =========================================================
   404
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint not found",
  });
});

/* =========================================================
   START SERVER
   ========================================================= */

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
    `Bridge key configured: ${!!BRIDGE_KEY}`
  );

  console.log(
    `GigaChat key configured: ${!!GIGACHAT_KEY}`
  );
});
