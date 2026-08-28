process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const axios = require("axios");
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
// URL GigaChat
// ============================================================

const OAUTH_URL =
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

const CHAT_URL =
  "https://api.giga.chat/v1/chat/completions";


// ============================================================
// НАСТРОЙКИ
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
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// Получение OAuth токена GigaChat
// ============================================================

async function getGigaChatToken() {

  if (!GIGACHAT_KEY) {

    throw new Error(
      "GIGACHAT_KEY is not configured"
    );

  }


  const rqUID =
    crypto.randomUUID();


  console.log("Requesting GigaChat OAuth token...");
  console.log("RqUID:", rqUID);


  try {

    const response = await axios.post(

      OAUTH_URL,

      new URLSearchParams({

        scope: GIGACHAT_SCOPE

      }).toString(),

      {

        timeout: 30000,

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded",

          "Accept":
            "application/json",

          "RqUID":
            rqUID,

          "Authorization":
            `Basic ${GIGACHAT_KEY}`

        },

        httpsAgent: new (require("https").Agent)({

          rejectUnauthorized: false

        })

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
        "GigaChat OAuth response does not contain access_token"
      );

    }


    console.log(
      "GigaChat OAuth token received successfully"
    );


    return response.data.access_token;

  } catch (error) {

    console.error(
      "===================================="
    );

    console.error(
      "GIGACHAT OAUTH ERROR"
    );

    console.error(
      "===================================="
    );


    console.error(
      "Status:",
      error.response
        ? error.response.status
        : "unknown"
    );


    console.error(
      "Data:",
      error.response
        ? error.response.data
        : null
    );


    throw createReadableError(
      "OAuth",
      error
    );

  }

}


// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// Нормализация ошибок
// ============================================================

function createReadableError(
  stage,
  error
) {

  const result =
    new Error(
      `${stage}: ${getErrorMessage(error)}`
    );


  result.stage =
    stage;


  result.status =
    error &&
    error.response
      ? error.response.status
      : null;


  result.data =
    error &&
    error.response
      ? error.response.data
      : null;


  result.original =
    error;


  return result;

}


// ============================================================
// Получение понятного текста ошибки
// ============================================================

function getErrorMessage(error) {

  if (!error) {

    return "Unknown error";

  }


  if (
    error.response &&
    error.response.data
  ) {

    const data =
      error.response.data;


    if (typeof data === "string") {

      return data;

    }


    try {

      return JSON.stringify(data);

    } catch (e) {

      return String(data);

    }

  }


  if (error.message) {

    return error.message;

  }


  if (typeof error === "string") {

    return error;

  }


  try {

    return JSON.stringify(error);

  } catch (e) {

    return String(error);

  }

}


// ============================================================
// Главная страница
// ============================================================

app.get("/", (req, res) => {

  res.json({

    ok: true,

    service:
      "Content Constructor Gateway",

    status:
      "working"

  });

});


// ============================================================
// TEST AUTH
// Проверяем только OAuth
// ============================================================

app.get("/test-auth", async (req, res) => {

  console.log("====================================");
  console.log("TEST AUTH STARTED");
  console.log("====================================");


  try {

    const token =
      await getGigaChatToken();


    return res.json({

      ok: true,

      stage:
        "auth",

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


    return res.status(500).json({

      ok: false,

      stage:
        "auth",

      error:
        getErrorMessage(error),

      status:
        error.status || null,

      details:
        error.data || null

    });

  }

});


// ============================================================
// TEST GENERATE
//
// Полностью независимый тест.
// Проверяет:
// OAuth → access_token → chat/completions
// ============================================================

app.get("/test-generate", async (req, res) => {

  console.log("====================================");
  console.log("TEST GENERATE STARTED");
  console.log("====================================");


  try {

    // --------------------------------------------------------
    // 1. Получаем OAuth токен
    // --------------------------------------------------------

    const token =
      await getGigaChatToken();


    console.log(
      "Access token obtained"
    );


    // --------------------------------------------------------
    // 2. Формируем тестовый запрос
    // --------------------------------------------------------

    const requestBody = {

      model:
        GIGACHAT_MODEL,

      messages: [

        {

          role:
            "user",

          content:
            "Ответь одним словом: работает"

        }

      ],

      temperature:
        0.2

    };


    console.log(
      "Sending test request to GigaChat..."
    );


    // --------------------------------------------------------
    // 3. Отправляем запрос
    // --------------------------------------------------------

    const response =
      await axios.post(

        CHAT_URL,

        requestBody,

        {

          timeout:
            120000,

          headers: {

            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "Authorization":
              `Bearer ${token}`,

            "User-Agent":
              "Content-Constructor-Gateway/1.0"

          },

          httpsAgent:
            new (require("https").Agent)({

              rejectUnauthorized:
                false

            })

        }

      );


    console.log(
      "GigaChat status:",
      response.status
    );


    console.log(
      "GigaChat response:"
    );


    console.dir(
      response.data,
      { depth: null }
    );


    // --------------------------------------------------------
    // 4. Возвращаем результат
    // --------------------------------------------------------

    return res.json({

      ok: true,

      stage:
        "generation",

      status:
        response.status,

      response:
        response.data

    });


  } catch (error) {

    console.error("====================================");
    console.error("TEST GENERATE ERROR");
    console.error("====================================");


    console.error(
      "Status:",
      error.response
        ? error.response.status
        : null
    );


    console.error(
      "Data:",
      error.response
        ? error.response.data
        : null
    );


    return res.status(500).json({

      ok: false,

      stage:
        "gigachat",

      error:
        getErrorMessage(error),

      status:
        error.response
          ? error.response.status
          : null,

      details:
        error.response
          ? error.response.data
          : null

    });

  }

});


// ============================================================
// GENERATE
//
// Основной endpoint для Salebot
// ============================================================

app.post("/generate", async (req, res) => {

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


  try {

    // ========================================================
    // 1. Проверяем настройки
    // ========================================================

    if (!GIGACHAT_KEY) {

      return res.status(500).json({

        ok: false,

        stage:
          "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    if (!BRIDGE_KEY) {

      return res.status(500).json({

        ok: false,

        stage:
          "configuration",

        error:
          "BRIDGE_KEY is not configured"

      });

    }


    // ========================================================
    // 2. Получаем данные Salebot
    // ========================================================

    const body =
      req.body || {};


    const bridge_key =
      body.bridge_key;


    const content_type =
      body.content_type || "";


    const business_info =
      body.business_info || "";


    const target_audience =
      body.target_audience || "";


    const content_goal =
      body.content_goal || "";


    const reels_topic =
      body.reels_topic || "";


    const content_style =
      body.content_style || "";


    // ========================================================
    // 3. Проверяем bridge_key
    // ========================================================

    if (
      bridge_key !== BRIDGE_KEY
    ) {

      console.log(
        "INVALID BRIDGE KEY"
      );


      return res.status(401).json({

        ok: false,

        stage:
          "security",

        error:
          "Invalid bridge_key"

      });

    }


    console.log(
      "Bridge key: OK"
    );


    // ========================================================
    // 4. Получаем OAuth токен
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );


    const token =
      await getGigaChatToken();


    console.log(
      "Access token obtained"
    );


    // ========================================================
    // 5. Формируем промпт
    // ========================================================

    const prompt = `

Ты — профессиональный контент-маркетолог,
контент-стратег и сценарист.

Ты работаешь внутри продукта
«Мой Контент-Конструктор».

Создай максимально качественный готовый контент
на основе данных пользователя.


==============================
ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
==============================

ТИП КОНТЕНТА:

${content_type}


БИЗНЕС:

${business_info}


ЦЕЛЕВАЯ АУДИТОРИЯ:

${target_audience}


ЦЕЛЬ КОНТЕНТА:

${content_goal}


ТЕМА:

${reels_topic}


СТИЛЬ:

${content_style}


==============================
ОБЩИЕ ТРЕБОВАНИЯ
==============================

Учитывай все переданные данные.

Контент должен быть конкретным,
интересным, естественным и применимым.

Не используй шаблонные фразы.

Не говори, что ты искусственный интеллект.

Не объясняй процесс своей работы.

Не добавляй лишних пояснений.

Верни сразу готовый результат.


==============================
ЕСЛИ ВЫБРАН REELS
==============================

Создай полноценный сценарий Reels.

ЗАЦЕПКА:

Сильная первая фраза,
которая заставляет продолжить просмотр.


СЦЕНАРИЙ:

Подробно распиши последовательность
сцен и реплик.


ФИНАЛ:

Сильное завершение.


CTA:

Призыв к действию.


==============================
ЕСЛИ ВЫБРАН ПОСТ
==============================

Создай полноценный пост.

Сильное начало.

Основная часть.

Практическая ценность.

Финал.

CTA.


==============================
ЕСЛИ ВЫБРАНА КАРУСЕЛЬ
==============================

Создай структуру карусели.

Слайд 1:

Заголовок / сильный хук.


Слайд 2:

...


Слайд 3:

...


Продолжай необходимое количество слайдов.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.

`;


    // ========================================================
    // 6. Формируем запрос GigaChat
    // ========================================================

    const requestBody = {

      model:
        GIGACHAT_MODEL,

      messages: [

        {

          role:
            "system",

          content:
            "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Отвечай на русском языке."

        },

        {

          role:
            "user",

          content:
            prompt

        }

      ],

      temperature:
        0.7

    };


    console.log(
      "Sending generation request to GigaChat..."
    );


    // ========================================================
    // 7. Отправляем запрос GigaChat
    // ========================================================

    const response =
      await axios.post(

        CHAT_URL,

        requestBody,

        {

          timeout:
            120000,

          headers: {

            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "Authorization":
              `Bearer ${token}`,

            "User-Agent":
              "Content-Constructor-Gateway/1.0"

          },

          httpsAgent:
            new (require("https").Agent)({

              rejectUnauthorized:
                false

            })

        }

      );


    console.log(
      "GigaChat response received"
    );


    console.log(
      "Status:",
      response.status
    );


    console.dir(
      response.data,
      { depth: null }
    );


    // ========================================================
    // 8. Получаем результат
    // ========================================================

    const data =
      response.data;


    const result =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;


    // ========================================================
    // 9. Проверяем результат
    // ========================================================

    if (!result) {

      console.error(
        "GigaChat response has no message.content"
      );


      return res.status(502).json({

        ok: false,

        stage:
          "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          data

      });

    }


    // ========================================================
    // 10. Возвращаем Salebot
    // ========================================================

    console.log(
      "Generation successful"
    );


    return res.json({

      ok: true,

      reels_result:
        result

    });


  } catch (error) {

    console.error("====================================");
    console.error("GENERATE ERROR");
    console.error("====================================");


    console.error(
      "Error:",
      error
    );


    console.error(
      "Status:",
      error.response
        ? error.response.status
        : null
    );


    console.error(
      "Response data:",
      error.response
        ? error.response.data
        : null
    );


    return res.status(500).json({

      ok: false,

      stage:
        error.stage || "gigachat",

      error:
        getErrorMessage(error),

      status:
        error.response
          ? error.response.status
          : error.status || null,

      details:
        error.response
          ? error.response.data
          : error.data || null

    });

  }

});


// ============================================================
// ЗАПУСК
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Content Constructor Gateway running on port ${PORT}`
    );

  }
);
