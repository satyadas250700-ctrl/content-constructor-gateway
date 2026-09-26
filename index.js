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

// Не допускаем одновременный запуск нескольких генераций
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

        RqUID:
          crypto.randomUUID(),

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

function getContentInstructions(contentType) {
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

  if (type.includes("reels")) {
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

Учитывай бизнес,
целевую аудиторию,
цель,
тему и стиль.

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
  return `
Ты — профессиональный российский
контент-маркетолог, контент-стратег и сценарист.

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
${reelsTopic || "Определи подходящую тему самостоятельно."}

Стиль:
${contentStyle}

ИНСТРУКЦИЯ:

${getContentInstructions(contentType)}

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

ФАКТЫ:

Используй только факты, которые прямо присутствуют
во входных данных клиента.

Не придумывай:
- товары;
- услуги;
- людей;
- помещения;
- интерьер;
- оборудование;
- упаковку;
- мебель;
- предметы;
- процессы;
- технологии;
- ингредиенты;
- свойства продукта;
- цены;
- скидки;
- сроки;
- даты;
- цифры;
- адреса;
- события;
- историю бизнеса;
- профессиональные или научные факты.

Творческие метафоры, сравнения, гиперболы,
юмор и художественные образы разрешены.

Но художественная формулировка не должна превращать
вымышленную деталь в реальный факт бизнеса.

Выдай только готовый контент.
`;
}

// ============================================================
// BUILD STRICT 5-DAY PLAN CHUNK PROMPT
// ============================================================

function buildPlanChunkPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  const contextBlock = previousPlan
    ? `
ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan}

Используй предыдущую часть только как контекст.

Не повторяй:
- темы;
- идеи;
- формулировки;
- одинаковые механики;
- одинаковые CTA.

Продолжай общую логику контент-плана.
`
    : `
Это начало контент-плана.

Построй первые дни так, чтобы человек
постепенно переходил от внимания
к интересу и доверию.
`;

  return `
Ты — профессиональный контент-стратег
для предпринимателей и экспертов.

Создай часть единого контент-плана на 30 дней.

ТОЛЬКО ДНИ ${startDay}–${endDay}.

============================================================
ДАННЫЕ КЛИЕНТА
============================================================

БИЗНЕС:
${businessInfo}

ЦЕЛЕВАЯ АУДИТОРИЯ:
${targetAudience}

ЦЕЛЬ КОНТЕНТА:
${contentGoal}

СТИЛЬ:
${contentStyle}

${contextBlock}

============================================================
ГЛАВНЫЙ ПРИНЦИП
============================================================

Твой план должен быть одновременно:

1. конкретным;
2. интересным;
3. разнообразным;
4. пригодным для реального создания контента;
5. строго основанным на входных данных клиента.

Но конкретность НЕ означает право придумывать
отсутствующие факты.

============================================================
ЧЕТЫРЕ УРОВНЯ ИНФОРМАЦИИ
============================================================

РАЗДЕЛ 1. ПОДТВЕРЖДЁННЫЕ ФАКТЫ

Фактом считается только то,
что прямо содержится во входных данных.

Не считай фактом то,
что просто логично предположить.

Например:

Если клиент написал:
«Кофейня. Продаёт кофе и десерты.»

Можно использовать:
- кофе;
- десерты;
- кофейню;
- продажу кофе;
- продажу десертов.

Но нельзя автоматически считать подтверждёнными:
- чашки;
- столики;
- бариста;
- кофемашину;
- витрину;
- интерьер;
- окна;
- мебель;
- посетителей;
- выпечку;
- конкретные виды кофе;
- конкретные виды десертов;
- ингредиенты;
- способ приготовления;
- температуру;
- запах;
- вкус;
- внешний вид;
- время работы;
- расположение;
- цены;
- акции;
- историю бизнеса.

Даже если такие детали типичны для данного бизнеса,
они всё равно НЕ подтверждены.

============================================================
РАЗДЕЛ 2. ТВОРЧЕСКАЯ ИНТЕРПРЕТАЦИЯ
============================================================

Разрешены:

- метафоры;
- сравнения;
- юмор;
- гиперболы;
- эмоциональные образы;
- игра слов;
- художественные концепции;
- необычные смысловые углы;
- контраст;
- эмоциональная драматургия.

Например:

«Антидепрессант дня»

может быть художественной метафорой.

Но метафора не должна создавать
новый реальный факт.

ШУТКА НЕ ДЕЛАЕТ ВЫДУМАННЫЙ ФАКТ ДОПУСТИМЫМ.

============================================================
РАЗДЕЛ 3. ФОРМАТ ПОДАЧИ
============================================================

Можно свободно использовать абстрактные
и монтажные приёмы:

- текст на экране;
- типографику;
- смену надписей;
- графическую анимацию;
- монтажный ритм;
- контраст кадров;
- крупные планы подтверждённого продукта;
- динамику текста;
- закадровый текст;
- музыкальный ритм;
- паузы;
- переходы;
- визуальные метафоры;
- композиционные приёмы.

Но эти приёмы НЕ дают права придумывать
новые реальные объекты.

============================================================
РАЗДЕЛ 4. ЗАПРЕЩЁННЫЕ НОВЫЕ ФАКТЫ
============================================================

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО добавлять от себя:

- новых людей;
- новых персонажей;
- новых предметов;
- мебель;
- интерьер;
- помещения;
- оборудование;
- посуду;
- упаковку;
- витрины;
- окна;
- двери;
- улицы;
- здания;
- транспорт;
- конкретные места;
- конкретное время;
- конкретные даты;
- события;
- действия, которых нет во входных данных;
- процессы;
- технологии;
- ингредиенты;
- ассортимент;
- конкретные продукты;
- свойства продуктов;
- цены;
- скидки;
- акции;
- цифры;
- статистику;
- медицинские факты;
- научные факты;
- технические факты;
- профессиональные факты;
- историю бизнеса;
- отзывы;
- результаты клиентов;
- обещания результата.

Также запрещено делать логические выводы
и выдавать их как факты.

Например:

«Продаёт кофе и десерты»

НЕ означает автоматически:

«Кофе и десерты хорошо сочетаются».

НЕ означает:

«Десерт увеличивает средний чек».

НЕ означает:

«Люди приходят за атмосферой».

НЕ означает:

«Посетители сидят за столиками».

НЕ означает:

«Кофе покупают утром».

НЕ означает:

«После 18:00 люди выбирают кофе».

НЕ означает:

«Десерты помогают поднять настроение».

Это всё дополнительные утверждения,
которых клиент не сообщал.

============================================================
НЕПОДТВЕРЖДЁННЫЕ СВОЙСТВА
============================================================

Нельзя самостоятельно добавлять такие свойства:

- горячий;
- холодный;
- свежий;
- ароматный;
- насыщенный;
- мягкий;
- нежный;
- сливочный;
- воздушный;
- хрустящий;
- тающий;
- тягучий;
- глянцевый;
- дымящийся;
- свежеобжаренный;
- необычного цвета;
- натуральный;
- полезный;
- качественный;
- авторский;
- премиальный;
- уникальный.

Если такого свойства нет во входных данных,
не используй его как факт.

============================================================
ОСОБОЕ ПРАВИЛО: СЦЕНАРИЙ ≠ ФАКТ
============================================================

Если тебе нужно предложить визуальную сцену,
сначала проверь:

Могу ли я создать эту сцену,
используя только подтверждённые материалы?

Если ДА —
предложи конкретный вариант.

Если НЕТ —
НЕ ДОБАВЛЯЙ НОВЫЙ ОБЪЕКТ.

Вместо этого используй:

- подтверждённый продукт;
- подтверждённый объект;
- текст на экране;
- графику;
- монтаж;
- закадровый голос;
- универсальную формулировку.

Например:

ПЛОХО:

«Можно снять человека,
который сидит за столиком с чашкой кофе.»

Здесь придуманы:
человек, столик и чашка.

ХОРОШО:

«Можно построить ролик вокруг идеи
короткой паузы в течение дня,
используя доступный визуал кофе.»

Ещё лучше, если нужен конкретный визуал:

«Можно использовать крупные планы
доступного визуала кофе и добавить
текстовые акценты на экране.»

Здесь нет новых предметов.

============================================================
КРИТИЧЕСКОЕ ПРАВИЛО
============================================================

ФРАЗА:

«Можно снять...»

НЕ ЯВЛЯЕТСЯ РАЗРЕШЕНИЕМ
НА ПРИДУМЫВАНИЕ НОВОГО ФАКТА.

Фраза «можно снять» означает только,
что предлагается ВАРИАНТ СЪЁМКИ.

Но сам вариант съёмки всё равно
должен использовать подтверждённый материал
или абстрактный визуальный приём.

============================================================
ЕСЛИ НЕ ХВАТАЕТ ДАННЫХ
============================================================

Никогда не заполняй пробел
правдоподобной деталью.

Если конкретизация требует нового факта:

НЕ КОНКРЕТИЗИРУЙ.

Подними формулировку
на ближайший подтверждённый уровень.

Примеры:

❌ «глянцевая глазурь и тягучая начинка»

✅ «крупные планы десертов»

❌ «керамическая чашка необычного оттенка»

✅ «визуал кофе»

❌ «пар поднимается над горячим кофе»

✅ «крупный план кофе»

❌ «человек сидит у окна»

✅ «можно построить сцену вокруг идеи паузы»

❌ «бариста готовит кофе на профессиональной кофемашине»

✅ «можно показать процесс приготовления,
если такой процесс действительно доступен для съёмки»

Но если сам процесс приготовления
не подтверждён входными данными,
предпочтительно использовать:

«можно построить визуал вокруг продукта
и динамики монтажа».

============================================================
КОНТЕНТНАЯ ОПОРА
============================================================

Каждый день должен иметь
КОНКРЕТНУЮ ПОДТВЕРЖДЁННУЮ ОПОРУ.

Перед созданием каждого дня
мысленно ответь:

«На каком факте из входных данных
строится эта идея?»

Если ответа нет —
идея недостаточно привязана к бизнесу.

Не используй универсальные темы
только потому, что они подходят
любому предпринимателю.

============================================================
ЭКСПЕРТНЫЕ ФАКТЫ
============================================================

Не придумывай экспертные объяснения.

Запрещено самостоятельно создавать:

- медицинские утверждения;
- психологические утверждения;
- научные объяснения;
- технические объяснения;
- профессиональные рекомендации;
- причинно-следственные связи;
- объяснения свойств продукта.

Например, если клиент продаёт кофе,
нельзя самостоятельно писать:

«Кофе после определённого времени
влияет на сон именно так-то».

Если клиент не дал соответствующий факт,
не создавай такой экспертный контент.

Можно создать тему вокруг вопроса или мифа,
но нельзя самостоятельно придумывать ответ,
если фактическая база не дана.

============================================================
ЛОГИКА КОНТЕНТ-ПЛАНА
============================================================

Постепенно веди аудиторию по пути:

внимание
→ интерес
→ экспертность
→ доверие
→ желание
→ действие.

Но эта логика не должна становиться
основанием для выдумывания фактов.

Например:

«увеличить средний чек»

не является допустимой задачей,
если клиент не говорил о среднем чеке.

============================================================
ФОРМАТЫ
============================================================

Используй и чередуй:

- Reels
- Пост
- Карусель
- Telegram-пост

Не делай однотипную последовательность.

============================================================
РАЗНООБРАЗИЕ
============================================================

Дни должны различаться
по смыслу и механике.

Используй разные подходы:

- эмоциональный;
- образовательный;
- вовлекающий;
- развлекательный;
- экспертный;
- продающий;
- интерактивный;
- сравнительный;
- миф/вопрос;
- история;
- наблюдение;
- контраст;
- работа с возражением.

Но каждый подход должен быть реализован
ТОЛЬКО через подтверждённые факты.

============================================================
ФИНАЛЬНАЯ САМОПРОВЕРКА
============================================================

Перед выдачей каждого дня проверь:

1. Все факты действительно есть во входных данных?
2. Не появился ли новый объект?
3. Не появился ли новый человек?
4. Не появился ли новый предмет?
5. Не появился ли интерьер?
6. Не появилось ли оборудование?
7. Не появилось ли новое место?
8. Не появилось ли новое время или событие?
9. Не появились ли новые товары или услуги?
10. Не появились ли новые свойства продукта?
11. Не появились ли цены, скидки или цифры?
12. Не появился ли экспертный факт?
13. Не выдал ли я логический вывод за факт?
14. Не придумал ли я сцену просто потому,
    что она типична для этого бизнеса?
15. Если я написал «можно снять»,
    основан ли этот вариант на подтверждённом материале?
16. Если конкретизация невозможна,
    поднял ли я формулировку до универсального уровня?
17. Не превращает ли шутка или метафора
    выдуманную деталь в реальный факт?

Если хотя бы на один вопрос ответ «нет» —
перепиши этот фрагмент.

============================================================
ЗАДАЧА
============================================================

Создай ВСЕ дни с ${startDay} по ${endDay}.

Каждый день должен быть:

- конкретным;
- разнообразным;
- связанным именно с бизнесом;
- основанным на подтверждённых данных;
- практически реализуемым;
- интересным;
- творческим без выдумывания фактов.

Не пиши длинные готовые тексты.

Не пиши полный сценарий.

Не объясняй свои решения.

Не добавляй вступление.

Не добавляй заключение.

Ответ только на русском языке.

============================================================
ФОРМАТ КАЖДОГО ДНЯ
============================================================

День N — Формат

Контентная опора:
какой подтверждённый факт используется.

Тема:
конкретная тема публикации.

Идея:
что именно раскрыть.

Креативный концепт:
метафора, эмоциональный угол,
юмор или художественная идея,
если это уместно.

Вариант съёмки:
конкретный способ подачи,
основанный только на подтверждённом материале
или на абстрактных визуальных приёмах.

Задача:
какую реакцию или действие
должна вызвать публикация.

CTA:
конкретный призыв к действию,
соответствующий цели контента.

Не используй одинаковые CTA каждый день.

============================================================
ГЛАВНОЕ ПРАВИЛО
============================================================

Если конкретизация невозможна
без добавления нового факта —

НЕ КОНКРЕТИЗИРУЙ.

Лучше дать более универсальную,
но правдивую формулировку,
чем красивую, но выдуманную деталь.

Креативность НЕ ограничиваем.

Факты НЕ выдумываем.

ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
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
  const startedAt = Date.now();

  console.log(
    `[${label}] Sending request to GigaChat...`
  );

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,

        messages: [
          {
            role: "system",
            content: `
Ты профессиональный контент-маркетолог
и контент-стратег.

Создавай только качественный
готовый контент на русском языке.

КРИТИЧЕСКОЕ ПРАВИЛО:

Факты бизнеса можно использовать
ТОЛЬКО из предоставленных входных данных.

Не придумывай реальные:
- объекты;
- предметы;
- людей;
- места;
- помещения;
- оборудование;
- свойства;
- события;
- процессы;
- цифры;
- цены;
- даты;
- ассортимент;
- профессиональные факты.

Разрешены:
- метафоры;
- сравнения;
- юмор;
- гиперболы;
- художественные концепции;
- эмоциональная подача.

Но творчество НЕ является разрешением
на создание новых фактов.

Формулировка «можно снять»
также НЕ разрешает придумывать
новые объекты.

Если конкретизация невозможна
без нового факта — используй
более универсальную формулировку.
`
          },

          {
            role: "user",
            content: prompt
          }
        ],

        temperature,
        max_tokens: maxTokens
      },
      {
        httpsAgent,

        timeout: 9000,

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"
        }
      }
    );

    const result =
      response.data?.choices?.[0]?.message?.content ||
      "";

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
      status: response.status
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
// PLAN VALIDATION
// ============================================================

function validatePlanData({
  bridge_key,
  business_info,
  target_audience,
  content_goal,
  content_style
}) {
  if (!bridge_key) {
    return "bridge_key is required";
  }

  if (!BRIDGE_KEY) {
    return "BRIDGE_KEY is not configured";
  }

  if (bridge_key !== BRIDGE_KEY) {
    return "Invalid bridge_key";
  }

  if (!business_info) {
    return "business_info is required";
  }

  if (!target_audience) {
    return "target_audience is required";
  }

  if (!content_goal) {
    return "content_goal is required";
  }

  if (!content_style) {
    return "content_style is required";
  }

  return null;
}

// ============================================================
// GENERATE PLAN CHUNK
// ============================================================

async function generatePlanChunk({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan,
  label
}) {
  const token =
    await getAccessToken();

  const prompt =
    buildPlanChunkPrompt({
      startDay,
      endDay,
      businessInfo,
      targetAudience,
      contentGoal,
      contentStyle,
      previousPlan
    });

  return generateWithGigaChat({
    token,
    prompt,

    temperature: 0.35,

    maxTokens: 1100,

    label
  });
}

// ============================================================
// HANDLE PLAN CHUNK
// ============================================================

async function handlePlanChunk(
  req,
  res,
  startDay,
  endDay
) {
  const startedAt =
    Date.now();

  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    `PLAN CHUNK REQUEST: ${startDay}-${endDay}`
  );

  console.log(
    "===================================="
  );

  if (generationInProgress) {
    return res.status(429).json({
      ok: false,
      error:
        "Generation already in progress. Please try again later."
    });
  }

  const {
    bridge_key,
    business_info,
    target_audience,
    content_goal,
    content_style,
    previous_plan
  } = req.body || {};

  const validationError =
    validatePlanData({
      bridge_key,
      business_info,
      target_audience,
      content_goal,
      content_style
    });

  if (validationError) {

    const status =
      validationError === "Invalid bridge_key" ||
      validationError === "bridge_key is required"
        ? 401
        : 400;

    return res.status(status).json({
      ok: false,
      error: validationError
    });
  }

  const safePreviousPlan =
    String(previous_plan || "")
      .slice(-18000);

  generationInProgress =
    true;

  try {

    const result =
      await generatePlanChunk({
        startDay,
        endDay,

        businessInfo:
          business_info,

        targetAudience:
          target_audience,

        contentGoal:
          content_goal,

        contentStyle:
          content_style,

        previousPlan:
          safePreviousPlan,

        label:
          `PLAN DAYS ${startDay}-${endDay}`
      });

    return res.json({
      ok: true,

      start_day:
        startDay,

      end_day:
        endDay,

      model:
        GIGACHAT_MODEL,

      status:
        result.status,

      time_ms:
        Date.now() - startedAt,

      result_length:
        result.result.length,

      reels_result:
        result.result
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,

      start_day:
        startDay,

      end_day:
        endDay,

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

// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {

  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    model:
      GIGACHAT_MODEL,

    gigachat_key_configured:
      !!GIGACHAT_KEY,

    bridge_key_configured:
      !!BRIDGE_KEY,

    generation_in_progress:
      generationInProgress
  });
});

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,

    service:
      "content-constructor-gateway",

    message:
      "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",

    endpoints: {

      health:
        "/health",

      test_auth:
        "/test-auth",

      test_generate:
        "/test-generate",

      test_plan_1_5:
        "/test-plan-1-5",

      generate:
        "POST /generate",

      plan_1_5:
        "POST /generate-plan-1-5",

      plan_6_10:
        "POST /generate-plan-6-10",

      plan_11_15:
        "POST /generate-plan-11-15",

      plan_16_20:
        "POST /generate-plan-16-20",

      plan_21_25:
        "POST /generate-plan-21-25",

      plan_26_30:
        "POST /generate-plan-26-30"
    }
  });
});

// ============================================================
// TEST AUTH
// ============================================================

app.get("/test-auth", async (req, res) => {

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
});

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
              9000,

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json"
            }
          }
        );

      const result =
        response.data?.choices?.[0]?.message?.content ||
        "";

      res.json({

        ok:
          true,

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
        "TEST GENERATE ERROR:",
        error.message
      );

      res.status(500).json({

        ok:
          false,

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
// TEST PLAN 1-5
// ============================================================

app.get(
  "/test-plan-1-5",
  async (req, res) => {

    const startedAt =
      Date.now();

    if (generationInProgress) {

      return res.status(429).json({
        ok: false,

        test:
          "plan-1-5",

        error:
          "Generation already in progress"
      });
    }

    generationInProgress =
      true;

    try {

      const result =
        await generatePlanChunk({

          startDay:
            1,

          endDay:
            5,

          businessInfo:
            "Кофейня. Продаёт кофе и десерты.",

          targetAudience:
            "Люди, которые любят кофе, десерты и хотят сделать паузу в течение дня.",

          contentGoal:
            "Привлечь внимание, вызвать эмоциональную связь и стимулировать посещение кофейни.",

          contentStyle:
            "Современный, живой, эмоциональный, с юмором и метафорами.",

          previousPlan:
            "",

          label:
            "TEST PLAN 1-5"
        });

      res.json({

        ok:
          true,

        test:
          "plan-1-5",

        status:
          result.status,

        time_ms:
          Date.now() - startedAt,

        result_length:
          result.result.length,

        model:
          GIGACHAT_MODEL,

        reels_result:
          result.result
      });

    } catch (error) {

      res.status(500).json({

        ok:
          false,

        test:
          "plan-1-5",

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
// PLAN ENDPOINTS
// ============================================================

app.post(
  "/generate-plan-1-5",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      1,
      5
    )
);

app.post(
  "/generate-plan-6-10",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      6,
      10
    )
);

app.post(
  "/generate-plan-11-15",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      11,
      15
    )
);

app.post(
  "/generate-plan-16-20",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      16,
      20
    )
);

app.post(
  "/generate-plan-21-25",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      21,
      25
    )
);

app.post(
  "/generate-plan-26-30",
  (req, res) =>
    handlePlanChunk(
      req,
      res,
      26,
      30
    )
);

// ============================================================
// NORMAL GENERATE
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
        Object.keys(req.body || {})
      );

      // ------------------------------------------------------
      // VALIDATION
      // ------------------------------------------------------

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

      if (bridge_key !== BRIDGE_KEY) {

        return res.status(401).json({
          ok: false,

          error:
            "Invalid bridge_key"
        });
      }

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

      // ------------------------------------------------------
      // CONTENT PLAN PROTECTION
      // ------------------------------------------------------

      if (
        isContentPlan(
          content_type
        )
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "Для контент-плана используй отдельные endpoints: /generate-plan-1-5, /generate-plan-6-10, /generate-plan-11-15, /generate-plan-16-20, /generate-plan-21-25, /generate-plan-26-30"
        });
      }

      if (!reels_topic) {

        return res.status(400).json({
          ok: false,

          error:
            "reels_topic is required"
        });
      }

      // ------------------------------------------------------
      // TOKEN
      // ------------------------------------------------------

      const token =
        await getAccessToken();

      // ------------------------------------------------------
      // PROMPT
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // GENERATE
      // ------------------------------------------------------

      const result =
        await generateWithGigaChat({

          token,

          prompt,

          temperature:
            0.75,

          maxTokens:
            1800,

          label:
            "NORMAL CONTENT"
        });

      // ------------------------------------------------------
      // RESPONSE
      // ------------------------------------------------------

      return res.json({

        ok:
          true,

        content_type:
          content_type,

        status:
          result.status,

        time_ms:
          Date.now() - startedAt,

        result_length:
          result.result.length,

        reels_result:
          result.result
      });

    } catch (error) {

      console.error(
        "GENERATE ERROR"
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

      return res.status(500).json({

        ok:
          false,

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
// 404
// ============================================================

app.use(
  (req, res) => {

    res.status(404).json({

      ok:
        false,

      error:
        "Endpoint not found",

      path:
        req.path,

      method:
        req.method
    });
  }
);

// ============================================================
// GLOBAL ERROR
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

    res.status(500).json({

      ok:
        false,

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
      "МОЙ КОНТЕНТ-КОНСТРУКТОР"
    );

    console.log(
      "Gateway started"
    );

    console.log(
      "===================================="
    );

    console.log(
      "PORT:",
      PORT
    );

    console.log(
      "MODEL:",
      GIGACHAT_MODEL
    );

    console.log(
      "GIGACHAT_KEY:",
      GIGACHAT_KEY
        ? "configured"
        : "MISSING"
    );

    console.log(
      "BRIDGE_KEY:",
      BRIDGE_KEY
        ? "configured"
        : "MISSING"
    );

    console.log(
      "PLAN ENDPOINTS:"
    );

    console.log(
      "POST /generate-plan-1-5"
    );

    console.log(
      "POST /generate-plan-6-10"
    );

    console.log(
      "POST /generate-plan-11-15"
    );

    console.log(
      "POST /generate-plan-16-20"
    );

    console.log(
      "POST /generate-plan-21-25"
    );

    console.log(
      "POST /generate-plan-26-30"
    );

    console.log(
      "===================================="
    );
  }
);
