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
// STARTUP INFORMATION
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
console.log("CHAT_URL:", CHAT_URL);
console.log("PORT:", PORT);

console.log("====================================");


// ============================================================
// ERROR FORMATTER
// ============================================================

function formatError(error) {

  const result = {
    type: typeof error,
    name: error?.name || null,
    message: error?.message || String(error)
  };

  if (error?.response) {

    result.http_status =
      error.response.status || null;

    result.response_data =
      error.response.data || null;

    result.response_headers =
      error.response.headers || null;
  }

  if (error?.code) {
    result.code = error.code;
  }

  return result;
}


// ============================================================
// GET GIGACHAT ACCESS TOKEN
// ============================================================

async function getAccessToken() {

  console.log("====================================");
  console.log("GIGACHAT AUTH STARTED");
  console.log("====================================");

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const rqUid = crypto.randomUUID();

  console.log("RqUID:", rqUid);
  console.log("Requesting GigaChat OAuth token...");

  const started = Date.now();

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      httpsAgent: httpsAgent,

      timeout: 8000,

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",

        "Accept":
          "application/json",

        "RqUID":
          rqUid,

        "Authorization":
          `Basic ${GIGACHAT_KEY}`
      }
    }
  );

  console.log(
    "OAuth response status:",
    response.status
  );

  console.log(
    "OAuth time:",
    Date.now() - started,
    "ms"
  );

  if (!response.data?.access_token) {

    throw new Error(
      "GigaChat OAuth response does not contain access_token"
    );
  }

  console.log(
    "GigaChat OAuth token received successfully"
  );

  return response.data.access_token;
}


// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });

});


app.get("/health", (req, res) => {

  res.json({

    ok: true,

    service:
      "Content Constructor Gateway",

    status:
      "working",

    gigaChatKey:
      GIGACHAT_KEY
        ? "CONFIGURED"
        : "NOT CONFIGURED",

    bridgeKey:
      BRIDGE_KEY
        ? "CONFIGURED"
        : "NOT CONFIGURED",

    model:
      GIGACHAT_MODEL,

    time:
      new Date().toISOString()

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
      await getAccessToken();

    return res.json({

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
      formatError(error)
    );

    return res.status(500).json({

      ok: false,

      stage: "auth",

      error:
        "GigaChat authorization failed",

      error_details:
        formatError(error)

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

    const token =
      await getAccessToken();

    console.log(
      "Access token obtained"
    );

    console.log(
      "Sending test request to GigaChat..."
    );

    const started =
      Date.now();

    const response =
      await axios.post(

        CHAT_URL,

        {
          model:
            GIGACHAT_MODEL,

          messages: [

            {
              role:
                "system",

              content:
                "Отвечай кратко на русском языке."
            },

            {
              role:
                "user",

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

          httpsAgent:
            httpsAgent,

          timeout:
            10000,

          headers: {

            "Authorization":
              `Bearer ${token}`,

            "Content-Type":
              "application/json",

            "Accept":
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
      "Generation time:",
      Date.now() - started,
      "ms"
    );

    console.log(
      "GigaChat response:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    const result =
      response.data
        ?.choices?.[0]
        ?.message
        ?.content;

    return res.json({

      ok:
        true,

      stage:
        "generation",

      status:
        response.status,

      response:
        response.data,

      reels_result:
        result || ""

    });

  } catch (error) {

    console.error(
      "TEST GENERATE ERROR:",
      formatError(error)
    );

    return res.status(500).json({

      ok:
        false,

      stage:
        "gigachat",

      error_type:
        typeof error,

      error_name:
        error?.name || null,

      error_message:
        error?.message || String(error),

      error_details:
        formatError(error)

    });

  }

});


// ============================================================
// GENERATE CONTENT
// ============================================================

app.post("/generate", async (req, res) => {

  const requestStarted =
    Date.now();

  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

  console.log(
    "Time:",
    new Date().toISOString()
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
    req.body
      ? Object.keys(req.body)
      : []
  );


  try {

    // ========================================================
    // 1. CONFIGURATION
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
    // 2. RECEIVE SALEBOT DATA
    // ========================================================

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


    // ========================================================
    // 3. LOG VARIABLES
    // ========================================================

    console.log("====================================");
    console.log("SALEBOT VARIABLES");
    console.log("====================================");

    console.log(
      "content_type:",
      JSON.stringify(content_type)
    );

    console.log(
      "business_info:",
      JSON.stringify(business_info)
    );

    console.log(
      "target_audience:",
      JSON.stringify(target_audience)
    );

    console.log(
      "content_goal:",
      JSON.stringify(content_goal)
    );

    console.log(
      "reels_topic:",
      JSON.stringify(reels_topic)
    );

    console.log(
      "content_style:",
      JSON.stringify(content_style)
    );

    console.log("====================================");


    // ========================================================
    // 4. CHECK BRIDGE KEY
    // ========================================================

    if (bridge_key !== BRIDGE_KEY) {

      console.error(
        "INVALID BRIDGE KEY"
      );

      return res.status(401).json({

        ok:
          false,

        stage:
          "security",

        error:
          "Invalid bridge_key"

      });

    }


    console.log(
      "Bridge key: VALID"
    );


    // ========================================================
    // 5. BASIC VALIDATION
    // ========================================================

    if (!content_type) {

      console.warn(
        "WARNING: content_type is empty"
      );

    }

    if (!business_info) {

      console.warn(
        "WARNING: business_info is empty"
      );

    }

    if (!target_audience) {

      console.warn(
        "WARNING: target_audience is empty"
      );

    }

    if (!content_goal) {

      console.warn(
        "WARNING: content_goal is empty"
      );

    }

    if (!reels_topic) {

      console.warn(
        "WARNING: reels_topic is empty"
      );

    }

    if (!content_style) {

      console.warn(
        "WARNING: content_style is empty"
      );

    }


    // ========================================================
    // 6. AUTH
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );

    const token =
      await getAccessToken();

    console.log(
      "Access token obtained"
    );


    // ========================================================
    // 7. PROMPT
    // ========================================================

    const prompt = `Ты — профессиональный контент-маркетолог и сценарист.

Создай готовый контент для пользователя.

ДАННЫЕ:

Тип контента:
${content_type || "не указан"}

Бизнес:
${business_info || "не указан"}

Целевая аудитория:
${target_audience || "не указана"}

Цель:
${content_goal || "не указана"}

Тема:
${reels_topic || "не указана"}

Стиль:
${content_style || "не указан"}

ТРЕБОВАНИЯ:

Используй ВСЕ данные пользователя.

Не задавай дополнительных вопросов.

Не объясняй процесс работы.

Сразу выдай готовый результат.

Не используй фразы вроде:
"я готов создать",
"предоставьте данные",
"уточните информацию".

Если тип контента — Reels, создай:

ЗАГОЛОВОК / ХУК

СЦЕНАРИЙ

ФИНАЛ

CTA

Добавляй конкретные действия в кадре, текст на экране и реплики.

Если тип контента — Пост, создай готовый пост с сильным началом, основной частью, пользой, финалом и CTA.

Если тип контента — Карусель, создай структуру слайдов с текстом каждого слайда.

Если тип контента — Telegram-пост, создай полностью готовый Telegram-пост.

Не добавляй никаких пояснений до или после готового контента.`;


    console.log(
      "Prompt length:",
      prompt.length,
      "characters"
    );


    // ========================================================
    // 8. SEND TO GIGACHAT
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );

    const generationStarted =
      Date.now();


    const response =
      await axios.post(

        CHAT_URL,

        {

          model:
            GIGACHAT_MODEL,

          messages: [

            {

              role:
                "system",

              content:
                "Ты профессиональный контент-маркетолог и сценарист. Отвечай только готовым результатом на русском языке."

            },

            {

              role:
                "user",

              content:
                prompt

            }

          ],

          temperature:
            0.7,

          max_tokens:
            450

        },

        {

          httpsAgent:
            httpsAgent,

          timeout:
            12000,

          headers: {

            "Authorization":
              `Bearer ${token}`,

            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "User-Agent":
              "Content-Constructor-Gateway/1.0"

          }

        }

      );


    console.log(
      "GigaChat HTTP status:",
      response.status
    );

    console.log(
      "GigaChat generation time:",
      Date.now() - generationStarted,
      "ms"
    );


    // ========================================================
    // 9. EXTRACT RESULT
    // ========================================================

    const result =
      response.data
        ?.choices?.[0]
        ?.message
        ?.content;


    if (!result) {

      console.error(
        "GigaChat returned empty content"
      );

      return res.status(502).json({

        ok:
          false,

        stage:
          "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          response.data

      });

    }


    console.log("====================================");
    console.log("CONTENT GENERATED SUCCESSFULLY");
    console.log("====================================");

    console.log(
      "Result length:",
      result.length,
      "characters"
    );

    console.log(
      "Total request time:",
      Date.now() - requestStarted,
      "ms"
    );

    console.log("====================================");


    // ========================================================
    // 10. RETURN TO SALEBOT
    // ========================================================

    return res.json({

      ok:
        true,

      reels_result:
        result

    });


  } catch (error) {

    console.error("====================================");
    console.error("GENERATE ERROR");
    console.error("====================================");

    console.error(
      JSON.stringify(
        formatError(error),
        null,
        2
      )
    );

    console.error(
      "Total request time:",
      Date.now() - requestStarted,
      "ms"
    );

    console.error("====================================");


    return res.status(500).json({

      ok:
        false,

      stage:
        "gigachat",

      error_type:
        typeof error,

      error_name:
        error?.name || null,

      error_message:
        error?.message || String(error),

      error_details:
        formatError(error)

    });

  }

});


// ============================================================
// 404
// ============================================================

app.use((req, res) => {

  res.status(404).json({

    ok:
      false,

    error:
      "Endpoint not found",

    method:
      req.method,

    url:
      req.originalUrl

  });

});


// ============================================================
// SERVER
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
