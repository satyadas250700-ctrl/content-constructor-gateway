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

if (!GIGACHAT_KEY) {
  console.error("ERROR: GIGACHAT_KEY is not configured");
}

if (!BRIDGE_KEY) {
  console.error("ERROR: BRIDGE_KEY is not configured");
}

console.log("GigaChat Gateway starting...");

// ============================================================
// UNIVERSAL HTTPS REQUEST
// ============================================================

function httpsRequest(options, body = null) {

  return new Promise((resolve, reject) => {

    const req = https.request(
      options,
      (res) => {

        let data = "";

        res.on("data", (chunk) => {
          data += chunk.toString();
        });

        res.on("end", () => {

          let parsed = data;

          try {
            parsed = JSON.parse(data);
          } catch (_) {
            // Ответ не JSON — оставляем как текст
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed
          });

        });

      }
    );

    req.on("error", (error) => {
      reject(error);
    });

    req.setTimeout(12000, () => {

      req.destroy(
        new Error("HTTPS request timeout")
      );

    });

    if (body) {
      req.write(body);
    }

    req.end();

  });

}

// ============================================================
// GET /
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
//
// Этот endpoint проверяет ТОЛЬКО:
//
// Authorization Key
//        ↓
// OAuth
//        ↓
// access_token
//
// Он НЕ запускает генерацию контента.
//
// После проверки endpoint можно удалить.
// ============================================================

app.get("/test-auth", async (req, res) => {

  console.log("======================================");
  console.log("=== TEST AUTH STARTED ===");
  console.log("======================================");

  try {

    // --------------------------------------------------------
    // 1. Проверяем наличие ключа
    // --------------------------------------------------------

    if (!GIGACHAT_KEY) {

      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }

    console.log(
      "GIGACHAT_KEY: configured"
    );

    // --------------------------------------------------------
    // 2. Генерируем UUID
    // --------------------------------------------------------

    const rqUID = crypto.randomUUID();

    console.log(
      "RqUID generated"
    );

    // --------------------------------------------------------
    // 3. Формируем OAuth body
    // --------------------------------------------------------

    const oauthBody =
      "scope=" +
      encodeURIComponent(
        "GIGACHAT_API_PERS"
      );

    // --------------------------------------------------------
    // 4. Отправляем запрос OAuth
    // --------------------------------------------------------

    console.log(
      "Sending OAuth request to GigaChat..."
    );

    const response = await httpsRequest({

      hostname:
        "ngw.devices.sberbank.ru",

      port: 9443,

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
          "Basic " + GIGACHAT_KEY,

        "Content-Length":
          Buffer.byteLength(oauthBody)

      }

    }, oauthBody);

    // --------------------------------------------------------
    // 5. Логируем ТОЛЬКО безопасную информацию
    // --------------------------------------------------------

    console.log(
      "OAuth HTTP status:",
      response.statusCode
    );

    // --------------------------------------------------------
    // 6. Проверяем ответ
    // --------------------------------------------------------

    if (
      response.statusCode < 200 ||
      response.statusCode >= 300
    ) {

      console.error(
        "OAuth FAILED"
      );

      console.error(
        "OAuth response:",
        response.data
      );

      return res.status(500).json({

        ok: false,

        stage: "oauth",

        status:
          response.statusCode,

        error:
          response.data

      });

    }

    // --------------------------------------------------------
    // 7. Извлекаем access token
    // --------------------------------------------------------

    const accessToken =
      response.data &&
      response.data.access_token;

    if (!accessToken) {

      console.error(
        "OAuth returned no access_token"
      );

      return res.status(500).json({

        ok: false,

        stage: "oauth",

        error:
          "OAuth response does not contain access_token",

        response:
          response.data

      });

    }

    // --------------------------------------------------------
    // 8. НЕ ВЫВОДИМ ТОКЕН В ЛОГИ
    // --------------------------------------------------------

    console.log(
      "OAuth SUCCESS"
    );

    console.log(
      "Access token received: YES"
    );

    // --------------------------------------------------------
    // 9. Возвращаем безопасный результат
    // --------------------------------------------------------

    return res.json({

      ok: true,

      stage: "oauth",

      token_received: true,

      message:
        "GigaChat Authorization Key works correctly"

    });

  } catch (error) {

    console.error(
      "OAuth request error:",
      error.message
    );

    return res.status(500).json({

      ok: false,

      stage: "oauth_connection",

      error:
        error.message

    });

  }

});

// ============================================================
// GET TOKEN FUNCTION
// ============================================================
//
// Используется основным /generate.
// ============================================================

async function getAccessToken() {

  if (!GIGACHAT_KEY) {

    throw new Error(
      "GIGACHAT_KEY is not configured"
    );

  }

  const rqUID =
    crypto.randomUUID();

  const oauthBody =
    "scope=" +
    encodeURIComponent(
      "GIGACHAT_API_PERS"
    );

  const response =
    await httpsRequest({

      hostname:
        "ngw.devices.sberbank.ru",

      port: 9443,

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
          "Basic " + GIGACHAT_KEY,

        "Content-Length":
          Buffer.byteLength(oauthBody)

      }

    }, oauthBody);

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

  const token =
    response.data &&
    response.data.access_token;

  if (!token) {

    throw new Error(
      "OAuth response does not contain access_token"
    );

  }

  return token;

}

// ============================================================
// GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("======================================");
  console.log("=== GENERATE REQUEST RECEIVED ===");
  console.log("======================================");

  try {

    // ========================================================
    // 1. CONFIG
    // ========================================================

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

    // ========================================================
    // 2. SALEBOT DATA
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

    console.log(
      "Content type:",
      content_type
    );

    console.log(
      "Business info:",
      business_info ? "YES" : "NO"
    );

    console.log(
      "Target audience:",
      target_audience ? "YES" : "NO"
    );

    console.log(
      "Content goal:",
      content_goal ? "YES" : "NO"
    );

    console.log(
      "Topic:",
      reels_topic ? "YES" : "NO"
    );

    console.log(
      "Style:",
      content_style ? "YES" : "NO"
    );

    // ========================================================
    // 3. SECURITY
    // ========================================================

    if (bridge_key !== BRIDGE_KEY) {

      console.error(
        "Invalid bridge_key"
      );

      return res.status(401).json({

        ok: false,

        stage: "security",

        error:
          "Invalid bridge_key"

      });

    }

    // ========================================================
    // 4. CHECK UNRESOLVED SALEBOT VARIABLES
    // ========================================================

    const variables = {

      content_type,
      business_info,
      target_audience,
      content_goal,
      reels_topic,
      content_style

    };

    const unresolved =
      Object.entries(
        variables
      )
      .filter(([key, value]) => {

        return (
          String(value)
            .trim()
            .startsWith("{{") &&
          String(value)
            .trim()
            .endsWith("}}")
        );

      })
      .map(([key]) => key);

    if (unresolved.length > 0) {

      console.error(
        "Unresolved variables:",
        unresolved
      );

      return res.status(400).json({

        ok: false,

        stage:
          "salebot_variables",

        error:
          "Salebot did not substitute variables",

        variables:
          unresolved

      });

    }

    // ========================================================
    // 5. GET FRESH ACCESS TOKEN
    // ========================================================

    console.log(
      "Getting GigaChat access token..."
    );

    const accessToken =
      await getAccessToken();

    console.log(
      "Access token received"
    );

    // ========================================================
    // 6. PROMPT
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

Создай полноценный сценарий Reels:

ЗАЦЕПКА:
Сильная первая фраза, которая удерживает внимание.

СЦЕНАРИЙ:
Полный сценарий по шагам.

ФИНАЛ:
Сильное завершение.

CTA:
Призыв к действию.


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
Заголовок и сильный хук.

Слайд 2:
Основная мысль.

Слайд 3:
Развитие темы.

Слайд 4:
Практическая ценность.

Слайд 5:
Вывод.

Добавляй дополнительные слайды,
если это необходимо.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.

==============================

Верни только готовый контент.
`;

    // ========================================================
    // 7. CHAT COMPLETIONS
    // ========================================================

    const requestBody =
      JSON.stringify({

        model:
          "GigaChat-3-Ultra",

        messages: [

          {
            role: "system",

            content:
              "Ты профессиональный контент-маркетолог, контент-стратег и сценарист. Отвечай на русском языке."
          },

          {
            role: "user",

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
      await httpsRequest({

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

      }, requestBody);

    // ========================================================
    // 8. CHECK GIGACHAT RESPONSE
    // ========================================================

    console.log(
      "GigaChat HTTP status:",
      response.statusCode
    );

    if (
      response.statusCode < 200 ||
      response.statusCode >= 300
    ) {

      console.error(
        "GigaChat error response:",
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

    // ========================================================
    // 9. EXTRACT RESULT
    // ========================================================

    const result =
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content;

    if (!result) {

      console.error(
        "No message.content in GigaChat response"
      );

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

    // ========================================================
    // 10. SUCCESS
    // ========================================================

    console.log(
      "Generation successful"
    );

    console.log(
      "Result length:",
      String(result).length
    );

    return res.json({

      ok:
        true,

      reels_result:
        result

    });

  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "GIGACHAT ERROR"
    );

    console.error(
      "======================================"
    );

    console.error(
      error.message || error
    );

    return res.status(500).json({

      ok:
        false,

      stage:
        "gigachat",

      error:
        String(
          error.message ||
          error
        )

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
    
