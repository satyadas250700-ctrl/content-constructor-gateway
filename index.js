```javascript
const express = require("express");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

// ============================================================
// HTTPS AGENT
// ============================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// ============================================================
// STARTUP
// ============================================================

console.log("======================================");
console.log("CONTENT CONSTRUCTOR GATEWAY");
console.log("======================================");

console.log(
  "GIGACHAT_KEY:",
  GIGACHAT_KEY ? "configured" : "NOT CONFIGURED"
);

console.log(
  "BRIDGE_KEY:",
  BRIDGE_KEY ? "configured" : "NOT CONFIGURED"
);

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });

});

// ============================================================
// SIMPLE TEST
// ============================================================
//
// Пока здесь НЕТ GigaChat.
// Проверяем только работу маршрута.
// ============================================================

app.get("/test-auth", (req, res) => {

  console.log("======================================");
  console.log("TEST-AUTH ROUTE REACHED");
  console.log("======================================");

  return res.json({

    ok: true,

    test_auth:
      "working",

    message:
      "The /test-auth route is working correctly."

  });

});

// ============================================================
// HTTPS REQUEST
// ============================================================

function httpsRequest(options, body = null) {

  return new Promise((resolve, reject) => {

    const request = https.request(
      options,
      (response) => {

        let data = "";

        response.on("data", (chunk) => {

          data += chunk.toString();

        });

        response.on("end", () => {

          let parsed = data;

          try {

            parsed = JSON.parse(data);

          } catch (error) {

            // Ответ не JSON
            // Оставляем как текст

          }

          resolve({

            statusCode:
              response.statusCode,

            headers:
              response.headers,

            data:
              parsed

          });

        });

      }
    );

    request.on("error", (error) => {

      reject(error);

    });

    request.setTimeout(
      15000,
      () => {

        request.destroy(
          new Error(
            "HTTPS request timeout"
          )
        );

      }
    );

    if (body) {

      request.write(body);

    }

    request.end();

  });

}

// ============================================================
// OAUTH TEST
// ============================================================
//
// После того как простой /test-auth подтвердит,
// что маршрут работает, сюда добавим реальную проверку.
// ============================================================

async function testGigaChatAuth() {

  if (!GIGACHAT_KEY) {

    throw new Error(
      "GIGACHAT_KEY is not configured"
    );

  }

  const rqUID =
    crypto.randomUUID();

  const body =
    "scope=" +
    encodeURIComponent(
      "GIGACHAT_API_PERS"
    );

  console.log(
    "Sending OAuth request..."
  );

  const response =
    await httpsRequest(

      {

        hostname:
          "ngw.devices.sberbank.ru",

        port:
          9443,

        path:
          "/api/v2/oauth",

        method:
          "POST",

        agent:
          httpsAgent,

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded",

          "Accept":
            "application/json",

          "RqUID":
            rqUID,

          "Authorization":
            "Basic " +
            GIGACHAT_KEY,

          "Content-Length":
            Buffer.byteLength(body)

        }

      },

      body

    );

  console.log(
    "OAuth status:",
    response.statusCode
  );

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {

    throw new Error(

      "OAuth HTTP " +
      response.statusCode +
      ": " +
      JSON.stringify(
        response.data
      )

    );

  }

  const accessToken =
    response.data &&
    response.data.access_token;

  if (!accessToken) {

    throw new Error(
      "OAuth response has no access_token"
    );

  }

  return accessToken;

}

// ============================================================
// REAL OAUTH TEST
// ============================================================
//
// Пока он находится отдельно.
// ============================================================

app.get("/test-gigachat-auth", async (req, res) => {

  console.log("======================================");
  console.log("GIGACHAT AUTH TEST STARTED");
  console.log("======================================");

  try {

    const token =
      await testGigaChatAuth();

    return res.json({

      ok: true,

      stage: "oauth",

      token_received:
        !!token,

      message:
        "GigaChat OAuth authentication works."

    });

  } catch (error) {

    console.error(
      "GigaChat OAuth error:",
      error.message
    );

    return res.status(500).json({

      ok: false,

      stage: "oauth",

      error:
        error.message

    });

  }

});

// ============================================================
// GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("======================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("======================================");

  try {

    // --------------------------------------------------------
    // CONFIG
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SALEBOT BODY
    // --------------------------------------------------------

    const body =
      req.body || {};

    console.log(
      "Body received:",
      !!req.body
    );

    console.log(
      "Body keys:",
      Object.keys(body)
    );

    // --------------------------------------------------------
    // DATA
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SECURITY
    // --------------------------------------------------------

    if (
      bridge_key !==
      BRIDGE_KEY
    ) {

      return res.status(401).json({

        ok: false,

        stage:
          "security",

        error:
          "Invalid bridge_key"

      });

    }

    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    console.log(
      "Getting GigaChat access token..."
    );

    const accessToken =
      await testGigaChatAuth();

    console.log(
      "Access token received."
    );

    // --------------------------------------------------------
    // PROMPT
    // --------------------------------------------------------

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

Создай полноценный сценарий Reels:

ЗАЦЕПКА:
...

СЦЕНАРИЙ:
...

ФИНАЛ:
...

CTA:
...


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

Создай структуру:

Слайд 1:
...

Слайд 2:
...

Слайд 3:
...

и далее.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.

Верни только готовый контент.

`;

    // --------------------------------------------------------
    // GIGACHAT REQUEST
    // --------------------------------------------------------

    const requestBody =
      JSON.stringify({

        model:
          "GigaChat-3-Ultra",

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
          0.7,

        stream:
          false

      });

    console.log(
      "Sending request to GigaChat..."
    );

    const response =
      await httpsRequest(

        {

          hostname:
            "api.giga.chat",

          port:
            443,

          path:
            "/v1/chat/completions",

          method:
            "POST",

          agent:
            httpsAgent,

          headers: {

            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "Authorization":
              "Bearer " +
              accessToken,

            "Content-Length":
              Buffer.byteLength(
                requestBody
              )

          }

        },

        requestBody

      );

    console.log(
      "GigaChat status:",
      response.statusCode
    );

    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    if (
      response.statusCode < 200 ||
      response.statusCode >= 300
    ) {

      console.error(
        "GigaChat response:",
        response.data
      );

      return res.status(502).json({

        ok: false,

        stage:
          "gigachat",

        status:
          response.statusCode,

        error:
          response.data

      });

    }

    // --------------------------------------------------------
    // RESULT
    // --------------------------------------------------------

    const result =
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content;

    if (!result) {

      return res.status(502).json({

        ok: false,

        stage:
          "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          response.data

      });

    }

    console.log(
      "Generation successful."
    );

    return res.json({

      ok:
        true,

      reels_result:
        result

    });

  } catch (error) {

    console.error(
      "Generate error:",
      error.message
    );

    return res.status(500).json({

      ok:
        false,

      stage:
        "gigachat",

      error:
        error.message

    });

  }

});

// ============================================================
// START SERVER
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
```
  
