import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const generatedTranslations = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/en-translations.generated.json"), "utf8")
);
const forcedTranslations = [
  [". \u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e:", ". Valid until:"],
  ["\u0413\u2014", "\u00d7"],
  ["\u0432\u045a\u201c", "\u2713"],
  ["\u045a\u201c", "\u2713"],
  ["\u043f\u0408\u0457 iOS", "\uf8ff iOS"],
  ["p\u0408\u0457 iOS", "\uf8ff iOS"]
];

const pages = [
  ["index.html", "en/index.html"],
  ["chatgpt.html", "en/chatgpt.html"],
  ["claude.html", "en/claude.html"],
  ["supergrok.html", "en/supergrok.html"],
  ["catalog/index.html", "en/catalog/index.html"],
  ["catalog/ai/index.html", "en/catalog/ai/index.html"],
  ["catalog/vpn/index.html", "en/catalog/vpn/index.html"],
  ["store/vpn/index.html", "en/store/vpn/index.html"],
  ["store/steam/index.html", "en/store/steam/index.html"],
  ["store/steam/topup/index.html", "en/store/steam/topup/index.html"],
  ["about.html", "en/about.html"],
  ["bundle-activation.html", "en/bundle-activation.html"],
  ["contact.html", "en/contact.html"],
  ["guarantee.html", "en/guarantee.html"],
  ["oferta.html", "en/oferta.html"],
  ["politika.html", "en/politika.html"],
  ["redeem-start.html", "en/redeem-start.html"],
  ["refund.html", "en/refund.html"],
  ["site-map.html", "en/site-map.html"],
  ["store/vpn/activate/index.html", "en/store/vpn/activate/index.html"],
];

const translations = [
  ["GPTishka — AI-подписки без входа и V*N в подарок", "GPTishka - AI subscriptions without login and V*N included"],
  ["Оформляйте ChatGPT, Claude Pro и SuperGrok без передачи логина и пароля. При покупке подписки даём V*N-доступ, поддержку и гарантию.", "Subscribe to ChatGPT, Claude Pro and SuperGrok without sharing login or password. Each subscription includes V*N access, support and warranty."],
  ["Популярные услуги GPTishka", "Popular GPTishka services"],
  ["ChatGPT без входа", "ChatGPT without login"],
  ["Пополнение Steam", "Steam top-ups"],
  ["Каталог нейросетей", "AI services catalog"],
  ["GPTishka VPN — VLESS-доступ после оплаты", "GPTishka VPN - VLESS access after payment"],
  ["Выберите срок VPN-доступа, оплатите заказ и получите VLESS-ключ с инструкцией подключения. Поддержка помогает с настройкой.", "Choose a VPN access term, pay for the order and receive a VLESS key with connection instructions. Support helps with setup."],
  ["GPTishka — подписки на ИИ-сервисы и V*N: ChatGPT, Claude, Grok, Gemini, Perplexity и Karing V*N. Быстрая активация, гарантия и поддержка.", "GPTishka — AI subscriptions and V*N: ChatGPT, Claude, Grok, Gemini, Perplexity, and Karing V*N. Fast activation, warranty, and support."],
  ["GPTishka — подписки на ИИ-сервисы и V*N", "GPTishka — AI subscriptions and V*N"],
  ["GPTishka — AI-подписки и V*N", "GPTishka — AI subscriptions and V*N"],
  ["Подписки на ChatGPT, Claude, Grok, Gemini, Perplexity и V*N с быстрой активацией, гарантией и поддержкой.", "Subscriptions for ChatGPT, Claude, Grok, Gemini, Perplexity, and V*N with fast activation, warranty, and support."],
  ["Основные разделы сайта", "Main website sections"],
  ["Главная", "Home"],
  ["О сервисе", "About"],
  ["Гарантия", "Guarantee"],
  ["Контакты", "Contacts"],
  ["Карта сайта", "Site map"],
  ["Лента активаций обновляется...", "Activation feed is updating..."],
  ["лента активаций обновляется", "activation feed is updating"],
  ["всего активаций:", "total activations:"],
  ["всего активаций", "total activations"],
  ["GPTишка", "GPTishka"],
  ["ChatGPT от 1290 ₽/мес", "ChatGPT from 1290 RUB/mo"],
  ["от 1290 ₽/мес", "from 1290 RUB/mo"],
  ["Русский", "Russian"],
  ["Выбрать язык", "Choose language"],
  ["Новости и предложения GPTishka", "GPTishka news and offers"],
  ["на 1 месяц", "for 1 month"],
  ["Grok от xAI: быстрые ответы, анализ, креативные задачи и генерация изображений в одной подписке на 1 месяц.", "Grok by xAI: fast answers, analysis, creative tasks, and image generation in one 1-month subscription."],
  ["Открыть тарифы", "Open plans"],
  ["Быстрый V*N", "Fast V*N"],
  ["с надёжным VLESS-подключением", "with a reliable VLESS connection"],
  ["Получите VLESS-ключ сразу после оплаты. Подходит для стабильного доступа к сайтам, сервисам и приложениям без сложной настройки.", "Get a VLESS key right after payment. Suitable for stable access to websites, services, and apps without complicated setup."],
  ["Пополнения", "Top-ups"],
  ["Пополни баланс Steam", "Top up your Steam balance"],
  ["на +10% ключами Манн Ко.", "with +10% using Mann Co. keys"],
  ["Укажите Steam trade-ссылку, выберите количество ключей и оплатите удобным способом. Подходит, если торговая площадка открыта и баланс нужен срочно.", "Enter your Steam trade URL, choose the number of keys, and pay with a convenient method. Useful when the market is unlocked and you need balance quickly."],
  ["Пополнить", "Top up"],
  ["Переключение баннеров", "Banner navigation"],
  ["Предыдущий баннер", "Previous banner"],
  ["Следующий баннер", "Next banner"],
  ["Как проходит подключение", "How connection works"],
  ["Понятный сценарий после оплаты", "A clear flow after payment"],
  ["Выберите тариф", "Choose a plan"],
  ["Откройте нужный сервис ниже и выберите подходящий вариант покупки.", "Open the service you need below and choose the right purchase option."],
  ["Оплатите заказ", "Pay for the order"],
  ["Доступны карта, СБП и криптовалюта — итоговая цена берётся с сервера.", "Cards, SBP, and crypto are available — the final price is taken from the server."],
  ["Получите подключение", "Get connected"],
  ["Система откроет активацию, выдаст V*N-ключ или передаст заявку менеджеру.", "The system will open activation, issue a V*N key, or pass the request to a manager."],
  ["Если что-то пойдёт не по автоматическому сценарию, поддержка доведёт заказ до результата.", "If something does not follow the automatic flow, support will bring the order to completion."],
  ["Разделы GPTishka", "GPTishka sections"],
  ["Открыть пополнения Steam", "Open Steam top-ups"],
  ["Открыть нейросети", "Open AI services"],
  ["Нейросети", "AI Services"],
  ["Открыть GPTishka V*N", "Open GPTishka V*N"],
  ["Новости, софт и соцсети GPTishka", "GPTishka news, software, and social networks"],
  ["Новости", "News"],
  ["Обновления GPTishka", "GPTishka updates"],
  ["Здесь будем показывать важные новости: новые товары, акции, изменения по автоматической активации и обновления сервиса.", "Important updates will appear here: new products, promos, automatic activation changes, and service updates."],
  ["Смотреть каталог", "View catalog"],
  ["Каталог", "Catalog"],
  ["Софт", "Software"],
  ["Скачать софт", "Download software"],
  ["Раздел под приложение GPTishka. Пока файл не загружен, скачивание закрыто, чтобы не вести клиента на пустую ссылку.", "A section for the GPTishka app. Downloads are disabled until the file is ready, so clients do not land on an empty link."],
  ["Скоро", "Soon"],
  ["Соцсети", "Socials"],
  ["Мы на связи", "Stay connected"],
  ["Новости, поддержка и быстрые объявления GPTishka в Telegram и VK.", "News, support, and quick GPTishka announcements in Telegram and VK."],
  ["Гарантии и доверие", "Trust and guarantees"],
  ["Безопасная активация", "Secure activation"],
  ["Подключение выполняется по токену без передачи данных входа.", "Connection is completed by token without sharing login credentials."],
  ["Доступны варианты без входа", "No-login options are available"],
  ["Для части тарифов клиент активирует доступ самостоятельно, без передачи логина и пароля.", "For some plans, the client activates access independently without sharing login or password."],
  ["Удобная оплата", "Convenient payment"],
  ["СБП, карты РФ/СНГ и Криптовалюта", "SBP, RU/CIS cards, and crypto"],
  ["Поддержка и гарантия", "Support and warranty"],
  ["Если возникнет проблема, поддержка поможет восстановить доступ или предложит решение по условиям гарантии.", "If a problem occurs, support will help restore access or offer a solution under the warranty terms."],
  ["Выберите подписку", "Choose a subscription"],
  ["Как проходит покупка", "How purchase works"],
  ["Сравните варианты по цене и сроку. Все условия сразу видны в карточке.", "Compare options by price and duration. All terms are visible in the card."],
  ["Оплатите удобным способом", "Pay with a convenient method"],
  ["СБП, карты РФ/СНГ и Криптовалюта. Оплата проходит на защищенной платежной странице.", "SBP, RU/CIS cards, and crypto. Payment is processed on a secure checkout page."],
  ["Получите инструкцию или ключ", "Get instructions or a key"],
  ["После оплаты откроется сценарий для выбранного товара: активация по токену, выдача V*N-ключа или инструкция по дальнейшим действиям.", "After payment, the selected product flow opens: token activation, V*N key delivery, or next-step instructions."],
  ["Поддержка поможет завершить", "Support helps complete it"],
  ["Если автоматическая активация недоступна или что-то пошло не так, менеджер видит заказ и помогает довести услугу до результата.", "If automatic activation is unavailable or something goes wrong, a manager sees the order and helps complete the service."],
  ["Вопросы и ответы", "FAQ"],
  ["Короткие ответы на самые частые вопросы", "Short answers to common questions"],
  ["ЛЕВАЯ КОЛОНКА", "LEFT COLUMN"],
  ["ПРАВАЯ ЛИПКАЯ КОЛОНКА", "RIGHT STICKY COLUMN"],
  ["Что такое токен и безопасно ли это?", "What is a token, and is it safe?"],
  ["Токен используется только для привязки оплаты к заказу и активации. Он не открывает доступ к вашему аккаунту. Логин и пароль мы не запрашиваем.", "A token is used only to link payment to the order and activation. It does not give access to your account. We do not ask for login or password."],
  ["Нужен ли логин и пароль?", "Do I need to provide login and password?"],
  ["Нет. Подключение выполняется без передачи данных от аккаунта.", "No. Connection can be completed without sharing account credentials."],
  ["Что происходит после оплаты?", "What happens after payment?"],
  ["После оплаты вы сразу переходите к следующему этапу: активации или получению данных по выбранному тарифу. Процесс простой и занимает минимум времени.", "After payment, you immediately move to the next step: activation or receiving details for the selected plan. The process is simple and quick."],
  ["Как быстро приходит доступ?", "How quickly do I get access?"],
  ["В большинстве случаев — в течение нескольких минут после подтверждения оплаты.", "In most cases, within a few minutes after payment confirmation."],
  ["Что делать, если что-то пошло не так?", "What if something goes wrong?"],
  ["Напишите в поддержку. Мы проверим заказ и доведём подключение до результата вручную или предложим решение по гарантии.", "Contact support. We will check the order and complete the connection manually or offer a warranty solution."],
  ["Есть ли поддержка после покупки?", "Is there support after purchase?"],
  ["Да. Мы сопровождаем клиентов не только на этапе оплаты, но и после подключения, если возникают вопросы по заказу.", "Yes. We support clients during payment and after connection if any order questions appear."],
  ["Как можно оплатить?", "How can I pay?"],
  ["СБП банковские карты РФ/СНГ и Криптовалюта, через доступные платёжные способы на сайте.", "SBP, RU/CIS bank cards, and crypto through the payment methods available on the site."],
  ["Можно ли продлить подписку позже?", "Can I renew the subscription later?"],
  ["Да. Продление оформляется отдельной оплатой через нужный тариф.", "Yes. Renewal is created as a separate payment through the required plan."],
  ["Нужна помощь с выбором?", "Need help choosing?"],
  ["Подскажем по тарифам, срокам и активации в чате поддержки.", "We can help with plans, terms, and activation in support chat."],
  ["Написать в поддержку", "Message support"],
  ["Видео процесса активации", "Activation process video"],
  ["Дополнительная инструкция: можно посмотреть до оплаты или сразу после покупки.", "Additional instructions: watch before payment or right after purchase."],
  ["Ваш браузер не поддерживает встроенное видео.", "Your browser does not support embedded video."],
  ["Готовы подключить подписку?", "Ready to connect a subscription?"],
  ["Выберите ChatGPT, Claude, SuperGrok или GPTishka V*N. После оплаты сайт откроет нужный сценарий подключения, а поддержка поможет, если потребуется ручная обработка.", "Choose ChatGPT, Claude, SuperGrok, or GPTishka V*N. After payment, the site opens the correct connection flow, and support helps if manual processing is needed."],
  ["Выбрать тариф", "Choose a plan"],
  ["Закрыть выбор способа оплаты", "Close payment method selection"],
  ["Закрыть", "Close"],
  ["Выберите способ оплаты", "Choose payment method"],
  ["После выбора вы перейдете к безопасной странице оплаты.", "After choosing, you will go to a secure payment page."],
  ["СБП и карты РФ/СНГ", "SBP and RU/CIS cards"],
  ["СБП и банковские карты", "SBP and bank cards"],
  ["Карты 3.2% и СБП 0%", "Cards 3.2% and SBP 0%"],
  ["СБП 0% и карты 3.2%", "SBP 0% and cards 3.2%"],
  ["Публичная оферта", "Public offer"],
  ["Политика конфиденциальности", "Privacy policy"],
  ["Условия возврата", "Refund policy"],
  ["Связь с нами", "Contact us"],
  ["Все права защищены, копирование запрещено.", "All rights reserved. Copying is prohibited."],
  ["Все права защищены.", "All rights reserved."],
  ["Закрыть меню", "Close menu"],
  ["Открыть меню", "Open menu"],

  ["Тарифные планы ChatGPT: Go, Plus, Pro 5x и Pro 20x с быстрой активацией, гарантией и поддержкой GPTishka.", "ChatGPT plans: Go, Plus, Pro 5x, and Pro 20x with fast activation, warranty, and GPTishka support."],
  ["ChatGPT — тарифные планы | GPTishka", "ChatGPT — Plans | GPTishka"],
  ["Выберите тариф ChatGPT: Go, Plus, Pro 5x или Pro 20x. Оплата и активация работают через текущий checkout GPTishka.", "Choose a ChatGPT plan: Go, Plus, Pro 5x, or Pro 20x. Payment and activation work through the current GPTishka checkout."],
  ["Тарифные планы Claude и Claude Pro с быстрым подключением, гарантией и поддержкой GPTishka.", "Claude and Claude Pro plans with fast connection, warranty, and GPTishka support."],
  ["Claude — тарифные планы | GPTishka", "Claude — Plans | GPTishka"],
  ["Выберите тариф Claude, оплатите заказ через GPTishka, а мы подключим подписку выбранным способом.", "Choose a Claude plan, pay through GPTishka, and we will connect the subscription using the selected method."],
  ["Тарифные планы SuperGrok с быстрым подключением, гарантией и поддержкой GPTishka.", "SuperGrok plans with fast connection, warranty, and GPTishka support."],
  ["SuperGrok — тарифные планы | GPTishka", "SuperGrok — Plans | GPTishka"],
  ["Выберите тариф SuperGrok, оплатите заказ через GPTishka, а мы подключим подписку выбранным способом.", "Choose a SuperGrok plan, pay through GPTishka, and we will connect the subscription using the selected method."],
  ["Все сервисы", "All services"],
  ["Тарифные планы", "Plans"],
  ["Оформите подписку ChatGPT без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.", "Subscribe to ChatGPT without unnecessary steps. Choose a plan, pay for the order, and GPTishka handles the connection — with support and warranty for the full subscription period."],
  ["Оформите подписку Claude без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.", "Subscribe to Claude without unnecessary steps. Choose a plan, pay for the order, and GPTishka handles the connection — with support and warranty for the full subscription period."],
  ["Оформите подписку SuperGrok без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.", "Subscribe to SuperGrok without unnecessary steps. Choose a plan, pay for the order, and GPTishka handles the connection — with support and warranty for the full subscription period."],
  ["Фильтры тарифов", "Plan filters"],
  ["ИИ-сервис для текста, кода, анализа документов и повседневных задач. Выберите подходящий тариф, оплатите его через текущую форму GPTishka, а мы подключим подписку по выбранному способу.", "AI service for text, code, document analysis, and everyday tasks. Choose the right plan, pay through the current GPTishka form, and we will connect the subscription using the selected method."],
  ["Со входом", "With login"],
  ["Подключение через вход в аккаунт. После оплаты понадобятся логин и пароль.", "Connection through account login. Login and password will be needed after payment."],
  ["Без входа", "No login"],
  ["Подключение без передачи данных от аккаунта. После оплаты мы пришлём инструкцию, как создать ссылку для активации.", "Connection without sharing account credentials. After payment, we will send instructions on how to create an activation link."],
  ["Возможности SuperGrok", "SuperGrok features"],
  ["Возможности", "Features"],
  ["Выберите подходящую подписку:", "Choose the right subscription:"],
  ["Как получить подписку", "How to get a subscription"],
  ["Оформляете заказ на gptishka.shop и оплачиваете его удобным способом.", "Create an order on gptishka.shop and pay with a convenient method."],
  ["Оформляете заказ на gptishka.shop и оплачиваете удобным способом.", "Create an order on gptishka.shop and pay with a convenient method."],
  ["Мы подключаем выбранную подписку и сообщаем вам о завершении.", "We connect the selected subscription and notify you when it is ready."],
  ["Пользуетесь ChatGPT в течение оплаченного срока.", "Use ChatGPT for the paid period."],
  ["При необходимости продлеваете подписку через наш сайт.", "Renew the subscription through our site when needed."],
  ["Почему GPTishka", "Why GPTishka"],
  ["Работаем с 2023 года", "Operating since 2023"],
  ["Более 5000 успешных подключений", "Over 5,000 successful connections"],
  ["Есть отзывы и постоянные клиенты", "Reviews and returning clients"],
  ["Даём гарантию на весь срок подписки", "Warranty for the full subscription period"],
  ["Помогаем с подключением и продлением", "Help with connection and renewal"],
  ["Часто задаваемые вопросы", "FAQ"],
  ["Какие способы оплаты доступны?", "Which payment methods are available?"],
  ["На gptishka.shop доступны банковские карты Мир, Visa, MasterCard, СБП, криптовалюта и иностранные карты через обращение в поддержку.", "gptishka.shop supports Mir, Visa, MasterCard, SBP, crypto, and foreign cards through support request."],
  ["Платежи проходят безопасно. Мы не сохраняем платёжные данные — обработка оплаты осуществляется через платёжные системы Enot и Lava.", "Payments are secure. We do not store payment details — payment processing is handled by Enot and Lava."],
  ["Сколько времени занимает подключение?", "How long does connection take?"],
  ["В среднем подключение занимает от 5 минут до 2 часов после оплаты. Максимальное время ожидания — до 48 часов.", "On average, connection takes from 5 minutes to 2 hours after payment. Maximum waiting time is up to 48 hours."],
  ["Мы обрабатываем заказы ежедневно с 10:00 до 20:00 по МСК. Если заказ оформлен ночью, подключение будет выполнено утром.", "We process orders daily from 10:00 to 20:00 Moscow time. If an order is placed at night, it will be processed in the morning."],
  ["Можно ли вам доверять?", "Can I trust you?"],
  ["Да. gptishka.shop — надёжный сервис подключения подписок ChatGPT. Вы оформляете заказ — мы берём всю техническую часть на себя.", "Yes. gptishka.shop is a reliable service for connecting ChatGPT subscriptions. You place an order — we handle the technical part."],
  ["Claude помогает писать тексты, разбирать документы, анализировать большие материалы, готовить код и быстрее закрывать рабочие задачи. Выберите тариф, а мы подключим его через текущий checkout GPTishka.", "Claude helps write texts, review documents, analyze large materials, prepare code, and complete work tasks faster. Choose a plan, and we will connect it through the current GPTishka checkout."],
  ["Подключение через вход в аккаунт Claude. После оплаты понадобятся логин и пароль.", "Connection through Claude account login. Login and password will be needed after payment."],
  ["Если для товара доступен вариант без входа, после оплаты мы покажем дальнейшую инструкцию по активации.", "If a no-login option is available for the product, we will show further activation instructions after payment."],
  ["Claude подходит для текстов, кода, документов, аналитики и повседневной работы с ИИ.", "Claude is suitable for text, code, documents, analytics, and everyday AI work."],
  ["Выбираете тариф Claude и способ подключения.", "Choose a Claude plan and connection method."],
  ["Пользуетесь Claude весь оплаченный срок.", "Use Claude for the full paid period."],
  ["Поддерживаем клиентов после оплаты", "We support clients after payment"],
  ["Подключаем подписку по выбранному способу", "We connect the subscription using the selected method"],
  ["Помогаем с продлением и повторной активацией", "We help with renewal and repeat activation"],
  ["На gptishka.shop доступны СБП и банковские карты через платёжные шлюзы Enot и Lava.", "gptishka.shop supports SBP and bank cards through Enot and Lava payment gateways."],
  ["Мы не сохраняем платёжные данные — обработка оплаты выполняется на стороне платёжной системы.", "We do not store payment details — payment processing is handled by the payment provider."],
  ["Заказы обрабатываются ежедневно с 10:00 до 20:00 по МСК. Если заказ оформлен ночью, подключение будет выполнено утром.", "Orders are processed daily from 10:00 to 20:00 Moscow time. If an order is placed at night, it will be processed in the morning."],
  ["Да. GPTishka подключает подписки и сопровождает заказ после оплаты: если возникнет вопрос по доступу, менеджер поможет разобраться.", "Yes. GPTishka connects subscriptions and supports the order after payment: if there is an access issue, a manager will help resolve it."],
  ["SuperGrok даёт доступ к Grok от xAI для поиска, анализа, текстов, кода и быстрых ответов в повседневных задачах. Выберите подходящий срок и способ подключения, а мы проведём заказ через текущий checkout GPTishka.", "SuperGrok gives access to Grok by xAI for search, analysis, text, code, and fast answers in everyday tasks. Choose the right term and connection method, and we will process the order through the current GPTishka checkout."],
  ["Подключение через вход в аккаунт. После оплаты в модальном окне понадобятся данные для подключения.", "Connection through account login. After payment, connection details will be required in the modal."],
  ["Без входа / по ID", "No login / by ID"],
  ["Если для товара доступен вариант без входа или по ID, после оплаты мы покажем дальнейшую инструкцию по активации.", "If a no-login or ID-based option is available for the product, we will show further activation instructions after payment."],
  ["Подписка подходит для работы с текстами, кодом, поиском, анализом информации и быстрых рабочих сценариев.", "The subscription is suitable for text, code, search, information analysis, and fast work scenarios."],
  ["Выбираете тариф SuperGrok и способ подключения.", "Choose a SuperGrok plan and connection method."],
  ["Пользуетесь SuperGrok весь оплаченный срок.", "Use SuperGrok for the full paid period."],
  ["Подключаем подписку выбранным способом", "We connect the subscription using the selected method"],
  ["Короткие ответы на самые частые вопросы по SuperGrok", "Short answers to common SuperGrok questions"],
  ["Как проходит подключение SuperGrok?", "How does SuperGrok connection work?"],
  ["Вы выбираете срок подписки и способ доставки, оформляете заказ, а после оплаты получаете дальнейшую инструкцию по подключению или активации.", "Choose the subscription term and delivery method, place the order, and after payment receive further connection or activation instructions."],
  ["Если для выбранного тарифа нужен ID аккаунта, система покажет нужный сценарий без лишних полей для логина и пароля.", "If the selected plan requires an account ID, the system will show the correct flow without unnecessary login and password fields."],

  ["Каталог GPTishka: нейросети, V*N и будущие пополнения в единой витрине.", "GPTishka catalog: AI services, V*N, and future top-ups in one storefront."],
  ["Все разделы GPTishka: ChatGPT, Claude, SuperGrok, V*N и будущие пополнения.", "All GPTishka sections: ChatGPT, Claude, SuperGrok, V*N, and future top-ups."],
  ["Каталог GPTishka", "GPTishka catalog"],
  ["Навигация", "Navigation"],
  ["Разделы каталога", "Catalog sections"],
  ["Все товары GPTishka", "All GPTishka products"],
  ["Открыть тарифы ChatGPT", "Open ChatGPT plans"],
  ["Открыть тарифы Claude", "Open Claude plans"],
  ["Открыть тарифы SuperGrok", "Open SuperGrok plans"],
  ["тарифов", "plans"],
  ["тарифа", "plans"],
  ["тариф", "plan"],
  ["Go, Plus и Pro для работы, учёбы, текста, кода и документов.", "Go, Plus, and Pro for work, study, text, code, and documents."],
  ["и Pro для работы, учёбы, текста, кода и документов.", "and Pro for work, study, text, code, and documents."],
  ["Claude PRO для текста, анализа, сценариев и повседневных задач.", "Claude PRO for text, analysis, scenarios, and everyday tasks."],
  ["для текста, анализа, сценариев и повседневных задач.", "for text, analysis, scenarios, and everyday tasks."],
  ["Тарифы SuperGrok с быстрым подключением и поддержкой GPTishka.", "SuperGrok plans with fast connection and GPTishka support."],
  ["1 месяц", "1 month"],
  ["от 1 290 RUB", "from 1,290 RUB"],
  ["от 1 999 RUB", "from 1,999 RUB"],
  ["от 1 490 RUB", "from 1,490 RUB"],
  ["от 199 RUB", "from 199 RUB"],
  ["К тарифам", "View plans"],
  ["Каталог нейросетей GPTishka: ChatGPT, Claude и SuperGrok. Выберите сервис и откройте готовую страницу с тарифами.", "GPTishka AI catalog: ChatGPT, Claude, and SuperGrok. Choose a service and open its ready-made plan page."],
  ["Нейросети GPTishka — ChatGPT, Claude, SuperGrok", "GPTishka AI services — ChatGPT, Claude, SuperGrok"],
  ["Выберите AI-сервис и перейдите к тарифам, оплате и подключению.", "Choose an AI service and go to plans, payment, and connection."],
  ["ИИ-сервисы", "AI Services"],
  ["Каталог V*N GPTishka. Откройте страницу GPTishka V*N и выберите срок VLESS-доступа.", "GPTishka V*N catalog. Open the GPTishka V*N page and choose a VLESS access term."],
  ["GPTishka V*N — каталог", "GPTishka V*N — Catalog"],
  ["V*N-доступ с выдачей VLESS-ключа через текущую систему GPTishka.", "V*N access with VLESS key delivery through the current GPTishka system."],
  ["VLESS-доступ с автоматической выдачей ключа после оплаты.", "VLESS access with automatic key delivery after payment."],
  ["доступ с автоматической выдачей ключа после оплаты.", "access with automatic key delivery after payment."],

  ["GPTishka V*N — тарифы VLESS Reality с автоматической выдачей ключа после оплаты, поддержкой и понятной инструкцией подключения.", "GPTishka V*N — VLESS Reality plans with automatic key delivery after payment, support, and clear connection instructions."],
  ["GPTishka V*N — VLESS-доступ | GPTishka", "GPTishka V*N — VLESS Access | GPTishka"],
  ["Выберите срок GPTishka V*N, оплатите заказ, а система выдаст VLESS-ключ и инструкцию подключения после успешной оплаты.", "Choose a GPTishka V*N term, pay for the order, and the system will issue a VLESS key and connection instructions after successful payment."],
  ["VLESS-доступ | GPTishka", "VLESS Access | GPTishka"],
  ["V*N-доступ", "V*N access"],
  ["Оформите V*N без лишних настроек на старте. Выберите срок, оплатите заказ, а GPTishka автоматически выдаст VLESS-ключ и покажет инструкцию подключения после успешной оплаты.", "Get V*N without unnecessary setup at the start. Choose a term, pay for the order, and GPTishka will automatically issue a VLESS key and show connection instructions after successful payment."],
  ["Фильтры V*N-тарифов", "V*N plan filters"],
  ["с автоматической выдачей ключа", "with automatic key delivery"],
  ["После успешной оплаты система создаёт V*N-доступ и открывает страницу, где можно скопировать VLESS-ссылку, QR-код или данные для подключения. Никакие токены активации вводить не нужно.", "After successful payment, the system creates V*N access and opens a page where you can copy the VLESS link, QR code, or connection details. No activation tokens are required."],
  ["Что получает клиент", "What the client receives"],
  ["Рабочий VLESS Reality доступ, инструкцию подключения и поддержку на весь оплаченный срок.", "Working VLESS Reality access, connection instructions, and support for the full paid period."],
  ["Как происходит выдача", "How delivery works"],
  ["Оплата проходит через общий checkout GPTishka, а backend выдаёт именно V*N-ключ — без перехода в окно активации по токену.", "Payment goes through the shared GPTishka checkout, and the backend issues the V*N key directly — without opening token activation."],
  ["Как подключить GPTishka V*N", "How to connect GPTishka V*N"],
  ["Весь процесс рассчитан на быстрый запуск: выбрать срок, оплатить, получить ключ и добавить его в приложение.", "The whole process is designed for a quick start: choose a term, pay, receive the key, and add it to the app."],
  ["Порядок подключения", "Connection flow"],
  ["Выберите нужный срок V*N-доступа.", "Choose the required V*N access term."],
  ["Оформите заказ через модальное окно и оплатите удобным способом.", "Place the order through the modal and pay with a convenient method."],
  ["После подтверждения оплаты откроется страница выдачи V*N-доступа.", "After payment confirmation, the V*N access delivery page will open."],
  ["Скопируйте VLESS-ссылку или QR-код и добавьте его в приложение.", "Copy the VLESS link or QR code and add it to the app."],
  ["Почему это удобно", "Why it is convenient"],
  ["Ключ выдаётся автоматически после оплаты", "The key is issued automatically after payment"],
  ["Не нужно вводить токен активации", "No activation token is required"],
  ["Поддержка помогает с настройкой приложения", "Support helps configure the app"],
  ["Можно продлить доступ через GPTishka", "Access can be renewed through GPTishka"],
  ["Доступ привязан к оплаченному сроку", "Access is linked to the paid term"],
  ["Короткие ответы по оплате, выдаче VLESS-ключа и подключению GPTishka V*N.", "Short answers about payment, VLESS key delivery, and GPTishka V*N connection."],
  ["После успешной оплаты заказ получает статус «оплачен», backend создаёт V*N-доступ и открывает страницу выдачи VLESS-ключа.", "After successful payment, the order receives paid status, the backend creates V*N access, and the VLESS key delivery page opens."],
  ["Для V*N не используется окно «Продлить/активировать» с токеном — клиент сразу получает данные подключения.", "V*N does not use the Extend / Activate token window — the client immediately receives connection details."],
  ["Платёжные данные обрабатываются на стороне платёжной системы, GPTishka их не хранит.", "Payment data is processed by the payment provider; GPTishka does not store it."],
  ["Куда вводить VLESS-ключ?", "Where do I enter the VLESS key?"],
  ["На странице выдачи будет инструкция. Обычно VLESS-ссылку нужно импортировать в приложение Karing, V2Ray, Hiddify или другой совместимый V*N-клиент.", "The delivery page includes instructions. Usually, the VLESS link should be imported into Karing, V2Ray, Hiddify, or another compatible V*N client."],
  ["Можно ли получить помощь с настройкой?", "Can I get setup help?"],
  ["Да. Если приложение не подключается или нужна помощь с импортом ключа, менеджер GPTishka поможет разобраться по указанным контактам.", "Yes. If the app does not connect or you need help importing the key, a GPTishka manager will help through the provided contacts."],

  ["Пополнение баланса Steam через ключи Манн Ко: укажите количество ключей, Steam trade-ссылку и оплатите заказ через GPTishka.", "Steam balance top-up with Mann Co. keys: enter the number of keys, Steam trade URL, and pay through GPTishka."],
  ["Каталог пополнений GPTishka: сейчас доступно пополнение Steam через ключи Манн Ко. Выберите товар и оформите заказ без модального окна.", "GPTishka top-ups catalog: Steam top-up with Mann Co. keys is currently available. Choose a product and place an order without a modal window."],
  ["Пополнения GPTishka — Steam", "GPTishka top-ups — Steam"],
  ["Раздел пополнений GPTishka. Сейчас доступно пополнение Steam через ключи Манн Ко: 1 ключ = 151 RUB.", "GPTishka top-ups section. Steam top-up with Mann Co. keys is currently available: 1 key = 151 RUB."],
  ["Пополнение Steam ключами Манн Ко | GPTishka", "Steam top-up with Mann Co. keys | GPTishka"],
  ["1 ключ = 151 RUB. Укажите количество ключей и Steam trade-ссылку — менеджер обработает заказ после оплаты.", "1 key = 151 RUB. Enter the number of keys and Steam trade URL — a manager will process the order after payment."],
  ["Пополнение Steam ключами Манн Ко", "Steam top-up with Mann Co. keys"],
  ["Открыть пополнение Steam", "Open Steam top-up"],
  ["Пополнение Steam", "Steam top-up"],
  ["1 товар", "1 product"],
  ["Пополнение баланса Steam ключами Манн Ко через trade-ссылку.", "Steam balance top-up with Mann Co. keys through a trade URL."],
  ["Пополнение баланса Steam ключами Манн Ко. Укажите trade-ссылку, выберите количество ключей и оплатите заказ.", "Steam balance top-up with Mann Co. keys. Enter your trade URL, choose the number of keys, and pay for the order."],
  ["от 151 RUB", "from 151 RUB"],
  ["К покупке", "Buy now"],
  ["Укажите количество ключей и Steam trade-ссылку. После оплаты заказ попадёт менеджеру: сейчас выдача ручная, позже добавим автоматическую отправку ключей.", "Enter the number of keys and your Steam trade URL. After payment, the order goes to a manager: delivery is manual for now, automatic key sending will be added later."],
  ["1 ключ = 151 RUB", "1 key = 151 RUB"],
  ["Оплата картой или СБП", "Card or SBP payment"],
  ["Trade-ссылка обязательна", "Trade URL is required"],
  ["Оформление пополнения Steam", "Steam top-up checkout"],
  ["+10% к пополнению ключами Манн Ко", "+10% top-up with Mann Co. keys"],
  ["Подходит, если у вас открыта торговая площадка Steam и нужен быстрый баланс.", "Suitable if your Steam market is unlocked and you need balance quickly."],
  ["Оформление заказа", "Order checkout"],
  ["Выберите количество ключей", "Choose the number of keys"],
  ["Email для статуса заказа", "Email for order status"],
  ["Нужен для связи и истории заказа.", "Needed for contact and order history."],
  ["Steam trade-ссылка", "Steam trade URL"],
  ["Формат:", "Format:"],
  ["Количество ключей", "Number of keys"],
  ["Уменьшить количество", "Decrease quantity"],
  ["Увеличить количество", "Increase quantity"],
  ["Цена за ключ", "Price per key"],
  ["К оплате", "Total"],
  ["Оплата", "Payment"],
  ["Комментарий к заказу", "Order comment"],
  ["Необязательно. Можно указать пожелания или детали по трейду.", "Optional. You can add preferences or trade details."],
  ["Например: отправить после 18:00", "Example: send after 18:00"],
  ["Нажимая кнопку, вы соглашаетесь с", "By clicking the button, you agree to the"],
  ["</a> и <a", "</a> and <a"],
  ["офертой", "public offer"],
  ["политикой конфиденциальности", "privacy policy"],
  ["Оплатить 151 RUB", "Pay 151 RUB"],
];

const linkMap = [
  ["https://gptishka.shop/store/vpn/activate/", "https://gptishka.shop/en/store/vpn/activate/"],
  ["https://gptishka.shop/store/vpn/activate", "https://gptishka.shop/en/store/vpn/activate"],
  ["https://gptishka.shop/store/steam/topup/", "https://gptishka.shop/en/store/steam/topup/"],
  ["https://gptishka.shop/store/steam/topup", "https://gptishka.shop/en/store/steam/topup"],
  ["https://gptishka.shop/store/steam/", "https://gptishka.shop/en/store/steam/"],
  ["https://gptishka.shop/store/steam", "https://gptishka.shop/en/store/steam"],
  ["https://gptishka.shop/catalog/ai/", "https://gptishka.shop/en/catalog/ai/"],
  ["https://gptishka.shop/catalog/ai", "https://gptishka.shop/en/catalog/ai"],
  ["https://gptishka.shop/catalog/vpn/", "https://gptishka.shop/en/catalog/vpn/"],
  ["https://gptishka.shop/catalog/vpn", "https://gptishka.shop/en/catalog/vpn"],
  ["https://gptishka.shop/catalog/", "https://gptishka.shop/en/catalog/"],
  ["https://gptishka.shop/catalog", "https://gptishka.shop/en/catalog"],
  ["https://gptishka.shop/chatgpt", "https://gptishka.shop/en/chatgpt.html"],
  ["https://gptishka.shop/claude", "https://gptishka.shop/en/claude.html"],
  ["https://gptishka.shop/supergrok", "https://gptishka.shop/en/supergrok.html"],
  ['href="/store/vpn/activate/"', 'href="/en/store/vpn/activate/"'],
  ['href="/store/vpn/activate"', 'href="/en/store/vpn/activate"'],
  ['href="/store/steam/topup/"', 'href="/en/store/steam/topup/"'],
  ['href="/store/steam/topup"', 'href="/en/store/steam/topup"'],
  ['href="/store/steam/"', 'href="/en/store/steam/"'],
  ['href="/store/steam"', 'href="/en/store/steam"'],
  ['href="/store/vpn/"', 'href="/en/store/vpn/"'],
  ['href="/store/vpn"', 'href="/en/store/vpn"'],
  ['href="/catalog/ai/"', 'href="/en/catalog/ai/"'],
  ['href="/catalog/ai"', 'href="/en/catalog/ai"'],
  ['href="/catalog/vpn/"', 'href="/en/catalog/vpn/"'],
  ['href="/catalog/vpn"', 'href="/en/catalog/vpn"'],
  ['href="/catalog/"', 'href="/en/catalog/"'],
  ['href="/catalog"', 'href="/en/catalog"'],
  ['href="/chatgpt"', 'href="/en/chatgpt.html"'],
  ['href="/claude"', 'href="/en/claude.html"'],
  ['href="/supergrok"', 'href="/en/supergrok.html"'],
  ['href="/app/"', 'href="/app/?lang=en"'],
  ['href="/#', 'href="/en/#'],
  ['href="/about.html"', 'href="/en/about.html"'],
  ['href="/guarantee.html"', 'href="/en/guarantee.html"'],
  ['href="/contact.html"', 'href="/en/contact.html"'],
  ['href="/site-map.html"', 'href="/en/site-map.html"'],
  ['href="/oferta.html"', 'href="/en/oferta.html"'],
  ['href="/politika.html"', 'href="/en/politika.html"'],
  ['href="/refund.html"', 'href="/en/refund.html"'],
  ['href="about.html"', 'href="/en/about.html"'],
  ['href="guarantee.html"', 'href="/en/guarantee.html"'],
  ['href="contact.html"', 'href="/en/contact.html"'],
  ['href="oferta.html"', 'href="/en/oferta.html"'],
  ['href="politika.html"', 'href="/en/politika.html"'],
  ['href="refund.html"', 'href="/en/refund.html"'],
  ['href="/"', 'href="/en/"'],
];

function replaceAllLiteral(input, from, to) {
  return input.split(from).join(to);
}

function replaceTranslation(input, from, to) {
  const escaped = from
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const startsWithWord = /^[\p{L}\p{N}]/u.test(from);
  const endsWithWord = /[\p{L}\p{N}]$/u.test(from);
  const pattern = `${startsWithWord ? "(?<![\\p{L}\\p{N}])" : ""}${escaped}${endsWithWord ? "(?![\\p{L}\\p{N}])" : ""}`;
  return input.replace(new RegExp(pattern, "gu"), () => to);
}

function stripTrailingWhitespace(input) {
  return input.replace(/[ \t]+$/gm, "").replace(/\r?\n(?:\r?\n)+$/, "\n");
}

function canonicalPathFor(targetRel) {
  const withoutIndex = targetRel.replace(/\/index\.html$/, "/");
  return `/${withoutIndex.replace(/\\/g, "/")}`;
}

function localizeCurrentLanguage(html) {
  return html
    .replace(/(<div class="lang-current"[^>]*>[\s\S]*?<img[^>]*src=")\/assets\/img\/iconrus\.avif("[\s\S]*?<span>)[\s\S]*?(<\/span>)/, "$1/assets/img/iconeng.png$2English$3")
    .replace(/(<button[^>]*class="lang-current"[^>]*>[\s\S]*?<img[^>]*src=")\/assets\/img\/iconrus\.avif("[\s\S]*?<span>)[\s\S]*?(<\/span>)/, "$1/assets/img/iconeng.png$2English$3");
}

function ensureEnglishLanguageSwitch(html) {
  if (html.includes('id="langSwitch"')) return html;

  const languageSwitch = `
    <div class="header-tools header-actions">
      <div class="lang-switch" id="langSwitch">
        <button type="button" class="lang-current" id="langCurrent" aria-label="Choose language">
          <img loading="lazy" decoding="async" src="/assets/img/iconeng.png" alt="">
          <span>English</span>
          <span class="arrow">▾</span>
        </button>
        <div class="lang-dropdown">
          <div class="lang-item" data-lang="ru">
            <img loading="lazy" decoding="async" src="/assets/img/iconrus.avif" alt="">
            <span>Russian</span>
          </div>
          <div class="lang-item" data-lang="en">
            <img loading="lazy" decoding="async" src="/assets/img/iconeng.png" alt="">
            <span>English</span>
          </div>
        </div>
      </div>
    </div>`;

  return html.replace(/<header\b[\s\S]*?<\/header>/i, (header) => {
    const closeIndex = header.lastIndexOf("</div>");
    if (closeIndex === -1) return header;
    return header.slice(0, closeIndex) + languageSwitch + "\n" + header.slice(closeIndex);
  });
}

function translateHtml(html, targetRel) {
  let out = html;
  out = out.replace('<html lang="ru">', '<html lang="en">');
  out = out.replace(/"inLanguage": "ru"/g, '"inLanguage": "en"');

  for (const [from, to] of [...generatedTranslations].sort((a, b) => b[0].length - a[0].length)) {
    out = replaceTranslation(out, from, to);
  }
  for (const [from, to] of forcedTranslations) {
    out = replaceAllLiteral(out, from, to);
  }

  for (const [from, to] of linkMap) out = replaceAllLiteral(out, from, to);

  const canonicalPath = canonicalPathFor(targetRel);
  out = out.replace(/<link rel="canonical" href="https:\/\/gptishka\.shop\/[^"]*">/, `<link rel="canonical" href="https://gptishka.shop${canonicalPath}">`);
  out = out.replace(/<meta property="og:url" content="https:\/\/gptishka\.shop\/[^"]*"\s*\/>/, `<meta property="og:url" content="https://gptishka.shop${canonicalPath}" />`);
  out = localizeCurrentLanguage(out);
  out = ensureEnglishLanguageSwitch(out);
  out = out.replace(/toLocaleString\("ru-RU"\)/g, 'toLocaleString("en-US")');
  out = out.replace(/toLocaleString\("ru-RU",/g, 'toLocaleString("en-US",');
  return stripTrailingWhitespace(out);
}

for (const [src, dest] of pages) {
  const html = fs.readFileSync(path.join(root, src), "utf8");
  const translated = translateHtml(html, dest);
  const fullDest = path.join(root, dest);
  fs.mkdirSync(path.dirname(fullDest), { recursive: true });
  fs.writeFileSync(fullDest, translated, "utf8");
}

console.log(JSON.stringify({ generated: pages.map(([, dest]) => dest) }, null, 2));
