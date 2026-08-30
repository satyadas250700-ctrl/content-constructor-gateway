const express = require("express");
const https = require("https");
const axios = require("axios");

const app = express();


// ============================================================
// НАСТРОЙКИ
// ============================================================

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
// Для работы с сертификатами GigaChat.
// Проверка сертификата отключена, как в нашем
// предыдущем рабочем варианте.
//

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});


// ============================================================
// EXPRESS
// ============================================================

app.use(express.json({
  limit: "1mb"
}));


// ============================================================
// ГЛОБАЛЬНОЕ ЛОГИРОВАНИЕ
// ============================================================
//
// ЭТОТ БЛОК СЕЙЧАС ОСОБЕННО ВАЖЕН.
//
// Он показывает абсолютно любой входящий запрос,
// который дошёл до нашего Node.js приложения.
//

app.use((req, res, next) => {

  console.log("====================================");
  console.log("INCOMING REQUEST");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log(
    "CONTENT-TYPE:",
    req.headers["content-type"]
  );

  if (req.body && Object.keys(req.body).length > 0) {

    console.log(
      "BODY KEYS:",
      Object.keys(req.body)
    );

  } else {

    console.log("BODY: EMPTY");

  }

  console.log("====================================");

  next();
});


// ============================================================
// ПРОВЕРКА ENVIRONMENT VARIABLES
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

console.log("====================================");


// ============================================================
// ПРОВЕРКА КЛЮЧЕЙ
// ============================================================

if (!GIGACHAT_KEY) {
  console.error(
    "ERROR: GIGACHAT_KEY is not configured"
  );
}

if (!BRIDGE_KEY) {
  console.error(
    "ERROR: BRIDGE_KEY is not configured"
  );
}


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
// GIGACHAT OAUTH
// ============================================================

async function getGigaChatToken() {

  console.log(
    "Requesting GigaChat OAuth token..."
  );

  const rqUid =
    require("crypto").randomUUID();

  console.log(
    "RqUID:",
    rqUid
  );

  const response = await axios.post(
    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      httpsAgent: httpsAgent,

      timeout: 30000,

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
}


// ============================================================
// GIGACHAT REQUEST
// ============================================================

async function sendToGigaChat(prompt) {

  const accessToken =
    await getGigaChatToken();

  console.log(
    "Access token obtained"
  );

  console.log(
    "Sending request to GigaChat..."
  );

  const response = await axios.post(

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

      httpsAgent: httpsAgent,

      timeout: 120000,

      headers: {

        "Authorization":
          `Bearer ${accessToken}`,

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
    "GigaChat response received"
  );


  return response.data;
}


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

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    const token =
      await getGigaChatToken();


    if (!token) {

      return res.status(500).json({

        ok: false,

        stage: "auth",

        error:
          "Access token was not received"

      });

    }


    return res.json({

      ok: true,

      stage: "auth",

      message:
        "Авторизация GigaChat прошла успешно"

    });


  } catch (error) {

    console.error(
      "TEST AUTH ERROR:",
      error
    );


    return res.status(500).json({

      ok: false,

      stage: "auth",

      error_type:
        typeof error,

      error_name:
        error.name || null,

      error_message:
        error.message || String(error),

      error_details:
        error.response
          ? error.response.data
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

    if (!GIGACHAT_KEY) {

      return res.status(500).json({

        ok: false,

        stage: "configuration",

        error:
          "GIGACHAT_KEY is not configured"

      });

    }


    const prompt =
      "Ответь одним словом: Да";


    const response =
      await sendToGigaChat(prompt);


    return res.json({

      ok: true,

      stage: "generation",

      status: 200,

      response: response

    });


  } catch (error) {

    console.error(
      "TEST GENERATE ERROR:"
    );

    console.error(error);


    return res.status(500).json({

      ok: false,

      stage: "gigachat",

      error_type:
        typeof error,

      error_name:
        error.name || null,

      error_message:
        error.message || String(error),

      error_details:
        error.response
          ? error.response.data
          : null

    });

  }

});


// ============================================================
// ОСНОВНОЙ GENERATE
// ============================================================

app.post("/generate", async (req, res) => {

  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");


  try {

    // --------------------------------------------------------
    // 1. ПРОВЕРКА НАСТРОЕК
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // 2. ПРОВЕРКА BODY
    // --------------------------------------------------------

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


    const body =
      req.body || {};


    // --------------------------------------------------------
    // 3. ПОЛУЧАЕМ ДАННЫЕ SALEBOT
    // --------------------------------------------------------

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
    // 4. ЛОГИРУЕМ ЗНАЧЕНИЯ
    // --------------------------------------------------------
    //
    // bridge_key специально НЕ выводим.
    //

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


    // --------------------------------------------------------
    // 5. ПРОВЕРКА BRIDGE KEY
    // --------------------------------------------------------

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


    console.log(
      "Bridge key validated successfully"
    );


    // --------------------------------------------------------
    // 6. ФОРМИРУЕМ PROMPT
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
${content_type || ""}

БИЗНЕС:
${business_info || ""}

ЦЕЛЕВАЯ АУДИТОРИЯ:
${target_audience || ""}

ЦЕЛЬ КОНТЕНТА:
${content_goal || ""}

ТЕМА:
${reels_topic || ""}

СТИЛЬ:
${content_style || ""}


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
Создай сильную первую фразу,
которая заставит зрителя остановиться.

СЦЕНАРИЙ:
Напиши подробный текст ролика
с последовательностью действий,
репликами и смыслом каждого блока.

ФИНАЛ:
Создай запоминающийся финал.

CTA:
Добавь естественный призыв
к действию.


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
Сильный заголовок.

Слайд 2:
...

Слайд 3:
...

Продолжай столько слайдов,
сколько необходимо для раскрытия темы.


==============================
ЕСЛИ ВЫБРАН TELEGRAM-ПОСТ
==============================

Создай полноценный Telegram-пост
в указанном стиле.

Не добавляй пояснений вне готового контента.


==============================
ВАЖНО
==============================

Не задавай пользователю дополнительных вопросов.

Не проси его повторно предоставить данные.

Используй именно те данные,
которые находятся выше.

Верни сразу готовый контент.
`;


    console.log(
      "Prompt created successfully"
    );


    // --------------------------------------------------------
    // 7. ОТПРАВЛЯЕМ В GIGACHAT
    // --------------------------------------------------------

    const response =
      await sendToGigaChat(prompt);


    // --------------------------------------------------------
    // 8. ПОЛУЧАЕМ РЕЗУЛЬТАТ
    // --------------------------------------------------------

    const result =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content;


    console.log(
      "Result exists:",
      !!result
    );


    // --------------------------------------------------------
    // 9. ЕСЛИ GIGACHAT НЕ ВЕРНУЛ ТЕКСТ
    // --------------------------------------------------------

    if (!result) {

      console.error(
        "GigaChat response does not contain message.content"
      );


      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content",

        response:
          response || null

      });

    }


    // --------------------------------------------------------
    // 10. ВОЗВРАЩАЕМ РЕЗУЛЬТАТ В SALEBOT
    // --------------------------------------------------------

    console.log(
      "Returning generated content to Salebot"
    );


    return res.json({

      ok: true,

      reels_result: result

    });


  } catch (error) {

    console.error("====================================");

    console.error(
      "GENERATE ERROR"
    );

    console.error(
      "ERROR TYPE:",
      typeof error
    );

    console.error(
      "ERROR NAME:",
      error.name
    );

    console.error(
      "ERROR MESSAGE:",
      error.message
    );


    if (error.response) {

      console.error(
        "HTTP STATUS:",
        error.response.status
      );

      console.error(
        "RESPONSE DATA:",
        error.response.data
      );

    }


    console.error("====================================");


    return res.status(500).json({

      ok: false,

      stage: "gigachat",

      error_type:
        typeof error,

      error_name:
        error.name || null,

      error_message:
        error.message || String(error),

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
// 404
// ============================================================

app.use((req, res) => {

  console.log(
    "404 REQUEST:",
    req.method,
    req.url
  );


  res.status(404).json({

    ok: false,

    error:
      "Endpoint not found",

    method:
      req.method,

    url:
      req.url

  });

});


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {

  console.error(
    "GLOBAL EXPRESS ERROR:",
    error
  );


  res.status(500).json({

    ok: false,

    stage: "express",

    error:
      error.message ||
      String(error)

  });

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
