const express = require("express");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

// ============================================================
// НАСТРОЙКИ
// ============================================================

const GIGACHAT_SCOPE = "GIGACHAT_API_PERS";
const GIGACHAT_MODEL = "GigaChat-3-Ultra";

// Временно отключаем проверку сертификата НУЦ Минцифры.
// Это необходимо для подключения к OAuth GigaChat.
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ HTTPS REQUEST
// ============================================================

function httpsRequest(options, body = null, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, httpsAgent, (res) => {
      let data = "";

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error("HTTPS request timeout"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// ============================================================
// ПОЛУЧЕНИЕ ACCESS TOKEN GIGACHAT
// ============================================================

async function getGigaChatToken() {
  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
  }

  const rqUid = crypto.randomUUID();

  const body = "scope=" + encodeURIComponent(GIGACHAT_SCOPE);

  const options = {
    hostname: "ngw.devices.sberbank.ru",
    port: 9443,
    path: "/api/v2/oauth",
    method: "POST",

    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "RqUID": rqUid,
      "Authorization": "Basic " + GIGACHAT_KEY,
      "Content-Length": Buffer.byteLength(body)
    }
  };

  console.log("=== GIGACHAT OAUTH REQUEST ===");
  console.log("RqUID:", rqUid);
  console.log("Scope:", GIGACHAT_SCOPE);

  const response = await httpsRequest(
    options,
    body,
    30000
  );

  console.log("OAuth status:", response.statusCode);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      "GigaChat OAuth error " +
      response.statusCode +
      ": " +
      response.body
    );
  }

  let json;

  try {
    json = JSON.parse(response.body);
  } catch (error) {
    throw new Error(
      "GigaChat OAuth returned invalid JSON: " +
      response.body
    );
  }

  if (!json.access_token) {
    throw new Error(
      "GigaChat OAuth response does not contain access_token: " +
      response.body
    );
  }

  return json.access_token;
}

// ============================================================
// ПРОВЕРКА ПЕРЕМЕННЫХ
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

console.log(
  "MODEL:",
  GIGACHAT_MODEL
);

console.log(
  "SCOPE:",
  GIGACHAT_SCOPE
);

// ============================================================
// ГЛАВНАЯ СТРАНИЦА
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
  console.log("=== TEST AUTH REQUEST ===");

  try {
    if (!GIGACHAT_KEY) {
      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "GIGACHAT_KEY is not configured"
      });
    }

    const token = await getGigaChatToken();

    return res.json({
      ok: true,
      test_auth: "working",
      message: "GigaChat authorization successful",
      token_received: !!token
    });

  } catch (error) {
    console.error("TEST AUTH ERROR:", error);

    return res.status(500).json({
      ok: false,
      stage: "auth",
      error: String(error.message || error)
    });
  }
});

// ============================================================
// TEST GIGACHAT
// ============================================================

app.get("/test-gigachat", async (req, res) => {
  console.log("=== TEST GIGACHAT REQUEST ===");

  try {
    if (!GIGACHAT_KEY) {
      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "GIGACHAT_KEY is not configured"
      });
    }

    const token = await getGigaChatToken();

    const requestBody = JSON.stringify({
      model: GIGACHAT_MODEL,

      messages: [
        {
          role: "user",
          content: "Ответь одним словом: работает"
        }
      ],

      temperature: 0.2
    });

    const options = {
      hostname: "api.giga.chat",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    console.log("=== GIGACHAT TEST REQUEST ===");

    const response = await httpsRequest(
      options,
      requestBody,
      60000
    );

    console.log(
      "GigaChat status:",
      response.statusCode
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return res.status(502).json({
        ok: false,
        stage: "gigachat",
        status: response.statusCode,
        error: response.body
      });
    }

    let json;

    try {
      json = JSON.parse(response.body);
    } catch (error) {
      return res.status(502).json({
        ok: false,
        stage: "gigachat",
        error: "Invalid JSON from GigaChat",
        response: response.body
      });
    }

    const result =
      json &&
      json.choices &&
      json.choices[0] &&
      json.choices[0].message &&
      json.choices[0].message.content;

    return res.json({
      ok: true,
      stage: "gigachat",
      model: GIGACHAT_MODEL,
      result: result || null
    });

  } catch (error) {
    console.error("TEST GIGACHAT ERROR:", error);

    return res.status(500).json({
      ok: false,
      stage: "gigachat",
      error: String(error.message || error)
    });
  }
});

// ============================================================
// ОСНОВНОЙ ENDPOINT SALEBOT
// ============================================================

app.post("/generate", async (req, res) => {
  console.log("======================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("======================================");

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
    req.body ? Object.keys(req.body) : []
  );

  try {

    // --------------------------------------------------------
    // 1. ПРОВЕРКА КОНФИГУРАЦИИ
    // --------------------------------------------------------

    if (!GIGACHAT_KEY) {
      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "GIGACHAT_KEY is not configured"
      });
    }

    if (!BRIDGE_KEY) {
      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "BRIDGE_KEY is not configured"
      });
    }

    // --------------------------------------------------------
    // 2. ПОЛУЧАЕМ ДАННЫЕ SALEBOT
    // --------------------------------------------------------

    const body = req.body || {};

    const bridge_key = body.bridge_key;
    const content_type = body.content_type;
    const business_info = body.business_info;
    const target_audience = body.target_audience;
    const content_goal = body.content_goal;
    const reels_topic = body.reels_topic;
    const content_style = body.content_style;

    console.log("Content type:", content_type);
    console.log("Business info:", business_info ? "received" : "empty");
    console.log("Target audience:", target_audience ? "received" : "empty");
    console.log("Content goal:", content_goal ? "received" : "empty");
    console.log("Topic:", reels_topic ? "received" : "empty");
    console.log("Style:", content_style ? "received" : "empty");

    // --------------------------------------------------------
    // 3. ПРОВЕРКА BRIDGE KEY
    // --------------------------------------------------------

    if (bridge_key !== BRIDGE_KEY) {
      return res.status(401).json({
        ok: false,
        stage: "security",
        error: "Invalid bridge_key"
      });
    }

    console.log("Bridge key: OK");

    // --------------------------------------------------------
    // 4. ПОЛУЧАЕМ ACCESS TOKEN
    // --------------------------------------------------------

    console.log("Getting GigaChat access token...");

    const token = await getGigaChatToken();

    console.log("GigaChat token received");

    // --------------------------------------------------------
    // 5. ФОРМИРУЕМ ПРОМПТ
    // --------------------------------------------------------

    const prompt = [
      "Ты — профессиональный контент-маркетолог,",
      "контент-стратег и сценарист.",
      "",
      "Ты работаешь внутри продукта",
      "«Мой Контент-Конструктор».",
      "",
      "Создай максимально качественный готовый контент",
      "на основе данных пользователя.",
      "",
      "==============================",
      "ДАННЫЕ ПОЛЬЗОВАТЕЛЯ",
      "==============================",
      "",
      "ТИП КОНТЕНТА:",
      String(content_type || ""),
      "",
      "БИЗНЕС:",
      String(business_info || ""),
      "",
      "ЦЕЛЕВАЯ АУДИТОРИЯ:",
      String(target_audience || ""),
      "",
      "ЦЕЛЬ КОНТЕНТА:",
      String(content_goal || ""),
      "",
      "ТЕМА:",
      String(reels_topic || ""),
      "",
      "СТИЛЬ:",
      String(content_style || ""),
      "",
      "==============================",
      "ОБЩИЕ ТРЕБОВАНИЯ",
      "==============================",
      "",
      "Учитывай все переданные данные.",
      "",
      "Контент должен быть конкретным,",
      "интересным, естественным и применимым.",
      "",
      "Не используй шаблонные фразы.",
      "",
      "Не говори, что ты искусственный интеллект.",
      "",
      "Не объясняй процесс своей работы.",
      "",
      "Не добавляй лишних пояснений.",
      "",
      "Верни сразу готовый результат.",
      "",
      "==============================",
      "ЕСЛИ ВЫБРАН REELS",
      "==============================",
      "",
      "Создай полноценный сценарий Reels:",
      "",
      "ЗАЦЕПКА:",
      "...",
      "",
      "СЦЕНАРИЙ:",
      "...",
      "",
      "ФИНАЛ:",
      "...",
      "",
      "CTA:",
      "...",
      "",
      "==============================",
      "ЕСЛИ ВЫБРАН ПОСТ",
      "==============================",
      "",
      "Создай полноценный пост:",
      "",
      "Сильное начало.",
      "",
      "Основная часть.",
      "",
      "Практическая ценность.",
      "",
      "Финал.",
      "",
      "CTA.",
      "",
      "==============================",
      "ЕСЛИ ВЫБРАНА КАРУСЕЛЬ",
      "==============================",
      "",
      "Создай структуру:",
      "",
      "Слайд 1:",
      "...",
      "",
      "Слайд 2:",
      "...",
      "",
      "Слайд 3:",
      "...",
      "",
      "и так далее.",
      "",
      "==============================",
      "ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ",
      "==============================",
      "",
      "Создай полноценный Telegram-пост",
      "в указанном стиле.",
      "",
      "Не добавляй пояснений вне готового контента."
    ].join("\n");

    // --------------------------------------------------------
    // 6. ФОРМИРУЕМ ЗАПРОС GIGACHAT
    // --------------------------------------------------------

    const requestBody = JSON.stringify({
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
    });

    // --------------------------------------------------------
    // 7. ОТПРАВЛЯЕМ ЗАПРОС В GIGACHAT
    // --------------------------------------------------------

    console.log("Sending request to GigaChat...");

    const options = {
      hostname: "api.giga.chat",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    const gigaResponse = await httpsRequest(
      options,
      requestBody,
      120000
    );

    console.log(
      "GigaChat response status:",
      gigaResponse.statusCode
    );

    // --------------------------------------------------------
    // 8. ОБРАБОТКА ОШИБКИ GIGACHAT
    // --------------------------------------------------------

    if (
      gigaResponse.statusCode < 200 ||
      gigaResponse.statusCode >= 300
    ) {

      console.error(
        "GigaChat HTTP error:",
        gigaResponse.statusCode
      );

      console.error(
        "GigaChat response:",
        gigaResponse.body
      );

      return res.status(502).json({
        ok: false,
        stage: "gigachat",
        status: gigaResponse.statusCode,
        error: gigaResponse.body
      });
    }

    // --------------------------------------------------------
    // 9. ПАРСИМ ОТВЕТ
    // --------------------------------------------------------

    let gigaJson;

    try {
      gigaJson = JSON.parse(gigaResponse.body);
    } catch (error) {

      return res.status(502).json({
        ok: false,
        stage: "gigachat",
        error: "GigaChat returned invalid JSON",
        response: gigaResponse.body
      });
    }

    // --------------------------------------------------------
    // 10. ПОЛУЧАЕМ ТЕКСТ
    // --------------------------------------------------------

    const result =
      gigaJson &&
      gigaJson.choices &&
      gigaJson.choices[0] &&
      gigaJson.choices[0].message &&
      gigaJson.choices[0].message.content;

    if (!result) {

      console.error(
        "Unexpected GigaChat response:",
        gigaJson
      );

      return res.status(502).json({
        ok: false,
        stage: "generation",
        error:
          "GigaChat response does not contain message.content",
        response: gigaJson
      });
    }

    console.log("Generation successful");
    console.log("Result length:", result.length);

    // --------------------------------------------------------
    // 11. ОТДАЁМ РЕЗУЛЬТАТ SALEBOT
    // --------------------------------------------------------

    return res.json({
      ok: true,
      reels_result: result
    });

  } catch (error) {

    console.error("======================================");
    console.error("GENERATION ERROR");
    console.error("======================================");

    console.error(error);

    return res.status(500).json({
      ok: false,
      stage: "gigachat",
      error: String(error.message || error)
    });
  }
});

// ============================================================
// ОБРАБОТКА НЕИЗВЕСТНЫХ ROUTES
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
    method: req.method,
    path: req.path
  });
});

// ============================================================
// ОБРАБОТКА ОШИБОК EXPRESS
// ============================================================

app.use((error, req, res, next) => {

  console.error("EXPRESS ERROR:", error);

  res.status(500).json({
    ok: false,
    stage: "express",
    error: String(error.message || error)
  });
});

// ============================================================
// ЗАПУСК
// ============================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log("======================================");
  console.log(
    "Content Constructor Gateway running on port " + PORT
  );
  console.log("======================================");

});
