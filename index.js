const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

const GIGACHAT_SCOPE =
  process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

const GIGACHAT_MODEL =
  process.env.GIGACHAT_MODEL || "GigaChat-3-Ultra";


// ============================================================
// HTTPS AGENT
// ============================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});


// ============================================================
// AXIOS
// ============================================================

const http = axios.create({
  httpsAgent: httpsAgent,
  timeout: 11000
});


// ============================================================
// ПЕРЕМЕННЫЕ ДЛЯ КЭША ТОКЕНА
// ============================================================

let cachedAccessToken = null;
let tokenExpiresAt = 0;


// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ UUID
// ============================================================

function createRqUID() {
  return crypto.randomUUID();
}


// ============================================================
// ПРОВЕРКА НАСТРОЕК
// ============================================================

console.log("====================================");
console.log("CONTENT CONSTRUCTOR GATEWAY");
console.log("====================================");

console.log(
  "GIGACHAT_KEY:",
  GIGACHAT_KEY ? "CONFIGURED" : "NOT CONFIGURED"
);

console.log(
  "BRIDGE_KEY:",
  BRIDGE_KEY ? "CONFIGURED" : "NOT CONFIGURED"
);

console.log(
  "GIGACHAT_SCOPE:",
  GIGACHAT_SCOPE
);

console.log(
  "GIGACHAT_MODEL:",
  GIGACHAT_MODEL
);

console.log(
  "PORT:",
  PORT
);


// ============================================================
// НОРМАЛИЗАЦИЯ AUTH KEY
// ============================================================

function getAuthorizationHeader() {

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const key = GIGACHAT_KEY.trim();

  if (key.toLowerCase().startsWith("basic ")) {
    return key;
  }

  return `Basic ${key}`;
}


// ============================================================
// ПОЛУЧЕНИЕ OAUTH TOKEN
// ============================================================

async function getAccessToken(forceRefresh = false) {

  // Используем уже полученный токен,
  // если он ещё действителен.

  if (
    !forceRefresh &&
    cachedAccessToken &&
    Date.now() < tokenExpiresAt - 60000
  ) {

    console.log("Using cached GigaChat access token");

    return cachedAccessToken;
  }


  console.log("Requesting GigaChat OAuth token...");

  const rqUID = createRqUID();

  console.log("RqUID:", rqUID);


  try {

    const response = await http.post(
      "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
      new URLSearchParams({
        scope: GIGACHAT_SCOPE
      }).toString(),
      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          "Accept":
            "application/json",

          "RqUID":
            rqUID,

          "Authorization":
            getAuthorizationHeader()
        }
      }
    );


    console.log(
      "OAuth response status:",
      response.status
    );


    if (
      !response.data ||
      !response.data.access_token
    ) {

      throw new Error(
        "OAuth response does not contain access_token"
      );
    }


    cachedAccessToken =
      response.data.access_token;


    const expiresAt =
      response.data.expires_at;


    if (expiresAt) {

      tokenExpiresAt =
        Number(expiresAt) * 1000;

    } else {

      // Если expires_at не пришёл,
      // считаем токен действительным 25 минут.

      tokenExpiresAt =
        Date.now() + 25 * 60 * 1000;
    }


    console.log(
      "GigaChat OAuth token received successfully"
    );


    return cachedAccessToken;

  } catch (error) {

    console.error(
      "OAuth ERROR"
    );


    if (error.response) {

      console.error(
        "OAuth status:",
        error.response.status
      );

      console.error(
        "OAuth response:",
        JSON.stringify(
          error.response.data,
          null,
          2
        )
      );

    } else {

      console.error(
        "OAuth message:",
        error.message
      );
    }


    throw error;
  }
}


// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working",
    gigachat_key:
      !!GIGACHAT_KEY,
    bridge_key:
      !!BRIDGE_KEY,
    model:
      GIGACHAT_MODEL
  });

});


// ============================================================
// ГЛАВНАЯ
// ============================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });

});


// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {

  console.log("====================================");
  console.log("TEST AUTH STARTED");
  console.log("====================================");

  try {

    const token =
      await getAccessToken(true);


    res.json({

      ok: true,

      stage: "auth",

      message:
        "Авторизация GigaChat прошла успешно",

      token_received:
        !!token

    });

  } catch (error) {

    console.error(
      "TEST AUTH ERROR:",
      error
    );


    res.status(500).json({

      ok: false,

      stage: "auth",

      error_type:
        typeof error,

      error_name:
        error.name,

      error_message:
        error.message,

      error_details:
        error.response
          ? {
              status:
                error.response.status,

              data:
                error.response.data
            }
          : null

    });

  }

});


// ============================================================
// TEST GENERATE
// ============================================================

app.get("/test-generate", async (req, res) => {

  console.log("====================================");
  console.log("TEST GENERATE STARTED");
  console.log("====================================");


  try {

    const accessToken =
      await getAccessToken(true);


    console.log(
      "Access token obtained"
    );


    console.log(
      "Sending test request to GigaChat..."
    );


    const response =
      await http.post(

        "https://api.giga.chat/v1/chat/completions",

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

          temperature: 0.2

        },

        {
          headers: {

            "Authorization":
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",

            "Accept":
              "application/json"

          }
        }

      );


    console.log(
      "GigaChat status:",
      response.status
    );


    console.log(
      "GigaChat response:"
    );


    console.log(
      JSON.stringify(
        response.data,
        null,
        2
      )
    );


    res.json({

      ok: true,

      stage: "generation",

      status:
        response.status,

      response:
        response.data

    });


  } catch (error) {

    console.error(
      "TEST GENERATE ERROR"
    );


    if (error.response) {

      console.error(
        "Status:",
        error.response.status
      );

      console.error(
        "Response:",
        JSON.stringify(
          error.response.data,
          null,
          2
        )
      );

    } else {

      console.error(
        "Message:",
        error.message
      );

    }


    res.status(500).json({

      ok: false,

      stage: "gigachat",

      error_type:
        typeof error,

      error_name:
        error.name,

      error_message:
        error.message,

      error_details:
        error.response
          ? {
              status:
                error.response.status,

              data:
                error.response.data
            }
          : null

    });

  }

});


// ============================================================
// ОСНОВНОЙ GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");


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
    req.body
      ? Object.keys(req.body)
      : []
  );


  // ----------------------------------------------------------
  // 1. ПРОВЕРКА НАСТРОЕК
  // ----------------------------------------------------------

  if (!GIGACHAT_KEY) {

    return res.status(500).json({

      ok: false,

      stage: "configuration",

      error:
        "GIGACHAT_KEY is not configured"

    });

  }


  if (!BRIDGE_KEY) {

    return res.status(500).json({

      ok: false,

      stage: "configuration",

      error:
        "BRIDGE_KEY is not configured"

    });

  }


  try {

    // --------------------------------------------------------
    // 2. ПОЛУЧАЕМ ДАННЫЕ SALEBOT
    // --------------------------------------------------------

    const body =
      req.body || {};


    const bridge_key =
      body.bridge_key;


    const content_type =
      body.content_type;


    const business_info =
      body.business_info;


    const target_audience =
      body.target_audience;


    const content_goal =
      body.content_goal;


    const reels_topic =
      body.reels_topic;


    const content_style =
      body.content_style;


    // --------------------------------------------------------
    // 3. ЛОГИ ДАННЫХ
    // --------------------------------------------------------

    console.log("------------------------------------");
    console.log("SALEBOT DATA");
    console.log("------------------------------------");

    console.log(
      "content_type:",
      content_type
    );

    console.log(
      "business_info:",
      business_info
    );

    console.log(
      "target_audience:",
      target_audience
    );

    console.log(
      "content_goal:",
      content_goal
    );

    console.log(
      "reels_topic:",
      reels_topic
    );

    console.log(
      "content_style:",
      content_style
    );


    // --------------------------------------------------------
    // 4. ПРОВЕРКА BRIDGE KEY
    // --------------------------------------------------------

    if (bridge_key !== BRIDGE_KEY) {

      console.error(
        "INVALID BRIDGE KEY"
      );


      return res.status(401).json({

        ok: false,

        stage: "security",

        error:
          "Invalid bridge_key"

      });

    }


    // --------------------------------------------------------
    // 5. ПРОВЕРКА ПОЛЕЙ
    // --------------------------------------------------------

    const missingFields = [];


    if (!content_type)
      missingFields.push(
        "content_type"
      );


    if (!business_info)
      missingFields.push(
        "business_info"
      );


    if (!target_audience)
      missingFields.push(
        "target_audience"
      );


    if (!content_goal)
      missingFields.push(
        "content_goal"
      );


    if (!reels_topic)
      missingFields.push(
        "reels_topic"
      );


    if (!content_style)
      missingFields.push(
        "content_style"
      );


    if (missingFields.length > 0) {

      console.warn(
        "Missing fields:",
        missingFields
      );

    }


    // --------------------------------------------------------
    // 6. ПОЛУЧАЕМ ACCESS TOKEN
    // --------------------------------------------------------

    console.log(
      "Getting GigaChat access token..."
    );


    let accessToken =
      await getAccessToken();


    console.log(
      "Access token obtained"
    );


    // --------------------------------------------------------
    // 7. ФОРМИРУЕМ ПРОМПТ
    // --------------------------------------------------------

    const prompt = `Ты — профессиональный контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри продукта «Мой Контент-Конструктор».

Твоя задача — создать готовый к публикации контент на основе данных пользователя.

ВАЖНО:
Не проси пользователя повторно присылать данные.
Не говори, что данные не заполнены, если они переданы ниже.
Не объясняй процесс своей работы.
Не говори, что ты искусственный интеллект.
Не добавляй лишних вступлений.
Сразу создай готовый результат.

==============================
ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
==============================

ТИП КОНТЕНТА:
${content_type || "Не указан"}

БИЗНЕС:
${business_info || "Не указан"}

ЦЕЛЕВАЯ АУДИТОРИЯ:
${target_audience || "Не указана"}

ЦЕЛЬ КОНТЕНТА:
${content_goal || "Не указана"}

ТЕМА:
${reels_topic || "Не указана"}

СТИЛЬ:
${content_style || "Не указан"}


==============================
ОБЩИЕ ТРЕБОВАНИЯ
==============================

Учитывай ВСЕ данные пользователя.

Контент должен быть:
— конкретным;
— естественным;
— интересным;
— применимым;
— соответствующим бизнесу;
— соответствующим целевой аудитории;
— соответствующим цели;
— соответствующим теме;
— соответствующим выбранному стилю.

Избегай банальных и шаблонных формулировок.

Если выбран провокационный стиль — используй сильные формулировки, контраст, неожиданные мысли и цепляющее начало, но без бессмысленной агрессии.

Если выбран экспертный стиль — демонстрируй компетентность через конкретику.

Если выбран юмористический стиль — добавляй уместный юмор.

Если выбран душевный стиль — используй живую человеческую подачу.


==============================
ФОРМАТ РЕЗУЛЬТАТА
==============================

ЕСЛИ ТИП КОНТЕНТА — REELS:

ЗАЦЕПКА:
Сильная первая фраза, которая удерживает внимание.

СЦЕНАРИЙ:
Подробный сценарий ролика по сценам.
Укажи, что говорит автор и что происходит в кадре.

ФИНАЛ:
Как закончить ролик.

CTA:
Конкретный призыв к действию.


ЕСЛИ ТИП КОНТЕНТА — ПОСТ:

ЗАГОЛОВОК:
...

ТЕКСТ:
Полноценный готовый пост.

CTA:
Призыв к действию.


ЕСЛИ ТИП КОНТЕНТА — КАРУСЕЛЬ:

СЛАЙД 1:
Заголовок / сильный хук.

СЛАЙД 2:
...

СЛАЙД 3:
...

Продолжай столько слайдов, сколько необходимо для раскрытия темы.

ФИНАЛЬНЫЙ СЛАЙД:
Призыв к действию.


ЕСЛИ ТИП КОНТЕНТА — TELEGRAM:

Создай полноценный готовый Telegram-пост.

Не добавляй пояснений вне готового контента.


==============================
ГЛАВНОЕ
==============================

Верни сразу готовый контент.

Не задавай дополнительных вопросов.

Не повторяй входные данные.

Не пиши «для того чтобы я мог...».

Не пиши «пожалуйста, отправьте данные».

Пользователь уже предоставил данные.
`;


    console.log(
      "Prompt prepared"
    );


    // --------------------------------------------------------
    // 8. ЗАПРОС К GIGACHAT
    // --------------------------------------------------------

    console.log(
      "Sending generation request to GigaChat..."
    );


    let response;


    try {

      response =
        await http.post(

          "https://api.giga.chat/v1/chat/completions",

          {

            model:
              GIGACHAT_MODEL,

            messages: [

              {

                role: "system",

                content:
                  "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Всегда отвечай на русском языке. Сразу выполняй задачу пользователя."

              },

              {

                role: "user",

                content:
                  prompt

              }

            ],

            temperature: 0.7

          },

          {

            headers: {

              "Authorization":
                `Bearer ${accessToken}`,

              "Content-Type":
                "application/json",

              "Accept":
                "application/json"

            }

          }

        );


    } catch (error) {

      // ------------------------------------------------------
      // ЕСЛИ ТОКЕН ИСТЁК — ОБНОВЛЯЕМ И ПОВТОРЯЕМ
      // ------------------------------------------------------

      if (
        error.response &&
        (
          error.response.status === 401 ||
          error.response.status === 403
        )
      ) {

        console.log(
          "Access token rejected. Refreshing token..."
        );


        accessToken =
          await getAccessToken(true);


        response =
          await http.post(

            "https://api.giga.chat/v1/chat/completions",

            {

              model:
                GIGACHAT_MODEL,

              messages: [

                {

                  role: "system",

                  content:
                    "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Всегда отвечай на русском языке. Сразу выполняй задачу пользователя."

                },

                {

                  role: "user",

                  content:
                    prompt

                }

              ],

              temperature: 0.7

            },

            {

              headers: {

                "Authorization":
                  `Bearer ${accessToken}`,

                "Content-Type":
                  "application/json",

                "Accept":
                  "application/json"

              }

            }

          );

      } else {

        throw error;

      }

    }


    // --------------------------------------------------------
    // 9. ЛОГ ОТВЕТА
    // --------------------------------------------------------

    console.log(
      "GigaChat status:",
      response.status
    );


    console.log(
      "GigaChat response received"
    );


    // --------------------------------------------------------
    // 10. ПОЛУЧАЕМ РЕЗУЛЬТАТ
    // --------------------------------------------------------

    const result =
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content;


    if (!result) {

      console.error(
        "GigaChat returned no message.content"
      );


      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          response.data

      });

    }


    // --------------------------------------------------------
    // 11. УСПЕШНЫЙ ОТВЕТ
    // --------------------------------------------------------

    console.log(
      "Generation completed successfully"
    );


    console.log(
      "Result length:",
      result.length
    );


    return res.json({

      ok: true,

      reels_result:
        result

    });


  } catch (error) {

    // --------------------------------------------------------
    // ПОДРОБНАЯ ОШИБКА
    // --------------------------------------------------------

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
      "Error name:",
      error
