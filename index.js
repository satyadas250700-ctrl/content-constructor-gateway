    const express = require("express");
const { Agent } = require("node:https");
const GigaChat = require("gigachat");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;


// ============================================================
// HTTPS AGENT
// ============================================================
//
// GigaChat использует сертификат НУЦ Минцифры.
// Временно отключаем проверку сертификата.
//
// Это соответствует официальному примеру JS SDK GigaChat.
// ============================================================

const httpsAgent = new Agent({
  rejectUnauthorized: false
});


// ============================================================
// ПРОВЕРКА НАСТРОЕК
// ============================================================

if (!GIGACHAT_KEY) {
  console.error("ERROR: GIGACHAT_KEY is not configured");
}

if (!BRIDGE_KEY) {
  console.error("ERROR: BRIDGE_KEY is not configured");
}


// ============================================================
// ПРОВЕРКА РАБОТЫ ШЛЮЗА
// ============================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "Content Constructor Gateway",
    status: "working"
  });

});


// ============================================================
// ОСНОВНОЙ ENDPOINT ДЛЯ SALEBOT
// ============================================================

app.post("/generate", async (req, res) => {

  try {

    // --------------------------------------------------------
    // 1. Проверяем секреты
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
    // 2. Получаем данные от Salebot
    // --------------------------------------------------------

    const body = req.body || {};

const bridge_key = body.bridge_key;
const content_type = body.content_type;
const business_info = body.business_info;
const target_audience = body.target_audience;
const content_goal = body.content_goal;
const reels_topic = body.reels_topic;
const content_style = body.content_style;


    // --------------------------------------------------------
    // 3. Проверяем bridge_key
    // --------------------------------------------------------

    if (bridge_key !== BRIDGE_KEY) {

      return res.status(401).json({
        ok: false,
        stage: "security",
        error: "Invalid bridge_key"
      });

    }


    // --------------------------------------------------------
    // 4. Создаём клиента GigaChat
    // --------------------------------------------------------

    const giga = new GigaChat({

      timeout: 600,

      model: "GigaChat-3-Ultra",

      credentials: GIGACHAT_KEY,

      scope: "GIGACHAT_API_PERS",

      baseUrl: "https://api.giga.chat/api/v1",

      httpsAgent: httpsAgent

    });


    // --------------------------------------------------------
    // 5. Формируем промпт
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


    // --------------------------------------------------------
    // 6. Отправляем запрос в GigaChat
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // 7. Получаем готовый текст
    // --------------------------------------------------------

    const result =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content;


    // --------------------------------------------------------
    // 8. Проверяем результат
    // --------------------------------------------------------

    if (!result) {

      return res.status(502).json({

        ok: false,

        stage: "generation",

        error:
          "GigaChat response does not contain message.content",

        response: response

      });

    }


    // --------------------------------------------------------
    // 9. Возвращаем результат в Salebot
    // --------------------------------------------------------

    return res.json({

      ok: true,

      reels_result: result

    });


  } catch (error) {

    console.error("GigaChat error:", error);

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
