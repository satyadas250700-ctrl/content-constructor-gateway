process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const GigaChat = require("gigachat").default;

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;


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
// Проверяем только авторизацию GigaChat
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

      timeout: 120

    });


    console.log("GigaChat client created");


    console.log("Requesting GigaChat token...");


    await client.updateToken();


    console.log("GigaChat token received");


    return res.json({

      ok: true,

      stage: "auth",

      message: "Авторизация GigaChat прошла успешно"

    });


  } catch (error) {

    console.log("====================================");
    console.log("AUTH ERROR");
    console.log("====================================");

    console.dir(error, { depth: null });


    let details = {};

    try {

      details = JSON.parse(
        JSON.stringify(
          error,
          Object.getOwnPropertyNames(error)
        )
      );

    } catch (jsonError) {

      details = {
        string: String(error)
      };

    }


    return res.status(500).json({

      ok: false,

      stage: "auth",

      error_type: typeof error,

      error_name:
        error && error.name
          ? error.name
          : null,

      error_message:
        error && error.message
          ? error.message
          : null,

      error_details: details

    });

  }

});


// ============================================================
// TEST GENERATE
//
// Это отдельный тест.
// Он НЕ зависит от Salebot.
//
// Проверяем:
// Render → GigaChat → chat/completions
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

        error: "GIGACHAT_KEY is not configured"

      });

    }


    console.log("Creating GigaChat client...");


    const client = new GigaChat({

      credentials: GIGACHAT_KEY,

      scope: "GIGACHAT_API_PERS",

      model: "GigaChat-3-Ultra",

      timeout: 120

    });


    console.log("GigaChat client created");


    console.log("Sending test message to GigaChat...");


    const response = await client.chat({

      messages: [

        {

          role: "user",

          content: "Ответь одним словом: работает"

        }

      ],

      temperature: 0.2

    });


    console.log("====================================");
    console.log("RAW GIGACHAT RESPONSE");
    console.log("====================================");

    console.dir(response, { depth: null });


    return res.json({

      ok: true,

      stage: "generation",

      response: response

    });


  } catch (error) {

    console.log("====================================");
    console.log("TEST GENERATE ERROR");
    console.log("====================================");

    console.dir(error, { depth: null });


    let details = {};

    try {

      details = JSON.parse(
        JSON.stringify(
          error,
          Object.getOwnPropertyNames(error)
        )
      );

    } catch (jsonError) {

      details = {

        string:
          String(error)

      };

    }


    return res.status(500).json({

      ok: false,

      stage: "gigachat",

      error_type:
        typeof error,

      error_name:
        error && error.name
          ? error.name
          : null,

      error_message:
        error && error.message
          ? error.message
          : null,

      error_details:
        details

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
    // 1. ПРОВЕРЯЕМ GIGACHAT KEY
    // ========================================================

    if (!GIGACHAT_KEY) {

      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    // ========================================================
    // 2. ПРОВЕРЯЕМ BRIDGE KEY
    // ========================================================

    if (!BRIDGE_KEY) {

      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "BRIDGE_KEY is not configured"

      });

    }


    // ========================================================
    // 3. ПОЛУЧАЕМ ДАННЫЕ SALEBOT
    // ========================================================

    const body = req.body || {};


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
    // 4. ПРОВЕРЯЕМ BRIDGE KEY
    // ========================================================

    if (bridge_key !== BRIDGE_KEY) {

      console.log("INVALID BRIDGE KEY");


      return res.status(401).json({

        ok: false,

        stage: "security",

        error:
          "Invalid bridge_key"

      });

    }


    console.log("Bridge key: OK");


    // ========================================================
    // 5. СОЗДАЁМ GIGACHAT CLIENT
    // ========================================================

    console.log(
      "Creating GigaChat client..."
    );


    const client = new GigaChat({

      credentials:
        GIGACHAT_KEY,

      scope:
        "GIGACHAT_API_PERS",

      model:
        "GigaChat-3-Ultra",

      timeout:
        120

    });


    console.log(
      "GigaChat client created"
    );


    // ========================================================
    // 6. ФОРМИРУЕМ PROMPT
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
    // 7. ОТПРАВЛЯЕМ ЗАПРОС GIGACHAT
    // ========================================================

    console.log(
      "Sending request to GigaChat..."
    );


    const response = await client.chat({

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
        0.7

    });


    console.log(
      "GigaChat response received"
    );


    console.log(
      "RAW RESPONSE:"
    );

    console.dir(
      response,
      { depth: null }
    );


    // ========================================================
    // 8. ПОЛУЧАЕМ ГОТОВЫЙ ТЕКСТ
    // ========================================================

    const result =

      response &&

      response.choices &&

      response.choices[0] &&

      response.choices[0].message &&

      response.choices[0].message.content;


    // ========================================================
    // 9. ПРОВЕРЯЕМ РЕЗУЛЬТАТ
    // ========================================================

    if (!result) {

      return res.status(502).json({

        ok: false,

        stage:
          "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          response

      });

    }


    // ========================================================
    // 10. ВОЗВРАЩАЕМ РЕЗУЛЬТАТ SALEBOT
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

    console.log("====================================");
    console.log("GIGACHAT ERROR");
    console.log("====================================");

    console.dir(
      error,
      { depth: null }
    );


    let details = {};


    try {

      details = JSON.parse(

        JSON.stringify(

          error,

          Object.getOwnPropertyNames(error)

        )

      );

    } catch (jsonError) {

      details = {

        string:
          String(error)

      };

    }


    return res.status(500).json({

      ok: false,

      stage:
        "gigachat",

      error_type:
        typeof error,

      error_name:
        error && error.name
          ? error.name
          : null,

      error_message:
        error && error.message
          ? error.message
          : null,

      error_details:
        details

    });

  }

});


// ============================================================
// ЗАПУСК СЕРВЕРА
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
