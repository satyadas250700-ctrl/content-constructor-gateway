const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

// ============================================================
// CONFIG
// ============================================================

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
// TOKEN CACHE
// ============================================================

let accessToken = null;
let tokenExpiresAt = 0;


// ============================================================
// GENERATION LOCK
// ============================================================
//
// Не допускаем одновременные тяжёлые запросы к GigaChat.
// Это особенно важно для контент-плана.
//

let generationInProgress = false;


// ============================================================
// GET GIGACHAT TOKEN
// ============================================================

async function getAccessToken() {

  if (
    accessToken &&
    Date.now() < tokenExpiresAt
  ) {
    return accessToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error(
      "GIGACHAT_KEY is not configured"
    );
  }

  const rqUid = crypto.randomUUID();

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({
      scope: GIGACHAT_SCOPE
    }).toString(),
    {
      httpsAgent,
      timeout: 8000,

      headers: {
        Authorization:
          `Basic ${GIGACHAT_KEY}`,

        RqUID: rqUid,

        "Content-Type":
          "application/x-www-form-urlencoded"
      }
    }
  );

  accessToken =
    response.data.access_token;

  const expiresIn =
    Number(response.data.expires_in) || 1800;

  tokenExpiresAt =
    Date.now() +
    (expiresIn - 60) * 1000;

  return accessToken;
}


// ============================================================
// CONTENT TYPE HELPERS
// ============================================================

function isContentPlan(contentType) {

  const type =
    String(contentType || "")
      .toLowerCase();

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}


// ============================================================
// NORMAL CONTENT INSTRUCTIONS
// ============================================================

function getContentInstructions(
  contentType
) {

  const type =
    String(contentType || "")
      .toLowerCase();


  // ----------------------------------------------------------
  // TELEGRAM
  // ----------------------------------------------------------

  if (
    type.includes("telegram") ||
    type.includes("тг") ||
    type.includes("телеграм")
  ) {

    return `
СОЗДАЙ ГОТОВЫЙ ПОСТ ДЛЯ TELEGRAM.

Текст должен:
- быть естественным;
- цеплять с первых строк;
- соответствовать целевой аудитории;
- демонстрировать экспертность;
- учитывать выбранную цель;
- соответствовать выбранному стилю.

Структура:

1. Сильное начало.
2. Основная мысль.
3. Полезное содержание.
4. Сильный финал.
5. CTA.

Выдай только готовый пост.
`;
  }


  // ----------------------------------------------------------
  // REELS
  // ----------------------------------------------------------

  if (
    type.includes("reels")
  ) {

    return `
СОЗДАЙ ГОТОВЫЙ СЦЕНАРИЙ REELS.

Структура:

ХУК:
первая цепляющая фраза.

СЦЕНАРИЙ:
короткий динамичный текст.

ФИНАЛ:
сильное завершение.

CTA:
призыв к действию.

Текст должен быть естественным,
интересным и соответствовать бизнесу,
аудитории, цели и стилю.

Выдай только готовый материал.
`;
  }


  // ----------------------------------------------------------
  // POST
  // ----------------------------------------------------------

  if (
    type.includes("пост") &&
    !type.includes("telegram") &&
    !type.includes("телеграм")
  ) {

    return `
СОЗДАЙ ГОТОВЫЙ ПОСТ ДЛЯ СОЦИАЛЬНЫХ СЕТЕЙ.

Требования:

- сильное начало;
- интересная основная часть;
- конкретная польза;
- естественный язык;
- соответствие бизнесу;
- соответствие аудитории;
- соответствие цели;
- выбранный стиль;
- хороший CTA.

Выдай только готовый пост.
`;
  }


  // ----------------------------------------------------------
  // CAROUSEL
  // ----------------------------------------------------------

  if (
    type.includes("карусель") ||
    type.includes("carousel")
  ) {

    return `
СОЗДАЙ ГОТОВУЮ КАРУСЕЛЬ.

Сделай 7–9 слайдов.

Для каждого слайда:

Слайд N:
Заголовок: ...
Текст: ...

Первый слайд должен цеплять.
Последний должен содержать CTA.

Выдай только готовую карусель.
`;
  }


  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  return `
Создай качественный готовый контент
для предпринимателя или эксперта.

Учитывай:

- бизнес;
- целевую аудиторию;
- цель;
- тему;
- стиль.

Ответ только на русском языке.
`;
}


// ============================================================
// BUILD NORMAL PROMPT
// ============================================================

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle
}) {

  const instructions =
    getContentInstructions(contentType);

  return `
Ты — профессиональный российский
контент-маркетолог, контент-стратег
и сценарист.

Ты работаешь внутри сервиса
«МОЙ КОНТЕНТ-КОНСТРУКТОР».

ДАННЫЕ КЛИЕНТА:

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель контента:
${contentGoal}

Тема:
${reelsTopic ||
  "Определи подходящую тему самостоятельно."}

Стиль:
${contentStyle}

ИНСТРУКЦИЯ:

${instructions}

ОБЩИЕ ТРЕБОВАНИЯ:

- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без фраз вроде «в современном мире».
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Учитывай бизнес.
- Учитывай аудиторию.
- Учитывай цель.
- Учитывай стиль.
- Контент должен быть практически применим.

Выдай только готовый контент.
`;
}


// ============================================================
// BUILD 15-DAY CONTENT PLAN PROMPT
// ============================================================

function buildPlanPartPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {

  const hasPrevious =
    Boolean(
      previousPlan &&
      String(previousPlan).trim()
    );


  // ==========================================================
  // FIRST HALF
  // ==========================================================

  if (!hasPrevious) {

    return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Твоя задача — создать ПЕРВУЮ ЧАСТЬ
контент-плана на 30 дней.

Создай ДНИ ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Главная цель:
${contentGoal}

Стиль:
${contentStyle}


ЛОГИКА ПЕРВЫХ 15 ДНЕЙ:

Построй контент как путь человека
от первого знакомства с экспертом
до формирования интереса и доверия.

Используй разные задачи контента:

- привлечение внимания;
- выявление проблем аудитории;
- демонстрация экспертности;
- разрушение мифов;
- полезный контент;
- личность эксперта;
- истории;
- кейсы;
- социальное доказательство;
- работа с возражениями;
- формирование желания получить результат.


ФОРМАТЫ:

Чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост


ВАЖНО:

1. ОБЯЗАТЕЛЬНО создай все 15 дней.
2. Не останавливайся раньше Дня 15.
3. Каждый день должен быть отдельной идеей.
4. Темы должны быть связаны именно с бизнесом клиента.
5. Не используй одинаковые темы.
6. Не повторяй одну и ту же механику подряд.
7. Делай контент разнообразным.
8. Не используй слишком общие идеи.
9. Не пиши полноценные тексты.
10. Не пиши длинные сценарии.
11. Не объясняй свои решения.
12. Не добавляй вступление.
13. Не добавляй заключение.
14. Только русский язык.


ОЧЕНЬ ВАЖНО ПО ОБЪЁМУ:

Каждый день должен быть КОРОТКИМ.

На один день:

- одна строка с форматом;
- одна строка «Тема»;
- одна короткая строка «Идея»;
- одна короткая строка «Задача»;
- одна короткая строка «CTA».

Не используй длинные объяснения.

Это необходимо, чтобы все 15 дней
полностью поместились в один ответ.


СТРОГО СОБЛЮДАЙ ФОРМАТ:

День 1 — Reels
Тема: ...
Идея: ...
Задача: ...
CTA: ...

День 2 — Пост
Тема: ...
Идея: ...
Задача: ...
CTA: ...

Продолжай последовательно
до Дня 15.


НЕ ПРОПУСКАЙ ДНИ.

ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
`;
  }


  // ==========================================================
  // SECOND HALF
  // ==========================================================

  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Ты создаёшь ВТОРУЮ ЧАСТЬ
контент-плана на 30 дней.

Создай ДНИ ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Главная цель:
${contentGoal}

Стиль:
${contentStyle}


ПЕРВАЯ ЧАСТЬ ПЛАНА:

${previousPlan}


ТВОЯ ЗАДАЧА:

Продолжи этот контент-план
с Дня 16 до Дня 30.

Первая часть уже существует.

Поэтому Дни 16–30 должны:

- логично продолжать Дни 1–15;
- не повторять темы первой части;
- не повторять одинаковые механики;
- не повторять одинаковые форматы подряд;
- постепенно переводить аудиторию
  от интереса к доверию;
- работать с возражениями;
- показывать ценность продукта или услуги;
- формировать желание получить результат;
- мягко подводить к покупке.


КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:

1. Повторять тему из Дней 1–15.
2. Повторять почти одинаковую идею.
3. Повторять одинаковую подачу.
4. Просто переформулировать старую тему.
5. Использовать «один день из жизни», если такая идея уже была.
6. Повторять чек-лист, если он уже использовался.
7. Повторять кейс в той же форме.
8. Повторять миф в той же форме.
9. Повторять одинаковый CTA несколько дней подряд.


ФОРМАТЫ:

Чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

Используй разные типы контента:

- кейсы;
- разборы;
- ошибки;
- возражения;
- сравнения;
- практические советы;
- истории;
- доказательства;
- процессы;
- результаты;
- FAQ;
- работа с сомнениями;
- демонстрация продукта;
- причины купить;
- мягкие продающие публикации.


ОЧЕНЬ ВАЖНО ПО ОБЪЁМУ:

Каждый день должен быть КОРОТКИМ.

На один день:

- одна строка с форматом;
- одна строка «Тема»;
- одна короткая строка «Идея»;
- одна короткая строка «Задача»;
- одна короткая строка «CTA».

Не используй длинные объяснения.

Это необходимо, чтобы все 15 дней
полностью поместились в один ответ.


СТРОГО СОБЛЮДАЙ ФОРМАТ:

День 16 — Reels
Тема: ...
Идея: ...
Задача: ...
CTA: ...

День 17 — Пост
Тема: ...
Идея: ...
Задача: ...
CTA: ...

Продолжай последовательно
до Дня 30.


НЕ ПРОПУСКАЙ ДНИ.

ВЕРНИ ТОЛЬКО ДНИ 16–30.
`;
}


// ============================================================
// GIGACHAT REQUEST
// ============================================================

async function generateWithGigaChat({
  token,
  prompt,
  temperature,
  maxTokens,
  label
}) {

  const startedAt =
    Date.now();

  console.log(
    `[${label}] Sending request to GigaChat...`
  );

  try {

    const response =
      await axios.post(
        CHAT_URL,

        {
          model:
            GIGACHAT_MODEL,

          messages: [
            {
              role: "system",

              content:
                "Ты профессиональный контент-маркетолог и контент-стратег. Создавай только качественный готовый контент на русском языке."
            },

            {
              role: "user",
              content: prompt
            }
          ],

          temperature,

          max_tokens:
            maxTokens
        },

        {
          httpsAgent,

          // Важно:
          // не увеличиваем timeout,
          // поскольку Salebot также имеет
          // ограниченное время ожидания.

          timeout: 12000,

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json"
          }
        }
      );


    const result =
      response.data
        ?.choices?.[0]
        ?.message
        ?.content || "";


    const elapsed =
      Date.now() - startedAt;


    console.log(
      `[${label}] HTTP status: ${response.status}`
    );

    console.log(
      `[${label}] Result length: ${result.length}`
    );

    console.log(
      `[${label}] Time: ${elapsed} ms`
    );


    if (!result) {

      throw new Error(
        `${label}: GigaChat returned empty result`
      );
    }


    return {
      result,
      elapsed,
      status:
        response.status
    };

  } catch (error) {

    const elapsed =
      Date.now() - startedAt;

    console.error(
      `[${label}] ERROR`
    );

    console.error(
      `[${label}] Message:`,
      error.message
    );

    console.error(
      `[${label}] Status:`,
      error.response?.status
    );

    console.error(
      `[${label}] Response:`,
      error.response?.data
    );

    console.error(
      `[${label}] Time:`,
      elapsed,
      "ms"
    );

    throw error;
  }
}


// ============================================================
// VALIDATE PLAN DAYS
// ============================================================

function validatePlanDays(
  text,
  startDay,
  endDay
) {

  const content =
    String(text || "");

  for (
    let day = startDay;
    day <= endDay;
    day++
  ) {

    const pattern =
      new RegExp(
        `День\\s+${day}\\s*[—-]`,
        "i"
      );

    if (!pattern.test(content)) {

      throw new Error(
        `Контент-план неполный: отсутствует День ${day}`
      );
    }
  }

  return true;
}


// ============================================================
// EXTRACT PLAN DAY HEADERS
// ============================================================

function extractPlanDayHeaders(
  text
) {

  const matches =
    String(text || "")
      .match(
        /День\s+\d+\s*[—-]\s*[^\n]+/gi
      );

  if (!matches) {
    return [];
  }

  return matches;
}


// ============================================================
// GENERATE FIRST 15 DAYS
// ============================================================

async function generateFirst15Days({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle
}) {

  const prompt =
    buildPlanPartPrompt({
      startDay: 1,
      endDay: 15,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle
    });


  const result =
    await generateWithGigaChat({
      token,
      prompt,

      temperature: 0.35,

      // Компактный формат позволяет
      // уложить все 15 дней.

      maxTokens: 1100,

      label:
        "FIRST 15 DAYS"
    });


  validatePlanDays(
    result.result,
    1,
    15
  );


  return result;
}


// ============================================================
// GENERATE NEXT 15 DAYS
// ============================================================

async function generateNext15Days({
  token,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {

  const prompt =
    buildPlanPartPrompt({
      startDay: 16,
      endDay: 30,

      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle,

      previousPlan
    });


  const result =
    await generateWithGigaChat({
      token,
      prompt,

      temperature: 0.35,

      maxTokens: 1100,

      label:
        "NEXT 15 DAYS"
    });


  validatePlanDays(
    result.result,
    16,
    30
  );


  return result;
}


// ============================================================
// TEST AUTH
// ============================================================

app.get(
  "/test-auth",
  async (req, res) => {

    try {

      const token =
        await getAccessToken();


      res.json({
        ok: true,

        stage:
          "auth",

        token_received:
          !!token
      });

    } catch (error) {

      console.error(
        "AUTH ERROR:",
        error.message
      );


      res.status(500).json({

        ok: false,

        stage:
          "auth",

        error:
          error.message
      });
    }
  }
);


// ============================================================
// TEST BASIC GENERATION
// ============================================================

app.get(
  "/test-generate",
  async (req, res) => {

    const startedAt =
      Date.now();

    try {

      const token =
        await getAccessToken();


      const response =
        await axios.post(

          CHAT_URL,

          {
            model:
              GIGACHAT_MODEL,

            messages: [
              {
                role: "user",

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
            httpsAgent,

            timeout:
              12000,

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json"
            }
          }
        );


      const result =
        response.data
          ?.choices?.[0]
          ?.message
          ?.content || "";


      res.json({

        ok: true,

        stage:
          "generation",

        status:
          response.status,

        time_ms:
          Date.now() - startedAt,

        response:
          response.data,

        reels_result:
          result
      });


    } catch (error) {

      console.error(
        "TEST GENERATE ERROR"
      );

      console.error(
        "Message:",
        error.message
      );

      console.error(
        "Status:",
        error.response?.status
      );

      console.error(
        "Response:",
        error.response?.data
      );


      res.status(500).json({

        ok: false,

        stage:
          "generation",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });
    }
  }
);


// ============================================================
// TEST FIRST 15 DAYS
// ============================================================

app.get(
  "/test-plan",
  async (req, res) => {

    const startedAt =
      Date.now();


    if (generationInProgress) {

      return res.status(429).json({

        ok: false,

        error:
          "Another generation is already in progress. Please wait."
      });
    }


    generationInProgress =
      true;


    try {

      const token =
        await getAccessToken();


      const result =
        await generateFirst15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно"
        });


      const days =
        extractPlanDayHeaders(
          result.result
        );


      res.json({

        ok: true,

        test:
          "first-15-day-plan",

        status:
          result.status,

        time_ms:
          Date.now() - startedAt,

        result_length:
          result.result.length,

        days_count:
          days.length,

        model:
          GIGACHAT_MODEL,

        reels_result:
          result.result
      });


    } catch (error) {

      console.error(
        "TEST PLAN ERROR:",
        error.message
      );


      res.status(500).json({

        ok: false,

        test:
          "first-15-day-plan",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });


    } finally {

      generationInProgress =
        false;
    }
  }
);


// ============================================================
// TEST NEXT 15 DAYS
// ============================================================
//
// Здесь намеренно:
//
// 1. Генерируем 1–15.
// 2. Передаём их во второй prompt.
// 3. Генерируем 16–30.
//
// Никакого Promise.all.
//

app.get(
  "/test-next-plan",
  async (req, res) => {

    const startedAt =
      Date.now();


    if (generationInProgress) {

      return res.status(429).json({

        ok: false,

        error:
          "Another generation is already in progress. Please wait."
      });
    }


    generationInProgress =
      true;


    try {

      const token =
        await getAccessToken();


      console.log(
        "[TEST NEXT PLAN] Generating first 15 days..."
      );


      const firstPart =
        await generateFirst15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно"
        });


      console.log(
        "[TEST NEXT PLAN] First 15 days generated."
      );


      console.log(
        "[TEST NEXT PLAN] Generating days 16–30 using first part as context..."
      );


      const secondPart =
        await generateNext15Days({

          token,

          businessInfo:
            "эксперт или предприниматель, который продаёт свои услуги или продукты",

          targetAudience:
            "потенциальные клиенты этого бизнеса",

          contentGoal:
            "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",

          contentStyle:
            "легко, уверенно, современно",

          previousPlan:
            firstPart.result
        });


      const firstDays =
        extractPlanDayHeaders(
          firstPart.result
        );

      const secondDays =
        extractPlanDayHeaders(
          secondPart.result
        );


      const combined =
        `${firstPart.result.trim()}\n\n${secondPart.result.trim()}`;


      res.json({

        ok: true,

        test:
          "next-15-day-plan",

        status:
          secondPart.status,

        time_ms:
          Date.now() - startedAt,

        first_part_length:
          firstPart.result.length,

        second_part_length:
          secondPart.result.length,

        first_days_count:
          firstDays.length,

        second_days_count:
          secondDays.length,

        total_length:
          combined.length,

        model:
          GIGACHAT_MODEL,

        reels_result:
          secondPart.result
      });


    } catch (error) {

      console.error(
        "TEST NEXT PLAN ERROR:",
        error.message
      );


      res.status(500).json({

        ok: false,

        test:
          "next-15-day-plan",

        message:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data,

        time_ms:
          Date.now() - startedAt
      });


    } finally {

      generationInProgress =
        false;
    }
  }
);


// ============================================================
// MAIN GENERATE
// ============================================================

app.post(
  "/generate",
  async (req, res) => {

    const startedAt =
      Date.now();


    console.log("");
    console.log(
      "===================================="
    );

    console.log(
      "GENERATE REQUEST RECEIVED"
    );

    console.log(
      "===================================="
    );


    try {

      const {
        bridge_key,
        content_type,
        business_info,
        target_audience,
        content_goal,
        reels_topic,
        content_style
      } = req.body || {};


      console.log(
        "Content-Type:",
        content_type
      );

      console.log(
        "Body keys:",
        Object.keys(
          req.body || {}
        )
      );


      // --------------------------------------------------------
      // BRIDGE KEY
      // --------------------------------------------------------

      if (!bridge_key) {

        return res.status(401).json({

          ok: false,

          error:
            "bridge_key is required"
        });
      }


      if (!BRIDGE_KEY) {

        return res.status(500).json({

          ok: false,

          error:
            "BRIDGE_KEY is not configured"
        });
      }


      if (
        bridge_key !==
        BRIDGE_KEY
      ) {

        return res.status(401).json({

          ok: false,

          error:
            "Invalid bridge_key"
        });
      }


      // --------------------------------------------------------
      // CONTENT PLAN?
      // --------------------------------------------------------

      const planRequest =
        isContentPlan(
          content_type
        );


      console.log(
        "Content plan:",
        planRequest
      );


      // --------------------------------------------------------
      // REQUIRED FIELDS
      // --------------------------------------------------------

      if (!content_type) {

        return res.status(400).json({

          ok: false,

          error:
            "content_type is required"
        });
      }


      if (!business_info) {

        return res.status(400).json({

          ok: false,

          error:
            "business_info is required"
        });
      }


      if (!target_audience) {

        return res.status(400).json({

          ok: false,

          error:
            "target_audience is required"
        });
      }


      if (!content_goal) {

        return res.status(400).json({

          ok: false,

          error:
            "content_goal is required"
        });
      }


      if (!content_style) {

        return res.status(400).json({

          ok: false,

          error:
            "content_style is required"
        });
      }


      if (
        !planRequest &&
        !reels_topic
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "reels_topic is required"
        });
      }


      // --------------------------------------------------------
      // LOG DATA
      // --------------------------------------------------------

      console.log(
        "Business info:",
        business_info
      );

      console.log(
        "Target audience:",
        target_audience
      );

      console.log(
        "Content goal:",
        content_goal
      );

      console.log(
        "Content style:",
        content_style
      );


      if (!planRequest) {

        console.log(
          "Reels topic:",
          reels_topic
        );
      }


      // --------------------------------------------------------
      // TOKEN
      // --------------------------------------------------------

      console.log(
        "Getting GigaChat token..."
      );


      const token =
        await getAccessToken();


      console.log(
        "OAuth token received"
      );


      // ========================================================
      // CONTENT PLAN
      // ========================================================

      if (planRequest) {

        if (generationInProgress) {

          return res.status(429).json({

            ok: false,

            error:
              "Another content generation is already in progress. Please wait."
          });
        }


        generationInProgress =
          true;


        try {

          console.log(
            "Generating FIRST 15 DAYS..."
          );


          const result =
            await generateFirst15Days({

              token,

              businessInfo:
                business_info,

              targetAudience:
                target_audience,

              contentGoal:
                content_goal,

              contentStyle:
                content_style
            });


          const totalTime =
            Date.now() - startedAt;


          console.log(
            "First 15 days generated."
          );

          console.log(
            "Final total request time:",
            totalTime,
            "ms"
          );


          return res.json({

            ok: true,

            reels_result:
              result.result
          });


        } finally {

          generationInProgress =
            false;
        }
      }


      // ========================================================
      // STANDARD CONTENT
      // ========================================================

      const prompt =
        buildPrompt({

          contentType:
            content_type,

          businessInfo:
            business_info,

          targetAudience:
            target_audience,

          contentGoal:
            content_goal,

          reelsTopic:
            reels_topic,

          contentStyle:
            content_style
        });


      console.log(
        "Using standard content generation"
      );


      const generated =
        await generateWithGigaChat({

          token,

          prompt,

          temperature:
            0.75,

          maxTokens:
            1800,

          label:
            "STANDARD CONTENT"
        });


      const totalTime =
        Date.now() - startedAt;


      console.log(
        "Total request time:",
        totalTime,
        "ms"
      );


      console.log(
        "GENERATION SUCCESS"
      );


      console.log(
        "===================================="
      );


      return res.json({

        ok: true,

        reels_result:
          generated.result
      });


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
        "Message:",
        error.message
      );

      console.error(
        "Status:",
        error.response?.status
      );

      console.error(
        "Response:",
        error.response?.data
      );

      console.error(
        "Total request time:",
        Date.now() - startedAt,
        "ms"
      );

      console.error(
        "===================================="
      );


      return res.status(500).json({

        ok: false,

        error:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data
      });
    }
  }
);


// ============================================================
// GENERATE NEXT 15 DAYS
// ============================================================
//
// Получает первую половину из Salebot:
//
// previous_plan = #{reels_result}
//
// И создаёт только Дни 16–30.
//

app.post(
  "/generate-next-15",
  async (req, res) => {

    const startedAt =
      Date.now();


    console.log("");
    console.log(
      "===================================="
    );

    console.log(
      "GENERATE NEXT 15 REQUEST RECEIVED"
    );

    console.log(
      "===================================="
    );


    try {

      const {
        bridge_key,
        business_info,
        target_audience,
        content_goal,
        content_style,
        previous_plan
      } = req.body || {};


      console.log(
        "Body keys:",
        Object.keys(
          req.body || {}
        )
      );


      // --------------------------------------------------------
      // BRIDGE KEY
      // --------------------------------------------------------

      if (!bridge_key) {

        return res.status(401).json({

          ok: false,

          error:
            "bridge_key is required"
        });
      }


      if (!BRIDGE_KEY) {

        return res.status(500).json({

          ok: false,

          error:
            "BRIDGE_KEY is not configured"
        });
      }


      if (
        bridge_key !==
        BRIDGE_KEY
      ) {

        return res.status(401).json({

          ok: false,

          error:
            "Invalid bridge_key"
        });
      }


      // --------------------------------------------------------
      // REQUIRED FIELDS
      // --------------------------------------------------------

      if (!business_info) {

        return res.status(400).json({

          ok: false,

          error:
            "business_info is required"
        });
      }


      if (!target_audience) {

        return res.status(400).json({

          ok: false,

          error:
            "target_audience is required"
        });
      }


      if (!content_goal) {

        return res.status(400).json({

          ok: false,

          error:
            "content_goal is required"
        });
      }


      if (!content_style) {

        return res.status(400).json({

          ok: false,

          error:
            "content_style is required"
        });
      }


      if (!previous_plan) {

        return res.status(400).json({

          ok: false,

          error:
            "previous_plan is required"
        });
      }


      // --------------------------------------------------------
      // PREVIOUS PLAN SIZE PROTECTION
      // --------------------------------------------------------

      const previousPlanText =
        String(
          previous_plan
        ).trim();


      if (
        previousPlanText.length <
        500
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "previous_plan is too short"
        });
      }


      console.log(
        "Previous plan length:",
        previousPlanText.length
      );


      // --------------------------------------------------------
      // LOCK
      // --------------------------------------------------------

      if (generationInProgress) {

        return res.status(429).json({

          ok: false,

          error:
            "Another content generation is already in progress. Please wait."
        });
      }


      generationInProgress =
        true;


      try {

        const token =
          await getAccessToken();


        console.log(
          "Generating DAYS 16–30..."
        );


        const result =
          await generateNext15Days({

            token,

            businessInfo:
              business_info,

            targetAudience:
              target_audience,

            contentGoal:
              content_goal,

            contentStyle:
              content_style,

            previousPlan:
              previousPlanText
          });


        const totalTime =
          Date.now() - startedAt;


        console.log(
          "Days 16–30 generated successfully."
        );


        console.log(
          "Total request time:",
          totalTime,
          "ms"
        );


        return res.json({

          ok: true,

          reels_result:
            result.result
        });


      } finally {

        generationInProgress =
          false;
      }


    } catch (error) {

      console.error("");

      console.error(
        "===================================="
      );

      console.error(
        "GENERATE NEXT 15 ERROR"
      );

      console.error(
        "===================================="
      );

      console.error(
        "Message:",
        error.message
      );

      console.error(
        "Status:",
        error.response?.status
      );

      console.error(
        "Response:",
        error.response?.data
      );

      console.error(
        "Total request time:",
        Date.now() - startedAt,
        "ms"
      );

      console.error(
        "===================================="
      );


      return res.status(500).json({

        ok: false,

        error:
          error.message,

        status:
          error.response?.status,

        response:
          error.response?.data
      });
    }
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      service:
        "content-constructor-gateway",

      model:
        GIGACHAT_MODEL,

      bridge_key_configured:
        !!BRIDGE_KEY,

      gigachat_key_configured:
        !!GIGACHAT_KEY,

      generation_in_progress:
        generationInProgress,

      timestamp:
        new Date().toISOString()
    });
  }
);


// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      ok: true,

      service:
        "МОЙ КОНТЕНТ-КОНСТРУКТОР",

      message:
        "Content Constructor Gateway is running",

      model:
        GIGACHAT_MODEL,

      endpoints: {

        health:
          "/health",

        testAuth:
          "/test-auth",

        testGenerate:
          "/test-generate",

        testPlan:
          "/test-plan",

        testNextPlan:
          "/test-next-plan",

        generate:
          "POST /generate",

        generateNext15:
          "POST /generate-next-15"
      }
    });
  }
);


// ============================================================
// 404
// ============================================================

app.use(
  (req, res) => {

    res.status(404).json({

      ok: false,

      error:
        "Endpoint not found"
    });
  }
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "GLOBAL ERROR:",
      error
    );


    if (res.headersSent) {
      return next(error);
    }


    res.status(500).json({

      ok: false,

      error:
        error.message ||
        "Internal server error"
    });
  }
);


// ============================================================
// SERVER START
// ============================================================

app.listen(
  PORT,
  () => {

    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      `Content Constructor Gateway started on port ${PORT}`
    );

    console.log(
      "===================================="
    );

    console.log(
      "GigaChat model:",
      GIGACHAT_MODEL
    );

    console.log(
      "Bridge key configured:",
      !!BRIDGE_KEY
    );

    console.log(
      "GigaChat key configured:",
      !!GIGACHAT_KEY
    );

    console.log(
      "30-day plan architecture:"
    );

    console.log(
      "1) Days 1–15"
    );

    console.log(
      "2) User clicks next button"
    );

    console.log(
      "3) Days 16–30 using Days 1–15 as context"
    );

    console.log(
      "Parallel generation: DISABLED"
    );

    console.log(
      "===================================="
    );
  }
);
