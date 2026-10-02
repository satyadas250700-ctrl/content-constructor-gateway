const express = require("express");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const GIGACHAT_KEY = process.env.GIGACHAT_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || "GigaChat-3-Ultra";
const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://api.giga.chat/v1/chat/completions";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let accessToken = null;
let tokenExpiresAt = 0;
let generationInProgress = false;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (!GIGACHAT_KEY) throw new Error("GIGACHAT_KEY is not configured");

  const response = await axios.post(
    OAUTH_URL,
    new URLSearchParams({ scope: GIGACHAT_SCOPE }).toString(),
    {
      httpsAgent,
      timeout: 8000,
      headers: {
        Authorization: `Basic ${GIGACHAT_KEY}`,
        RqUID: crypto.randomUUID(),
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  accessToken = response.data.access_token;
  const expiresIn = Number(response.data.expires_in) || 1800;
  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
  return accessToken;
}

function isContentPlan(contentType) {
  const type = String(contentType || "").toLowerCase();
  return type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней");
}

function getContentInstructions(contentType) {
  const type = String(contentType || "").toLowerCase();

  if (type.includes("telegram") || type.includes("тг") || type.includes("телеграм")) {
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

  if (type.includes("reels")) {
    return `
СОЗДАЙ ГОТОВЫЙ СЦЕНАРИЙ REELS.

Структура:
ХУК: первая цепляющая фраза.
СЦЕНАРИЙ: короткий динамичный текст.
ФИНАЛ: сильное завершение.
CTA: призыв к действию.

Текст должен быть естественным, интересным и соответствовать бизнесу, аудитории, цели и стилю.
Выдай только готовый материал.
`;
  }

  if (type.includes("пост") && !type.includes("telegram") && !type.includes("телеграм")) {
    return `
СОЗДАЙ ГОТОВЫЙ ПОСТ ДЛЯ СОЦИАЛЬНЫХ СЕТЕЙ.

Требования:
- сильное начало;
- интересная основная часть;
- конкретная польза;
- естественный язык;
- соответствие бизнесу, аудитории, цели и стилю;
- хороший CTA.

Выдай только готовый пост.
`;
  }

  if (type.includes("карусель") || type.includes("carousel")) {
    return `
СОЗДАЙ ГОТОВУЮ КАРУСЕЛЬ.

Сделай 7–9 слайдов.
Для каждого:
Слайд N:
Заголовок: ...
Текст: ...

Первый слайд должен цеплять. Последний должен содержать CTA.
Выдай только готовую карусель.
`;
  }

  return `
Создай качественный готовый контент для предпринимателя или эксперта.
Учитывай бизнес, целевую аудиторию, цель, тему и стиль.
Ответ только на русском языке.
`;
}

function buildPrompt({ contentType, businessInfo, targetAudience, contentGoal, reelsTopic, contentStyle }) {
  return `
Ты — профессиональный российский контент-маркетолог, контент-стратег и сценарист.
Ты работаешь внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

ДАННЫЕ КЛИЕНТА:
Формат: ${contentType}
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель контента: ${contentGoal}
Тема: ${reelsTopic || "Определи подходящую тему самостоятельно."}
Стиль: ${contentStyle}

ИНСТРУКЦИЯ:
${getContentInstructions(contentType)}

ОБЩИЕ ТРЕБОВАНИЯ:
- Только русский язык.
- Естественный человеческий язык.
- Без канцелярита.
- Без фраз вроде «в современном мире».
- Не говори, что ты ИИ.
- Не объясняй процесс создания.
- Учитывай бизнес, аудиторию, цель и стиль.
- Контент должен быть практически применим.

Выдай только готовый контент.
`;
}

function buildPlanChunkPrompt({ startDay, endDay, businessInfo, targetAudience, contentGoal, contentStyle, previousPlan }) {
  const contextBlock = previousPlan
    ? `
ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:
${previousPlan}

Используй её только как контекст. Не повторяй темы и идеи. Продолжай общую логику контент-воронки.
`
    : `
Это начало контент-плана. Построй первые дни так, чтобы человек постепенно переходил от внимания к интересу и доверию.
`;

  return `
Ты — профессиональный контент-стратег для предпринимателей и экспертов.

Создай часть единого контент-плана на 30 дней:
ТОЛЬКО ДНИ ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель контента: ${contentGoal}
Стиль: ${contentStyle}

${contextBlock}

ЛОГИКА ПЛАНА:
Постепенно веди аудиторию по пути:
внимание → интерес → экспертность → доверие → желание → действие.

Используй и чередуй форматы:
- Reels
- Пост
- Карусель
- Telegram-пост

ТРЕБОВАНИЯ:
1. Создай ВСЕ дни с ${startDay} по ${endDay}.
2. Каждый день должен быть конкретным.
3. Темы должны соответствовать именно этому бизнесу.
4. Не используй абстрактные универсальные идеи.
5. Не повторяй темы и идеи из предыдущей части.
6. Чередуй форматы.
7. Учитывай аудиторию, цель и стиль.
8. Не пиши длинные готовые тексты.
9. Не пиши полный сценарий.
10. Не объясняй свои решения.
11. Не добавляй вступление или заключение.
12. Ответ только на русском языке.

ФОРМАТ:
День N — Формат
Тема: конкретная тема
Идея: что именно показать или раскрыть
Задача: какую реакцию или действие должна вызвать публикация
CTA: конкретный призыв к действию

Каждый пункт — короткий, но содержательный. Не используй одинаковые CTA каждый день.

ВЕРНИ ТОЛЬКО КОНТЕНТ-ПЛАН.
`;
}

async function generateWithGigaChat({ token, prompt, temperature, maxTokens, label }) {
  const startedAt = Date.now();
  console.log(`[${label}] Sending request to GigaChat...`);

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,
        messages: [
          {
            role: "system",
            content: "Ты профессиональный контент-маркетолог и контент-стратег. Создавай только качественный готовый контент на русском языке."
          },
          { role: "user", content: prompt }
        ],
        temperature,
        max_tokens: maxTokens
      },
      {
        httpsAgent,
        timeout: 9000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = response.data?.choices?.[0]?.message?.content || "";
    const elapsed = Date.now() - startedAt;

    console.log(`[${label}] HTTP status: ${response.status}`);
    console.log(`[${label}] Result length: ${result.length}`);
    console.log(`[${label}] Time: ${elapsed} ms`);

    if (!result) throw new Error(`${label}: GigaChat returned empty result`);

    return { result, elapsed, status: response.status };
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    console.error(`[${label}] ERROR`);
    console.error(`[${label}] Message:`, error.message);
    console.error(`[${label}] Status:`, error.response?.status);
    console.error(`[${label}] Response:`, error.response?.data);
    console.error(`[${label}] Time:`, elapsed, "ms");
    throw error;
  }
}


// ============================================================
// AI CONTENT FACT AUDITOR V2
// ============================================================

function cleanJsonText(text) {
  let value = String(text || "").trim();

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    value = value.slice(firstBrace, lastBrace + 1);
  }

  return value;
}

function parseAuditorJson(text) {
  try {
    return JSON.parse(cleanJsonText(text));
  } catch (error) {
    console.error("[AI AUDITOR] JSON parse error:", error.message);
    return null;
  }
}

function buildAuditPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent
}) {
  return `
Ты — строгий редактор-фактчекер сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — проверить готовый контент на ФАКТИЧЕСКУЮ ОПОРУ именно на данных конкретного клиента.

Главное правило:
НЕТ ПРЯМОЙ ОПОРЫ В ИСХОДНЫХ ДАННЫХ → ЗНАЧИТ ЭТО НЕПОДТВЕРЖДЁННЫЙ ФАКТ.
Не додумывай за клиента то, чего он не сообщил.

====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================
Формат: ${contentType}
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель: ${contentGoal}
Тема: ${reelsTopic || "не задана отдельно"}
Стиль: ${contentStyle}

====================
ГОТОВЫЙ КОНТЕНТ
====================
${generatedContent}

====================
АЛГОРИТМ ПРОВЕРКИ
====================

Для КАЖДОГО конкретного утверждения в готовом контенте мысленно задай вопрос:
«Какой конкретный фрагмент исходных данных подтверждает это утверждение?»

Если можешь указать прямую смысловую опору — разрешено.
Если опоры нет — это нарушение.
Если не уверен, есть ли опора, считай, что опоры НЕТ.

Особенно строго проверяй:
- числа, проценты, количество, длительность, сроки, даты и возраст;
- цены, стоимость, скидки, акции и финансовые условия;
- реальные истории, личный опыт, прошлые события, ошибки, провалы и кейсы;
- существование клиентов, подписчиков, комментариев, отзывов, продаж и результатов;
- обещания результата и гарантии;
- конкретные продукты, услуги, объекты, помещения, оборудование и локации;
- конкретные действия бизнеса и его рабочие процессы;
- технологии, методы и этапы оказания услуги;
- свойства продукта или услуги;
- утверждения от первого лица: «я», «мы», «у нас», «мой», «наша», если соответствующий факт не подтверждён входными данными;
- утверждения о том, что что-то уже происходило, происходит регулярно или обязательно произойдёт.

КРИТИЧЕСКИ ВАЖНО:

1. Любое конкретное число в тексте является нарушением, если такого числа нет во входных данных. Исключение: номера дней и техническая нумерация слайдов/структуры.
2. «15 секунд», «90%», «5 критериев», «первые ошибки», «прошлый пост», «комментарии подписчика», «завтра», «один из клиентов» — это конкретные факты или обстоятельства. Если они не подтверждены входными данными, помечай их.
3. «Моя услуга устроена так», «мы распределяем ответственность», «я прошёл через...», «мы используем...» — нельзя считать фактом только потому, что это правдоподобно для бизнеса.
4. Не разрешается превращать общую бизнес-нишу в выдуманный конкретный процесс. Например, если известно только «эксперт продаёт услуги», нельзя автоматически утверждать наличие консультаций, этапов работы, кейсов, правок, анализа, созвонов и т. п.
5. Не разрешается превращать наличие продукта в выдуманные свойства, результаты или клиентский опыт.
6. Если сценарная идея описывает реальный объект/событие как уже существующее, это факт. Если она явно условная — «если у вас есть...», «можно снять...», «представьте...», «например...» — это может быть допустимой творческой рекомендацией.
7. Простая универсальная рекомендация по съёмке допустима: текст на экране, монтаж, субтитры, графика, крупный план, голос за кадром и т. п. Но нельзя под видом съёмочной рекомендации утверждать, что у клиента уже есть конкретный предмет, комментарии, помещение, сотрудник, отзыв или кейс.
8. Метафоры, сравнения, юмор, гиперболы и эмоциональные образы допустимы, если они не маскируют конкретное фактическое утверждение.
9. Маркетинговая задача («привлечь внимание», «вызвать доверие») не является фактом о бизнесе и не требует подтверждения.
10. Обычный CTA допустим. Но CTA не должен обещать неподтверждённый ресурс или результат: например, нельзя обещать «пришлю кейс», «рассчитаю стоимость», «дам чек-лист», если наличие такого ресурса не подтверждено.
11. Не оценивай качество идеи, стиль или маркетинговую силу. Проверяй только фактологическую опору.

ВАЖНО О СЦЕНАРНЫХ ИДЕЯХ:

Идея может быть конкретной, но если конкретика зависит от отсутствующего факта, её нужно считать нарушением и при исправлении переводить в условную форму.

Плохо:
«Эксперт открывает комментарии под прошлым постом и выбирает вопрос подписчика».

Хорошо:
«Если под публикациями уже есть вопросы аудитории, можно выбрать один из них для короткого разбора».

Плохо:
«Эксперт рассказывает о своих первых ошибках».

Хорошо:
«Можно разобрать типичную ошибку в нише и объяснить, как её распознать».

Плохо:
«За 15 секунд покажите...».

Хорошо:
«Сделайте короткое динамичное видео...».

Плохо:
«5 критериев выбора».

Хорошо:
«Несколько критериев выбора» или «Ключевые критерии выбора».

Плохо:
«Что получает клиент и какие этапы включает ваша работа» — если эти сведения не даны.

Хорошо:
«Раскройте те элементы услуги, которые действительно указаны в описании бизнеса; если деталей нет, объясните ценность услуги на уровне общей идеи».

====================
ФОРМАТ ОТВЕТА
====================

Верни ТОЛЬКО JSON без Markdown и без пояснений:

{
  "passed": true,
  "violations": []
}

или:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент из контента",
      "reason": "почему он не имеет прямой опоры во входных данных",
      "support": "какой именно факт отсутствует или не подтверждён"
    }
  ]
}

Критически важно: если violations содержит хотя бы один элемент, passed ДОЛЖЕН быть false.
Не возвращай passed=true при наличии violations.
Максимум 15 нарушений.
`;
}

async function auditGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  label
}) {
  const prompt = buildAuditPrompt({
    contentType,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic,
    contentStyle,
    generatedContent
  });

  try {
    const audit = await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.1,
      maxTokens: 450,
      label: `${label} AI AUDITOR`
    });

    const parsed = parseAuditorJson(audit.result);

    if (!parsed || typeof parsed.passed !== "boolean" || !Array.isArray(parsed.violations)) {
      console.error("[AI AUDITOR] Invalid auditor response. Failing open.");
      return {
        available: false,
        passed: true,
        violations: [],
        raw: audit.result
      };
    }

    const violations = parsed.violations
      .filter(item => item && typeof item.text === "string" && typeof item.reason === "string")
      .slice(0, 12)
      .map(item => ({
        text: item.text.trim(),
        reason: item.reason.trim()
      }))
      .filter(item => item.text && item.reason);

    console.log(`[AI AUDITOR] Passed: ${parsed.passed}`);
    console.log(`[AI AUDITOR] Violations: ${violations.length}`);

    return {
      available: true,
      passed: parsed.passed && violations.length === 0,
      violations,
      raw: parsed
    };
  } catch (error) {
    console.error("[AI AUDITOR] Failed. Failing open:", error.message);
    return {
      available: false,
      passed: true,
      violations: [],
      error: error.message
    };
  }
}

function buildRepairPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  violations
}) {
  const violationBlock = violations
    .map((item, index) => `${index + 1}. Фрагмент: «${item.text}»\nПричина: ${item.reason}${item.support ? `\nОпора: ${item.support}` : ""}`)
    .join("\n\n");

  return `
Ты — финальный редактор сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

Твоя задача — исправить готовый контент после строгой факт-проверки.

====================
ИСХОДНЫЕ ДАННЫЕ КЛИЕНТА
====================
Формат: ${contentType}
Бизнес: ${businessInfo}
Целевая аудитория: ${targetAudience}
Цель: ${contentGoal}
Тема: ${reelsTopic || "не задана отдельно"}
Стиль: ${contentStyle}

====================
НАЙДЕННЫЕ НАРУШЕНИЯ
====================
${violationBlock}

====================
ИСХОДНЫЙ КОНТЕНТ
====================
${generatedContent}

====================
ПРАВИЛА ИСПРАВЛЕНИЯ
====================

1. Исправь каждое перечисленное нарушение.
2. НЕ ДОБАВЛЯЙ НИКАКИХ НОВЫХ ФАКТОВ.
3. Во время исправления нельзя придумывать замену неподтверждённой детали.
4. Если факт не подтверждён — удали его или подними уровень абстракции.
5. Если конкретный сценарий зависит от существования объекта/события, переведи его в условную рекомендацию: «если у вас есть...», «можно...», «например...», «представьте...». Не утверждай существование этого объекта или события.
6. Если число не подтверждено — удали число. Не заменяй его другим числом.
7. Если личная история не подтверждена — не создавай новую историю. Переведи идею в универсальный разбор или условный сценарий.
8. Если процесс работы не описан клиентом — не придумывай этапы, консультации, анализ, правки, созвоны, оборудование и технологии.
9. Если есть неподтверждённое свойство или результат — убери его, а не заменяй другим свойством или результатом.
10. Не используй от первого лица «я/мы/у нас/мой/наша» для неподтверждённого опыта, процесса или факта.
11. Сохрани полезность, конкретность, структуру, формат и стиль настолько, насколько это возможно без выдуманных фактов.
12. Метафоры, юмор, сравнения, гиперболы и эмоциональные формулировки сохраняй, если они не создают конкретный новый факт.
13. Универсальные приёмы съёмки и монтажа можно сохранять.
14. Обычные CTA можно сохранять, если они ничего не обещают и не утверждают неподтверждённый ресурс.
15. Не объясняй, что именно ты исправил.
16. Верни только готовый исправленный контент.

====================
ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ОТВЕТОМ
====================

Перед выдачей текста самостоятельно проверь каждое предложение:
- Есть ли у конкретного факта прямая опора во входных данных?
- Если числа нет во входных данных — удалено ли оно?
- Не появилась ли новая история, кейс, клиент, комментарий, отзыв или результат?
- Не появился ли новый процесс работы, объект, оборудование или технология?
- Не утверждается ли как существующее то, что было лишь идеей для съёмки?
- Если опоры нет — заменена ли фраза на абстрактную или условную?

Если сомневаешься, выбирай более абстрактную формулировку.
`;
}

async function repairGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  violations,
  label
}) {
  const prompt = buildRepairPrompt({
    contentType,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic,
    contentStyle,
    generatedContent,
    violations
  });

  return generateWithGigaChat({
    token,
    prompt,
    temperature: 0.15,
    maxTokens: 900,
    label: `${label} REPAIR`
  });
}

async function postFilterGeneratedContent({
  token,
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent,
  label
}) {
  console.log(`[${label}] Starting AI fact audit...`);

  const firstAudit = await auditGeneratedContent({
    token,
    contentType,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic,
    contentStyle,
    generatedContent,
    label
  });

  if (!firstAudit.available || firstAudit.passed) {
    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null
    };
  }

  console.log(`[${label}] Violations detected. Starting one repair pass...`);

  try {
    const repaired = await repairGeneratedContent({
      token,
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent,
      violations: firstAudit.violations,
      label
    });

    const secondAudit = await auditGeneratedContent({
      token,
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent: repaired.result,
      label: `${label} SECOND`
    });

    if (secondAudit.available && !secondAudit.passed) {
      console.warn(`[${label}] Second audit still found violations. Returning repaired version without another loop.`);
    }

    return {
      result: repaired.result,
      audit: firstAudit,
      repaired: true,
      secondAudit
    };
  } catch (error) {
    console.error(`[${label}] Repair failed. Returning original content:`, error.message);

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      secondAudit: null,
      repair_error: error.message
    };
  }
}

function validatePlanData({ bridge_key, business_info, target_audience, content_goal, content_style }) {
  if (!bridge_key) return "bridge_key is required";
  if (!BRIDGE_KEY) return "BRIDGE_KEY is not configured";
  if (bridge_key !== BRIDGE_KEY) return "Invalid bridge_key";
  if (!business_info) return "business_info is required";
  if (!target_audience) return "target_audience is required";
  if (!content_goal) return "content_goal is required";
  if (!content_style) return "content_style is required";
  return null;
}

async function generatePlanChunk({ startDay, endDay, businessInfo, targetAudience, contentGoal, contentStyle, previousPlan, label }) {
  const token = await getAccessToken();
  const prompt = buildPlanChunkPrompt({
    startDay,
    endDay,
    businessInfo,
    targetAudience,
    contentGoal,
    contentStyle,
    previousPlan
  });

  const generated = await generateWithGigaChat({
    token,
    prompt,
    temperature: 0.35,
    maxTokens: 550,
    label
  });

  const filtered = await postFilterGeneratedContent({
    token,
    contentType: `Контент-план, дни ${startDay}-${endDay}`,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic: "",
    contentStyle,
    generatedContent: generated.result,
    label
  });

  return {
    ...generated,
    result: filtered.result,
    audit: filtered.audit,
    repaired: filtered.repaired,
    secondAudit: filtered.secondAudit
  };
}

async function handlePlanChunk(req, res, startDay, endDay) {
  const startedAt = Date.now();

  console.log("");
  console.log("====================================");
  console.log(`PLAN CHUNK REQUEST: ${startDay}-${endDay}`);
  console.log("====================================");

  if (generationInProgress) {
    return res.status(429).json({
      ok: false,
      error: "Generation already in progress. Please try again later."
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

  const validationError = validatePlanData({
    bridge_key,
    business_info,
    target_audience,
    content_goal,
    content_style
  });

  if (validationError) {
    const status = validationError === "Invalid bridge_key" || validationError === "bridge_key is required" ? 401 : 400;
    return res.status(status).json({ ok: false, error: validationError });
  }

  const safePreviousPlan = String(previous_plan || "").slice(-18000);
  generationInProgress = true;

  try {
    const result = await generatePlanChunk({
      startDay,
      endDay,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal,
      contentStyle: content_style,
      previousPlan: safePreviousPlan,
      label: `PLAN DAYS ${startDay}-${endDay}`
    });

    return res.json({
      ok: true,
      start_day: startDay,
      end_day: endDay,
      model: GIGACHAT_MODEL,
      status: result.status,
      time_ms: Date.now() - startedAt,
      result_length: result.result.length,
      post_filter: {
        auditor_available: result.audit?.available || false,
        triggered: !(result.audit?.passed ?? true),
        repaired: result.repaired || false,
        warnings: result.audit?.violations?.length || 0,
        second_audit_passed: result.secondAudit?.passed ?? null
      },
      reels_result: result.result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      start_day: startDay,
      end_day: endDay,
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: Date.now() - startedAt
    });
  } finally {
    generationInProgress = false;
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    model: GIGACHAT_MODEL,
    gigachat_key_configured: !!GIGACHAT_KEY,
    bridge_key_configured: !!BRIDGE_KEY,
    generation_in_progress: generationInProgress
  });
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    message: "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",
    endpoints: {
      health: "/health",
      test_auth: "/test-auth",
      test_generate: "/test-generate",
      test_plan_1_5: "/test-plan-1-5",
      generate: "POST /generate",
      plan_1_5: "POST /generate-plan-1-5",
      plan_6_10: "POST /generate-plan-6-10",
      plan_11_15: "POST /generate-plan-11-15",
      plan_16_20: "POST /generate-plan-16-20",
      plan_21_25: "POST /generate-plan-21-25",
      plan_26_30: "POST /generate-plan-26-30"
    }
  });
});

app.get("/test-auth", async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ ok: true, stage: "auth", token_received: !!token });
  } catch (error) {
    console.error("AUTH ERROR:", error.message);
    res.status(500).json({ ok: false, stage: "auth", error: error.message });
  }
});

app.get("/test-generate", async (req, res) => {
  const startedAt = Date.now();
  try {
    const token = await getAccessToken();
    const response = await axios.post(
      CHAT_URL,
      {
        model: GIGACHAT_MODEL,
        messages: [{ role: "user", content: "Ответь одним словом: Да" }],
        temperature: 0.2,
        max_tokens: 10
      },
      {
        httpsAgent,
        timeout: 9000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = response.data?.choices?.[0]?.message?.content || "";
    res.json({
      ok: true,
      stage: "generation",
      status: response.status,
      time_ms: Date.now() - startedAt,
      response: response.data,
      reels_result: result
    });
  } catch (error) {
    console.error("TEST GENERATE ERROR:", error.message);
    res.status(500).json({
      ok: false,
      stage: "generation",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: Date.now() - startedAt
    });
  }
});

app.get("/test-plan-1-5", async (req, res) => {
  const startedAt = Date.now();

  if (generationInProgress) {
    return res.status(429).json({ ok: false, test: "plan-1-5", error: "Generation already in progress" });
  }

  generationInProgress = true;

  try {
    const result = await generatePlanChunk({
      startDay: 1,
      endDay: 5,
      businessInfo: "эксперт или предприниматель, который продаёт свои услуги или продукты",
      targetAudience: "потенциальные клиенты этого бизнеса",
      contentGoal: "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",
      contentStyle: "легко, уверенно, современно",
      previousPlan: "",
      label: "TEST PLAN 1-5"
    });

    res.json({
      ok: true,
      test: "plan-1-5",
      status: result.status,
      time_ms: Date.now() - startedAt,
      result_length: result.result.length,
      model: GIGACHAT_MODEL,
      reels_result: result.result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      test: "plan-1-5",
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: Date.now() - startedAt
    });
  } finally {
    generationInProgress = false;
  }
});

app.post("/generate-plan-1-5", (req, res) => handlePlanChunk(req, res, 1, 5));
app.post("/generate-plan-6-10", (req, res) => handlePlanChunk(req, res, 6, 10));
app.post("/generate-plan-11-15", (req, res) => handlePlanChunk(req, res, 11, 15));
app.post("/generate-plan-16-20", (req, res) => handlePlanChunk(req, res, 16, 20));
app.post("/generate-plan-21-25", (req, res) => handlePlanChunk(req, res, 21, 25));
app.post("/generate-plan-26-30", (req, res) => handlePlanChunk(req, res, 26, 30));

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();
  console.log("");
  console.log("====================================");
  console.log("GENERATE REQUEST RECEIVED");
  console.log("====================================");

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

    console.log("Content-Type:", content_type);
    console.log("Body keys:", Object.keys(req.body || {}));

    if (!bridge_key) return res.status(401).json({ ok: false, error: "bridge_key is required" });
    if (!BRIDGE_KEY) return res.status(500).json({ ok: false, error: "BRIDGE_KEY is not configured" });
    if (bridge_key !== BRIDGE_KEY) return res.status(401).json({ ok: false, error: "Invalid bridge_key" });
    if (!content_type) return res.status(400).json({ ok: false, error: "content_type is required" });
    if (!business_info) return res.status(400).json({ ok: false, error: "business_info is required" });
    if (!target_audience) return res.status(400).json({ ok: false, error: "target_audience is required" });
    if (!content_goal) return res.status(400).json({ ok: false, error: "content_goal is required" });
    if (!content_style) return res.status(400).json({ ok: false, error: "content_style is required" });

    if (isContentPlan(content_type)) {
      return res.status(400).json({
        ok: false,
        error: "Для контент-плана используй отдельные endpoints: /generate-plan-1-5, /generate-plan-6-10, /generate-plan-11-15, /generate-plan-16-20, /generate-plan-21-25, /generate-plan-26-30"
      });
    }

    if (!reels_topic) return res.status(400).json({ ok: false, error: "reels_topic is required" });

    const token = await getAccessToken();
    const prompt = buildPrompt({
      contentType: content_type,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal,
      reelsTopic: reels_topic,
      contentStyle: content_style
    });

    const result = await generateWithGigaChat({
      token,
      prompt,
      temperature: 0.75,
      maxTokens: 1800,
      label: "NORMAL CONTENT"
    });

    const filtered = await postFilterGeneratedContent({
      token,
      contentType: content_type,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal,
      reelsTopic: reels_topic,
      contentStyle: content_style,
      generatedContent: result.result,
      label: "NORMAL CONTENT"
    });

    return res.json({
      ok: true,
      content_type,
      status: result.status,
      time_ms: Date.now() - startedAt,
      result_length: filtered.result.length,
      post_filter: {
        auditor_available: filtered.audit?.available || false,
        triggered: !(filtered.audit?.passed ?? true),
        repaired: filtered.repaired,
        warnings: filtered.audit?.violations?.length || 0,
        second_audit_passed: filtered.secondAudit?.passed ?? null
      },
      reels_result: filtered.result
    });
  } catch (error) {
    console.error("GENERATE ERROR");
    console.error("Message:", error.message);
    console.error("Status:", error.response?.status);
    console.error("Response:", error.response?.data);

    return res.status(500).json({
      ok: false,
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      time_ms: Date.now() - startedAt
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Endpoint not found", path: req.path, method: req.method });
});

app.use((error, req, res, next) => {
  console.error("GLOBAL ERROR:", error);
  res.status(500).json({ ok: false, error: error.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log("МОЙ КОНТЕНТ-КОНСТРУКТОР");
  console.log("Gateway started");
  console.log("====================================");
  console.log("PORT:", PORT);
  console.log("MODEL:", GIGACHAT_MODEL);
  console.log("GIGACHAT_KEY:", GIGACHAT_KEY ? "configured" : "MISSING");
  console.log("BRIDGE_KEY:", BRIDGE_KEY ? "configured" : "MISSING");
  console.log("PLAN ENDPOINTS:");
  console.log("POST /generate-plan-1-5");
  console.log("POST /generate-plan-6-10");
  console.log("POST /generate-plan-11-15");
  console.log("POST /generate-plan-16-20");
  console.log("POST /generate-plan-21-25");
  console.log("POST /generate-plan-26-30");
  console.log("====================================");
});
