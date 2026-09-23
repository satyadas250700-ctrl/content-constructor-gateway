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


// ==================================================
// GIGACHAT QUEUE
// ==================================================

let gigaChatQueue = Promise.resolve();

function runInGigaQueue(task) {
  const nextTask = gigaChatQueue.then(
    () => task(),
    () => task()
  );

  gigaChatQueue = nextTask.catch(() => {});

  return nextTask;
}


// ==================================================
// TOKEN CACHE
// ==================================================

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

async function getGigaChatToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      const rqUID = crypto.randomUUID();

      const response = await axios.post(
        OAUTH_URL,
        new URLSearchParams({
          scope: "GIGACHAT_API_PERS",
        }).toString(),
        {
          headers: {
            Authorization: `Basic ${GIGACHAT_KEY}`,
            RqUID: rqUID,
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          httpsAgent,
          timeout: 12000,
        }
      );

      cachedToken = response.data.access_token;

      const expiresIn =
        response.data.expires_in || 1800;

      tokenExpiresAt =
        Date.now() + expiresIn * 1000;

      console.log(
        "GigaChat token received"
      );

      return cachedToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}


// ==================================================
// GIGACHAT INTERNAL REQUEST
// ==================================================

async function askGigaChatInternal(
  messages,
  options = {},
  attempt = 1
) {
  const {
    temperature = 0.55,
    max_tokens = 800,
  } = options;

  const token = await getGigaChatToken();

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: MODEL,
        messages,
        temperature,
        max_tokens,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent,
        timeout: 12000,
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

    const finishReason =
      response.data?.choices?.[0]?.finish_reason;

    const usage = response.data?.usage;

    console.log(
      `GigaChat finished | finish_reason=${finishReason} | result_length=${result.length}`
    );

    if (usage) {
      console.log(
        `GigaChat usage | prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`
      );
    }

    return result;
  } catch (error) {
    const status = error.response?.status;

    console.error(
      "GigaChat error:",
      status,
      error.response?.data || error.message
    );

    // ==============================================
    // 401 — обновляем токен и повторяем
    // ==============================================

    if (status === 401 && attempt === 1) {
      cachedToken = null;
      tokenExpiresAt = 0;

      return askGigaChatInternal(
        messages,
        options,
        attempt + 1
      );
    }

    // ==============================================
    // 429 — ждём и повторяем
    // ==============================================

    if (
      status === 429 &&
      attempt <= 3
    ) {
      const delay =
        attempt === 1
          ? 3000
          : attempt === 2
          ? 6000
          : 9000;

      console.log(
        `GigaChat 429. Retry after ${delay} ms`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );

      return askGigaChatInternal(
        messages,
        options,
        attempt + 1
      );
    }

    throw error;
  }
}


// ==================================================
// GIGACHAT PUBLIC REQUEST
// ==================================================

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


// ==================================================
// BRIDGE KEY
// ==================================================

function checkBridgeKey(req, res) {
  if (!BRIDGE_KEY) {
    console.error(
      "BRIDGE_KEY is not configured"
    );

    res.status(500).json({
      ok: false,
      error: "BRIDGE_KEY is not configured",
    });

    return false;
  }

  if (
    !req.body ||
    req.body.bridge_key !== BRIDGE_KEY
  ) {
    console.error(
      "Invalid bridge_key"
    );

    res.status(403).json({
      ok: false,
      error: "Invalid bridge_key",
    });

    return false;
  }

  return true;
}


// ==================================================
// NORMAL CONTENT GENERATOR PROMPT
// ==================================================

function buildPrompt(data) {
  const {
    content_type,
    business_info,
    target_audience,
    offer,
    content_goal,
    reels_topic,
    content_style,
  } = data;

  return `
Ты — профессиональный контент-маркетолог,
контент-стратег и сценарист внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создавать готовый к публикации
контент на русском языке.

Не объясняй свою работу.
Не анализируй запрос.
Сразу выдавай готовый результат.

==================================================
ДАННЫЕ БИЗНЕСА
==================================================

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

==================================================
ВАЖНО: ФАКТЫ
==================================================

Используй только те реальные факты,
которые присутствуют в данных пользователя.

Не придумывай:
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
- гарантии;
- сертификаты;
- отзывы;
- количество клиентов;
- статистику;
- результаты;
- обещания;
- историю компании;
- сотрудников;
- оборудование;
- технологии производства;
- происхождение товаров;
- ингредиенты;
- характеристики;
- наличие;
- ассортимент;
- конкретные продукты или услуги,
  если они не названы пользователем.

==================================================
КРЕАТИВНОСТЬ
==================================================

Креатив разрешён.

Можно использовать:
- метафоры;
- сравнения;
- гиперболу;
- юмор;
- иронию;
- игру слов;
- эмоциональные образы;
- рекламные формулировки;
- художественные концепции.

Например:
«антидепрессант дня»,
«маленький отпуск посреди рабочего дня»,
«опасно вкусная привычка».

Но художественная метафора
не должна превращаться в выдуманный
факт о бизнесе.

==================================================
АССОРТИМЕНТ
==================================================

Если пользователь написал только общий ассортимент,
не расширяй его самостоятельно.

Например:

если указано:
«кофейня с кофе и десертами»

нельзя самостоятельно добавлять:
капучино, латте, американо, раф,
матчу, чизкейк, фондан, круассан,
тарт, вафли, тирамису и т.д.

==================================================
РЕЗУЛЬТАТ
==================================================

Создай качественный контент именно под выбранный формат.

Не добавляй вступлений вроде:
«Конечно!»
«Вот ваш контент».
«Ниже результат».

Выдавай только готовый материал.
`;
}


// ==================================================
// NORMAL GENERATE
// ==================================================

app.post("/generate", async (req, res) => {
  console.log(
    "GENERATE REQUEST RECEIVED"
  );

  console.log(
    "Content-Type:",
    req.headers["content-type"]
  );

  console.log(
    "Body exists:",
    !!req.body
  );

  console.log(
    "Body keys:",
    Object.keys(req.body || {})
  );

  if (!checkBridgeKey(req, res)) {
    return;
  }

  try {
    const prompt = buildPrompt(req.body);

    const result = await askGigaChat(
      [
        {
          role: "system",
          content:
            "Ты профессиональный контент-маркетолог. Отвечай только на русском языке.",
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

    return res.json({
      ok: true,
      reels_result: result,
    });
  } catch (error) {
    console.error(
      "GENERATE ERROR:",
      error.response?.data ||
        error.message
    );

    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message,
    });
  }
});


// ==================================================
// 30-DAY PLAN PROMPT
// ==================================================

function buildPlanChunkPrompt({
  startDay,
  endDay,
  business_info,
  target_audience,
  offer,
  content_goal,
  content_style,
  previous_plan,
}) {
  return `
Ты — профессиональный контент-маркетолог,
контент-стратег и сценарист внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — создать очередной блок
контент-плана на 30 дней.

Сейчас необходимо создать дни
${startDay}–${endDay}.

==================================================
ГЛАВНЫЙ ПРИНЦИП
==================================================

Создавай НЕ набор придуманных сцен
о том, как якобы работает бизнес.

Создавай КОНЦЕПЦИИ КОНТЕНТА:

- что можно показать;
- о чём можно поговорить;
- какую эмоцию вызвать;
- какой вопрос задать;
- какую мысль раскрыть;
- какой контраст использовать;
- какой пользовательский сценарий обыграть;
- какую проблему аудитории затронуть.

Идея должна быть применима к бизнесу,
но не должна содержать выдуманные факты
о его работе.

==================================================
ДАННЫЕ БИЗНЕСА
==================================================

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

Предыдущий блок контент-плана:
${previous_plan || "это первый блок"}

==================================================
ОБЪЁМ
==================================================

Создай ровно 5 дней.

Каждый день должен содержать
примерно 45–70 слов.

Не обрывай идеи.

Каждый день должен быть законченным.

==================================================
НЕ ПРИДУМЫВАЙ ФАКТЫ
==================================================

Источник реальных фактов —
ТОЛЬКО данные пользователя.

Не придумывай:

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
- гарантии;
- сертификаты;
- отзывы;
- количество клиентов;
- статистику;
- результаты;
- обещания;
- события;
- достижения;
- историю бизнеса;
- сотрудников;
- команду;
- оборудование;
- технологии производства;
- происхождение продукции;
- ингредиенты;
- характеристики товаров;
- наличие;
- конкретный ассортимент,
  если он не указан пользователем.

==================================================
АССОРТИМЕНТ
==================================================

Если указан только общий ассортимент,
не расширяй его.

Например:

если пользователь написал:
«кофейня с кофе и десертами»

нельзя самостоятельно добавлять:

капучино,
латте,
американо,
раф,
матчу,
чизкейк,
фондан,
круассан,
тарт,
вафли,
тирамису,
сэндвич,
завтраки,
сиропы и т.д.

==================================================
НЕ ПРИДУМЫВАЙ АТРИБУТЫ БИЗНЕСА
==================================================

Если этого нет в данных пользователя,
не утверждай и не используй как обязательный
элемент сценария:

- бариста;
- кофемашину;
- витрину;
- столики у окна;
- фарфоровые чашки;
- упаковку;
- доставку;
- музыку;
- Wi-Fi;
- розетки;
- террасу;
- кухню;
- собственную выпечку;
- интерьер;
- конкретное оборудование.

==================================================
НЕ ИСПОЛЬЗУЙ НЕИЗВЕСТНЫЕ АТРИБУТЫ
ДАЖЕ КАК ОБЯЗАТЕЛЬНУЮ СЦЕНУ
==================================================

Если для идеи нужен неизвестный атрибут бизнеса,
не делай его частью обязательного сценария.

Например, не пиши:

«снимите бариста...»,
«покажите кофемашину...»,
«запишите шипение пара...»,

если этого нет в данных.

Вместо этого формулируй концепцию через:

- ощущение;
- эмоцию;
- контраст;
- вопрос;
- визуальный образ;
- пользовательский сценарий;
- уже подтверждённые продукты/услуги.

Не заменяй запрещённую конкретику
другой непроверенной конкретикой.

==================================================
НЕ ДЕЛАЙ ВЫВОДОВ ИЗ ГЕОГРАФИИ
==================================================

Название города, района или страны
само по себе не означает, что:

- продукты местные;
- ингредиенты местные;
- поставщики местные;
- производство находится там;
- используется местное сырьё;
- рецепт связан с этим местом;
- продукт обладает какими-либо
  особенностями именно этого места.

Город можно использовать как контекст.

Например:

«в Новомосковске»,
«городская суета»,
«ритм города»,
«после рабочего дня в городе».

Но нельзя без подтверждения писать:

«местные ингредиенты»,
«локальные продукты»,
«продукты от местных фермеров»,
«создано из местного сырья»,
«наши местные поставщики»,
«вкус Новомосковска» как характеристику продукта
и подобные утверждения.

==================================================
СЦЕНАРНЫЕ ДЕТАЛИ
==================================================

Можно предлагать действия как КОНЦЕПЦИЮ КОНТЕНТА.

Например:

«Можно построить Reels вокруг идеи первой
паузы после тяжёлого рабочего дня».

Но не превращай это в утверждение,
что именно так реально происходит
в заведении.

==================================================
КРЕАТИВНОСТЬ РАЗРЕШЕНА
==================================================

Разрешены:

- метафоры;
- сравнения;
- гипербола;
- юмор;
- ирония;
- игра слов;
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

Это художественные формулировки,
а не реальные факты.

==================================================
РАЗНООБРАЗИЕ
==================================================

Не делай все дни одинаковыми.

Чередуй:

- привлечение внимания;
- вовлечение;
- доверие;
- экспертность;
- знакомство с брендом;
- работа с возражениями;
- эмоциональный контент;
- продажи;
- комьюнити;
- полезный контент.

Не делай каждый день прямой продажей.

Используй разные форматы:

- Reels;
- пост;
- карусель;
- Stories;
- фото-пост;
- другие уместные форматы.

==================================================
ПРЕДЫДУЩИЙ БЛОК
==================================================

Учитывай предыдущий блок.

Не повторяй буквально:

- темы;
- форматы;
- CTA;
- одинаковые идеи.

Следующий блок должен логично продолжать предыдущий,
но приносить новые углы раскрытия бизнеса.

==================================================
ЕСЛИ НЕ ХВАТАЕТ ФАКТОВ
==================================================

Если какого-то факта нет,
НЕ ПРИДУМЫВАЙ его.

Используй универсальную креативную формулировку.

Лучше написать:

«раскройте ощущение первой паузы дня»

чем придумать:

«покажите бариста, который готовит капучино».

==================================================
CTA ДОЛЖЕН БЫТЬ УНИВЕРСАЛЬНЫМ
==================================================

Не используй платформенные механики,
которые могут быть недоступны:

«свайпните вверх»,
«ссылка в шапке»,
«переходите по ссылке»,

если конкретная механика не была указана
пользователем.

Используй универсальные CTA:

«Проголосуйте в опросе»,
«Ответьте в комментариях»,
«Отправьте другу»,
«Сохраните»,
«Напишите свой вариант»,
«Поделитесь своим мнением».

==================================================
СТРОГОЕ ОФОРМЛЕНИЕ
==================================================

Перед отправкой обязательно проверь,
что заголовки написаны именно так:

ДЕНЬ 1
ДЕНЬ 2
ДЕНЬ 3
ДЕНЬ 4
ДЕНЬ 5

Никогда не используй:
«ДЕНЯ»,
«ДЕНЬЬ»,
«ДЕНЬЯ»
или другие варианты.

Для каждого дня:

ДЕНЬ X

Формат:
...

Тема:
...

Цель:
...

Идея:
...

CTA:
...

==================================================
ВАЖНО
==================================================

Не добавляй вступление.

Не добавляй заключение.

Не добавляй комментарии от себя.

Не объясняй, почему выбрал эти идеи.

Выдай только контент-план.
`;
}


// ==================================================
// PLAN GENERATOR
// ==================================================

async function generatePlanChunk(data) {
  const prompt =
    buildPlanChunkPrompt(data);

  return askGigaChat(
    [
      {
        role: "system",
        content:
          "Ты профессиональный контент-маркетолог и контент-стратег. Отвечай только на русском языке.",
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
}


// ==================================================
// PLAN REQUEST HANDLER
// ==================================================

async function handlePlanRequest(
  req,
  res,
  startDay,
  endDay,
  previousPlanVariable
) {
  console.log(
    `PLAN REQUEST RECEIVED: ${startDay}-${endDay}`
  );

  console.log(
    "Body keys:",
    Object.keys(req.body || {})
  );

  if (!checkBridgeKey(req, res)) {
    return;
  }

  try {
    const result =
      await generatePlanChunk({
        startDay,
        endDay,

        business_info:
          req.body.business_info,

        target_audience:
          req.body.target_audience,

        offer:
          req.body.offer,

        content_goal:
          req.body.content_goal,

        content_style:
          req.body.content_style,

        previous_plan:
          req.body[previousPlanVariable] ||
          req.body.previous_plan ||
          "",
      });

    return res.json({
      ok: true,
      reels_result: result,
    });
  } catch (error) {
    console.error(
      `PLAN ${startDay}-${endDay} ERROR:`,
      error.response?.data ||
        error.message
    );

    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message,
    });
  }
}


// ==================================================
// PLAN ENDPOINTS
// ==================================================

app.post(
  "/generate-plan-1-5",
  async (req, res) => {
    return handlePlanRequest(
      req,
      res,
      1,
      5,
      ""
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
      10,
      "previous_plan"
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
      15,
      "previous_plan"
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
      20,
      "previous_plan"
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
      25,
      "previous_plan"
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
      30,
      "previous_plan"
    );
  }
);


// ==================================================
// ROOT
// ==================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service:
      "content-constructor-gateway",
    model: MODEL,
    status: "running",
  });
});


// ==================================================
// HEALTH
// ==================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    model: MODEL,
  });
});


// ==================================================
// TEST AUTH
// ==================================================

app.get("/test-auth", async (req, res) => {
  try {
    const token =
      await getGigaChatToken();

    return res.json({
      ok: true,
      token_received: !!token,
    });
  } catch (error) {
    console.error(
      "TEST AUTH ERROR:",
      error.response?.data ||
        error.message
    );

    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message,
    });
  }
});


// ==================================================
// TEST GENERATE
// ==================================================

app.get(
  "/test-generate",
  async (req, res) => {
    try {
      const result =
        await askGigaChat(
          [
            {
              role: "system",
              content:
                "Ты профессиональный копирайтер. Отвечай на русском.",
            },
            {
              role: "user",
              content:
                "Напиши короткий рекламный текст для кофейни.",
            },
          ],
          {
            temperature: 0.55,
            max_tokens: 300,
          }
        );

      return res.json({
        ok: true,
        status: 200,
        model: MODEL,
        reels_result: result,
      });
    } catch (error) {
      console.error(
        "TEST GENERATE ERROR:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        ok: false,
        error:
          error.response?.data ||
          error.message,
      });
    }
  }
);


// ==================================================
// TEST PLAN 1-5
// ==================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {
    const startedAt = Date.now();

    try {
      const result =
        await generatePlanChunk({
          startDay: 1,
          endDay: 5,

          business_info:
            "Кофейня в Новомосковске. Кофе и десерты.",

          target_audience:
            "Жители города, которым хочется сделать паузу и провести время приятно.",

          offer:
            "Кофе и десерты.",

          content_goal:
            "Привлекать внимание, вызывать желание прийти и формировать узнаваемость.",

          content_style:
            "Живой, эмоциональный, современный, с юмором и метафорами.",

          previous_plan: "",
        });

      return res.json({
        ok: true,
        test: "plan-1-5",
        status: 200,
        time_ms:
          Date.now() - startedAt,
        result_length:
          result.length,
        model: MODEL,
        finish_reason: "stop",
        reels_result: result,
      });
    } catch (error) {
      console.error(
        "TEST PLAN ERROR:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        ok: false,
        test: "plan-1-5",
        error:
          error.response?.data ||
          error.message,
      });
    }
  }
);


// ==================================================
// 404
// ==================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
  });
});


// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log(
    `content-constructor-gateway running on port ${PORT}`
  );

  console.log(
    `Model: ${MODEL}`
  );
});
