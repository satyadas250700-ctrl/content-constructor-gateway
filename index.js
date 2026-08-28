const express = require("express");
const GigaChat = require("gigachat");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;


// ============================================================
// ПРОВЕРКА ПЕРЕМЕННЫХ
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

console.log("PORT:", PORT);


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


    console.log("Creating GigaChat client...");


    const client = new GigaChat({
      credentials: GIGACHAT_KEY,
      scope: "GIGACHAT_API_PERS",
      model: "GigaChat-3-Ultra",
      timeout: 600
    });


    console.log("GigaChat client created");


    console.log("Requesting GigaChat token...");


    await client.updateToken();


    console.log("GigaChat token received");


    return res.json({
      ok: true,
      stage: "auth",
      message: "GigaChat authorization successful"
    });


  } catch (error) {

    console.error("====================================");
    console.error("AUTH ERROR");
    console.error("====================================");

    console.error(error);

    return res.status(500).json({
      ok: false,
      stage: "auth",
      error: String(error.message || error)
    });

  }

});


// ============================================================
// GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

  try {

    console.log("Content-Type:", req.headers["content-type"]);

    console.log(
      "Body exists:",
      !!req.body
    );

    console.log(
      "Body keys:",
      req.body ? Object.keys(req.body) : []
    );


    // ========================================================
    // ПРОВЕРКА GIGACHAT KEY
    // ========================================================

    if (!GIGACHAT_KEY) {

      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "GIGACHAT_KEY is not configured"
      });

    }


    // ========================================================
    // ПРОВЕРКА BRIDGE KEY
    // ========================================================

    if (!BRIDGE_KEY) {

      return res.status(500).json({
        ok: false,
        stage: "configuration",
        error: "BRIDGE_KEY is not configured"
      });

    }


    // ========================================================
    // ПОЛУЧАЕМ ДАННЫЕ SALEBOT
    // ========================================================

    const body = req.body || {};

    const bridge_key = body.bridge_key;

    const content_type = body.content_type || "";
    const business_info = body.business_info || "";
    const target_audience = body.target_audience || "";
    const content_goal = body.content_goal || "";
    const reels_topic = body.reels_topic || "";
    const content_style = body.content_style || "";


    // ========================================================
    // ПРОВЕРКА BRIDGE KEY
    // ========================================================

    if (bridge_key !== BRIDGE_KEY) {

      console.log("INVALID BRIDGE KEY");

      return res.status(401).json({
        ok: false,
        stage: "security",
        error: "Invalid bridge_key"
      });

    }


    console.log("Bridge key: OK");


    // ========================================================
    // СОЗДАЁМ GIGACHAT
    // ========================================================

    console.log("Creating GigaChat client...");


    const client = new GigaChat({

      credentials: GIGACHAT_KEY,

      scope: "GIGACHAT_API_PERS",

      model: "GigaChat-3-Ultra",

      timeout: 600

    });


    console.log("GigaChat client created");


    // ========================================================
    // ПРОМПТ
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


и так далее.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.

`;


    // ========================================================
    // ЗАПРОС К GIGACHAT
    // ========================================================

    console.log("Sending request to GigaChat...");


    const response = await client.chat({

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


    console.log("GigaChat response received");


    // ========================================================
    // ПОЛУЧАЕМ РЕЗУЛЬТАТ
    // ========================================================

    const result =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content;


    // ========================================================
    // ПРОВЕРКА РЕЗУЛЬТАТА
    // ========================================================

    if (!result) {

      console.error(
        "GigaChat response does not contain message.content"
      );

      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content",

        response: response

      });

    }


    // ========================================================
    // ОТВЕТ SALEBOT
    // ========================================================

    console.log("Generation successful");


    return res.json({

      ok: true,

      reels_result: result

    });


  } catch (error) {

    console.error("====================================");
    console.error("GIGACHAT ERROR");
    console.error("====================================");

    console.error(error);

    return res.status(500).json({

      ok: false,

      stage: "gigachat",

      error:
        String(error.message || error)

    });

  }

});


// ============================================================
// ЗАПУСК
// ============================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Content Constructor Gateway running on port ${PORT}`
  );

});
