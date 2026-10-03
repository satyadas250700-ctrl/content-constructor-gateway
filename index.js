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
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  if (!GIGACHAT_KEY) {
    throw new Error("GIGACHAT_KEY is not configured");
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

  return (
    type.includes("контент-план") ||
    type.includes("контент план") ||
    type.includes("30 дней") ||
    type.includes("30дней")
  );
}

function getContentInstructions(contentType) {
  const type = String(contentType || "").toLowerCase();

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
- соответствие бизнесу, аудитории, цели и стилю;
- хороший CTA.

Выдай только готовый пост.
`;
  }

  if (
    type.includes("карусель") ||
    type.includes("carousel")
  ) {
    return `
СОЗДАЙ ГОТОВУЮ КАРУСЕЛЬ.

Сделай 7–9 слайдов.

Для каждого:
Слайд N:
Заголовок: ...
Текст: ...

Первый слайд должен цеплять.
Последний должен содержать CTA.

Выдай только готовую карусель.
`;
  }

  return `
Создай качественный готовый контент для предпринимателя или эксперта.

Учитывай:
- бизнес;
- целевую аудиторию;
- цель;
- тему;
- стиль.

Ответ только на русском языке.
`;
}

function buildPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle
}) {
  return `
Ты — профессиональный российский контент-маркетолог, контент-стратег и сценарист.

Ты работаешь внутри сервиса «МОЙ КОНТЕНТ-КОНСТРУКТОР».

ДАННЫЕ КЛИЕНТА:

Формат: ${contentType}

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

ИНСТРУКЦИЯ ПО ФОРМАТУ:

${getContentInstructions(contentType)}

ОБЩИЕ ТРЕБОВАНИЯ:

- Только русский язык.
- Естественный человеческий язык.
- Не используй канцелярит.
- Не объясняй процесс своей работы.
- Не говори, что ты ИИ.
- Не добавляй вступления вроде «Конечно!», «Вот готовый вариант» и т.п.
- Сразу выдавай готовый контент.

КРИТИЧЕСКОЕ ПРАВИЛО ФАКТОВ:

Используй только те реальные сведения о бизнесе, аудитории, продукте, услуге, опыте, цифрах, результатах, событиях, местах, процессах и свойствах, которые прямо присутствуют во входных данных.

НИКОГДА не придумывай реальные факты о клиенте.

Если конкретный факт отсутствует во входных данных, считай его неподтверждённым.

Нельзя самостоятельно придумывать:

- историю бизнеса;
- историю клиента;
- историю владельца;
- количество клиентов;
- отзывы;
- кейсы;
- результаты;
- цифры;
- проценты;
- цены;
- скидки;
- сроки;
- даты;
- адреса;
- названия мест;
- сотрудников;
- партнёров;
- оборудование;
- помещения;
- мебель;
- интерьер;
- упаковку;
- блюда;
- ингредиенты;
- товары;
- дополнительные услуги;
- технологии;
- процессы;
- гарантии;
- обещания;
- характеристики продукта;
- свойства продукта;
- научные;
- медицинские;
- профессиональные;
- технические утверждения.

ВАЖНО:

Не делай логических выводов, если они не указаны во входных данных.

Например:

Если указано:
«Продаёт кофе и десерты»

нельзя автоматически утверждать:

«кофе отлично сочетается с десертом»,
«люди приходят сюда за атмосферой»,
«десерт увеличивает средний чек»,
«гости любят сидеть здесь»,
«кофе покупают утром»,
«десерты свежие»,
«кофе ароматный»,
«продукты качественные».

Это всё неподтверждённые факты.

НЕПОДТВЕРЖДЁННЫЕ СВОЙСТВА:

Не приписывай объектам свойства, которых нет во входных данных.

Например нельзя без подтверждения использовать:

горячий,
холодный,
свежий,
ароматный,
насыщенный,
мягкий,
нежный,
сливочный,
воздушный,
хрустящий,
тающий,
тягучий,
глянцевый,
дымящийся,
свежеобжаренный,
натуральный,
полезный,
премиальный,
уникальный,
эксклюзивный,
лучший.

Но творческий язык разрешён.

РАЗРЕШЕНЫ:

- метафоры;
- сравнения;
- гиперболы;
- художественные образы;
- юмор;
- ирония;
- игра слов;
- эмоциональные формулировки;
- абстрактные образы;
- драматургия;
- контрасты;
- художественные концепции;
- выражения вроде «антидепрессант дня», если они очевидно являются метафорой, а не заявлением о медицинском свойстве продукта.

Например:

«Этот пост — антидепрессант для вашего контента»

можно использовать как метафору.

Но нельзя превращать метафору в неподтверждённое фактическое утверждение.

СЦЕНАРИИ И СЪЁМКА:

Если предлагаешь визуальную идею, не придумывай реальные предметы.

Можно использовать:

- текст на экране;
- крупные планы уже подтверждённого продукта;
- монтаж;
- графику;
- типографику;
- переходы;
- голос за кадром;
- абстрактные визуальные приёмы;
- съёмку объекта, который прямо подтверждён входными данными.

Если объект не подтверждён, не создавай его специально.

Фраза «можно снять» НЕ разрешает придумывать предмет.

Если конкретики недостаточно — повышай уровень абстракции.

Например вместо:
«Снимите, как сотрудник ставит стакан кофе на деревянный стол»

лучше:
«Покажите продукт крупным планом и добавьте поверх него короткую фразу».

Нельзя придумывать сотрудника, стол или стакан, если они не указаны.

КОНТЕНТ ДОЛЖЕН БЫТЬ ПРИЗЕМЛЁННЫМ:

Каждый день должен иметь конкретную смысловую опору в данных клиента.

Не делай абстрактный контент, который можно было бы одинаково дать любому бизнесу.

Но если конкретной информации недостаточно, не компенсируй её выдуманными фактами.

Вместо этого используй:

- экспертное объяснение;
- вопрос аудитории;
- разбор проблемы;
- образовательный контент;
- мнение;
- метафору;
- контраст;
- универсальную структуру;
- визуальную типографику;
- монтаж;
- голос за кадром.

CTA:

CTA должен быть безопасным.

Не обещай:

- чек-лист;
- подарок;
- скидку;
- расчёт;
- консультацию;
- бесплатный материал;
- вторую часть;
- результат;

если такое действие или предложение не подтверждено входными данными.

Не создавай фальшивые обещания ради повышения конверсии.

ПЕРЕД ОТВЕТОМ ПРОВЕРЬ:

1. Есть ли у каждого конкретного факта опора на входные данные?
2. Не придумал ли ты историю?
3. Не придумал ли ты клиента?
4. Не придумал ли ты результат?
5. Не придумал ли ты цену?
6. Не придумал ли ты скидку?
7. Не придумал ли ты цифру?
8. Не придумал ли ты объект?
9. Не придумал ли ты процесс?
10. Не придумал ли ты свойство продукта?
11. Не придумал ли ты место?
12. Не придумал ли ты оборудование?
13. Не придумал ли ты технологию?
14. Не придумал ли ты отзыв?
15. Не придумал ли ты обещание?
16. Не превратил ли ты логический вывод в факт?

Если информации недостаточно — не выдумывай.

Творчество разрешено.
Факты — только подтверждённые.

Выдай только готовый контент.
`;
}

async function generateWithGigaChat({
  token,
  systemPrompt,
  userPrompt,
  temperature = 0.75,
  maxTokens = 1800,
  label = "GIGACHAT"
}) {
  const startedAt = Date.now();

  const response = await axios.post(
    CHAT_URL,
    {
      model: GIGACHAT_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
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

  const result =
    response.data?.choices?.[0]?.message?.content ||
    response.data?.choices?.[0]?.text ||
    "";

  console.log(
    `[${label}] GigaChat status=${response.status} time=${Date.now() - startedAt}ms length=${result.length}`
  );

  if (!result) {
    throw new Error("GigaChat returned empty response");
  }

  return {
    result: result.trim(),
    status: response.status,
    time_ms: Date.now() - startedAt
  };
}

function extractJson(text) {
  if (!text) return null;

  let cleaned = String(text).trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(
          cleaned.slice(firstBrace, lastBrace + 1)
        );
      } catch (nestedError) {
        return null;
      }
    }

    return null;
  }
}

function buildAuditorPrompt({
  contentType,
  businessInfo,
  targetAudience,
  contentGoal,
  reelsTopic,
  contentStyle,
  generatedContent
}) {
  return `
Ты — строгий AI-аудитор фактической достоверности контента.

Твоя задача — проверить готовый контент на наличие УТВЕРЖДЕНИЙ, которые не имеют прямой опоры на исходные данные клиента.

ВАЖНО:

Ты не проверяешь, нравится ли тебе текст.

Ты не оцениваешь стиль.

Ты не оцениваешь маркетинговую эффективность.

Ты проверяешь только фактическую опору.

ИСХОДНЫЕ ДАННЫЕ:

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель:
${contentGoal}

Тема:
${reelsTopic || ""}

Стиль:
${contentStyle}

СГЕНЕРИРОВАННЫЙ КОНТЕНТ:

${generatedContent}

ГЛАВНЫЙ ПРИНЦИП:

НЕТ ПРЯМОЙ ОПОРЫ В ИСХОДНЫХ ДАННЫХ → ЗНАЧИТ ЭТО НЕПОДТВЕРЖДЁННЫЙ ФАКТ.

Для каждого конкретного утверждения мысленно задай вопрос:

«Какой конкретный фрагмент исходных данных клиента подтверждает это утверждение?»

Если такого фрагмента нет — это нарушение.

ОСОБО СТРОГО ПРОВЕРЯЙ:

1. Придуманные истории бизнеса.
2. Придуманные личные истории владельца.
3. Придуманные истории клиентов.
4. Придуманные отзывы.
5. Придуманные кейсы.
6. Придуманные результаты.
7. Придуманные достижения.
8. Придуманные цифры.
9. Придуманные проценты.
10. Придуманные цены.
11. Придуманные скидки.
12. Придуманные сроки.
13. Придуманные даты.
14. Придуманные места.
15. Придуманных людей.
16. Придуманные предметы.
17. Придуманные продукты.
18. Придуманные блюда.
19. Придуманное оборудование.
20. Придуманные процессы.
21. Придуманные технологии.
22. Придуманные свойства.
23. Придуманные характеристики.
24. Придуманные гарантии.
25. Придуманные обещания.
26. Придуманные результаты для клиента.
27. Утверждения от первого лица, если соответствующий опыт не указан.
28. Утверждения о событиях, которые якобы уже произошли.
29. Логические выводы, которые выданы как установленные факты.
30. Любые конкретные числовые данные, которых нет во входных данных.

О ЧИСЛАХ:

Любое конкретное число считается нарушением, если оно не подтверждено входными данными.

ИСКЛЮЧЕНИЕ:

Номера дней, слайдов и структурных элементов могут использоваться как элементы формата.

НАПРИМЕР:

Если во входных данных нет:

«10 клиентов»

а в тексте написано:

«10 клиентов уже получили результат»

это нарушение.

Если во входных данных нет:

«скидка 20%»

а в тексте написано:

«скидка 20%»

это нарушение.

Если во входных данных нет:

«работаем 5 лет»

а в тексте написано:

«5 лет опыта»

это нарушение.

ЛОГИЧЕСКИЕ ВЫВОДЫ:

Не считай факт подтверждённым только потому, что он кажется логичным.

Например:

«Продаёт кофе и десерты»

НЕ подтверждает:

«кофе отлично сочетается с десертом».

НЕ подтверждает:

«клиенты приходят за атмосферой».

НЕ подтверждает:

«десерты увеличивают средний чек».

НЕ подтверждает:

«люди покупают кофе утром».

НЕ подтверждает:

«кофе ароматный».

НЕ подтверждает:

«десерты свежие».

НЕ подтверждает:

«продукт качественный».

КРЕАТИВ:

Не считай нарушением очевидные метафоры, художественные сравнения, юмор, гиперболу, иронию и образные выражения, если они не подаются как проверяемый факт.

Например:

«антидепрессант дня»

само по себе не нарушение, если это очевидная метафора.

Но если текст утверждает:

«наш продукт лечит депрессию»

это нарушение, если такое свойство не подтверждено.

СЪЁМКА:

Условные рекомендации по съёмке могут быть допустимы.

Например:

«Можно показать текст крупным планом».

Но если рекомендация утверждает наличие конкретного объекта:

«Сотрудник ставит стакан на деревянный стол»

нужно проверить, подтверждены ли сотрудник, стакан и стол.

ЕСЛИ ИНФОРМАЦИИ НЕДОСТАТОЧНО:

Это не повод считать текст хорошим автоматически.

Если конкретное утверждение невозможно подтвердить — зафиксируй нарушение.

Но не считай нарушением сам факт использования абстрактной формулировки, метафоры или универсального визуального приёма.

CTA:

CTA допустим, если он не обещает неподтверждённый ресурс, подарок, скидку, консультацию, результат или другое действие.

ПРИМЕРЫ НАРУШЕНИЙ:

«Наш клиент увеличил продажи на 40%».

Если 40% и клиент не указаны во входных данных → нарушение.

«Мы работаем с 2018 года».

Если дата не указана → нарушение.

«В нашем офисе».

Если офис не указан → нарушение.

«Наш специалист проведёт бесплатную консультацию».

Если специалист и консультация не указаны → нарушение.

«Сохраните пост».

Это само по себе не нарушение.

«Напишите + в комментариях».

Это само по себе не нарушение.

«Мысль, которая может изменить ваш подход».

Это не конкретный проверяемый факт и само по себе не нарушение.

ФОРМАТ ОТВЕТА:

Верни ТОЛЬКО JSON.

Структура:

{
  "passed": true,
  "violations": []
}

или:

{
  "passed": false,
  "violations": [
    {
      "text": "точный фрагмент нарушения",
      "reason": "почему это неподтверждённый факт",
      "support": "какого подтверждения не хватает или какой фрагмент входных данных должен был бы это подтверждать"
    }
  ]
}

ВАЖНО:

- Не возвращай passed=true при наличии violations.
- Не добавляй нарушения ради придирки к стилю.
- Не считай метафоры фактическими нарушениями.
- Не считай юмор фактическим нарушением.
- Не считай гиперболу фактическим нарушением, если она очевидно художественная.
- Не требуй буквального совпадения слов: учитывай смысл и перефразирование.
- Максимум 15 нарушений.
- Если нарушений нет — violations должен быть [].
`;
}

function parseAuditorJson(text) {
  return extractJson(text);
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
  label = "AUDIT"
}) {
  try {
    const prompt = buildAuditorPrompt({
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent
    });

    const audit = await generateWithGigaChat({
      token,
      systemPrompt:
        "Ты строгий аудитор фактической достоверности. Возвращай только JSON без markdown.",
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 450,
      label: `${label} AI AUDITOR`
    });

    const parsed = parseAuditorJson(audit.result);

    if (
      !parsed ||
      typeof parsed.passed !== "boolean" ||
      !Array.isArray(parsed.violations)
    ) {
      console.error(
        "[AI AUDITOR] Invalid auditor response. Failing open."
      );

      return {
        available: false,
        passed: true,
        violations: [],
        raw: audit.result,
        error: "Invalid auditor JSON response"
      };
    }

    const violations = parsed.violations
      .filter(
        item =>
          item &&
          typeof item.text === "string" &&
          typeof item.reason === "string"
      )
      .slice(0, 12)
      .map(item => ({
        text: item.text.trim(),
        reason: item.reason.trim(),
        support:
          typeof item.support === "string"
            ? item.support.trim()
            : ""
      }))
      .filter(item => item.text && item.reason);

    console.log(
      `[AI AUDITOR] Passed: ${parsed.passed}`
    );

    console.log(
      `[AI AUDITOR] Violations: ${violations.length}`
    );

    return {
      available: true,
      passed:
        parsed.passed &&
        violations.length === 0,
      violations,
      raw: parsed
    };
  } catch (error) {
    console.error(
      "[AI AUDITOR] Error:",
      error.response?.data || error.message
    );

    return {
      available: false,
      passed: true,
      violations: [],
      raw: null,
      error:
        error.response?.data ||
        error.message ||
        "Unknown auditor error"
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
  const violationsText = violations
    .map(
      (item, index) => `
НАРУШЕНИЕ ${index + 1}:
Фрагмент:
${item.text}

Причина:
${item.reason}

Опора / чего не хватает:
${item.support || "Прямой подтверждающей опоры во входных данных нет."}
`
    )
    .join("\n");

  return `
Ты — редактор контента.

Твоя задача — исправить готовый текст после строгого аудита фактической достоверности.

ДАННЫЕ КЛИЕНТА:

Формат:
${contentType}

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель:
${contentGoal}

Тема:
${reelsTopic || ""}

Стиль:
${contentStyle}

ИСХОДНЫЙ КОНТЕНТ:

${generatedContent}

АУДИТОР НАШЁЛ:

${violationsText}

ГЛАВНАЯ ЗАДАЧА:

Исправь только фактические нарушения.

НЕ ПРИДУМЫВАЙ НОВЫЕ ФАКТЫ.

Если конкретная деталь не подтверждена:

1. Удали её;
или
2. Сделай формулировку более абстрактной;
или
3. Преврати её в условную рекомендацию/вариант, если это уместно.

НЕЛЬЗЯ:

- придумывать новые цифры;
- придумывать цены;
- придумывать скидки;
- придумывать даты;
- придумывать истории;
- придумывать клиентов;
- придумывать отзывы;
- придумывать результаты;
- придумывать сотрудников;
- придумывать предметы;
- придумывать оборудование;
- придумывать помещения;
- придумывать процессы;
- придумывать технологии;
- придумывать свойства продукта;
- придумывать гарантии;
- придумывать обещания;
- добавлять неподтверждённые факты от первого лица.

ВАЖНО:

Сохрани:

- смысл;
- маркетинговую задачу;
- структуру;
- динамику;
- сильные формулировки;
- метафоры;
- юмор;
- гиперболу;
- эмоциональность;
- художественные образы.

Не делай текст сухим только ради фактической точности.

Например метафору «антидепрессант дня» можно сохранить, если она является очевидным образным выражением.

CTA можно сохранить, если он безопасен и не обещает неподтверждённый ресурс или результат.

Если визуальный сценарий содержит неподтверждённый объект — не заменяй его другим придуманным объектом.

Лучше использовать:

- текст на экране;
- графику;
- монтаж;
- типографику;
- голос за кадром;
- уже подтверждённый объект;
- абстрактный визуальный приём.

Выдай ТОЛЬКО исправленный готовый контент.

Не объясняй, что ты исправил.
Не добавляй комментарии редактора.
`;
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
  label = "POST FILTER"
}) {
  const firstAudit = await auditGeneratedContent({
    token,
    contentType,
    businessInfo,
    targetAudience,
    contentGoal,
    reelsTopic,
    contentStyle,
    generatedContent,
    label: `${label} FIRST`
  });

  if (!firstAudit.available) {
    console.warn(
      "[POST FILTER] Auditor unavailable. Returning original content."
    );

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      repair_error: null,
      secondAudit: null
    };
  }

  if (firstAudit.passed) {
    console.log(
      "[POST FILTER] First audit passed. No repair needed."
    );

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      repair_error: null,
      secondAudit: null
    };
  }

  console.log(
    `[POST FILTER] Repair triggered. Violations: ${firstAudit.violations.length}`
  );

  try {
    const repairPrompt = buildRepairPrompt({
      contentType,
      businessInfo,
      targetAudience,
      contentGoal,
      reelsTopic,
      contentStyle,
      generatedContent,
      violations: firstAudit.violations
    });

    const repaired = await generateWithGigaChat({
      token,
      systemPrompt:
        "Ты редактор фактической достоверности. Исправляй текст без добавления новых фактов.",
      userPrompt: repairPrompt,
      temperature: 0.15,
      maxTokens: 1800,
      label: `${label} REPAIR`
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

    if (!secondAudit.available) {
      console.warn(
        "[POST FILTER] Second audit unavailable. Returning repaired content."
      );

      return {
        result: repaired.result,
        audit: firstAudit,
        repaired: true,
        repair_error: null,
        secondAudit
      };
    }

    if (!secondAudit.passed) {
      console.warn(
        `[POST FILTER] Second audit still found ${secondAudit.violations.length} violations.`
      );
    } else {
      console.log(
        "[POST FILTER] Second audit passed."
      );
    }

    return {
      result: repaired.result,
      audit: firstAudit,
      repaired: true,
      repair_error: null,
      secondAudit
    };
  } catch (error) {
    console.error(
      "[POST FILTER] Repair error:",
      error.response?.data || error.message
    );

    return {
      result: generatedContent,
      audit: firstAudit,
      repaired: false,
      repair_error:
        error.response?.data ||
        error.message ||
        "Unknown repair error",
      secondAudit: null
    };
  }
}

function buildPlanPrompt({
  startDay,
  endDay,
  businessInfo,
  targetAudience,
  contentGoal,
  contentStyle,
  previousPlan
}) {
  return `
Ты — профессиональный контент-стратег и редактор.

Твоя задача — создать часть контент-плана для предпринимателя или эксперта.

Нужно создать дни ${startDay}–${endDay}.

ДАННЫЕ КЛИЕНТА:

Бизнес:
${businessInfo}

Целевая аудитория:
${targetAudience}

Цель:
${contentGoal}

Стиль:
${contentStyle}

ПРЕДЫДУЩАЯ ЧАСТЬ ПЛАНА:

${previousPlan || "Нет предыдущей части."}

ЗАДАЧА:

Создай следующие дни контент-плана.

Для каждого дня укажи:

День N — Формат

Тема:
...

Идея:
...

Задача:
...

CTA:
...

Используй разные форматы:

- Reels
- Пост
- Карусель
- Telegram-пост

Не повторяй одну и ту же идею механически.

ВАЖНО:

Каждый день должен иметь конкретную смысловую опору в данных клиента.

Но НЕ ПРИДУМЫВАЙ факты.

Нельзя придумывать:

- истории бизнеса;
- личные истории;
- клиентов;
- отзывы;
- кейсы;
- результаты;
- цифры;
- цены;
- скидки;
- даты;
- места;
- сотрудников;
- оборудование;
- предметы;
- продукты;
- блюда;
- ингредиенты;
- процессы;
- технологии;
- свойства;
- характеристики;
- гарантии;
- обещания.

Не делай логические выводы фактом.

Если информации недостаточно, используй:

- экспертное объяснение;
- разбор проблемы;
- мнение;
- вопрос аудитории;
- метафору;
- контраст;
- образовательный контент;
- универсальные визуальные приёмы;
- текст на экране;
- графику;
- монтаж;
- голос за кадром.

Не создавай несуществующие предметы ради сценария.

Творческие метафоры, юмор, гипербола и образный язык разрешены.

Например выражение «антидепрессант дня» может использоваться как метафора.

CTA не должен обещать неподтверждённый подарок, чек-лист, консультацию, скидку, расчёт или результат.

ПЕРЕД ОТВЕТОМ:

Проверь каждый день на наличие неподтверждённых фактов.

Если факт нельзя подтвердить входными данными — убери его или сделай формулировку абстрактной.

Выдай только дни ${startDay}–${endDay}.
`;
}

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
  const token = await getAccessToken();

  const prompt = buildPlanPrompt({
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
    systemPrompt:
      "Ты профессиональный контент-стратег. Создавай качественный контент-план строго по исходным данным клиента.",
    userPrompt: prompt,
    temperature: 0.35,
    maxTokens: 550,
    label: label || `PLAN ${startDay}-${endDay}`
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
    label: label || `PLAN ${startDay}-${endDay} FILTER`
  });

  return {
    status: generated.status,
    time_ms: generated.time_ms,
    result: filtered.result,
    generated_result: generated.result,
    audit: filtered.audit,
    repaired: filtered.repaired,
    repair_error: filtered.repair_error,
    secondAudit: filtered.secondAudit
  };
}

async function handlePlanChunk({
  req,
  res,
  startDay,
  endDay,
  previousVariable,
  outputVariable
}) {
  const startedAt = Date.now();

  if (generationInProgress) {
    return res.status(429).json({
      ok: false,
      error: "Generation already in progress"
    });
  }

  generationInProgress = true;

  try {
    const {
      bridge_key,
      business_info,
      target_audience,
      content_goal,
      content_style,
      previous_plan
    } = req.body || {};

    if (!bridge_key || bridge_key !== BRIDGE_KEY) {
      return res.status(403).json({
        ok: false,
        error: "Invalid bridge_key"
      });
    }

    if (!business_info || !target_audience) {
      return res.status(400).json({
        ok: false,
        error: "business_info and target_audience are required"
      });
    }

    const result = await generatePlanChunk({
      startDay,
      endDay,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal || "",
      contentStyle: content_style || "",
      previousPlan: previous_plan || "",
      label: `PLAN ${startDay}-${endDay}`
    });

    return res.json({
      ok: true,
      status: result.status,
      start_day: startDay,
      end_day: endDay,
      output_variable: outputVariable,
      time_ms: Date.now() - startedAt,
      result_length: result.result.length,
      post_filter: {
        auditor_available: result.audit?.available || false,
        first_audit_passed: result.audit?.passed ?? null,
        triggered: !(result.audit?.passed ?? true),
        repaired: result.repaired || false,
        warnings: result.audit?.violations?.length || 0,
        second_audit_passed:
          result.secondAudit?.passed ?? null
      },
      reels_result: result.result
    });
  } catch (error) {
    console.error(
      `[PLAN ${startDay}-${endDay}] ERROR:`,
      error.response?.data || error.message
    );

    return res.status(500).json({
      ok: false,
      start_day: startDay,
      end_day: endDay,
      error:
        error.response?.data ||
        error.message ||
        "Unknown error"
    });
  } finally {
    generationInProgress = false;
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "МОЙ КОНТЕНТ-КОНСТРУКТОР gateway is running",
    model: GIGACHAT_MODEL,
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "content-constructor-gateway",
    model: GIGACHAT_MODEL,
    time: new Date().toISOString()
  });
});

app.get("/test-auth", async (req, res) => {
  try {
    const startedAt = Date.now();
    const token = await getAccessToken();

    return res.json({
      ok: true,
      token_received: Boolean(token),
      time_ms: Date.now() - startedAt
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        "Auth error"
    });
  }
});

app.get("/test-generate", async (req, res) => {
  try {
    const startedAt = Date.now();

    const token = await getAccessToken();

    const result = await generateWithGigaChat({
      token,
      systemPrompt:
        "Ты полезный ассистент. Отвечай кратко на русском языке.",
      userPrompt:
        "Напиши одну короткую фразу о создании контента.",
      temperature: 0.7,
      maxTokens: 100,
      label: "TEST GENERATE"
    });

    return res.json({
      ok: true,
      status: result.status,
      time_ms: Date.now() - startedAt,
      model: GIGACHAT_MODEL,
      result: result.result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message ||
        "Generate error"
    });
  }
});

app.get("/test-plan-1-5", async (req, res) => {
  const startedAt = Date.now();

  if (generationInProgress) {
    return res.status(429).json({
      ok: false,
      test: "plan-1-5",
      error: "Generation already in progress"
    });
  }

  generationInProgress = true;

  try {
    const result = await generatePlanChunk({
      startDay: 1,
      endDay: 5,
      businessInfo:
        "эксперт или предприниматель, который продаёт свои услуги или продукты",
      targetAudience:
        "потенциальные клиенты этого бизнеса",
      contentGoal:
        "привлечь внимание, показать экспертность, вызвать доверие и привести к покупке",
      contentStyle:
        "легко, уверенно, современно",
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

      post_filter: {
        auditor_available:
          result.audit?.available || false,

        first_audit_passed:
          result.audit?.passed ?? null,

        triggered:
          !(result.audit?.passed ?? true),

        repaired:
          result.repaired || false,

        violations_count:
          result.audit?.violations?.length || 0,

        violations:
          result.audit?.violations || [],

        repair_error:
          result.repair_error || null,

        second_audit_available:
          result.secondAudit?.available ?? null,

        second_audit_passed:
          result.secondAudit?.passed ?? null,

        second_audit_violations_count:
          result.secondAudit?.violations?.length || 0,

        second_audit_violations:
          result.secondAudit?.violations || [],

        first_audit_raw:
          result.audit?.raw || null,

        second_audit_raw:
          result.secondAudit?.raw || null,

        first_audit_error:
          result.audit?.error || null,

        second_audit_error:
          result.secondAudit?.error || null
      },

      reels_result: result.result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      test: "plan-1-5",
      time_ms: Date.now() - startedAt,
      error:
        error.response?.data ||
        error.message ||
        "Unknown error"
    });
  } finally {
    generationInProgress = false;
  }
});

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();

  if (generationInProgress) {
    return res.status(429).json({
      ok: false,
      error: "Generation already in progress"
    });
  }

  generationInProgress = true;

  try {
    const {
      bridge_key,
      content_type,
      business_info,
      target_audience,
      offer,
      content_goal,
      reels_topic,
      content_style
    } = req.body || {};

    console.log(
      "[GENERATE REQUEST RECEIVED]",
      {
        content_type,
        business_info,
        target_audience,
        offer,
        content_goal,
        reels_topic,
        content_style
      }
    );

    if (!bridge_key || bridge_key !== BRIDGE_KEY) {
      return res.status(403).json({
        ok: false,
        error: "Invalid bridge_key"
      });
    }

    if (!content_type) {
      return res.status(400).json({
        ok: false,
        error: "content_type is required"
      });
    }

    if (!business_info) {
      return res.status(400).json({
        ok: false,
        error: "business_info is required"
      });
    }

    if (!target_audience) {
      return res.status(400).json({
        ok: false,
        error: "target_audience is required"
      });
    }

    const token = await getAccessToken();

    const generated = await generateWithGigaChat({
      token,
      systemPrompt:
        "Ты профессиональный российский контент-маркетолог, стратег и сценарист. Создавай только готовый контент по данным клиента. Не придумывай реальные факты.",
      userPrompt: buildPrompt({
        contentType: content_type,
        businessInfo: business_info,
        targetAudience: target_audience,
        contentGoal: content_goal,
        reelsTopic: reels_topic,
        contentStyle: content_style
      }),
      temperature: 0.75,
      maxTokens: 1800,
      label: "NORMAL GENERATE"
    });

    const filtered = await postFilterGeneratedContent({
      token,
      contentType: content_type,
      businessInfo: business_info,
      targetAudience: target_audience,
      contentGoal: content_goal,
      reelsTopic: reels_topic,
      contentStyle: content_style,
      generatedContent: generated.result,
      label: "NORMAL GENERATE FILTER"
    });

    return res.json({
      ok: true,
      status: generated.status,
      time_ms: Date.now() - startedAt,
      result_length: filtered.result.length,
      model: GIGACHAT_MODEL,

      post_filter: {
        auditor_available:
          filtered.audit?.available || false,

        first_audit_passed:
          filtered.audit?.passed ?? null,

        triggered:
          !(filtered.audit?.passed ?? true),

        repaired:
          filtered.repaired || false,

        warnings:
          filtered.audit?.violations?.length || 0,

        second_audit_passed:
          filtered.secondAudit?.passed ?? null
      },

      reels_result: filtered.result
    });
  } catch (error) {
    console.error(
      "[GENERATE ERROR]",
      error.response?.data || error.message
    );

    return res.status(500).json({
      ok: false,
      time_ms: Date.now() - startedAt,
      error:
        error.response?.data ||
        error.message ||
        "Unknown generation error"
    });
  } finally {
    generationInProgress = false;
  }
});

app.post("/generate-plan-1-5", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 1,
    endDay: 5,
    previousVariable: "",
    outputVariable: "plan_1_5"
  });
});

app.post("/generate-plan-6-10", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 6,
    endDay: 10,
    previousVariable: "plan_1_5",
    outputVariable: "plan_6_10"
  });
});

app.post("/generate-plan-11-15", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 11,
    endDay: 15,
    previousVariable: "plan_6_10",
    outputVariable: "plan_11_15"
  });
});

app.post("/generate-plan-16-20", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 16,
    endDay: 20,
    previousVariable: "plan_11_15",
    outputVariable: "plan_16_20"
  });
});

app.post("/generate-plan-21-25", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 21,
    endDay: 25,
    previousVariable: "plan_16_20",
    outputVariable: "plan_21_25"
  });
});

app.post("/generate-plan-26-30", async (req, res) => {
  return handlePlanChunk({
    req,
    res,
    startDay: 26,
    endDay: 30,
    previousVariable: "plan_21_25",
    outputVariable: "plan_26_30"
  });
});

app.listen(PORT, () => {
  console.log(
    `МОЙ КОНТЕНТ-КОНСТРУКТОР gateway listening on port ${PORT}`
  );

  console.log(
    `GigaChat model: ${GIGACHAT_MODEL}`
  );

  console.log(
    `GigaChat chat URL: ${CHAT_URL}`
  );
});
