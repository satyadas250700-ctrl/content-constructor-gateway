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
//
// GigaChat может использовать сертификаты НУЦ Минцифры.
// Для текущего тестового проекта отключаем проверку TLS.
//
// ВАЖНО:
// Это сделано для совместимости с GigaChat.
// ============================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});


// ============================================================
// AXIOS CLIENT
// ============================================================

const http = axios.create({
  httpsAgent: httpsAgent,

  // Для GigaChat даём достаточно времени.
  timeout: 600000,

  validateStatus: () => true
});


// ============================================================
// STARTUP LOG
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

console.log("GIGACHAT_SCOPE:", GIGACHAT_SCOPE);
console.log("GIGACHAT_MODEL:", GIGACHAT_MODEL);
console.log("PORT:", PORT);


// ============================================================
// ПРОВЕРКА КОНФИГУРАЦИИ
// ============================================================

if (!GIGACHAT_KEY) {
  console.error("ERROR: GIGACHAT_KEY is not configured");
}

if (!BRIDGE_KEY) {
  console.error("ERROR: BRIDGE_KEY is not configured");
}


// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {

  console.log("ROOT REQUEST RECEIVED");

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });

});


// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {

  console.log("HEALTH REQUEST RECEIVED");

  res.json({
    ok: true,
    status: "alive",
    service: "Content Constructor Gateway",
    timestamp: new Date().toISOString()
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

    if (!GIGACHAT_KEY) {

      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "GIGACHAT_KEY is not configured"
      });

    }


    console.log("Requesting GigaChat OAuth token...");


    const rqUID = crypto.randomUUID();

    console.log("RqUID:", rqUID);


    const tokenResponse = await http.post(

      "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",

      new URLSearchParams({
        scope: GIGACHAT_SCOPE
      }).toString(),

      {
        headers: {
          "Authorization": `Basic ${GIGACHAT_KEY}`,
          "RqUID": rqUID,
          "Content-Type":
            "application/x-www-form-urlencoded"
        }
      }

    );


    console.log(
      "OAuth response status:",
      tokenResponse.status
    );


    if (
      tokenResponse.status < 200 ||
      tokenResponse.status >= 300
    ) {

      console.error(
        "OAuth error:",
        tokenResponse.data
      );

      return res.status(500).json({

        ok: false,

        stage: "auth",

        status: tokenResponse.status,

        error: "GigaChat OAuth failed",

        details: tokenResponse.data

      });

    }


    const accessToken =
      tokenResponse.data &&
      tokenResponse.data.access_token;


    if (!accessToken) {

      return res.status(500).json({

        ok: false,

        stage: "auth",

        error: "OAuth response does not contain access_token",

        details: tokenResponse.data

      });

    }


    console.log(
      "GigaChat OAuth token received successfully"
    );


    return res.json({

      ok: true,

      stage: "auth",

      message:
        "Авторизация GigaChat прошла успешно"

    });


  } catch (error) {

    console.error(
      "AUTH ERROR:",
      error
    );


    return res.status(500).json({

      ok: false,

      stage: "auth",

      error_type: typeof error,

      error_name: error.name,

      error_message: error.message,

      error_details:
        error.response
          ? {
              status: error.response.status,
              data: error.response.data
            }
          : null

    });

  }

});


// ============================================================
// ПОЛУЧЕНИЕ GIGACHAT ACCESS TOKEN
// ============================================================

async function getAccessToken() {

  console.log("Requesting GigaChat OAuth token...");


  const rqUID = crypto.randomUUID();

  console.log("RqUID:", rqUID);


  const response = await http.post(

    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",

    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),

    {
      headers: {
        "Authorization": `Basic ${GIGACHAT_KEY}`,
        "RqUID": rqUID,
        "Content-Type":
          "application/x-www-form-urlencoded"
      }
    }

  );


  console.log(
    "OAuth response status:",
    response.status
  );


  if (
    response.status < 200 ||
    response.status >= 300
  ) {

    const error = new Error(
      "GigaChat OAuth request failed"
    );

    error.response = response;

    throw error;

  }


  const accessToken =
    response.data &&
    response.data.access_token;


  if (!accessToken) {

    const error = new Error(
      "OAuth response does not contain access_token"
    );

    error.response = response;

    throw error;

  }


  console.log(
    "GigaChat OAuth token received successfully"
  );


  return accessToken;

}


// ============================================================
// ТЕСТ GENERATE
// ============================================================

app.get("/test-generate", async (req, res) => {

  console.log("====================================");
  console.log("TEST GENERATE STARTED");
  console.log("====================================");


  try {

    if (!GIGACHAT_KEY) {

      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    const accessToken =
      await getAccessToken();


    console.log(
      "Access token obtained"
    );


    console.log(
      "Sending test request to GigaChat..."
    );


    const response = await http.post(

      "https://api.giga.chat/api/v1/chat/completions",

      {

        model: GIGACHAT_MODEL,

        messages: [

          {

            role: "user",

            content: "Ответь одним словом: Да"

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

          "User-Agent":
            "Content-Constructor-Gateway/1.0"

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

    console.dir(
      response.data,
      {
        depth: null
      }
    );


    if (
      response.status < 200 ||
      response.status >= 300
    ) {

      return res.status(500).json({

        ok: false,

        stage: "generation",

        status: response.status,

        response: response.data

      });

    }


    return res.json({

      ok: true,

      stage: "generation",

      status: response.status,

      response: response.data

    });


  } catch (error) {

    console.error(
      "TEST GENERATE ERROR:"
    );

    console.error(error);


    return res.status(500).json({

      ok: false,

      stage: "generation",

      error_type: typeof error,

      error_name: error.name,

      error_message: error.message,

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
// GENERATE — ОСНОВНОЙ ENDPOINT SALEBOT
// ============================================================

app.post("/generate", async (req, res) => {

  // ==========================================================
  // ЭТОТ ЛОГ ДОЛЖЕН ПОЯВИТЬСЯ СРАЗУ
  // ==========================================================

  console.log("");
  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

  console.log(
    "Time:",
    new Date().toISOString()
  );

  console.log(
    "Method:",
    req.method
  );

  console.log(
    "Content-Type:",
    req.headers["content-type"]
  );

  console.log(
    "Body exists:",
    !!req.body
  );


  try {

    // ========================================================
    // 1. ПОЛУЧАЕМ BODY
    // ========================================================

    const body = req.body || {};


    console.log(
      "Body keys:",
      Object.keys(body)
    );


    console.log(
      "Received data:"
    );


    console.dir(
      {
        bridge_key:
          body.bridge_key
            ? "RECEIVED"
            : "MISSING",

        content_type:
          body.content_type,

        business_info:
          body.business_info,

        target_audience:
          body.target_audience,

        content_goal:
          body.content_goal,

        reels_topic:
          body.reels_topic,

        content_style:
          body.content_style

      },

      {
        depth: null
      }
    );


    // ========================================================
    // 2. ПРОВЕРЯЕМ КОНФИГУРАЦИЮ
    // ========================================================

    if (!GIGACHAT_KEY) {

      console.error(
        "GIGACHAT_KEY is missing"
      );


      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    if (!BRIDGE_KEY) {

      console.error(
        "BRIDGE_KEY is missing"
      );


      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "BRIDGE_KEY is not configured"

      });

    }


    // ========================================================
    // 3. ПОЛУЧАЕМ ПЕРЕМЕННЫЕ
    // ========================================================

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


    // ========================================================
    // 4. ПРОВЕРКА BRIDGE KEY
    // ========================================================

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


    console.log(
      "Bridge key: VALID"
    );


    // ========================================================
    // 5. ПРОВЕРКА ПЕРЕМЕННЫХ
    // ========================================================

    console.log(
      "Checking received variables..."
    );


    const missingFields = [];


    if (!content_type)
      missingFields.push("content_type");

    if (!business_info)
      missingFields.push("business_info");

    if (!target_audience)
      missingFields.push("target_audience");

    if (!content_goal)
      missingFields.push("content_goal");

    if (!reels_topic)
      missingFields.push("reels_topic");

    if (!content_style)
      missingFields.push("content_style");


    if (missingFields.length > 0) {

      console.error(
        "MISSING FIELDS:",
        missingFields
      );


      return res.status(400).json({

        ok: false,

        stage: "validation",

        error:
          "Не все переменные были переданы из Salebot",

        missing_fields:
          missingFields,

        received: {

          content_type,
          business_info,
          target_audience,
          content_goal,
          reels_topic,
          content_style

        }

      });

    }


    console.log(
      "All variables received successfully"
    );


    // ========================================================
    // 6. ФОРМИРУЕМ PROMPT
    // ========================================================

    const prompt = `Ты — профессиональный контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри продукта «Мой Контент-Конструктор».

Создай максимально качественный готовый контент на основе данных пользователя.

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

Контент должен быть конкретным, интересным, естественным и применимым.

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
Сильная фраза или действие в первые секунды.

СЦЕНАРИЙ:
Подробно распиши, что говорит и делает автор.

ФИНАЛ:
Чем заканчивается ролик.

CTA:
Конкретный призыв к действию.


==============================
ЕСЛИ ВЫБРАН ПОСТ
==============================

Создай полноценный пост:

Сильное начало.

Основная часть.

Практическая ценность.

Финал.

CTA.


==============================
ЕСЛИ ВЫБРАНА КАРУСЕЛЬ
==============================

Создай полноценную структуру карусели.

Слайд 1:
Заголовок и сильный крючок.

Слайд 2:
...

Слайд 3:
...

Продолжай необходимое количество слайдов.

Последний слайд:
CTA.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост в указанном стиле.

Не добавляй пояснений вне готового контента.

==============================

Верни только готовый контент.`;



    console.log(
      "Prompt created"
    );


    console.log(
      "Prompt length:",
      prompt.length
    );


    // ========================================================
    // 7. АВТОРИЗАЦИЯ
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );


    const accessToken =
      await getAccessToken();


    console.log(
      "Access token obtained"
    );


    // ========================================================
    // 8. ЗАПРОС GIGACHAT
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );


    const gigaResponse = await http.post(

      "https://api.giga.chat/api/v1/chat/completions",

      {

        model: GIGACHAT_MODEL,

        messages: [

          {

            role: "system",

            content:
              "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Отвечай на русском языке."

          },

          {

            role: "user",

            content: prompt

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

          "User-Agent":
            "Content-Constructor-Gateway/1.0"

        }

      }

    );


    console.log(
      "GigaChat status:",
      gigaResponse.status
    );


    // ========================================================
    // 9. ПРОВЕРКА ОТВЕТА GIGACHAT
    // ========================================================

    if (
      gigaResponse.status < 200 ||
      gigaResponse.status >= 300
    ) {

      console.error(
        "GigaChat returned error:"
      );

      console.dir(
        gigaResponse.data,
        {
          depth: null
        }
      );


      return res.status(502).json({

        ok: false,

        stage: "gigachat",

        status:
          gigaResponse.status,

        error:
          "GigaChat returned an error",

        details:
          gigaResponse.data

      });

    }


    console.log(
      "GigaChat response received successfully"
    );


    console.dir(
      gigaResponse.data,
      {
        depth: 4
      }
    );


    // ========================================================
    // 10. ИЗВЛЕКАЕМ ТЕКСТ
    // ========================================================

    const result =
      gigaResponse.data &&
      gigaResponse.data.choices &&
      gigaResponse.data.choices[0] &&
      gigaResponse.data.choices[0].message &&
      gigaResponse.data.choices[0].message.content;


    if (!result) {

      console.error(
        "GigaChat response does not contain content"
      );


      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          gigaResponse.data

      });

    }


    console.log(
      "Generated content length:",
      result.length
    );


    // ========================================================
    // 11. ВОЗВРАЩАЕМ РЕЗУЛЬТАТ SALEBOT
    // ========================================================

    console.log(
      "Sending result back to Salebot..."
    );


    const finalResponse = {

      ok: true,

      reels_result: result

    };


    console.log(
      "===================================="
    );

    console.log(
      "GENERATE COMPLETED SUCCESSFULLY"
    );

    console.log(
      "===================================="
    );


    return res.status(200).json(
      finalResponse
    );


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
      "Error type:",
      typeof error
    );

    console.error(
      "Error name:",
      error.name
    );

    console.error(
      "Error message:",
      error.message
    );


    if (error.response) {

      console.error(
        "HTTP status:",
        error.response.status
      );

      console.error(
        "HTTP response:"
      );

      console.dir(
        error.response.data,
        {
          depth: null
        }
      );

    }


    return res.status(
