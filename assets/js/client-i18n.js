(() => {
  const url = new URL(window.location.href);
  const englishMode = /^\/en(?:\/|$)/.test(url.pathname) || url.searchParams.get("lang") === "en";
  if (!englishMode) return;

  document.documentElement.lang = "en";
  document.documentElement.dataset.clientLanguage = "en";

  const translations = new Map([
    ["Отзывы покупателей — GPTishka", "Customer reviews — GPTishka"],
    ["iTunes и App Store", "iTunes & App Store"],
    ["Отзыв", "Review"],
    ["Покупатель", "Customer"],
    ["Отзыв из Telegram", "Review from Telegram"],
    ["Отзыв из VK", "Review from VK"],
    ["Главная", "Home"],
    ["Тарифы", "Plans"],
    ["Как это работает", "How it works"],
    ["Вопросы и ответы", "Questions and answers"],
    ["Контакты", "Contact"],
    ["На главную", "Back to home"],
    ["Публичная оферта", "Public offer"],
    ["Политика конфиденциальности", "Privacy policy"],
    ["Условия возврата", "Refund policy"],
    ["О сервисе", "About"],
    ["Гарантия", "Guarantee"],
    ["Связь с нами", "Contact us"],
    ["Все права защищены.", "All rights reserved."],
    ["Все права защищены, копирование запрещено.", "All rights reserved. Copying is prohibited."],

    ["Личный кабинет", "Account"],
    ["Личный кабинет - GPTишка", "Account — GPTishka"],
    ["Вход в личный кабинет через Telegram. После авторизации доступны ключ VPN, срок подписки и продление.", "Sign in through Telegram to view your VPN key, subscription term and renewal options."],
    ["Вход через Telegram", "Sign in with Telegram"],
    ["Нажмите кнопку, откройте бота и подтвердите вход командой Start. Вход работает для Telegram, который уже привязан к вашему кабинету.", "Press the button, open the bot and confirm sign-in with Start. Use the Telegram account already linked to your account."],
    ["Войти через Telegram", "Sign in with Telegram"],
    ["Проверить вход", "Check sign-in"],
    ["Ваш кабинет", "Your account"],
    ["Обновить", "Refresh"],
    ["Выйти", "Sign out"],
    ["Подписки VPN", "VPN subscriptions"],
    ["Тариф", "Plan"],
    ["Статус", "Status"],
    ["Окончание", "Expires"],
    ["Осталось", "Time left"],
    ["Ключ", "Key"],
    ["Действие", "Action"],
    ["Привяжите Telegram, чтобы получать напоминания о продлении подписки.", "Link Telegram to receive subscription renewal reminders."],
    ["Привязать Telegram", "Link Telegram"],
    ["Проверить статус", "Check status"],
    ["Отвязать", "Unlink"],
    ["Уведомления", "Notifications"],
    ["Сервисные письма о сроке подписки. Маркетинговые письма здесь не настраиваются.", "Service emails about your subscription term. Marketing emails are not managed here."],
    ["Включить email-уведомления", "Enable email notifications"],
    ["Напоминать за 7 дней", "Remind me 7 days before"],
    ["Напоминать за 3 дня", "Remind me 3 days before"],
    ["Напоминать за 1 день", "Remind me 1 day before"],
    ["Уведомлять после истечения", "Notify me after expiration"],
    ["Сохранить настройки", "Save settings"],
    ["Сначала нажмите «Войти через Telegram».", "First press “Sign in with Telegram”."],
    ["Ожидаем подтверждение в Telegram...", "Waiting for confirmation in Telegram..."],
    ["Токен входа уже использован. Запросите вход снова.", "This sign-in token has already been used. Request a new one."],
    ["Ссылка входа устарела. Запросите новую.", "The sign-in link has expired. Request a new one."],
    ["Не удалось завершить вход через Telegram.", "Could not complete Telegram sign-in."],
    ["Вход выполнен.", "Signed in."],
    ["Ошибка сети при входе через Telegram.", "Network error during Telegram sign-in."],
    ["Не получили подтверждение. Нажмите «Проверить вход» или запросите вход заново.", "No confirmation received. Press “Check sign-in” or request a new link."],
    ["Генерируем ссылку Telegram...", "Creating a Telegram link..."],
    ["Не удалось создать Telegram-ссылку для входа.", "Could not create a Telegram sign-in link."],
    ["Ссылка входа не получена.", "The sign-in link was not received."],
    ["Откройте Telegram, нажмите Start в боте. Возвратитесь на сайт — вход завершится автоматически.", "Open Telegram and press Start in the bot. Return to the site and sign-in will finish automatically."],
    ["Ошибка сети при запросе Telegram-входа.", "Network error while requesting Telegram sign-in."],
    ["Telegram не привязан.", "Telegram is not linked."],
    ["привязан", "linked"],
    ["Не удалось загрузить Telegram статус.", "Could not load Telegram status."],
    ["Ошибка сети при получении Telegram статуса.", "Network error while loading Telegram status."],
    ["Генерируем ссылку...", "Creating a link..."],
    ["Не удалось создать Telegram ссылку.", "Could not create a Telegram link."],
    ["Ссылка не получена.", "The link was not received."],
    ["Открыт Telegram. Нажмите Start в боте, затем обновите статус.", "Telegram opened. Press Start in the bot, then refresh the status."],
    ["Ошибка сети при создании Telegram ссылки.", "Network error while creating the Telegram link."],
    ["Не удалось отвязать Telegram.", "Could not unlink Telegram."],
    ["Telegram отвязан.", "Telegram unlinked."],
    ["Ошибка сети при отвязке Telegram.", "Network error while unlinking Telegram."],
    ["Сохраняем...", "Saving..."],
    ["Не удалось сохранить настройки.", "Could not save settings."],
    ["Настройки обновлены.", "Settings updated."],
    ["Ошибка сети при сохранении.", "Network error while saving."],
    ["Загрузка...", "Loading..."],
    ["Ошибка", "Error"],
    ["Ошибка сети", "Network error"],
    ["Подписки не найдены.", "No subscriptions found."],
    ["Показать ключ", "Show key"],
    ["Загрузка данных...", "Loading account data..."],
    ["Не удалось загрузить кабинет.", "Could not load the account."],
    ["Данные актуальны.", "Data is up to date."],
    ["Ошибка сети при загрузке кабинета.", "Network error while loading the account."],

    ["Что пишут покупатели", "What customers say"],
    ["Вернуться на главную", "Back to home"],
    ["Фильтр отзывов", "Review filter"],
    ["Отзывы временно не загрузились", "Reviews could not be loaded"],
    ["Откройте исходные площадки или попробуйте обновить страницу немного позже.", "Open the source platforms or refresh the page a little later."],
    ["Показать ещё", "Show more"],
    ["Откуда берём данные", "Where the data comes from"],
    ["Источники отзывов", "Review sources"],
    ["Статус каждого источника отображается без скрытых подмен.", "Each source status is shown transparently."],
    ["Проверяемые источники", "Verifiable sources"],
    ["Отзывы покупателей", "Customer reviews"],
    ["Собираем обратную связь из открытых профилей GPTishka. Каждый отзыв ведёт к исходной площадке, а данные обновляются автоматически.", "We collect feedback from GPTishka’s public profiles. Every review links to its source and the data updates automatically."],
    ["Статистика отзывов", "Review statistics"],
    ["отзывов на всех площадках", "reviews across all platforms"],
    ["средняя оценка", "average rating"],
    ["последняя проверка", "last checked"],
    ["Всё прозрачно", "Full transparency"],
    ["Хотите проверить или оставить отзыв?", "Want to verify or leave a review?"],
    ["Для проверяемых публикаций ссылка на площадку находится в карточке. Чтобы оставить отзыв в Telegram, перейдите в наш канал.", "Each verifiable review includes a source link. To leave a review on Telegram, open our channel."],
    ["Отзывы в Telegram", "Reviews on Telegram"],
    ["Связаться с нами", "Contact us"],
    ["Все отзывы", "All reviews"],
    ["Открытый источник", "Public source"],
    ["Источник ↗", "Source ↗"],
    ["В этом месяце", "This month"],
    ["Отзывы GPTishka", "GPTishka reviews"],
    ["Покупатель", "Customer"],
    ["Отзыв покупателя", "Customer review"],
    ["Отзыв оставлен на сайте", "Review submitted on the website"],
    ["Источник", "Source"],
    ["Открыть исходный отзыв", "Open the original review"],
    ["Источник доступен", "Source available"],
    ["Показана сохранённая копия", "Saved copy shown"],
    ["Ожидает публичную ленту", "Waiting for a public feed"],
    ["Источник временно недоступен", "Source temporarily unavailable"],
    ["Канал подключён к системе", "Channel connected"],
    ["Публичный профиль", "Public profile"],
    ["нет данных", "no data"],
    ["недавно", "recently"],

    ["GPTishka — тарифные планы", "GPTishka — subscription plans"],
    ["Все сервисы", "All services"],
    ["← Все сервисы", "← All services"],
    ["Тарифные планы", "Subscription plans"],
    ["Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя.", "Choose a plan and pay for the order — GPTishka will handle the connection."],
    ["Фильтры тарифов", "Plan filters"],
    ["Описание появится после загрузки настроек страницы.", "The description will appear after the page settings load."],

    ["Оплата обрабатывается", "Payment is processing"],
    ["Оплата обрабатывается - GPTишка", "Payment processing — GPTishka"],
    ["Проверяем платеж через webhook. Обычно это занимает до 30 секунд.", "We are checking the payment. This usually takes up to 30 seconds."],
    ["Заказ:", "Order:"],
    ["Сумма:", "Amount:"],
    ["Ожидаем подтверждение платежа...", "Waiting for payment confirmation..."],
    ["К тарифам", "View plans"],
    ["не найден", "not found"],
    ["Не удалось определить order_id. Откройте оплату заново.", "Could not determine the order ID. Please restart payment."],
    ["Платеж еще в обработке. Обновите страницу через несколько секунд.", "The payment is still processing. Refresh the page in a few seconds."],
    ["Оплачено. Переводим в активацию VPN...", "Paid. Opening VPN activation..."],
    ["Оплачено. Заявка передана менеджеру — мы свяжемся с вами по указанным контактам.", "Paid. The order was sent to a manager; we will contact you using the details provided."],
    ["Оплачено. Открываем шаги: VPN + активация подписки...", "Paid. Opening the VPN and subscription activation steps..."],
    ["Оплачено. Переводим на страницу активации...", "Paid. Opening the activation page..."],
    ["Платеж возвращен.", "Payment refunded."],
    ["Оплата не подтверждена.", "Payment not confirmed."],
    ["Ошибка оплаты", "Payment error"],
    ["Ошибка оплаты - GPTишка", "Payment error — GPTishka"],
    ["Платеж не был завершен. Вы можете повторить попытку.", "The payment was not completed. You can try again."],
    ["Номер заказа:", "Order number:"],
    ["Уведомление о независимом сервисе", "Independent service notice"],
    ["GPTishka — независимый магазин цифровых услуг. Мы не являемся официальным представителем OpenAI, Anthropic, xAI или других правообладателей. Названия продуктов используются только для описания совместимых услуг, запрошенных пользователями. Если что-то выглядит непонятно — напишите в", "GPTishka is an independent digital services marketplace. We are not affiliated with OpenAI, Anthropic, xAI or other trademark owners. Product names are used only to describe compatible services requested by users. If anything is unclear, contact"],
    ["поддержку", "support"],
    ["Попробовать снова", "Try again"],
    ["404 - Страница не найдена", "404 — Page not found"],
    ["Страница не найдена. Проверьте адрес или вернитесь на главную.", "Page not found. Check the address or return to the home page."],
    ["Связаться с нами", "Contact us"],
    ["500 - Временная ошибка", "500 — Temporary error"],
    ["Внутренняя ошибка сервера. Повторите попытку через несколько минут.", "Internal server error. Please try again in a few minutes."]
  ]);

  const seoPages = {
    "/chatgpt-plus-kupit.html": {
      title: "Buy ChatGPT Plus online — GPTishka",
      description: "A practical guide to purchasing ChatGPT Plus online with clear order status, support and warranty.",
      html: `
        <a href="/en/">← Back to home</a>
        <h1>Buy ChatGPT Plus online</h1>
        <p>GPTishka helps you place an order online, follow a clear activation flow and receive support throughout the paid subscription period.</p>
        <div class="seo-note">Most orders move to the next activation step within 5–15 minutes after payment confirmation.</div>
        <h2>Who this service is for</h2>
        <ul><li>Customers who need ChatGPT Plus for work or everyday tasks.</li><li>Users who prefer activation without sharing an account password.</li><li>Customers who want assistance if activation requires an extra step.</li></ul>
        <h2>What is included</h2>
        <ul><li>Order processing after payment.</li><li>Step-by-step activation instructions.</li><li>Telegram and email support.</li><li>Warranty support for the paid term.</li></ul>
        <h2>How to order</h2>
        <ol><li>Choose a suitable plan.</li><li>Check your contact details.</li><li>Pay using an available payment method.</li><li>Follow the activation instructions and contact support if needed.</li></ol>
        <h2>Before payment</h2>
        <p>Check the selected plan, subscription term and activation method. If you are unsure, ask support before paying.</p>
        <h2>Frequently asked questions</h2>
        <p><strong>Do I need to share my password?</strong><br>No. Available plans use a flow that does not request your account password.</p>
        <p><strong>How long does activation take?</strong><br>Most orders proceed within 5–15 minutes after payment confirmation.</p>
        <p><strong>What if activation fails?</strong><br>Contact support with your order number. We will check the status and help complete the order.</p>
        <p><a href="/en/#pricing">Choose a plan</a> · <a href="/en/contact.html">Contact support</a></p>`
    },
    "/chatgpt-plus-cena.html": {
      title: "ChatGPT Plus price and plans — GPTishka",
      description: "How to compare ChatGPT Plus plans, terms and support before ordering.",
      html: `
        <a href="/en/">← Back to home</a>
        <h1>ChatGPT Plus price and connection</h1>
        <p>When comparing plans, consider not only the final price but also the subscription term, activation method, support and warranty conditions.</p>
        <div class="seo-note">Use the checkout page for current prices and available plans.</div>
        <h2>What affects the price</h2>
        <ul><li>The subscription plan and term.</li><li>The available payment infrastructure.</li><li>Support and warranty conditions.</li><li>The selected activation method.</li></ul>
        <h2>How to choose a plan</h2>
        <p>Choose a shorter term to test the service or a plan that matches your regular workload. All current conditions are displayed before payment.</p>
        <h2>How to place an order</h2>
        <ol><li>Select a plan.</li><li>Provide the required activation details.</li><li>Pay and wait for confirmation.</li></ol>
        <h2>Frequently asked questions</h2>
        <p><strong>Are there hidden charges?</strong><br>No. Use the final amount shown during checkout and the selected plan description.</p>
        <p><strong>How do I know which plan fits?</strong><br>Consider how often you use the service and the required subscription term. Support can help before payment.</p>
        <p><a href="/en/#pricing">View current plans</a> · <a href="/en/contact.html">Ask support</a></p>`
    },
    "/kak-oplatit-chatgpt-v-rossii.html": {
      title: "How to pay for a ChatGPT order — GPTishka",
      description: "A step-by-step payment guide with available methods and support.",
      html: `
        <a href="/en/">← Back to home</a>
        <h1>How to pay for a ChatGPT order</h1>
        <p>This guide covers the payment stage, from choosing a plan to confirming that the order was processed.</p>
        <div class="seo-note">Before payment, make sure the contact email for order updates is correct.</div>
        <h2>Available payment methods</h2>
        <ul><li>SBP</li><li>Bank cards supported by the selected gateway</li><li>Secure hosted payment forms</li></ul>
        <h2>Payment steps</h2>
        <ol><li>Choose a plan.</li><li>Check the term, amount and contact details.</li><li>Select a payment method and complete payment.</li><li>Wait for confirmation and follow the next instructions.</li></ol>
        <h2>If payment does not complete</h2>
        <p>Do not create multiple duplicate orders. Contact support with the order number and payment details so we can check the transaction.</p>
        <h2>Payment security</h2>
        <p>Payment is processed by the selected payment gateway. GPTishka does not store bank-card details.</p>
        <p><a href="/en/#pricing">Choose ChatGPT Plus</a> · <a href="/en/contact.html">Contact support</a></p>`
    },
    "/podklyuchenie-chatgpt-online.html": {
      title: "Connect ChatGPT online — GPTishka",
      description: "Online ChatGPT connection with step-by-step instructions and support.",
      html: `
        <a href="/en/">← Back to home</a>
        <h1>Connect ChatGPT online</h1>
        <p>Place an order on the site and receive the next activation step online. No office visit or long manual correspondence is required.</p>
        <div class="seo-note">Most orders move forward within 5–15 minutes after payment confirmation.</div>
        <h2>How online connection works</h2>
        <ol><li>Choose a plan and place an order.</li><li>After payment, open the provided activation instructions.</li><li>The connection runs automatically or with support assistance.</li><li>Check the result in your account.</li></ol>
        <h2>What you receive</h2>
        <ul><li>A clear order status and next-step instructions.</li><li>Support if assistance is required.</li><li>Warranty for the paid subscription term.</li></ul>
        <h2>If activation is delayed</h2>
        <p>Send your order number to support. This is the fastest way for us to check the status and complete the connection.</p>
        <p><a href="/en/#pricing">Connect now</a> · <a href="/en/contact.html">Contact support</a></p>`
    }
  };

  translations.set("Дополнительные настройки подарка", "Additional gift settings");
  // Shared checkout copy; never translate values entered by the customer.
  Object.entries({"Тарифные планы": "Subscription plans", "Фильтры тарифов": "Plan options", "Быстрые разделы GPTishka": "GPTishka navigation", "Контакты": "Contact details", "Для статуса заказа и связи": "For order updates and support", "Почта": "Email", "Нужна для связи по заказу": "Used for order updates", "Сюда придет вся информация по заказу": "Order information will be sent here", "Дополнительно": "Additional options", "Оформить в подарок": "Send as a gift", "Покажем поля получателя после включения": "Enable to enter the recipient's details", "🎁 Хотите устроить сюрприз?": "Sending a surprise?", "Вы выбираете подписку и указываете получателя. Мы сами свяжемся с ним, уточним данные и подключим подписку без передачи логинов и паролей.": "Choose a subscription and enter the recipient's details. We will contact them to arrange activation without sharing login credentials.", "Укажите получателя и контакт — остальные детали можно оставить на менеджера или раскрыть ниже.": "Enter the recipient and their contact. Leave the remaining details to our team or expand the options below.", "Данные подарка": "Gift details", "Отправитель": "Sender", "Получатель": "Recipient", "Укажем в подарке": "Shown with the gift", "Где прислать подарок": "How to send the gift", "Выберите способ": "Choose a method", "Электронная почта": "Email", "Контакт получателя": "Recipient's contact", "Дата отправки": "Delivery date", "Время отправки (МСК)": "Delivery time (Moscow time)", "Подарки отправляем с 10:00 до 20:00 МСК.": "Gifts are sent between 10:00 and 20:00 Moscow time.", "Ставьте время минимум +4 часа от оформления. Если заказ ночью, доставка должна быть не раньше 14:00.": "Allow at least 4 hours after placing the order. For overnight orders, choose a delivery time of 14:00 or later.", "Сообщение получателю": "Message to the recipient", "Пришлём вместе с подарком": "Sent with the gift", "Пришёл по рекомендации": "Referred by a friend", "Добавим контакт друга для скидки": "Enter your friend's contact for the referral discount", "Пришли от друга? Дайте ему 5% скидки за ваш первый заказ — напишите его контакт ниже.": "Referred by a friend? Give them a 5% discount for your first order by entering their contact below.", "Кто пригласил": "Who referred you", "Комментарий к заказу": "Order comment", "Комментарий": "Comment", "У меня есть промокод": "I have a promo code", "Введите промокод": "Enter a promo code", "Применить": "Apply", "Оплата": "Payment", "Выберите платёжный шлюз": "Choose a payment provider", "Способ оплаты": "Payment method", "Сроки выполнения заказа": "Order processing times", "Мы обрабатываем заказы ежедневно с 08:00 до 20:00 по МСК.": "Our team processes orders daily from 08:00 to 20:00 Moscow time.", "Заказы с автоматическим подключением выполняются 24/7.": "Automatic activation runs 24/7.", "Среднее время ожидания — от 5 минут до 2 часов после оплаты.": "The usual wait is between 5 minutes and 2 hours after payment.", "Нажимая кнопку, вы соглашаетесь с": "By pressing the button, you agree to the", "офертой": "public offer", "и": "and", "политикой конфиденциальности": "privacy policy", "Итого": "Total", "Итого к оплате": "Total due", "Скидка:": "Discount:", "Оформить заказ": "Place order", "Закрыть": "Close", "Проверяем...": "Checking...", "Переходим к оплате...": "Opening payment...", "Введите корректный email.": "Enter a valid email address.", "Укажите Telegram.": "Enter your Telegram contact.", "Укажите имя отправителя.": "Enter the sender's name.", "Укажите имя получателя.": "Enter the recipient's name.", "Выберите способ доставки подарка.": "Choose how to deliver the gift.", "Укажите контакт получателя.": "Enter the recipient's contact.", "Укажите дату отправки подарка.": "Choose the gift delivery date.", "Укажите время отправки подарка.": "Choose the gift delivery time.", "Данные аккаунта Devin": "Devin account details", "Логин Devin": "Devin login", "Пароль Devin": "Devin password", "Нужны только для подключения выбранного тарифа": "Required only to activate the selected plan", "Почта, на которую зарегистрирован аккаунт": "The email registered with your account", "После подключения рекомендуем сменить пароль": "We recommend changing your password after activation", "Введите пароль": "Enter your password", "Показать пароль": "Show password", "Скрыть пароль": "Hide password", "Безопасная передача": "Secure transfer", "Данные шифруются на сервере, доступны только сотруднику, который выполняет заказ, и не передаются платёжной системе. Никому не сообщайте коды 2FA или резервные коды.": "Details are encrypted on the server and available only to the team member processing your order. They are not shared with the payment provider. Never share two-factor or backup codes.", "Никита": "Alex", "Артём": "Sam", "Например: продление аккаунта, пожелания, детали по заказу": "For example: renewal, preferences or order details", "Напишите тёплые слова или оставьте поле пустым": "Write a message or leave this blank", "Дополнительные настройки": "Additional settings", "Подробнее": "More details", "Свернуть": "Collapse", "Показать детали": "Show details", "Выберите Pro, Max или Teams. После оплаты мы подключим подписку на ваш аккаунт Devin и сообщим о результате.": "Choose Pro, Max or Teams. After payment, we will activate the subscription on your Devin account and send you an update.", "AI-инженер для кода, репозиториев и задач разработки.": "AI software engineer for code, repositories and development tasks.", "Выберите план Pro на 12 или 18 месяцев. Конструктор сразу покажет итоговую стоимость и откроет оформление выбранного варианта.": "Choose a Pro plan for 12 or 18 months. The total updates with your selection.", "Gemini Pro для работы с текстом, файлами, идеями и сложными задачами. Выберите подписку на 12 или 18 месяцев.": "Gemini Pro for text, files, ideas and complex tasks. Choose a 12 or 18 month subscription.", "Perplexity Pro помогает быстро находить и проверять информацию, проводить глубокие исследования, анализировать файлы и получать ответы со ссылками на источники.": "Perplexity Pro helps you find and verify information, research topics, analyse files and get answers with source links.", "Выберите Pro или Premier на один месяц. После оплаты GPTishka отправьте ссылку Stripe Checkout со страницы оплаты того же тарифа в Suno.": "Choose Pro or Premier for one month. After paying GPTishka, submit the Stripe Checkout link for the same plan from Suno.", "Выберите Basic, Standard или Pro на один месяц. После оплаты заказа отправьте ссылку на оплату тарифа Midjourney — менеджер завершит подключение.": "Choose Basic, Standard or Pro for one month. After paying for your order, submit the Midjourney plan payment link and our team will complete activation.", "Claude помогает работать с текстами, кодом, документами и большими объёмами информации. Выберите подходящий тариф, проверьте требования к аккаунту и оформите заказ — GPTishka выполнит подключение и останется на связи после оплаты.": "Claude helps with text, code, documents and large amounts of information. Choose a plan, check the account requirements and place your order. GPTishka will arrange activation and provide order support."}).forEach(([ru, en]) => translations.set(ru, en));

  Object.entries({"Введите корректную почту.": "Enter a valid email address.", "Введите id telegram с @": "Enter your Telegram username starting with @.", "Укажите отправителя.": "Enter the sender's name.", "Укажите получателя.": "Enter the recipient's name.", "Укажите время по МСК или оставьте дату пустой.": "Enter a Moscow delivery time or leave the date blank.", "Укажите дату отправки или оставьте время пустым.": "Choose a delivery date or leave the time blank.", "Выберите вариант аккаунта.": "Choose an account option.", "Введите логин от сервиса.": "Enter your service login.", "Введите пароль или напишите «Восстановить».": "Enter your password or write “Restore”.", "Введите почту Apple ID или логин сервиса.": "Enter your Apple ID email or service login.", "Выберите способ оплаты.": "Choose a payment method.", "Понятно": "Got it", "Подключение по ссылке на оплату": "Activation using a payment link"}).forEach(([ru, en]) => translations.set(ru, en));

  function replaceTextNode(node) {
    if (node.parentElement?.closest('script, style, textarea, [translate="no"]')) return;
    const raw = String(node.nodeValue || "");
    const clean = raw.trim();
    if (!clean) return;
    let translated = translations.get(clean);
    if (!translated) {
      translated = clean
        .replace(/GPTишка/g, "GPTishka")
        .replace(/Все права защищены, копирование запрещено\./g, "All rights reserved. Copying is prohibited.")
        .replace(/Все права защищены\./g, "All rights reserved.")
        .replace(/(\d+)\s+отзыв(?:ов|а)?/gi, "$1 reviews")
        .replace(/(\d+(?:[.,]\d+)?)\s+из\s+5/gi, "$1 out of 5")
        .replace(/(\d{1,2})\s+янв\.,/gi, "$1 Jan,")
        .replace(/(\d{1,2})\s+февр\.,/gi, "$1 Feb,")
        .replace(/(\d{1,2})\s+мар\.,/gi, "$1 Mar,")
        .replace(/(\d{1,2})\s+апр\.,/gi, "$1 Apr,")
        .replace(/(\d{1,2})\s+мая,/gi, "$1 May,")
        .replace(/(\d{1,2})\s+июн\.,/gi, "$1 Jun,")
        .replace(/(\d{1,2})\s+июл\.,/gi, "$1 Jul,")
        .replace(/(\d{1,2})\s+авг\.,/gi, "$1 Aug,")
        .replace(/(\d{1,2})\s+сент\.,/gi, "$1 Sep,")
        .replace(/(\d{1,2})\s+окт\.,/gi, "$1 Oct,")
        .replace(/(\d{1,2})\s+нояб\.,/gi, "$1 Nov,")
        .replace(/(\d{1,2})\s+дек\.,/gi, "$1 Dec,")
        .replace(/^Telegram привязан:\s*/i, "Telegram linked: ")
        .replace(/^Последняя ошибка:\s*/i, "Last error: ")
        .replace(/^(\d+)\s*дн\.$/i, "$1 d.")
        .replace(/^(\d+)\s+отзыв(?:ов|а)?$/i, "$1 reviews")
        .replace(/^(\d+(?:[.,]\d+)?)\s+из\s+5$/i, "$1 out of 5");
    }
    if (translated === clean) return;
    node.nodeValue = raw.replace(clean, translated);
  }

  function translateElement(element) {
    if (!(element instanceof Element) || element.matches('script, style, textarea, [translate="no"]')) return;
    ["aria-label", "placeholder", "title"].forEach((name) => {
      const value = element.getAttribute(name);
      if (!value) return;
      const translated = translations.get(value.trim());
      if (translated) element.setAttribute(name, translated);
    });
    Array.from(element.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) replaceTextNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
    });
  }

  function translateMetadata() {
    const titleTranslation = translations.get(document.title.trim());
    if (titleTranslation) document.title = titleTranslation;
    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]')
      .forEach((meta) => {
        const value = String(meta.content || "").trim();
        const translated = translations.get(value);
        if (translated) meta.content = translated;
      });
  }

  function applySeoPage() {
    const page = seoPages[window.location.pathname];
    const article = document.querySelector(".seo-article");
    if (!page || !article) return false;
    document.title = page.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = page.description;
    article.innerHTML = page.html;
    return true;
  }

  function applyTranslations() {
    applySeoPage();
    translateMetadata();
    translateElement(document.body);
  }

  function explainOriginalLanguage() {
    if (!/^\/(?:en\/)?news(?:\/|$)|^\/app(?:\/|$)/.test(window.location.pathname)) return;
    const main = document.querySelector('main');
    const heading = main?.querySelector('h1');
    if (!heading || main.querySelector('.storefront-language-note') || !/[А-Яа-яЁё]{3,}/.test(main.innerText)) return;
    const note = document.createElement('p');
    note.className = 'storefront-language-note';
    note.textContent = 'Some news items and customer reviews are shown in their original language.';
    heading.insertAdjacentElement('afterend', note);
  }

  function rewriteInternalLinks() {
    const fallbackPaths = new Set([
      "/404.html",
      "/500.html",
      "/account.html",
      "/app/",
      "/app/index.html",
      "/service.html",
      "/success.html",
      "/fail.html",
      "/chatgpt-plus-kupit.html",
      "/chatgpt-plus-cena.html",
      "/kak-oplatit-chatgpt-v-rossii.html",
      "/podklyuchenie-chatgpt-online.html"
    ]);
    const englishProductPaths = new Map([
      ["/chatgpt", "/en/chatgpt.html"],
      ["/chatgpt.html", "/en/chatgpt.html"],
      ["/claude", "/en/claude.html"],
      ["/claude.html", "/en/claude.html"],
      ["/supergrok", "/en/supergrok.html"],
      ["/supergrok.html", "/en/supergrok.html"]
    ]);
    document.querySelectorAll("a[href]").forEach((anchor) => {
      if (anchor.closest("[data-lang-switcher], #langSwitch, .lang-switch")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#") || /^(?:mailto:|tel:|javascript:)/i.test(raw)) return;
      let target;
      try {
        target = new URL(raw, window.location.origin);
      } catch (_) {
        return;
      }
      if (target.origin !== window.location.origin || target.pathname.startsWith("/en/")) return;
      if (englishProductPaths.has(target.pathname)) {
        target.pathname = englishProductPaths.get(target.pathname);
        target.searchParams.delete("lang");
      } else if (fallbackPaths.has(target.pathname)) {
        target.searchParams.set("lang", "en");
      } else {
        target.pathname = target.pathname === "/" ? "/en/" : `/en${target.pathname}`.replace(/\/{2,}/g, "/");
      }
      anchor.href = `${target.pathname}${target.search}${target.hash}`;
    });
  }

  const start = () => {
    applyTranslations();
    rewriteInternalLinks();
    explainOriginalLanguage();
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes") { translateElement(record.target); return; }
        if (record.type === "characterData") {
          replaceTextNode(record.target);
          return;
        }
        record.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) replaceTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        });
      });
      rewriteInternalLinks();
      explainOriginalLanguage();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "placeholder", "title"] });
    const title = document.querySelector('title');
    if (title) new MutationObserver(translateMetadata).observe(title, {childList: true, characterData: true, subtree: true});
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
