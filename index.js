const express = require('express');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

const app = express();

/* =========================================================
   BASIC SERVER SETTINGS
========================================================= */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.PORT || 10000);

const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

const GIGACHAT_SCOPE =
  process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';

const GIGACHAT_MODEL =
  process.env.GIGACHAT_MODEL || 'GigaChat-3-Ultra';

/* =========================================================
   GIGACHAT API
========================================================= */

/*
   OAuth endpoint.
   Этот адрес уже работал у нас на Render и выдавал
   успешную авторизацию.
*/
const OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

/*
   Актуальный endpoint GigaChat API.
*/
const CHAT_URL =
  'https://api.giga.chat/v1/chat/completions';

/*
   На Render ранее была проблема с сертификатом.
   Поэтому пока оставляем этот вариант.

   Позже, когда всё заработает, можно будет отдельно
   настроить нормальную проверку сертификатов.
*/
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/* =========================================================
   TOKEN CACHE
========================================================= */

let cachedToken = null;
let tokenExpiresAt = 0;

/* =========================================================
   HELPERS
========================================================= */

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function mask(value) {
  const stringValue = safeString(value);

  if (!stringValue) {
    return '(empty)';
  }

  if (stringValue.length <= 8) {
    return '***';
  }

  return (
    stringValue.slice(0, 4) +
    '***' +
    stringValue.slice(-4)
  );
}

/* =========================================================
   ERROR FORMATTER
========================================================= */

function errorPayload(error) {
  const response = error && error.response;

  return {
    error_type: typeof error,

    error_name:
      error?.name || 'Error',

    error_message:
      error?.message || String(error),

    status:
      response?.status || null,

    details:
      response?.data ||
      response?.statusText ||
      null
  };
}

/* =========================================================
   REQUEST BODY
========================================================= */

function getBody(req) {
  if (
    req.body &&
    typeof req.body === 'object'
  ) {
    return req.body;
  }

  return {};
}

/* =========================================================
   GET FIELD FROM SALEBOT
========================================================= */

function getField(body, name) {

  const aliases = {

    content_type: [
      'content_type',
      'contentType',
      'type'
    ],

    business_info: [
      'business_info',
      'businessInfo',
      'business'
    ],

    target_audience: [
      'target_audience',
      'targetAudience',
      'audience'
    ],

    content_goal: [
      'content_goal',
      'contentGoal',
      'goal'
    ],

    reels_topic: [
      'reels_topic',
      'reelsTopic',
      'topic'
    ],

    content_style: [
      'content_style',
      'contentStyle',
      'style'
    ],

    bridge_key: [
      'bridge_key',
      'bridgeKey'
    ]
  };

  const possibleKeys =
    aliases[name] || [name];

  for (const key of possibleKeys) {

    if (
      body[key] !== undefined &&
      body[key] !== null
    ) {
      return safeString(body[key]);
    }
  }

  return '';
}

/* =========================================================
   GIGACHAT AUTHORIZATION
========================================================= */

async function getAccessToken(forceRefresh = false) {

  const currentTime = Date.now();

  /*
     Используем уже полученный токен,
     если он ещё действителен.
  */

  if (
    !forceRefresh &&
    cachedToken &&
    tokenExpiresAt >
      currentTime + 60000
  ) {

    console.log(
      'Using cached GigaChat access token'
    );

    return cachedToken;
  }

  if (!GIGACHAT_KEY) {

    throw new Error(
      'GIGACHAT_KEY is not configured'
    );
  }

  const rqUid =
    crypto.randomUUID();

  console.log(
    'Requesting GigaChat OAuth token...'
  );

  console.log(
    'RqUID:',
    rqUid
  );

  const form =
    new URLSearchParams();

  form.append(
    'scope',
    GIGACHAT_SCOPE
  );

  try {

    const response =
      await axios.post(
        OAUTH_URL,
        form.toString(),
        {
          httpsAgent,

          timeout: 10000,

          headers: {

            Authorization:
              `Basic ${GIGACHAT_KEY}`,

            RqUID:
              rqUid,

            'Content-Type':
              'application/x-www-form-urlencoded',

            Accept:
              'application/json'
          },

          validateStatus:
            () => true
        }
      );

    console.log(
      'OAuth response status:',
      response.status
    );

    if (
      response.status < 200 ||
      response.status >= 300
    ) {

      const error =
        new Error(
          `GigaChat OAuth failed with status ${response.status}`
        );

      error.response =
        response;

      throw error;
    }

    const token =
      response.data?.access_token;

    if (!token) {

      const error =
        new Error(
          'GigaChat OAuth response does not contain access_token'
        );

      error.response =
        response;

      throw error;
    }

    cachedToken =
      token;

    const expiresAtSeconds =
      Number(
        response.data?.expires_at || 0
      );

    if (expiresAtSeconds > 0) {

      tokenExpiresAt =
        expiresAtSeconds * 1000;

    } else {

      tokenExpiresAt =
        Date.now() +
        25 * 60 * 1000;
    }

    console.log(
      'GigaChat OAuth token received successfully'
    );

    return cachedToken;

  } catch (error) {

    console.error(
      'OAuth ERROR:'
    );

    console.error(
      JSON.stringify(
        errorPayload(error),
        null,
        2
      )
    );

    throw error;
  }
}

/* =========================================================
   PROMPT
========================================================= */

function buildPrompt(data) {

  return `
Ты — профессиональный контент-стратег,
маркетолог и сценарист для предпринимателей,
экспертов и специалистов.

Твоя задача — создать ГОТОВЫЙ контент
на основе входных данных пользователя.

========================
ВХОДНЫЕ ДАННЫЕ
========================

Тип контента:
${data.content_type}

Бизнес:
${data.business_info}

Целевая аудитория:
${data.target_audience}

Цель контента:
${data.content_goal}

Тема:
${data.reels_topic}

Стиль:
${data.content_style}

========================
ГЛАВНАЯ ЗАДАЧА
========================

Создай готовый контент,
который можно использовать сразу,
без дополнительной доработки.

========================
ВАЖНЫЕ ПРАВИЛА
========================

1. Не задавай пользователю вопросов.

2. Не говори, что переменные не заполнены.

3. Не говори, что тебе нужны дополнительные данные.

4. Не повторяй входные данные в виде анкеты.

5. Не начинай ответ с фраз:
"Я готов создать контент",
"Для этого мне нужны данные",
"Как только вы предоставите данные",
"Пожалуйста, пришлите информацию".

6. Сразу создавай готовый результат.

7. Используй русский язык.

8. Обязательно учитывай одновременно:
- бизнес;
- целевую аудиторию;
- цель;
- тему;
- выбранный стиль.

========================
ЕСЛИ ЭТО REELS
========================

Создай полноценный сценарий:

1. Хук первых секунд.
2. Текст/реплики.
3. Что происходит в кадре.
4. Основная часть.
5. Финал.
6. Призыв к действию.

Сценарий должен быть конкретным,
а не общими рекомендациями.

========================
ЕСЛИ ЭТО ПОСТ
========================

Создай полностью готовый пост:

- сильное начало;
- основная мысль;
- полезная информация;
- эмоциональная подача;
- призыв к действию.

========================
ЕСЛИ ЭТО КАРУСЕЛЬ
========================

Создай структуру:

Слайд 1 — заголовок/хук
Слайд 2 — ...
Слайд 3 — ...
и так далее.

Каждый слайд должен содержать
готовый текст.

========================
ЕСЛИ ЭТО TELEGRAM-ПОСТ
========================

Создай готовый пост для Telegram
с вовлекающим началом,
полезной основной частью
и призывом к действию.

========================
ФИНАЛЬНОЕ ПРАВИЛО
========================

Выдай ТОЛЬКО готовый контент.

Не добавляй анализ,
комментарии о своей работе
или объяснение того,
как ты выполнял задачу.
`;
}

/* =========================================================
   VALIDATION
========================================================= */

function validateInput(data) {

  const required = [

    [
      'content_type',
      data.content_type
    ],

    [
      'business_info',
      data.business_info
    ],

    [
      'target_audience',
      data.target_audience
    ],

    [
      'content_goal',
      data.content_goal
    ],

    [
      'reels_topic',
      data.reels_topic
    ],

    [
      'content_style',
      data.content_style
    ]
  ];

  return required
    .filter(
      ([name, value]) =>
        !value
    )
    .map(
      ([name]) => name
    );
}

/* =========================================================
   GENERATE CONTENT
========================================================= */

async function generateContent(data) {

  /*
     Получаем OAuth token.
  */

  let token =
    await getAccessToken(false);

  const requestBody = {

    model:
      GIGACHAT_MODEL,

    messages: [

      {
        role: 'system',

        content:
          'Ты создаёшь практичный маркетинговый контент на русском языке. Всегда выполняй задачу по переданным данным и сразу выдавай готовый результат.'
      },

      {
        role: 'user',

        content:
          buildPrompt(data)
      }
    ],

    temperature:
      0.7,

    max_tokens:
      2500
  };

  console.log(
    'Sending request to GigaChat...'
  );

  console.log(
    'Model:',
    GIGACHAT_MODEL
  );

  console.log(
    'Prompt length:',
    requestBody
      .messages[1]
      .content
      .length
  );

  /*
     Первый запрос.
  */

  let response =
    await axios.post(

      CHAT_URL,

      requestBody,

      {

        httpsAgent,

        /*
           Salebot ждёт примерно 13 секунд.
           Поэтому не держим соединение
           бесконечно.
        */

        timeout:
          12000,

        headers: {

          Authorization:
            `Bearer ${token}`,

          'Content-Type':
            'application/json',

          Accept:
            'application/json'
        },

        validateStatus:
          () => true
      }
    );

  /*
     Если token был отклонён,
     обновляем его и делаем ещё одну попытку.
  */

  if (
    response.status === 401 ||
    response.status === 403
  ) {

    console.log(
      `GigaChat returned ${response.status}; refreshing OAuth token...`
    );

    token =
      await getAccessToken(true);

    response =
      await axios.post(

        CHAT_URL,

        requestBody,

        {

          httpsAgent,

          timeout:
            12000,

          headers: {

            Authorization:
              `Bearer ${token}`,

            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          validateStatus:
            () => true
        }
      );
  }

  console.log(
    'GigaChat status:',
    response.status
  );

  /*
     Ошибка GigaChat.
  */

  if (
    response.status < 200 ||
    response.status >= 300
  ) {

    const error =
      new Error(
        `GigaChat generation failed with status ${response.status}`
      );

    error.response =
      response;

    throw error;
  }

  /*
     Получаем текст ответа.
  */

  const content =
    response
      .data
      ?.choices
      ?.[0]
      ?.message
      ?.content;

  if (!content) {

    const error =
      new Error(
        'GigaChat returned an empty content field'
      );

    error.response =
      response;

    throw error;
  }

  return {

    content:
      safeString(content),

    raw:
      response.data
  };
}

/* =========================================================
   ROOT
========================================================= */

app.get(
  '/',
  (req, res) => {

    res.json({

      ok: true,

      service:
        'Content Constructor Gateway',

      status:
        'working',

      time:
        nowIso(),

      endpoints: [

        '/health',

        '/test-auth',

        '/test-generate',

        '/generate'
      ]
    });
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  '/health',
  (req, res) => {

    res.json({

      ok: true,

      service:
        'Content Constructor Gateway',

      status:
        'working',

      gigaChatKey:
        GIGACHAT_KEY
          ? 'CONFIGURED'
          : 'MISSING',

      bridgeKey:
        BRIDGE_KEY
          ? 'CONFIGURED'
          : 'MISSING',

      model:
        GIGACHAT_MODEL,

      time:
        nowIso()
    });
  }
);

/* =========================================================
   TEST AUTH
========================================================= */

app.get(
  '/test-auth',
  async (req, res) => {

    console.log(
      '===================================='
    );

    console.log(
      'TEST AUTH STARTED'
    );

    console.log(
      '===================================='
    );

    try {

      await getAccessToken(true);

      return res.json({

        ok: true,

        stage:
          'auth',

        message:
          'Авторизация GigaChat прошла успешно'
      });

    } catch (error) {

      return res
        .status(500)
        .json({

          ok: false,

          stage:
            'auth',

          ...errorPayload(error)
        });
    }
  }
);

/* =========================================================
   TEST GENERATE
========================================================= */

app.get(
  '/test-generate',
  async (req, res) => {

    console.log(
      '===================================='
    );

    console.log(
      'TEST GENERATE STARTED'
    );

    console.log(
      '===================================='
    );

    try {

      const result =
        await generateContent({

          content_type:
            'Reels',

          business_info:
            'Тестовая кофейня',

          target_audience:
            'Люди 25-40 лет',

          content_goal:
            'Продать услугу',

          reels_topic:
            'Как выбрать хороший кофе',

          content_style:
            'Провокационный'
        });

      return res.json({

        ok: true,

        stage:
          'generation',

        status:
          200,

        response:
          result.raw,

        reels_result:
          result.content
      });

    } catch (error) {

      return res
        .status(500)
        .json({

          ok: false,

          stage:
            'gigachat',

          ...errorPayload(error)
        });
    }
  }
);

/* =========================================================
   MAIN GENERATE ENDPOINT
========================================================= */

app.post(
  '/generate',
  async (req, res) => {

    const startedAt =
      Date.now();

    console.log(
      '===================================='
    );

    console.log(
      'GENERATE REQUEST RECEIVED'
    );

    console.log(
      'Time:',
      nowIso()
    );

    console.log(
      'Method:',
      req.method
    );

    console.log(
      'Content-Type:',
      req.headers['content-type']
    );

    console.log(
      '===================================='
    );

    try {

      const body =
        getBody(req);

      console.log(
        'Body exists:',
        !!body
      );

      console.log(
        'Body keys:',
        Object.keys(body)
      );

      /*
         Проверяем bridge_key.
      */

      const bridgeKey =
        getField(
          body,
          'bridge_key'
        );

      console.log(
        'Bridge key received:',
        mask(bridgeKey)
      );

      console.log(
        'Expected bridge key:',
        BRIDGE_KEY
          ? mask(BRIDGE_KEY)
          : '(not configured)'
      );

      if (!BRIDGE_KEY) {

        return res
          .status(500)
          .json({

            ok: false,

            stage:
              'config',

            error:
              'BRIDGE_KEY is not configured'
          });
      }

      if (
        !bridgeKey ||
        bridgeKey !== BRIDGE_KEY
      ) {

        console.log(
          'BRIDGE KEY CHECK: FAILED'
        );

        return res
          .status(401)
          .json({

            ok: false,

            stage:
              'auth',

            error:
              'Неверный bridge_key'
          });
      }

      console.log(
        'BRIDGE KEY CHECK: OK'
      );

      /*
         Получаем все переменные Salebot.
      */

      const data = {

        content_type:
          getField(
            body,
            'content_type'
          ),

        business_info:
          getField(
            body,
            'business_info'
          ),

        target_audience:
          getField(
            body,
            'target_audience'
          ),

        content_goal:
          getField(
            body,
            'content_goal'
          ),

        reels_topic:
          getField(
            body,
            'reels_topic'
          ),

        content_style:
          getField(
            body,
            'content_style'
          )
      };

      /*
         Показываем в Render,
         что реально пришло из Salebot.
      */

      console.log(
        'Received variables:'
      );

      console.log(
        'content_type:',
        JSON.stringify(
          data.content_type
        )
      );

      console.log(
        'business_info:',
        JSON.stringify(
          data.business_info
        )
      );

      console.log(
        'target_audience:',
        JSON.stringify(
          data.target_audience
        )
      );

      console.log(
        'content_goal:',
        JSON.stringify(
          data.content_goal
        )
      );

      console.log(
        'reels_topic:',
        JSON.stringify(
          data.reels_topic
        )
      );

      console.log(
        'content_style:',
        JSON.stringify(
          data.content_style
        )
      );

      /*
         Проверяем,
         что все данные реально пришли.
      */

      const missing =
        validateInput(data);

      if (
        missing.length > 0
      ) {

        console.log(
          'MISSING VARIABLES:',
          missing.join(', ')
        );

        return res
          .status(400)
          .json({

            ok: false,

            stage:
              'validation',

            error:
              'Не все переменные переданы из Salebot',

            missing,

            received:
              data
          });
      }

      console.log(
        'All variables received. Starting generation...'
      );

      /*
         Запускаем GigaChat.
      */

      const result =
        await generateContent(
          data
        );

      const elapsed =
        Date.now() -
        startedAt;

      console.log(
        'GENERATION SUCCESS'
      );

      console.log(
        'Elapsed ms:',
        elapsed
      );

      console.log(
        'Result length:',
        result.content.length
      );

      /*
         Именно этот формат
         ожидает Salebot.
      */

      return res.json({

        ok: true,

        reels_result:
          result.content,

        generation_time_ms:
          elapsed
      });

    } catch (error) {

      const elapsed =
        Date.now() -
        startedAt;

      console.error(
        'GENERATION ERROR'
      );

      console.error(
        'Elapsed ms:',
        elapsed
      );

      console.error(
        JSON.stringify(
          errorPayload(error),
          null,
          2
        )
      );

      return res
        .status(500)
        .json({

          ok: false,

          stage:
            'generation',

          generation_time_ms:
            elapsed,

          ...errorPayload(error)
        });
    }
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res
      .status(404)
      .json({

        ok: false,

        error:
          'Endpoint not found',

        method:
          req.method,

        url:
          req.originalUrl
      });
  }
);

/* =========================================================
   EXPRESS ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      'EXPRESS ERROR:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res
      .status(500)
      .json({

        ok: false,

        stage:
          'server',

        error:
          error?.message ||
          String(error)
      });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      '===================================='
    );

    console.log(
      'CONTENT CONSTRUCTOR GATEWAY'
    );

    console.log(
      '===================================='
    );

    console.log(
      'GIGACHAT_KEY:',
      GIGACHAT_KEY
        ? 'CONFIGURED'
        : 'MISSING'
    );

    console.log(
      'BRIDGE_KEY:',
      BRIDGE_KEY
        ? 'CONFIGURED'
        : 'MISSING'
    );

    console.log(
      'GIGACHAT_SCOPE:',
      GIGACHAT_SCOPE
    );

    console.log(
      'GIGACHAT_MODEL:',
      GIGACHAT_MODEL
    );

    console.log(
      'CHAT_URL:',
      CHAT_URL
    );

    console.log(
      'PORT:',
      PORT
    );

    console.log(
      `Content Constructor Gateway running on port ${PORT}`
    );
  }
);
