    ```javascript
const express = require("express");
const { Agent } = require("node:https");
const GigaChat = require("gigachat");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

// ============================================================
// ENV
// ============================================================

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

// ============================================================
// HTTPS AGENT
// ============================================================

const httpsAgent = new Agent({
  rejectUnauthorized: false
});

// ============================================================
// STARTUP CHECK
// ============================================================

if (!GIGACHAT_KEY) {
  console.error("ERROR: GIGACHAT_KEY is not configured");
}

if (!BRIDGE_KEY) {
  console.error("ERROR: BRIDGE_KEY is not configured");
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });
});

// ============================================================
// HELPER
// ============================================================

function getValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

// ============================================================
// GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("======================================");
  console.log("=== GENERATE REQUEST RECEIVED ===");
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

    // ========================================================
    // 1. CHECK CONFIGURATION
    // ========================================================

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

    // ========================================================
    // 2. GET SALEBOT DATA
    // ========================================================

    const body = req.body || {};

    const bridge_key = getValue(body.bridge_key);

    const content_type = getValue(body.content_type);

    const business_info = getValue(body.business_info);

    const target_audience = getValue(
      body.target_audience
    );

    const content_goal = getValue(
      body.content_goal
    );

    const reels_topic = getValue(
      body.reels_topic
    );

    const content_style = getValue(
      body.content_style
    );

    console.log(
      "Content type received:",
      content_type
    );

    console.log(
      "Business info received:",
      business_info ? "YES" : "NO"
    );

    console.log(
      "Target audience received:",
      target_audience ? "YES" : "NO"
    );

    console.log(
      "Content goal received:",
      content_goal ? "YES" : "NO"
    );

    console.log(
      "Topic received:",
      reels_topic ? "YES" : "NO"
    );

    console.log(
      "Style received:",
      content_style ? "YES" : "NO"
    );

    // ========================================================
    // 3. CHECK BRIDGE KEY
    // ========================================================

    if (bridge_key !== BRIDGE_KEY) {

      console.error(
        "SECURITY ERROR: Invalid bridge_key"
      );

      return res.status(401).json({
        ok: false,
        stage: "security",
        error: "Invalid bridge_key"
      });

    }

    console.log("Bridge key: OK");

    // ========================================================
    // 4. CHECK SALEBOT VARIABLES
    // ========================================================
    //
    // Если Salebot отправляет буквально:
    // {{content_type}}
    //
    // значит переменная не была подставлена в Salebot.
    // Не отправляем такой мусор в GigaChat.
    //

    const variables = {
      content_type,
      business_info,
      target_audience,
      content_goal,
      reels_topic,
      content_style
    };

    const unresolvedVariables = Object.entries(
      variables
    )
      .filter(([key, value]) => {
        return (
          value.startsWith("{{") &&
          value.endsWith("}}")
        );
      })
      .map(([key]) => key);

    if (unresolvedVariables.length > 0) {

      console.error(
        "UNRESOLVED SALEBOT VARIABLES:",
        unresolvedVariables
      );

      return res.status(400).json({
        ok: false,
        stage: "salebot_variables",
        error:
          "Salebot did not substitute variables",
        variables: unresolvedVariables
      });

    }

    // ========================================================
    // 5. CREATE GIGACHAT CLIENT
    // ========================================================

    console.log(
      "Creating GigaChat client..."
    );

    const giga = new GigaChat({
      credentials: GIGACHAT_KEY,

      scope: "GIGACHAT_API_PERS",

      model: "GigaChat-3-Ultra",

      timeout: 12,

      baseUrl:
        "https://api.giga.chat/api/v1",

      httpsAgent: httpsAgent,

      headers: {
        "User-Agent":
          "Content-Constructor-Gateway/1.0"
      }
    });

    console.log(
      "GigaChat client created"
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

Создай полноценный сценарий Reels.

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

Создай полноценный пост.

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
если это необходимо для качества.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.

==============================

Верни только готовый контент.
`;

    console.log(
      "Prompt prepared"
    );

    // ========================================================
    // 7. GIGACHAT REQUEST
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );

    const response = await giga.chat({

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

    console.log(
      "GigaChat response received"
    );

    // ========================================================
    // 8. GET RESULT
    // ========================================================

    const result =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content;

    // ========================================================
    // 9. CHECK RESULT
    // ========================================================

    if (!result) {

      console.error(
        "GigaChat returned empty result"
      );

      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content"

      });

    }

    console.log(
      "Generated content length:",
      String(result).length
    );

    // ========================================================
    // 10. RETURN TO SALEBOT
    // ========================================================

    console.log(
      "Returning result to Salebot"
    );

    return res.json({

      ok: true,

      reels_result: result

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
      "Message:",
      error.message || error
    );

    if (error.response) {

      console.error(
        "HTTP status:",
        error.response.status
      );

      console.error(
        "Response data:",
        error.response.data
      );

    }

    return res.status(500).json({

      ok: false,

      stage: "gigachat",

      error:
        String(
          error.message || error
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
