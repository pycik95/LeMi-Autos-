export type DocumentType = "zb1" | "invoice" | "purchase_invoice";

const ZB1_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. На фото/скане — немецкий регистрационный документ на автомобиль:
это может быть Zulassungsbescheinigung Teil I (техпаспорт, компактный бланк с одним владельцем) ИЛИ
Zulassungsbescheinigung Teil II / Fahrzeugbrief (бланк крупнее, на лицевой стороне — история владельцев в
НЕСКОЛЬКИХ блоках друг за другом, на обороте — технические данные D.1/D.2/E/P.1/P.3 и т.п.). Определи тип сам по виду бланка.

ОСОБО ВАЖНО про поле "Anzahl der Vorhalter" (число прежних владельцев):
— Если на бланке Teil II несколько блоков владельцев (обычно 2, слева направо или сверху вниз по датам),
  у КАЖДОГО блока своё поле "(1) Anzahl der Vorhalter" — это НЕ одно и то же число.
  Тебе нужно значение из ПОСЛЕДНЕГО по времени (самого правого / самого нижнего, с самой поздней датой) блока —
  он отражает актуальное состояние. Не бери число из более раннего блока.
— Если блок владельца всего один — просто возьми число из него.

Прочитай ВСЕ читаемые поля бланка (используй обе стороны, если это Teil II). Верни СТРОГО валидный JSON
без markdown-разметки, без пояснений, только объект вида:

{
  "make": string | null,           // D.1 Hersteller. Если написано "VOLKSWAGEN, VW" — верни только "VOLKSWAGEN"
  "model": string | null,          // D.3 Handelsbezeichnung (если пусто — D.2 Typ)
  "color": string | null,          // R Farbe. Немецкое слово как в бланке (Grau, Blau, Schwarz…)
  "vin": string | null,            // E Fahrzeug-Ident-Nr., 17 символов.
                                   //   ВНИМАНИЕ: различай букву O и цифру 0, букву I и цифру 1, букву Z и цифру 2.
                                   //   В VIN НИКОГДА не бывает букв I, O, Q — если видишь их, это цифры 1, 0, 0.
  "previousPlates": string | null, // A Amtl. Kennzeichen (берётся из последнего по дате блока, если их несколько)
  "firstRegistration": string | null, // B Datum der Erstzulassung des Fahrzeugs — дата ПЕРВОЙ РЕГИСТРАЦИИ САМОЙ
                                   //   МАШИНЫ (одна на весь бланк, не путать с датой конкретного владельческого блока), формат YYYY-MM-DD
  "engineCcm": number | null,      // P.1 Hubraum, см3
  "powerKw": number | null,        // P.2 Nennleistung, кВт
  "fuelType": string | null,       // P.3 Kraftstoffart. Строго одно из:
                                   //   PETROL (Benzin), DIESEL, CNG (Erdgas), LPG (Autogas),
                                   //   ELECTRIC (Elektro), HYBRID, OTHER
  "owners": number | null,         // "(1) Anzahl der Vorhalter" из ПОСЛЕДНЕГО блока владельца (см. выше)
  "emissionClass": string | null,  // 14.1 Schadstoffklasse / Emissionsklasse, напр. "Euro4", "Euro 5"
  "doors": string | null,          // число дверей, если указано
  "seats": number | null,          // S.1 Sitzplätze, если указано
  "zbIiNumber": string | null      // номер справа от маленькой цифры "16" в правом нижнем углу бланка Teil II,
                                   //   либо номер под штрихкодом вида "DN239401"
}

Если поле не читается или отсутствует — верни null. Не додумывай. Даты только YYYY-MM-DD. Числа — без единиц измерения.`;

const INVOICE_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. На фото/скане — счёт (Rechnung): это может быть счёт на покупку автомобиля
(Differenzbesteuerung, §25a UStG) либо счёт за услугу (ремонт, доставка, ТЮФ, регистрация и т.п.).
Извлеки поля и верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект вида:

{
  "invoiceType": string,          // ЧТО это за счёт. Строго одно из:
                                  //   PURCHASE  — счёт на сам автомобиль (Fahrzeugrechnung, позиция "Verkaufspreis",
                                  //               обычно 0% USt по §25a)
                                  //   FEE       — сбор за посредничество (Gebühr Fahrzeugvermittlung,
                                  //               Vermittlungsgebühr), 19% USt
                                  //   BNPL      — комиссия за отсрочку платежа
                                  //               ("Jetzt kaufen, später bezahlen Gebühr"), 19% USt
                                  //   TRANSPORT — доставка/перевозка (Transport, Lieferung, Überführung), 19% USt
                                  //   OTHER     — всё остальное (ремонт, ТЮФ, регистрация и т.п.)
  "invoiceNumber": string | null, // номер счёта / Rechnungsnummer
  "invoiceDate": string | null,   // дата счёта, формат YYYY-MM-DD
  "amount": number | null,        // итоговая сумма счёта (Gesamtbetrag), €, без символа валюты
  "vatAmount": number | null,     // сумма НДС (MwSt/USt), если указана отдельно, €
  "mileageKm": number | null,     // пробег на момент счёта (Kilometerstand/km-Stand), если указан — только для счёта покупки авто
  "vin": string | null,           // VIN / Fahrgestellnummer, если указан на счёте покупки авто
  "sellerName": string | null     // название продавца / автосалона / сервиса
}

Если поле не читается или отсутствует — верни null для него. Даты — только в формате YYYY-MM-DD. Числа — только число, без единиц измерения и без символа валюты.`;

const PURCHASE_INVOICE_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. На скане — счёт на ПОКУПКУ автомобиля с аукциона (CarOnSale или AUTO1).
Продажа идёт по Differenzbesteuerung §25a UStG.

КРИТИЧЕСКИ ВАЖНО про цену:
— Нужна ТОЛЬКО цена самого автомобиля (Fahrzeugpreis / Kaufpreis / цена лота).
— НЕ бери итог к оплате (Gesamtbetrag / Rechnungsbetrag / Summe), если в него включены сборы,
  комиссия (Vermittlungsgebühr), транспорт (Transport) или комиссия за отсрочку (BNPL).
— Сборы и транспорт — это ОТДЕЛЬНЫЕ позиции, они НЕ входят в закупочную цену.
— Если в счёте только одна общая сумма и разбивки нет — верни её, но поставь "priceIsTotal": true.
— Счёт на машину идёт с НДС 0% (§25a). Если видишь НДС 19% на позиции автомобиля — это НЕ §25a,
  поставь "vatAmount" как есть.

Верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект:

{
  "vin": string | null,            // VIN / Fahrgestellnummer / Fahrzeug-Ident-Nr., 17 символов
  "vehiclePrice": number | null,   // цена САМОГО автомобиля, €
  "priceIsTotal": boolean,         // true, если разбивки нет и это общая сумма счёта
  "vatAmount": number | null,      // НДС по позиции автомобиля, € (обычно 0 при §25a)
  "invoiceNumber": string | null,  // номер счёта / Rechnungsnummer
  "invoiceDate": string | null,    // дата счёта (Rechnungsdatum), формат YYYY-MM-DD
  "mileageKm": number | null,      // пробег (Kilometerstand / km-Stand), как есть
  "make": string | null,           // марка
  "model": string | null,          // модель
  "firstRegistration": string | null, // Erstzulassung, формат YYYY-MM-DD
  "sellerName": string | null,     // продавец

  // Характеристики машины — в счетах с аукциона обычно есть блок с описанием лота.
  // Заполняй только то, что реально написано в документе.
  "color": string | null,          // Farbe / Außenfarbe, немецкое слово
  "fuelType": string | null,       // строго одно из: PETROL, DIESEL, CNG, LPG, ELECTRIC, HYBRID, OTHER
  "transmission": string | null,   // строго одно из: MANUAL (Schaltgetriebe/manuell), AUTOMATIC (Automatik)
  "bodyType": string | null,       // Fahrzeugtyp/Karosserie: Kleinwagen, Limousine, Kombi, Cabrio,
                                   //   SUV/Geländewagen, Van/Bus, Coupé
  "doors": string | null,          // число дверей, напр. "4/5"
  "emissionClass": string | null,  // Schadstoffklasse, напр. "Euro4"
  "powerKw": number | null,        // мощность, кВт
  "engineCcm": number | null,      // объём двигателя, см3
  "owners": number | null          // число прежних владельцев (Vorbesitzer), если указано
}

Если поле не читается или отсутствует — верни null. Не додумывай значения. Даты только YYYY-MM-DD. Числа — без единиц и символа валюты.`;

/**
 * Договор продажи (Kaufvertrag), где дилер продаёт машину клиенту — используется дропзоной
 * на /cars для автоматического закрытия карточки при перетаскивании договора.
 */
export const SALE_CONTRACT_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. На скане/фото — договор купли-продажи
(Kaufvertrag), где автосалон (продавец) продаёт машину покупателю (Käufer). Извлеки поля и верни СТРОГО валидный
JSON без markdown-разметки, без пояснений, только объект вида:

{
  "vin": string | null,             // VIN / Fahrgestellnummer / Fahrzeug-Ident-Nr., 17 символов.
                                    //   В VIN НИКОГДА не бывает букв I, O, Q — если видишь их, это цифры 1, 0, 0.
  "salePrice": number | null,       // цена продажи (Kaufpreis), €, без символа валюты
  "saleDate": string | null,        // дата договора, формат YYYY-MM-DD
  "buyerName": string | null,       // ФИО покупателя (Käufer)
  "buyerAddress": string | null,    // адрес покупателя, если указан
  "mileageKm": number | null,       // пробег на момент продажи (km-Stand), если указан
  "conditionNote": string | null    // краткая оговорка о состоянии/повреждениях/гарантии из
                                    //   договора (напр. "Kratzer/Dellen, keine Garantie"), 1 фраза
}

Если поле не читается или отсутствует — верни null. Не додумывай значения. Даты только YYYY-MM-DD. Числа — без единиц и символа валюты.`;

/**
 * Промпт для кнопки "Проверить Telegram" — файл прислан в чат боту, тип заранее не известен, а сам
 * файл может содержать НЕСКОЛЬКО отдельных документов (напр. пакетный PDF-скан чеков за месяц,
 * склеенный HP-сканером из отдельных фото). Модель должна сама разбить файл на отдельные документы
 * по границам страниц и для каждого определить тип:
 * — договор, где Chukhliebov ПРОДАЁТ (Verkäufer) свою машину;
 * — договор, где Chukhliebov ПОКУПАЕТ (Käufer) у частника;
 * — обычный счёт/чек на расход бизнеса (ремонт, ТЮФ, доставка, топливо и т.п. — как для кнопки
 *   "Проверить почту").
 */
export const TELEGRAM_DOCUMENT_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. В Telegram-чат прислали файл — это может быть:
— один документ на одной странице (фото или скан);
— ОДИН документ на НЕСКОЛЬКИХ страницах (напр. договор + его оборотная сторона, или обе стороны бланка);
— НЕСКОЛЬКО РАЗНЫХ документов в одном файле (напр. владелец сфотографировал несколько чеков за месяц
  на телефон и склеил их HP-сканером в один PDF — каждая страница или группа страниц тогда отдельный чек).

Каждый отдельный документ — это либо договор купли-продажи автомобиля (Kaufvertrag), либо обычный
счёт/чек (Rechnung/Beleg) на расход бизнеса (ремонт, ТЮФ, доставка, топливо, запчасти, страховка,
реклама, аренда и т.п.). Одна из сторон в договорах купли-продажи — автосалон Chukhliebov (мой бизнес).

СНАЧАЛА разбей файл на отдельные документы по смысловым границам (обычно граница страницы = граница
документа, но если очевидно, что документ продолжается на следующей странице — напр. оборот бланка —
объедини эти страницы в один документ). ЗАТЕМ для каждого документа определи ТИП:

— "SALE" — договор, где Chukhliebov ПРОДАВЕЦ (Verkäufer): салон продаёт машину клиенту.
— "PURCHASE" — договор, где Chukhliebov ПОКУПАТЕЛЬ (Käufer): салон покупает машину у частного лица (не с аукциона).
— "EXPENSE" — обычный счёт/чек на расход бизнеса, НЕ про покупку/продажу самого автомобиля целиком
  (ремонт, ТЮФ, доставка, топливо, запчасти, страховка, реклама, аренда, бухгалтерия и т.п.).
— null — тип этой конкретной страницы/документа не удаётся определить (нечитаемо, не по теме, чистый лист).

Верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект вида:

{
  "items": [
    {
      "pages": number[],                // номера страниц ЭТОГО документа, 1 — первая страница файла.
                                        //   Для одностраничного документа — массив из одного числа.
      "role": "SALE" | "PURCHASE" | "EXPENSE" | null,
      "vin": string | null,              // VIN / Fahrgestellnummer / Fahrzeug-Ident-Nr., 17 символов, если есть.
                                         //   В VIN НИКОГДА не бывает букв I, O, Q — если видишь их, это цифры 1, 0, 0.
                                         //   Для EXPENSE — только если счёт явно привязан к конкретной машине.
      "price": number | null,            // при SALE — цена продажи (Kaufpreis); при PURCHASE — цена покупки, €
      "date": string | null,             // дата договора/счёта, формат YYYY-MM-DD
      "counterpartyName": string | null, // при SALE — покупатель (Käufer); при PURCHASE — продавец (Verkäufer)
      "counterpartyAddress": string | null,
      "mileageKm": number | null,        // пробег на момент сделки, если указан (SALE/PURCHASE)
      "conditionNote": string | null,    // краткая оговорка о состоянии/повреждениях/гарантии, 1 фраза (только SALE)
      "make": string | null,             // марка — нужна только при PURCHASE, для новой карточки машины
      "model": string | null,            // модель — нужна только при PURCHASE
      "firstRegistration": string | null,// Erstzulassung, формат YYYY-MM-DD — только при PURCHASE, если указана
      "owners": number | null,           // число владельцев (включая нового) — только при PURCHASE, если можно определить

      "isRealInvoice": boolean | null,   // только при EXPENSE — false, если это НЕ настоящий счёт
                                         //   (Rechnung), а платёжное уведомление посредника (напр.
                                         //   "Zahlungsinformation" от Billie GmbH — "Erstellt im Namen
                                         //   von X", без таблицы позиций и НДС) ИЛИ накладная на доставку
                                         //   (Lieferschein/Lieferliste/Packing List) — у нёй тоже может
                                         //   быть таблица товаров с ценами, но это НЕ счёт. ПРАВИЛО: true
                                         //   можно поставить, ТОЛЬКО если в документе буквально написано
                                         //   слово "Rechnung" (или "Invoice"/"Quittung"/"Beleg" как
                                         //   заголовок) — если документ называет себя Lieferschein/
                                         //   Lieferliste/Auftragsbestätigung/Versandbestätigung, это
                                         //   false, даже если сумма и товар совпадают с реальным счётом,
                                         //   который может прийти отдельным письмом позже.
      "vendor": string | null,           // только при EXPENSE — название продавца/поставщика/мастерской
      "item": string | null,             // только при EXPENSE — краткое название товара/услуги (2-4 слова)
      "invoiceNumber": string | null,    // только при EXPENSE — номер счёта, если есть
      "amount": number | null,           // только при EXPENSE — итоговая сумма к оплате (брутто), €
      "vatAmount": number | null,        // только при EXPENSE — сумма НДС (MwSt/USt), ТОЛЬКО если явно указана
                                         //   отдельной строкой как часть этой суммы; иначе null
      "paymentMethod": string | null     // только при EXPENSE — строго "CASH" (Bar) или "CARD" (Karte), иначе null
    }
  ]
}

Если поле не читается или отсутствует — верни null для него (не для всего документа). Не додумывай значения.
Если сомневаешься в типе конкретного документа — верни для него role: null, не гадай, но всё равно включи
его в items с правильными pages, чтобы страница не потерялась молча. Даты только YYYY-MM-DD. Числа — без
единиц и символа валюты. vatAmount никогда не должен быть больше amount — если получается больше, значит
перепутано с другой суммой в документе, верни null.`;

/**
 * Отдельный промпт для писем (кнопка "Проверить почту") — не переиспользует INVOICE_PROMPT,
 * чтобы не менять поведение уже работающей кнопки "Распознать данные" на карточке машины.
 * Дополнительно определяет способ оплаты — нужен для имени файла в архиве
 * ({Поставщик} {Товар} {Сумма} ({нал|карта}).pdf, как во всём остальном архиве).
 */
export const MAIL_INVOICE_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. Файл — счёт/чек (Rechnung/Beleg) из письма на почте автомобильного дилера.
Извлеки поля и верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект вида:

{
  "invoiceType": string,          // ЧТО это за счёт. Строго одно из:
                                  //   PURCHASE  — счёт на сам автомобиль (Fahrzeugrechnung, Verkaufspreis)
                                  //   FEE       — сбор за посредничество/аукцион (Vermittlungsgebühr, Auktionsgebühr)
                                  //   BNPL      — комиссия за отсрочку платежа
                                  //   TRANSPORT — доставка/перевозка (Transport, Lieferung, Überführung)
                                  //   OTHER     — всё остальное (запчасти, инструмент, ТЮФ, бухгалтерия, страховка, реклама и т.п.)
  "isRealInvoice": boolean,       // false, если это НЕ настоящий счёт (Rechnung), а платёжное
                                  //   уведомление/квитанция посредника — напр. "Zahlungsinformation"
                                  //   от Billie GmbH ("Erstellt im Namen von X", "Die Billie GmbH hat
                                  //   den Anspruch auf Zahlung übernommen", просто Betrag/IBAN/
                                  //   Verwendungszweck БЕЗ таблицы позиций и НДС). Платёжные уведомления
                                  //   НИКОГДА не считаются как счета — они дублируют/предшествуют
                                  //   настоящему счёту поставщика, которого в этом письме может не быть.
                                  //   ТО ЖЕ САМОЕ касается накладных на доставку (Lieferschein/
                                  //   Lieferliste/Packing List) — у них тоже может быть таблица товаров
                                  //   с ценами, но это НЕ счёт, настоящий Rechnung за тот же заказ может
                                  //   прийти отдельным письмом позже с другой датой/номером документа.
                                  //   ПРАВИЛО: true можно поставить, ТОЛЬКО если в документе буквально
                                  //   написано слово "Rechnung" (или "Invoice"/"Quittung"/"Beleg" как
                                  //   заголовок документа) — если документ называет себя Lieferschein/
                                  //   Lieferliste/Auftragsbestätigung/Versandbestätigung, это false.
  "vendor": string | null,        // название продавца/поставщика — кратко, как в шапке счёта.
  "item": string | null,          // краткое название товара/услуги/категории (2-4 слова)
  "invoiceNumber": string | null,
  "invoiceDate": string | null,   // формат YYYY-MM-DD
  "amount": number | null,        // итоговая сумма к оплате (брутто), €
  "vatAmount": number | null,     // сумма НДС (Vorsteuer), ТОЛЬКО если она явно и однозначно
                                  //   указана как часть ЭТОЙ суммы (напр. "davon 19% MwSt: X €").
                                  //   Письма из налоговой (Finanzamt), уведомления о декларациях
                                  //   (Umsatzsteuererklärung, Steuerbescheid) — это НЕ счета с
                                  //   вычитаемым НДС, у них vatAmount ВСЕГДА null, даже если в
                                  //   тексте письма упоминаются другие суммы налога.
  "vin": string | null,           // VIN, если указан (только для счетов на машину/её детали)
  "paymentMethod": string | null  // строго "CASH" (Bar/наличные) или "CARD" (Karte/карта); null если не указано/не читается
}

Если поле не читается или отсутствует — верни null для него. Даты — только в формате YYYY-MM-DD. Числа — только число, без единиц измерения и без символа валюты. vatAmount никогда не должен быть больше amount — если получается больше, значит перепутано с другой суммой в документе, верни null.`;

/**
 * Для кнопки "Проверить аукционы" — на входе текст страницы "Мои закупки"/"Оплаченные лоты"
 * CarOnSale или AUTO1 (снят через Playwright), а не файл. Нужно вытащить список выигранных лотов.
 */
export const AUCTION_LOTS_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. Ниже — текст страницы
"мои закупки/оплаченные лоты" аукциона подержанных автомобилей ({SITE}), снятый из браузера пользователя.
Найди в этом тексте ВСЕ выигранные/оплаченные лоты (машины) и извлеки по каждому данные.

Верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект вида:

{
  "lots": [
    {
      "vin": string | null,          // VIN, 17 символов. В VIN НИКОГДА не бывает букв I, O, Q — если видишь их,
                                     //   это цифры 1, 0, 0. Если VIN на странице не показан — null (не выдумывай).
      "make": string | null,
      "model": string | null,
      "lotNumber": string | null,    // номер лота
      "price": number | null,        // цена машины (без учёта отдельных сборов), €
      "date": string | null,         // дата покупки/счёта, формат YYYY-MM-DD, если видна
      "mileageKm": number | null     // пробег, если показан на странице
    }
  ]
}

Если на странице нет ни одного лота (пусто, ещё не залогинен, ошибка загрузки) — верни {"lots": []}.
Не додумывай значения, которых нет в тексте — верни null для них.`;

/**
 * Карточка/страница "все детали автомобиля" конкретного лота (AUTO1 — отдельная страница
 * /merchant/car/{id}; CarOnSale — боковая панель, открывается кликом по названию модели в списке
 * закупок). Текст может быть на русском, английском или немецком — зависит от сайта и языка
 * интерфейса аккаунта, поэтому промпт не завязан на конкретные фразы одного языка.
 */
export const AUCTION_CAR_DETAIL_PROMPT = `Ты помощник по вводу данных б/у автомобилей в Германии. Ниже — текст страницы/панели
"полные детали автомобиля" одного купленного лота с аукциона подержанных машин (AUTO1 или CarOnSale),
снятый из браузера пользователя. Текст может быть на русском, английском или немецком языке.

ВАЖНО про CarOnSale: на странице может быть текст, который выглядит как бессмысленный набор букв
(НЕ настоящие слова ни на одном языке, напр. "kblfxrtpwnojmplvsfrqzxv" или "Plkw-TzNv Xkqv Bnwtoa") —
это заблокированный платной подпиской контент (история сервисной книжки, отчёт carVertical и т.п.),
намеренно скрытый/обфусцированный сайтом. ПОЛНОСТЬЮ игнорируй такие фрагменты — не пытайся их
интерпретировать, не используй как данные.

Верни СТРОГО валидный JSON без markdown-разметки, без пояснений, только объект вида:

{
  "color": string | null,          // Цвет — переведи на немецкий и верни СТРОГО одно значение из списка:
                                   //   Beige, Blau, Braun, Gelb, Gold, Grau, Grün, Orange, Rot, Schwarz, Silber, Violet, Weiß
  "fuelType": string | null,       // строго одно из: PETROL, DIESEL, CNG, LPG, ELECTRIC, HYBRID, OTHER
  "transmission": string | null,   // строго одно из: MANUAL, AUTOMATIC
  "bodyType": string | null,       // строго одно значение из списка:
                                   //   Kleinwagen, Limousine, Kombi, Cabrio, SUV/Geländewagen, Van/Bus, Coupé, Andere Fahrzeugtypen
  "doors": string | null,          // количество дверей — строго одно из: "2/3", "4/5", "6/7", "Andere Türanzahl"
  "emissionClass": string | null,  // Schadstoffklasse, напр. "Euro4"
  "interiorMaterial": string | null, // Обивка/материал салона — строго одно значение из списка:
                                   //   Vollleder, Teilleder, Stoff, Velours, Alcantara, Andere Materialien Innenausstattung
                                   //   ("Ткань" = Stoff, "Кожа" = Vollleder, "Велюр" = Velours)
  "condition": string | null,      // строго одно из: "Beschädigtes Fahrzeug", "Unbeschädigtes Fahrzeug".
                                   //   Beschädigtes, если на странице указано ДТП/аварийное повреждение
                                   //   (accident damage / Unfallschaden / "после аварии: Да") или в
                                   //   разделе повреждений перечислены конкретные повреждённые зоны
                                   //   кузова (не просто толщина краски/косметика). Unbeschädigtes,
                                   //   если явно написано, что следов аварии/ДТП нет (напр. "No
                                   //   indication of existing accident damage", "после аварии: Нет").
                                   //   Если раздел о повреждениях вообще отсутствует — верни null.
  "features": string[],            // комплектация — верни массив кодов из списка ниже, включай код,
                                   //   только если соответствующий пункт явно упомянут в разделе про
                                   //   оборудование/комплектацию (Equipment/Ausstattung/АВТОМОБИЛЬНОЕ
                                   //   ОБОРУДОВАНИЕ) — не додумывай по типу/марке машины:
                                   //   TOW_BAR (фаркоп), ALLOY_WHEELS (легкосплавные диски), PARK_ASSIST (парктроник),
                                   //   XENON_LED (ксенон/светодиодные фары), AC (кондиционер/климат-контроль),
                                   //   SUNROOF (люк/панорамная крыша), NAVI (навигация), SEAT_HEATING (подогрев сидений),
                                   //   RADIO (радио/магнитола), CRUISE_CONTROL (круиз-контроль), BLUETOOTH,
                                   //   NON_SMOKER (не курили), HANDS_FREE (громкая связь), ABS, SERVICE_BOOK (сервисная книжка)
                                   //   Пустой массив, если ничего не подходит.
  "owners": number | null,         // количество предыдущих владельцев
  "mileageKm": number | null,      // пробег, если указан
  "firstRegistration": string | null, // дата первой регистрации, формат YYYY-MM-DD
  "engineCcm": number | null,      // объём двигателя, см3
  "powerKw": number | null,        // мощность, кВт
  "tuvUntil": string | null        // техосмотр до, формат YYYY-MM-DD
}

Если поле не читается или отсутствует на странице — верни null для него (для features — не включай код). Не додумывай значения.
Даты только YYYY-MM-DD. Числа — без единиц измерения.`;

/**
 * Вырезает строки с "тарабарщиной" — платный контент CarOnSale (история сервисной книжки,
 * carVertical-отчёт и т.п.) рендерится на странице как обфусцированный набор букв для
 * неподписчиков (напр. "kblfxrtpwnojmplvsfrqzxv", "Plkw-TzNv Xkqv Bnwtoa"). Помимо того что это
 * не настоящие данные, такие строки (длинные последовательности согласных без гласных) иногда
 * ложно триггерят safety-классификатор модели (отказ с категорией "bio") — поэтому вырезаем их
 * ДО отправки в модель, а не полагаемся только на инструкцию в промпте их игнорировать.
 */
function stripObfuscatedText(text: string): string {
  const isGibberish = (word: string): boolean => {
    const letters = word.replace(/[^a-zA-Zа-яА-Я]/g, "");
    return letters.length >= 4 && /^[b-df-hj-np-tv-zбвгджзйклмнпрстфхцчшщ]+$/i.test(letters);
  };

  return text
    .split("\n")
    .filter((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length === 0) return true;
      const gibberishCount = words.filter(isGibberish).length;
      return gibberishCount === 0 || gibberishCount / words.length < 0.5;
    })
    .join("\n");
}

/** Для страницы/панели "все детали автомобиля" отдельного лота AUTO1 или CarOnSale (см. AUCTION_CAR_DETAIL_PROMPT). */
export async function extractAuctionCarDetail(pageText: string): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 400, error: "ANTHROPIC_API_KEY не задан в .env — распознавание недоступно" };
  }

  const cleanedText = stripObfuscatedText(pageText);
  const prompt = AUCTION_CAR_DETAIL_PROMPT + `\n\n--- текст страницы ---\n${cleanedText.slice(0, 20000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `Anthropic API вернул ошибку: ${res.status} ${errText}` };
  }

  const result = await res.json();
  if (result?.stop_reason === "refusal") {
    return {
      ok: false,
      status: 502,
      error: `Модель отказалась обработать страницу (категория: ${result?.stop_details?.category ?? "?"})`,
    };
  }
  const text = result?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  try {
    return { ok: true, fields: parseModelJson(text) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Не удалось разобрать ответ модели: ${err instanceof Error ? err.message : err}`,
      raw: text.slice(0, 500),
    };
  }
}

export type ExtractResult =
  | { ok: true; fields: unknown }
  | { ok: false; status: number; error: string; raw?: string };

/**
 * Достаёт JSON из ответа модели: снимает markdown-обёртку, а если вокруг объекта
 * оказался пояснительный текст — вырезает первый сбалансированный блок {...}.
 */
function parseModelJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // ищем сбалансированный объект, игнорируя скобки внутри строк
    const start = cleaned.indexOf("{");
    if (start === -1) throw new Error("в ответе нет JSON-объекта");

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
      }
    }
    throw new Error("JSON-объект в ответе не закрыт");
  }
}

function promptForType(documentType: DocumentType): string {
  return documentType === "purchase_invoice"
    ? PURCHASE_INVOICE_PROMPT
    : documentType === "invoice"
    ? INVOICE_PROMPT
    : ZB1_PROMPT;
}

/** Модель иногда обрывает ответ посреди JSON — повторяем только эти случаи. */
async function extractOnce(
  buffer: Buffer,
  mimeType: string,
  documentType: DocumentType,
  promptOverride?: string,
  maxTokens = 4096
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      error: "ANTHROPIC_API_KEY не задан в .env — распознавание недоступно",
    };
  }

  const isPdf = mimeType === "application/pdf";
  const base64 = buffer.toString("base64");
  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: base64 } };

  const prompt = promptOverride ?? promptForType(documentType);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      // 1024 было мало для длинных промптов (Teil II с несколькими блоками владельцев) —
      // ответ иногда обрезался посреди JSON вместе с thinking-блоком.
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `Anthropic API вернул ошибку: ${res.status} ${errText}` };
  }

  const result = await res.json();
  const text = result?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

  try {
    return { ok: true, fields: parseModelJson(text) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Не удалось разобрать ответ модели: ${err instanceof Error ? err.message : err}`,
      raw: text.slice(0, 500),
    };
  }
}

/** Похоже на обрыв/пустой ответ, а не на содержательный отказ модели — стоит повторить. */
function looksTransient(error: string): boolean {
  return /не удалось разобрать ответ модели/i.test(error);
}

export async function extractDocumentFields(
  buffer: Buffer,
  mimeType: string,
  documentType: DocumentType = "zb1"
): Promise<ExtractResult> {
  let last = await extractOnce(buffer, mimeType, documentType);
  if (last.ok || !looksTransient(last.error)) return last;

  // Один повтор молча — такие сбои случаются у модели нерегулярно на длинных промптах.
  last = await extractOnce(buffer, mimeType, documentType);
  return last;
}

/** Для кнопки "Проверить почту" — свой промпт с определением способа оплаты (см. MAIL_INVOICE_PROMPT). */
export async function extractMailInvoiceFields(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractResult> {
  let last = await extractOnce(buffer, mimeType, "invoice", MAIL_INVOICE_PROMPT);
  if (last.ok || !looksTransient(last.error)) return last;
  last = await extractOnce(buffer, mimeType, "invoice", MAIL_INVOICE_PROMPT);
  return last;
}

/** Для дропзоны договоров продажи на /cars — см. SALE_CONTRACT_PROMPT. */
export async function extractSaleContractFields(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractResult> {
  let last = await extractOnce(buffer, mimeType, "invoice", SALE_CONTRACT_PROMPT);
  if (last.ok || !looksTransient(last.error)) return last;
  last = await extractOnce(buffer, mimeType, "invoice", SALE_CONTRACT_PROMPT);
  return last;
}

/**
 * Для кнопки "Проверить Telegram" — см. TELEGRAM_DOCUMENT_PROMPT. Файл может содержать несколько
 * документов сразу (пакетный скан чеков), поэтому лимит токенов ответа выше обычного.
 */
export async function extractTelegramBatchFields(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractResult> {
  let last = await extractOnce(buffer, mimeType, "invoice", TELEGRAM_DOCUMENT_PROMPT, 8192);
  if (last.ok || !looksTransient(last.error)) return last;
  last = await extractOnce(buffer, mimeType, "invoice", TELEGRAM_DOCUMENT_PROMPT, 8192);
  return last;
}

/** Текстовый (не файловый) вызов модели — для кнопки "Проверить аукционы" (см. AUCTION_LOTS_PROMPT). */
export async function extractAuctionLots(pageText: string, siteLabel: string): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 400, error: "ANTHROPIC_API_KEY не задан в .env — распознавание недоступно" };
  }

  const prompt = AUCTION_LOTS_PROMPT.replace("{SITE}", siteLabel) + `\n\n--- текст страницы ---\n${pageText.slice(0, 40000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `Anthropic API вернул ошибку: ${res.status} ${errText}` };
  }

  const result = await res.json();
  const text = result?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  try {
    return { ok: true, fields: parseModelJson(text) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Не удалось разобрать ответ модели: ${err instanceof Error ? err.message : err}`,
      raw: text.slice(0, 500),
    };
  }
}
