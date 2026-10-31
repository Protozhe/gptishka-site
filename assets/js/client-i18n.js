(() => {
  const url = new URL(window.location.href);
  const englishMode = /^\/en(?:\/|$)/.test(url.pathname) || url.searchParams.get("lang") === "en";
  if (!englishMode) return;

  document.documentElement.lang = "en";
  document.documentElement.dataset.clientLanguage = "en";

  const translations = new Map([
    ["Я прочитал предупреждение о рисках KYC и условиях гарантии.", "I have read the KYC risk warning and guarantee conditions."],
    ["Добавьте ссылку на проверку", "Add your verification link"],
    ["Используйте персональную ссылку, которая открылась после Start.", "Use the personal link that opened after Start."],
    ["Ссылка для верификации", "Verification link"],
    ["Ссылка будет сохранена в заказе. Её не нужно публиковать или отправлять в общий чат.", "Your link will be saved with the order. Do not post it publicly or share it in a group chat."],
    ["Gemini Pro для работы с текстом, файлами, идеями и сложными задачами. Доступна подписка на 18 месяцев.", "Gemini Pro for text, files, ideas and complex tasks. An 18-month subscription is available."],
    ["Доступен Gemini Pro на 18 месяцев. Актуальная стоимость указана в тарифе перед оформлением.", "Gemini Pro is available for 18 months. The current price is shown in the plan before checkout."],
    ["Что входит в Gemini Pro", "What Gemini Pro includes"],
    ["Расширенный тариф AI‑помощника Google на длительный период.", "An extended Google AI assistant plan for long-term use."],
    ["Доступ к возможностям и актуальным моделям тарифа Pro.", "Access to the features and current models included in the Pro plan."],
    ["Работа с текстом, изображениями, документами и другими файлами.", "Work with text, images, documents and other files."],
    ["Увеличенные лимиты и инструменты для исследования сложных тем.", "Higher limits and tools for researching complex topics."],
    ["Доступная подписка", "Available subscription"],
    ["Gemini Pro — 18 месяцев.", "Gemini Pro — 18 months."],
    ["Актуальная стоимость указана в тарифе и в итоговой сумме перед оплатой.", "The current price is shown in the plan and in the order total before payment."],
    ["Как проходит подключение", "How activation works"],
    ["Выберите Gemini Pro на 18 месяцев.", "Select Gemini Pro for 18 months."],
    ["Перейдите к оформлению и укажите данные, запрошенные в форме.", "Proceed to checkout and enter the details requested in the form."],
    ["После подтверждения оплаты получите инструкцию и помощь с подключением.", "After payment is confirmed, you will receive instructions and activation assistance."],
    ["Поддержка и важные условия", "Support and important terms"],
    ["Срок подписки — 18 месяцев.", "The subscription lasts 18 months."],
    ["Функции, модели и лимиты могут меняться на стороне Google.", "Google may change the features, models and limits."],
    ["GPTishka сопровождает заказ и помогает с вопросами по подключению.", "GPTishka provides order support and helps with activation questions."],
    ["Какая подписка Gemini Pro доступна?", "Which Gemini Pro subscription is available?"],
    ["Доступна одна подписка: Gemini Pro на 18 месяцев. Актуальная цена указана в тарифе перед оформлением.", "One subscription is available: Gemini Pro for 18 months. The current price is shown in the plan before checkout."],
    ["Нужно ли выбирать длительность?", "Do I need to choose a duration?"],
    ["Нет, сейчас доступен один срок — 18 месяцев. Выберите Gemini Pro и перейдите к оформлению.", "No. One duration is currently available: 18 months. Select Gemini Pro and proceed to checkout."],
    ["Что я получу после оплаты?", "What will I receive after payment?"],
    ["Gemini Pro на 18 месяцев и помощь GPTishka с подключением тарифа.", "Gemini Pro for 18 months and activation assistance from GPTishka."],
    ["Что делать, если возник вопрос после оплаты?", "What if I have a question after payment?"],
    ["Напишите в поддержку и укажите номер заказа — мы проверим статус и поможем разобраться.", "Contact support with your order number. We will check the status and help you resolve the issue."],

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
  <nav class="guide-breadcrumb" aria-label="Breadcrumb"><a href="/en/">Home</a><span aria-hidden="true">/</span><span>Buying ChatGPT Plus</span></nav>
  <div class="guide-intro">
    <div class="guide-heading"><p class="guide-eyebrow"><span class="guide-symbol" aria-hidden="true"></span>CHATGPT · GUIDES</p><h1>Buy <span>ChatGPT Plus</span> online</h1><p class="guide-lead">GPTishka helps you place an order online, follow a clear activation flow and receive support throughout the paid subscription period.</p><div class="guide-actions"><a class="guide-button" href="/en/chatgpt.html?plan=plus">Choose a plan<span aria-hidden="true">↗</span></a><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></div>
    <aside class="guide-summary"><p>Subscription</p><strong>ChatGPT Plus</strong><p>Most orders move to the next activation step within 5–15 minutes after payment confirmation.</p></aside>
  </div>
  <div class="guide-layout"><article class="guide-content"><section class="guide-section" id="guide-section-1"><h2>Who this service is for</h2>
        <ul><li>Customers who need ChatGPT Plus for work or everyday tasks.</li><li>Users who prefer activation without sharing an account password.</li><li>Customers who want assistance if activation requires an extra step.</li></ul>
        </section><section class="guide-section" id="guide-section-2"><h2>What is included</h2>
        <ul><li>Order processing after payment.</li><li>Step-by-step activation instructions.</li><li>Telegram and email support.</li><li>Warranty support for the paid term.</li></ul>
        </section><section class="guide-section" id="guide-section-3"><h2>How to order</h2>
        <ol><li>Choose a suitable plan.</li><li>Check your contact details.</li><li>Pay using an available payment method.</li><li>Follow the activation instructions and contact support if needed.</li></ol>
        </section><section class="guide-section" id="guide-section-4"><h2>Before payment</h2>
        <p>Check the selected plan, subscription term and activation method. If you are unsure, ask support before paying.</p>
        </section><section class="guide-section" id="guide-section-5"><h2>Frequently asked questions</h2>
        <details class="guide-question"><summary>Do I need to share my password?</summary><p>No. Available plans use a flow that does not request your account password.</p></details>
        <details class="guide-question"><summary>How long does activation take?</summary><p>Most orders proceed within 5–15 minutes after payment confirmation.</p></details>
        <details class="guide-question"><summary>What if activation fails?</summary><p>Contact support with your order number. We will check the status and help complete the order.</p></details>
        </section></article><aside class="guide-sidebar"><nav class="guide-toc" aria-label="On this page"><h2>On this page</h2><a href="#guide-section-1">Who this service is for</a><a href="#guide-section-2">What is included</a><a href="#guide-section-3">How to order</a><a href="#guide-section-4">Before payment</a><a href="#guide-section-5">Frequently asked questions</a></nav><div class="guide-help"><h2>Need help choosing?</h2><p>Support can explain the plan and the next steps for your order.</p><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></aside></div>
  <aside class="guide-related"><h2>Related guides</h2><div><a href="/chatgpt-plus-cena.html?lang=en">Prices and plans<span aria-hidden="true">↗</span></a><a href="/kak-oplatit-chatgpt-v-rossii.html?lang=en">Payment guide<span aria-hidden="true">↗</span></a><a href="/podklyuchenie-chatgpt-online.html?lang=en">Online activation<span aria-hidden="true">↗</span></a></div></aside>
`
    },
    "/chatgpt-plus-cena.html": {
      title: "ChatGPT Plus price and plans — GPTishka",
      description: "How to compare ChatGPT Plus plans, terms and support before ordering.",
      html: `
  <nav class="guide-breadcrumb" aria-label="Breadcrumb"><a href="/en/">Home</a><span aria-hidden="true">/</span><span>Prices and plans</span></nav>
  <div class="guide-intro">
    <div class="guide-heading"><p class="guide-eyebrow"><span class="guide-symbol" aria-hidden="true"></span>CHATGPT · GUIDES</p><h1><span>ChatGPT Plus</span> price and connection</h1><p class="guide-lead">When comparing plans, consider not only the final price but also the subscription term, activation method, support and warranty conditions.</p><div class="guide-actions"><a class="guide-button" href="/en/chatgpt.html?plan=plus">Choose a plan<span aria-hidden="true">↗</span></a><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></div>
    <aside class="guide-summary"><p>Plans and terms</p><strong>Price before payment</strong><p>Use the checkout page for current prices and available plans.</p></aside>
  </div>
  <div class="guide-layout"><article class="guide-content"><section class="guide-section" id="guide-section-1"><h2>What affects the price</h2>
        <ul><li>The subscription plan and term.</li><li>The available payment infrastructure.</li><li>Support and warranty conditions.</li><li>The selected activation method.</li></ul>
        </section><section class="guide-section" id="guide-section-2"><h2>How to choose a plan</h2>
        <p>Choose a shorter term to test the service or a plan that matches your regular workload. All current conditions are displayed before payment.</p>
        </section><section class="guide-section" id="guide-section-3"><h2>How to place an order</h2>
        <ol><li>Select a plan.</li><li>Provide the required activation details.</li><li>Pay and wait for confirmation.</li></ol>
        </section><section class="guide-section" id="guide-section-4"><h2>Frequently asked questions</h2>
        <details class="guide-question"><summary>Are there hidden charges?</summary><p>No. Use the final amount shown during checkout and the selected plan description.</p></details>
        <details class="guide-question"><summary>How do I know which plan fits?</summary><p>Consider how often you use the service and the required subscription term. Support can help before payment.</p></details>
        </section></article><aside class="guide-sidebar"><nav class="guide-toc" aria-label="On this page"><h2>On this page</h2><a href="#guide-section-1">What affects the price</a><a href="#guide-section-2">How to choose a plan</a><a href="#guide-section-3">How to place an order</a><a href="#guide-section-4">Frequently asked questions</a></nav><div class="guide-help"><h2>Need help choosing?</h2><p>Support can explain the plan and the next steps for your order.</p><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></aside></div>
  <aside class="guide-related"><h2>Related guides</h2><div><a href="/chatgpt-plus-kupit.html?lang=en">Buying ChatGPT Plus<span aria-hidden="true">↗</span></a><a href="/kak-oplatit-chatgpt-v-rossii.html?lang=en">Payment guide<span aria-hidden="true">↗</span></a><a href="/podklyuchenie-chatgpt-online.html?lang=en">Online activation<span aria-hidden="true">↗</span></a></div></aside>
`
    },
    "/kak-oplatit-chatgpt-v-rossii.html": {
      title: "How to pay for a ChatGPT order — GPTishka",
      description: "A step-by-step payment guide with available methods and support.",
      html: `
  <nav class="guide-breadcrumb" aria-label="Breadcrumb"><a href="/en/">Home</a><span aria-hidden="true">/</span><span>Payment guide</span></nav>
  <div class="guide-intro">
    <div class="guide-heading"><p class="guide-eyebrow"><span class="guide-symbol" aria-hidden="true"></span>CHATGPT · GUIDES</p><h1>How to pay for a ChatGPT order</h1><p class="guide-lead">This guide covers the payment stage, from choosing a plan to confirming that the order was processed.</p><div class="guide-actions"><a class="guide-button" href="/en/chatgpt.html?plan=plus">Choose a plan<span aria-hidden="true">↗</span></a><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></div>
    <aside class="guide-summary"><p>Payment methods</p><strong>Cards and SBP</strong><p>Before payment, make sure the contact email for order updates is correct.</p></aside>
  </div>
  <div class="guide-layout"><article class="guide-content"><section class="guide-section" id="guide-section-1"><h2>Available payment methods</h2>
        <ul><li>SBP</li><li>Bank cards supported by the selected gateway</li><li>Secure hosted payment forms</li></ul>
        </section><section class="guide-section" id="guide-section-2"><h2>Payment steps</h2>
        <ol><li>Choose a plan.</li><li>Check the term, amount and contact details.</li><li>Select a payment method and complete payment.</li><li>Wait for confirmation and follow the next instructions.</li></ol>
        </section><section class="guide-section" id="guide-section-3"><h2>If payment does not complete</h2>
        <p>Do not create multiple duplicate orders. Contact support with the order number and payment details so we can check the transaction.</p>
        </section><section class="guide-section" id="guide-section-4"><h2>Payment security</h2>
        <p>Payment is processed by the selected payment gateway. GPTishka does not store bank-card details.</p>
        </section></article><aside class="guide-sidebar"><nav class="guide-toc" aria-label="On this page"><h2>On this page</h2><a href="#guide-section-1">Available payment methods</a><a href="#guide-section-2">Payment steps</a><a href="#guide-section-3">If payment does not complete</a><a href="#guide-section-4">Payment security</a></nav><div class="guide-help"><h2>Need help choosing?</h2><p>Support can explain the plan and the next steps for your order.</p><a class="guide-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div></aside></div>
  <aside class="guide-related"><h2>Related guides</h2><div><a href="/chatgpt-plus-kupit.html?lang=en">Buying ChatGPT Plus<span aria-hidden="true">↗</span></a><a href="/chatgpt-plus-cena.html?lang=en">Prices and plans<span aria-hidden="true">↗</span></a><a href="/podklyuchenie-chatgpt-online.html?lang=en">Online activation<span aria-hidden="true">↗</span></a></div></aside>
`
    },
    "/podklyuchenie-chatgpt-online.html": {
      title: "Connect ChatGPT online — GPTishka",
      description: "Online ChatGPT activation with step-by-step instructions and support.",
      html: `
  <nav class="connection-breadcrumb" aria-label="Breadcrumb"><a href="/en/">Home</a><span aria-hidden="true">/</span><span>ChatGPT activation</span></nav>
  <div class="connection-intro">
    <div class="connection-heading">
      <p class="connection-eyebrow"><span class="connection-symbol" aria-hidden="true"></span>CHATGPT · ONLINE ACTIVATION</p>
      <h1>ChatGPT online.<span>Support at every step.</span></h1>
      <p class="connection-lead">Choose a plan, pay online and follow the activation instructions. We’ll help you get connected and answer questions about your order.</p>
      <div class="connection-actions"><a class="connection-button" href="/en/chatgpt.html?plan=plus">Choose a plan<span aria-hidden="true">↗</span></a><a class="connection-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></div>
    </div>
    <aside class="connection-summary"><p>Activation time</p><strong>5–15 minutes</strong><p>after payment confirmation. The exact steps and timing depend on the selected plan.</p><div class="connection-summary-note">Instructions and support are included.</div></aside>
  </div>
  <section class="connection-process"><h2>How online activation works</h2><ol><li><span class="connection-step-number" aria-hidden="true">01</span><h3>Choose a plan</h3><p>Check the subscription term, activation method and final price before ordering.</p></li><li><span class="connection-step-number" aria-hidden="true">02</span><h3>Complete payment</h3><p>After confirmation, open the instructions for your order.</p></li><li><span class="connection-step-number" aria-hidden="true">03</span><h3>Follow the instructions</h3><p>Activation runs automatically or with support assistance, depending on the plan.</p></li><li><span class="connection-step-number" aria-hidden="true">04</span><h3>Check your access</h3><p>Make sure the subscription is active and the selected features are available.</p></li></ol></section>
  <div class="connection-columns"><section><h2>What you receive</h2><ul><li>Clear order status and instructions for the next step.</li><li>Help from support if you need assistance.</li><li>Warranty for the paid subscription term.</li><li>A contact channel for questions about your order.</li></ul></section><section><h2>What to check after activation</h2><ul><li>An active subscription in your account.</li><li>Access to the features included in your chosen plan.</li><li>Continued access during your first sessions.</li></ul></section></div>
  <section class="connection-help"><div><h2>If activation is delayed</h2><p>An incomplete instruction step or missing order details can cause a delay. Send your order number to support so we can check the status and help you finish activation.</p></div><a class="connection-support" href="/en/contact.html">Contact support<span aria-hidden="true">↗</span></a></section>
  <section class="connection-faq"><h2>Questions about activation</h2><details><summary>Can ChatGPT Plus be activated entirely online?</summary><p>Yes. You place the order online and receive the activation instructions after payment.</p></details><details><summary>What if I do not understand the next instruction step?</summary><p>Contact support with your order number. We will explain the next step for your selected plan.</p></details><details><summary>Is support available after activation?</summary><p>Yes. Support can help with questions during the paid subscription term.</p></details></section>
  <aside class="connection-related"><h2>Related guides</h2><div><a href="/chatgpt-plus-kupit.html?lang=en">Buying ChatGPT Plus<span aria-hidden="true">↗</span></a><a href="/chatgpt-plus-cena.html?lang=en">Prices and plans<span aria-hidden="true">↗</span></a><a href="/kak-oplatit-chatgpt-v-rossii.html?lang=en">Payment guide<span aria-hidden="true">↗</span></a></div></aside>
`
    }
  };

  translations.set("Дополнительные настройки подарка", "Additional gift settings");
  // Shared checkout copy; never translate values entered by the customer.
  Object.entries({"Тарифные планы": "Subscription plans", "Фильтры тарифов": "Plan options", "Быстрые разделы GPTishka": "GPTishka navigation", "Контакты": "Contact details", "Для статуса заказа и связи": "For order updates and support", "Почта": "Email", "Нужна для связи по заказу": "Used for order updates", "Сюда придет вся информация по заказу": "Order information will be sent here", "Дополнительно": "Additional options", "Оформить в подарок": "Send as a gift", "Покажем поля получателя после включения": "Enable to enter the recipient's details", "🎁 Хотите устроить сюрприз?": "Sending a surprise?", "Вы выбираете подписку и указываете получателя. Мы сами свяжемся с ним, уточним данные и подключим подписку без передачи логинов и паролей.": "Choose a subscription and enter the recipient's details. We will contact them to arrange activation without sharing login credentials.", "Укажите получателя и контакт — остальные детали можно оставить на менеджера или раскрыть ниже.": "Enter the recipient and their contact. Leave the remaining details to our team or expand the options below.", "Данные подарка": "Gift details", "Отправитель": "Sender", "Получатель": "Recipient", "Укажем в подарке": "Shown with the gift", "Где прислать подарок": "How to send the gift", "Выберите способ": "Choose a method", "Электронная почта": "Email", "Контакт получателя": "Recipient's contact", "Дата отправки": "Delivery date", "Время отправки (МСК)": "Delivery time (Moscow time)", "Подарки отправляем с 10:00 до 20:00 МСК.": "Gifts are sent between 10:00 and 20:00 Moscow time.", "Ставьте время минимум +4 часа от оформления. Если заказ ночью, доставка должна быть не раньше 14:00.": "Allow at least 4 hours after placing the order. For overnight orders, choose a delivery time of 14:00 or later.", "Сообщение получателю": "Message to the recipient", "Пришлём вместе с подарком": "Sent with the gift", "Пришёл по рекомендации": "Referred by a friend", "Добавим контакт друга для скидки": "Enter your friend's contact for the referral discount", "Пришли от друга? Дайте ему 5% скидки за ваш первый заказ — напишите его контакт ниже.": "Referred by a friend? Give them a 5% discount for your first order by entering their contact below.", "Кто пригласил": "Who referred you", "Комментарий к заказу": "Order comment", "Комментарий": "Comment", "У меня есть промокод": "I have a promo code", "Введите промокод": "Enter a promo code", "Применить": "Apply", "Оплата": "Payment", "Выберите платёжный шлюз": "Choose a payment provider", "Способ оплаты": "Payment method", "Сроки выполнения заказа": "Order processing times", "Мы обрабатываем заказы ежедневно с 08:00 до 20:00 по МСК.": "Our team processes orders daily from 08:00 to 20:00 Moscow time.", "Заказы с автоматическим подключением выполняются 24/7.": "Automatic activation runs 24/7.", "Среднее время ожидания — от 5 минут до 2 часов после оплаты.": "The usual wait is between 5 minutes and 2 hours after payment.", "Нажимая кнопку, вы соглашаетесь с": "By pressing the button, you agree to the", "офертой": "public offer", "и": "and", "политикой конфиденциальности": "privacy policy", "Итого": "Total", "Итого к оплате": "Total due", "Скидка:": "Discount:", "Оформить заказ": "Place order", "Закрыть": "Close", "Проверяем...": "Checking...", "Переходим к оплате...": "Opening payment...", "Введите корректный email.": "Enter a valid email address.", "Укажите Telegram.": "Enter your Telegram contact.", "Укажите имя отправителя.": "Enter the sender's name.", "Укажите имя получателя.": "Enter the recipient's name.", "Выберите способ доставки подарка.": "Choose how to deliver the gift.", "Укажите контакт получателя.": "Enter the recipient's contact.", "Укажите дату отправки подарка.": "Choose the gift delivery date.", "Укажите время отправки подарка.": "Choose the gift delivery time.", "Данные аккаунта Devin": "Devin account details", "Логин Devin": "Devin login", "Пароль Devin": "Devin password", "Нужны только для подключения выбранного тарифа": "Required only to activate the selected plan", "Почта, на которую зарегистрирован аккаунт": "The email registered with your account", "После подключения рекомендуем сменить пароль": "We recommend changing your password after activation", "Введите пароль": "Enter your password", "Показать пароль": "Show password", "Скрыть пароль": "Hide password", "Безопасная передача": "Secure transfer", "Данные шифруются на сервере, доступны только сотруднику, который выполняет заказ, и не передаются платёжной системе. Никому не сообщайте коды 2FA или резервные коды.": "Details are encrypted on the server and available only to the team member processing your order. They are not shared with the payment provider. Never share two-factor or backup codes.", "Никита": "Alex", "Артём": "Sam", "Например: продление аккаунта, пожелания, детали по заказу": "For example: renewal, preferences or order details", "Напишите тёплые слова или оставьте поле пустым": "Write a message or leave this blank", "Дополнительные настройки": "Additional settings", "Подробнее": "More details", "Свернуть": "Collapse", "Показать детали": "Show details", "Выберите Pro, Max или Teams. После оплаты мы подключим подписку на ваш аккаунт Devin и сообщим о результате.": "Choose Pro, Max or Teams. After payment, we will activate the subscription on your Devin account and send you an update.", "AI-инженер для кода, репозиториев и задач разработки.": "AI software engineer for code, repositories and development tasks.", "Perplexity Pro помогает быстро находить и проверять информацию, проводить глубокие исследования, анализировать файлы и получать ответы со ссылками на источники.": "Perplexity Pro helps you find and verify information, research topics, analyse files and get answers with source links.", "Выберите Pro или Premier на один месяц. После оплаты GPTishka отправьте ссылку Stripe Checkout со страницы оплаты того же тарифа в Suno.": "Choose Pro or Premier for one month. After paying GPTishka, submit the Stripe Checkout link for the same plan from Suno.", "Выберите Basic, Standard или Pro на один месяц. После оплаты заказа отправьте ссылку на оплату тарифа Midjourney — менеджер завершит подключение.": "Choose Basic, Standard or Pro for one month. After paying for your order, submit the Midjourney plan payment link and our team will complete activation.", "Claude помогает работать с текстами, кодом, документами и большими объёмами информации. Выберите подходящий тариф, проверьте требования к аккаунту и оформите заказ — GPTishka выполнит подключение и останется на связи после оплаты.": "Claude helps with text, code, documents and large amounts of information. Choose a plan, check the account requirements and place your order. GPTishka will arrange activation and provide order support."}).forEach(([ru, en]) => translations.set(ru, en));

  Object.entries({"Введите корректную почту.": "Enter a valid email address.", "Введите id telegram с @": "Enter your Telegram username starting with @.", "Укажите отправителя.": "Enter the sender's name.", "Укажите получателя.": "Enter the recipient's name.", "Укажите время по МСК или оставьте дату пустой.": "Enter a Moscow delivery time or leave the date blank.", "Укажите дату отправки или оставьте время пустым.": "Choose a delivery date or leave the time blank.", "Выберите вариант аккаунта.": "Choose an account option.", "Введите логин от сервиса.": "Enter your service login.", "Введите пароль или напишите «Восстановить».": "Enter your password or write “Restore”.", "Введите почту Apple ID или логин сервиса.": "Enter your Apple ID email or service login.", "Выберите способ оплаты.": "Choose a payment method.", "Понятно": "Got it", "Подключение по ссылке на оплату": "Activation using a payment link"}).forEach(([ru, en]) => translations.set(ru, en));

  // Shared dynamic UI: account creation, checkout states and service-specific hints.
  Object.entries({
    "Аккаунт": "Account",
    "Нужен новый аккаунт": "Need a new account",
    "Новый аккаунт": "New account",
    "Создадим аккаунт для выбранного тарифа. После оплаты свяжитесь с менеджером; токен вводить не потребуется.": "We will create an account with your selected plan. Contact our team after payment; no token is required.",
    "Создадим аккаунт, пройдём верификацию и подключим выбранную подписку. В дальнейшем продлевайте этот аккаунт по цене тарифа — без повторной доплаты за создание. После оплаты свяжитесь с менеджером; токен вводить не потребуется.": "We will create and verify an account and activate your selected subscription. Future renewals cost the plan price, with no additional account creation fee. Contact our team after payment; no token is required.",
    "После оплаты свяжитесь с менеджером для получения данных входа. В дальнейшем продлевайте этот аккаунт по цене тарифа — без повторной доплаты за создание.": "Contact our team after payment to receive your login details. Future renewals cost the plan price, with no additional account creation fee.",
    "После оплаты менеджер создаст аккаунт и передаст вам данные для входа.": "After payment, our team will create your account and send you the login details.",
    "По умолчанию подключаем подписку на ваш аккаунт.": "By default, we activate the subscription on your account.",
    "После оплаты менеджер свяжется с вами и запросит данные аккаунта Claude для подключения. В форме заказа логин и пароль не нужны.": "After payment, our team will contact you to arrange activation using your Claude account details. No login or password is required in this order form.",
    "После оплаты откроется страница с инструкцией. Вставьте на ней ссылку Stripe Checkout для выбранного тарифа Devin — логин и пароль передавать не нужно.": "After payment, an instructions page will open. Paste the Stripe Checkout link for your selected Devin plan there; no login or password is required.",
    "Напишите поздравление или пожелание": "Write a greeting or a message",
    "Нужны только для подключения выбранного тарифа": "Required only to activate your selected plan",
    "Почта, на которую зарегистрирован аккаунт": "The email address registered to your account",
    "После подключения рекомендуем сменить пароль": "We recommend changing your password after activation",
    "Проверьте обязательные поля.": "Please check the required fields.",
    "Товар устарел. Обновите страницу и выберите тариф заново.": "This product has changed. Refresh the page and select your plan again.",
    "Промокод не применён. Исправьте его или очистите поле.": "The promo code was not applied. Check it or clear the field.",
    "Создаём безопасную оплату...": "Creating a secure payment...",
    "Создаём безопасную оплату…": "Creating a secure payment…",
    "Создаём оплату…": "Creating payment…",
    "Промокод не найден": "Promo code not found",
    "Проверяем промокод...": "Checking promo code...",
    "Промокод принят": "Promo code accepted",
    "Не удалось начать оплату. Попробуйте снова.": "Could not start payment. Please try again.",
    "Не удалось создать оплату.": "Could not create payment.",
    "Не удалось создать оплату. Попробуйте снова.": "Could not create payment. Please try again.",
    "Не удалось получить ссылку на оплату.": "Could not retrieve the payment link.",
    "Ошибка сети. Попробуйте ещё раз.": "Network error. Please try again.",
    "Платёжная система не вернула ссылку на оплату.": "The payment provider did not return a payment link.",
    "Платёжный шлюз не вернул ссылку на оплату.": "The payment provider did not return a payment link.",
    "Платёжная система отвечает дольше обычного. Подключаем доступный маршрут…": "The payment provider is taking longer than usual. Connecting to an available route…",
    "Оплата готова. Открываем платёжную страницу…": "Payment is ready. Opening the payment page…",
    "Lava временно недоступна. Выберите Enot.io.": "Lava is temporarily unavailable. Please choose Enot.io.",
    "Товар в корзине устарел. Добавьте его заново из тарифов.": "This cart item has changed. Add it again from the plans page.",
    "Сейчас оплата доступна по одному товару. Оплатите позиции по отдельности.": "Please pay for each item separately.",
    "Укажите корректный email.": "Enter a valid email address.",
    "Укажите настоящий email покупателя.": "Enter the buyer's valid email address.",
    "Введите корректный email": "Enter a valid email address",
    "Укажите Telegram в формате @username.": "Enter your Telegram username in the @username format.",
    "Укажите корректный Telegram, например @username.": "Enter a valid Telegram username, such as @username.",
    "Этот номинал пока недоступен. Напишите в поддержку.": "This amount is currently unavailable. Please contact support.",
    "Не удалось загрузить актуальные варианты товара.": "Could not load the available product options.",
    "Не удалось получить актуальную конфигурацию товара.": "Could not load the current product configuration.",
    "Товар Steam пока не найден в серверной конфигурации. Попробуйте позже или напишите в поддержку.": "This Steam product is currently unavailable. Try again later or contact support.",
    "Укажите логин Steam-аккаунта.": "Enter your Steam account login.",
    "Укажите Steam trade-ссылку в формате tradeoffer/new с partner и token.": "Enter a Steam tradeoffer/new link containing partner and token parameters.",
    "Подходящего тарифа нет": "No matching plan",
    "Подходящих тарифов нет": "No matching plans",
    "Выберите другой тариф или срок.": "Choose another plan or duration.",
    "Загружаем тарифы…": "Loading plans…",
    "Не удалось загрузить тарифы": "Could not load plans",
    "Проверьте соединение и попробуйте ещё раз.": "Check your connection and try again.",
    "Попробовать ещё раз": "Try again",
    "План": "Plan",
    "Длительность": "Duration",
    "Выбранный тариф": "Selected plan",
    "Выберите способ оплаты": "Choose a payment method",
    "Купить": "Buy",
    "Оплатить": "Pay",
    "Закрыть": "Close",
    "Показать пароль": "Show password",
    "Скрыть пароль": "Hide password",
    "Промокод": "Promo code",
    "Товар": "Product",
    "Удалить": "Remove",
    "Уменьшить количество": "Decrease quantity",
    "Увеличить количество": "Increase quantity",
    "Что входит": "What's included",
    "Детали тарифа": "Plan details",
    "Оплатить этот тариф": "Pay for this plan",
    "Описание появится в ближайшее время.": "Details will be available shortly.",
    "Оплата заказа": "Order payment",
    "Оформление корзины": "Cart checkout",
    "Корзина:": "Cart:",
    "Email для получения данных заказа": "Email for order details",
    "Товары временно недоступны": "Products are temporarily unavailable",
    "Перед покупкой": "Before you buy",
    "Активация": "Activation",
    "По ID": "Using ID",
    "Со входом в аккаунт": "With account login",
    "По ссылке на оплату": "Using a payment link",
    "по ссылке": "using a link",
    "Поддержка": "Support",
    "Поддержка 24/7": "24/7 support",
    "По умолчанию": "By default",
    "Безопасность": "Security",
    "Сроки": "Timing",
    "Гарантии": "Guarantees",
    "Часто задаваемые вопросы": "Frequently asked questions",
    "Короткие ответы на частые вопросы": "Quick answers to common questions",
    "Автовыдача": "Automatic delivery",
    "Автоматически": "Automatically",
    "Мгновенно": "Instantly",
    "Безопасно": "Securely",
    "Все тарифы": "All plans",
    "Все сроки": "All durations",
    "1 месяц": "1 month",
    "2 месяца": "2 months",
    "6 месяцев": "6 months",
    "12 месяцев": "12 months",
    "1 мес": "1 month",
    "2 мес": "2 months",
    "месяц": "month",
    "месяца": "months",
    "месяцев": "months",
    "от": "from",
    "Выбрать тариф": "Choose a plan",
    "Сначала выберите сервис, затем подходящий тариф.": "Choose a service, then select a plan.",
    "Сначала выберите сервис, затем откройте его тарифы.": "Choose a service to see its plans.",
    "Выберите товар для пополнения и перейдите к оплате.": "Choose a top-up product and proceed to payment.",
    "Откройте VPN-каталог и выберите актуальный тариф.": "Open the VPN catalog and choose an available plan.",
    "Показать все": "Show all",
    "Пополнения": "Top-ups",
    "Товары": "Products",
    "Пополнить": "Top up",
    "Пополнение Steam": "Steam top-up",
    "Пополнение Steam ключами": "Steam top-up using keys",
    "Ключи Манн Ко": "Mann Co. keys",
    "ключ(ей)": "key(s)",
    "Карты пополнения Apple ID": "Apple ID gift cards",
    "Подарочная карта Apple ID": "Apple ID gift card",
    "Номинал на выбор": "Choose an amount",
    "Заказать": "Order",
    "Оформить": "Order",
    "Кредиты Codex": "Codex credits",
    "Пополнение кредитов Codex": "Codex credit top-up",
    "Пополнение Codex": "Codex top-up",
    "кредитов": "credits",
    "250 / 500 / 1000 кредитов": "250 / 500 / 1000 credits",
    "Нужна помощь?": "Need help?",
    "Напишите нам в поддержку — поможем с подключением.": "Contact support for help with activation.",
    "Средний ответ: ~5 минут": "Typical response: about 5 minutes",
    "Написать в Telegram": "Message us on Telegram",
    "Аккаунт еще не активирован. Вернитесь к активации по заказу.": "Your account has not been activated yet. Return to your order's activation page.",
    "Перейти к активации": "Go to activation",
    "Перейти к активации заказа": "Go to order activation",
    "Продолжить активацию": "Resume activation",
    "Продолжить активацию заказа": "Resume order activation",
    "Скрыть": "Hide",
    "Скрыть напоминание об активации": "Hide the activation reminder",
    "Развернуть напоминание об активации": "Expand the activation reminder",
    "Откройте защищённую ссылку на заказ после оплаты или обратитесь в поддержку.": "Open your protected order link after payment or contact support.",
    "Проверяем оплату…": "Checking payment…",
    "Оплата ещё подтверждается. Страница проверит её повторно через несколько секунд.": "Payment is still being confirmed. This page will check again shortly.",
    "Не удалось открыть заказ. Проверьте защищённую ссылку или обратитесь в поддержку.": "Could not open this order. Check your protected link or contact support.",
    "Эта страница доступна для заказов верификации KYC или CVP.": "This page is only available for KYC or CVP verification orders.",
    "Оплата подтверждена.": "Payment confirmed.",
    "Ошибка сети. Проверьте оплату ещё раз.": "Network error. Please check payment again.",
    "Возможности тарифа, порядок подключения и сопровождение заказа.": "Plan features, activation steps and order support.",
    "Категория": "Category",
    "Нейросети": "AI services",
    "Подписки ChatGPT": "ChatGPT subscriptions",
    "Тарифы Plus, GO и Pro для работы, учебы и любых задач.": "Plus, Go and Pro plans for work, study and everyday tasks.",
    "Тарифы SuperGrok с быстрой активацией на ваш аккаунт.": "SuperGrok plans with quick activation on your account.",
    "Perplexity Pro для поиска, исследований и ответов с источниками.": "Perplexity Pro for search, research and answers with sources.",
    "Gemini Pro для работы, учёбы, анализа и творчества.": "Gemini Pro for work, study, analysis and creativity.",
    "Suno Pro и Premier для создания музыки и вокала.": "Suno Pro and Premier for creating music and vocals.",
    "Генерация изображений и видео на вашем аккаунте.": "Create images and videos on your account.",
    "Поиск с надёжными источниками": "Search with reliable sources",
    "Gemini для работы и учёбы": "Gemini for work and study",
    "Suno для создания музыки": "Suno for creating music",
    "AI-инженер для задач разработки": "An AI engineer for development tasks",
    "Грустный котёнок": "Sad kitten",
    "Новости": "News",
    "Отзывы": "Reviews",
    "Помощь": "Help",
    "Каталог": "Catalog",
    "Русский": "Russian",
    "В целях безопасности личных данных клиентов email в ленте активаций маскируется полностью.": "Customer email addresses in the activation feed are fully masked to protect personal data.",
    "Не передавайте токены, сессионные ключи и чеки в личные сообщения. Используйте только официальные контакты поддержки с сайта.": "Do not send tokens, session keys or receipts in private messages. Use only the official support contacts listed on the site."
}).forEach(([ru, en]) => translations.set(ru, en));

  Object.entries({
    "Оформление заказа": "Checkout",
    "Выберите количество кредитов": "Choose the number of credits",
    "Количество кредитов": "Number of credits",
    "Почта аккаунта ChatGPT": "ChatGPT account email",
    "Статус и поддержка": "Order status and support",
    "После выбора вы перейдете к безопасной странице оплаты.": "After choosing a method, you will be taken to a secure payment page.",
    "Закрыть выбор способа оплаты": "Close payment method selection",
    "Верификация": "Verification",
    "Перед подключением Max 5× и Max 20×": "Before activating Max 5× or Max 20×",
    "Для подключения через наш сервис нужен аккаунт Claude старше 30 дней с уже пройденной проверкой личности (KYC). На аккаунте без KYC активация может не пройти.": "To activate a plan through our service, use a Claude account older than 30 days that has already completed identity verification (KYC). Activation may fail on an account without KYC.",
    "Мы помогаем оплатить подписку, но не обходим проверку личности. Подключение не исключает дополнительных проверок, ограничений или блокировки со стороны Anthropic.": "We help pay for the subscription, but do not bypass identity verification. Activation does not prevent additional checks, restrictions or account suspension by Anthropic.",
    "Если KYC ещё не пройден, завершите проверку до оформления заказа.": "If KYC is not complete, finish verification before placing your order.",
    "Верификация KYC: объясним порядок проверки и поможем разобраться.": "KYC verification: we explain the verification steps and help you understand the process.",
    "Пройдите KYC до подключения Claude Max 5× или Max 20×.": "Complete KYC before activating Claude Max 5× or Max 20×.",
    "Завершите KYC до подключения Claude Max 5× или Max 20×. После подтверждения оплаты появится кнопка связи с менеджером.": "Complete KYC before activating Claude Max 5× or Max 20×. A contact button will appear after payment is confirmed.",
    "После подтверждения оплаты появится кнопка связи с менеджером.": "A contact button will appear after payment is confirmed.",
    "Email для заказа": "Order email",
    "Telegram для связи": "Telegram contact",
    "Карта РФ / СБП": "Russian card / SBP",
    "Карта / СБП — ENOT": "Card / SBP — ENOT",
    "Зарубежная карта": "International card",
    "Для KYC верификацию проходим мы и проводим без входа в аккаунт. После подтверждения оплаты появится кнопка связи с менеджером.": "For KYC, we complete the verification without logging into your account. A contact button will appear once payment is confirmed.",
    "Нажимая «Оплатить», вы принимаете": "By clicking Pay, you accept the",
    "оферту": "public offer",
    "политику конфиденциальности": "privacy policy",
    "Скопируйте полную ссылку со страницы оплаты Stripe.": "Copy the full link from the Stripe payment page.",
    "Форма проверяет формат ссылки. Менеджер отдельно проверит тариф и доступность страницы оплаты.": "This form checks the link format. Our team will separately check the plan and availability of the payment page.",
    "Отправить ссылку": "Submit link",
    "Регион: США": "Region: United States",
    "Номинал:": "Amount:",
    "Стоимость": "Price",
    "Куда отправить чек и код": "Where to send the receipt and code",
    "Укажите действующую электронную почту": "Enter a valid email address",
    "На этот адрес будет оформлен заказ и сохранён доступ к выдаче": "Your order and access to delivery will be linked to this address",
    "Если Telegram привязан к аккаунту с этим email, бот автоматически продублирует туда оплаченный код.": "If Telegram is linked to the account with this email, the bot will also send the paid code there.",
    "Как вы получите карту": "How you will receive your card",
    "После успешной оплаты сайт автоматически выдаст свободный код из админки. Код также придёт через Telegram-бота, если Telegram заранее привязан к аккаунту с указанным email. Карта подходит только для Apple ID региона США.": "After payment, the site will automatically issue an available code. The Telegram bot will also send it if Telegram is already linked to the account with this email. This card is only valid for US-region Apple IDs.",
    "Перейти к оплате": "Proceed to payment",
    "Оплата подтверждена": "Payment confirmed",
    "Ваша подарочная карта готова": "Your gift card is ready",
    "Получаем свободный код из админки…": "Retrieving your gift card code…",
    "Код Apple Gift Card": "Apple Gift Card code",
    "Скопировать код": "Copy code",
    "Открыть инструкцию по активации": "Open activation instructions",
    "Закрыть окно": "Close window",
    "Например: карта в подарок": "For example: a gift card for a friend",
    "Активация завершена": "Activation complete",
    "Ваш тариф успешно активирован": "Your plan has been activated successfully",
    "Подписка активна. Оцените подключение — после проверки отзыв появится на странице «Отзывы».": "Your subscription is active. Rate the activation experience: your review will appear on the Reviews page after moderation.",
    "Ваша оценка": "Your rating",
    "необязательно": "optional",
    "Отзыв публикуется без email и данных аккаунта.": "Your review is published without your email or account details.",
    "Отправить отзыв": "Submit review",
    "Спасибо! Отзыв отправлен на проверку.": "Thank you! Your review has been submitted for moderation.",
    "Мы в Telegram": "Find us on Telegram",
    "Получить чек": "Get receipt",
    "Позже": "Later",
    "Закрыть сообщение": "Close message",
    "Оценка от 1 до 5 звёзд": "Rating from 1 to 5 stars",
    "Например: подписка подключилась быстро, всё работает": "For example: activation was quick and everything works",
    "Выберите количество ключей": "Choose the number of keys",
    "Email покупателя": "Buyer's email",
    "Укажите настоящий email для уведомлений по заказу": "Enter a valid email address for order updates",
    "Логин Steam": "Steam login",
    "Аккаунт, на который отправим ключи": "The account that will receive the keys",
    "Steam trade-ссылка": "Steam trade link",
    "Количество ключей": "Number of keys",
    "Цена за ключ": "Price per key",
    "К оплате": "Total due",
    "Необязательно. Можно указать пожелания или детали по трейду.": "Optional. Add any requests or trade details.",
    "Например: отправить после 18:00": "For example: send after 18:00"
  }).forEach(([ru, en]) => translations.set(ru, en));

  // Example names belong to placeholders, never to customer text or author names.
  Object.entries({
    "Демонстрация страницы": "Page preview",
    "Пример страницы после оплаты GPTishka. Здесь клиент отправит ссылку Devin.": "Example of the page after payment. The customer submits their Devin payment link here.",
    "Не найдена защищённая ссылка на заказ. Вернитесь к странице подтверждения оплаты или обратитесь в поддержку.": "Your protected order link was not found. Return to the payment confirmation page or contact support.",
    "Проверяем оплату заказа…": "Checking order payment…",
    "Оплата заказа ещё подтверждается. Попробуйте проверить её чуть позже.": "Your payment is still being confirmed. Please check again shortly.",
    "Не удалось открыть заказ. Проверьте ссылку из письма или обратитесь в поддержку.": "Could not open this order. Check the link in your email or contact support.",
    "Отправить новую ссылку": "Submit a new link",
    "Оплата заказа подтверждена. Отправьте ссылку Stripe Checkout для выбранного тарифа.": "Payment is confirmed. Submit the Stripe Checkout link for your selected plan.",
    "Не удалось проверить заказ из-за ошибки сети. Попробуйте ещё раз.": "Could not check your order due to a network error. Please try again.",
    "Это демонстрация. Ссылка не отправлена и заказ не изменён.": "This is a preview. No link was submitted and the order was not changed.",
    "Нужна полная HTTPS-ссылка Stripe Checkout вида checkout.stripe.com/g/pay/cs_live_…": "Enter a full HTTPS Stripe Checkout link in the format checkout.stripe.com/g/pay/cs_live_…",
    "Нужна полная HTTPS-ссылка Stripe Checkout вида checkout.stripe.com/c/pay/cs_live_…": "Enter a full HTTPS Stripe Checkout link in the format checkout.stripe.com/c/pay/cs_live_…",
    "Сохраняем ссылку в заказе…": "Saving the link to your order…",
    "Ссылка не принята. Проверьте её и попробуйте ещё раз.": "The link was not accepted. Please check it and try again.",
    "Не удалось отправить ссылку из-за ошибки сети. Попробуйте ещё раз.": "Could not submit the link due to a network error. Please try again.",
    "Тариф:": "Plan:",
    "Не удалось загрузить актуальные цены. Попробуйте позже.": "Could not load current prices. Please try again later.",
    "Укажите корректную электронную почту.": "Enter a valid email address.",
    "Цена изменилась. Проверьте новую сумму и нажмите кнопку ещё раз.": "The price has changed. Check the new amount and click again.",
    "Этот номинал больше недоступен. Выберите другой.": "This amount is no longer available. Choose another amount.",
    "Не удалось проверить актуальную цену. Попробуйте позже.": "Could not verify the current price. Please try again later.",
    "Коды этого номинала временно закончились. Выберите другой номинал или попробуйте позже.": "Codes for this amount are temporarily out of stock. Choose another amount or try again later.",
    "Не удалось создать оплату. Выберите другой шлюз или попробуйте ещё раз.": "Could not create payment. Choose another provider or try again.",
    "Код автоматически выдан после оплаты. Если Telegram привязан к аккаунту, бот уже продублировал его сообщением.": "Your code was issued automatically after payment. If Telegram is linked to your account, the bot has also sent it in a message.",
    "Код скопирован": "Code copied"
  }).forEach(([ru, en]) => translations.set(ru, en));
  translations.delete("Никита");
  translations.delete("Артём");

  function translateUiText(value) {
    const raw = String(value || "");
    const clean = raw.trim();
    if (!clean) return raw;
    let translated = translations.get(clean);
    if (!translated && /\s[·•]\s/.test(clean)) {
      const parts = clean.split(/(\s[·•]\s)/);
      const joined = parts.map(part => /^\s[·•]\s$/.test(part) ? part : translateUiText(part)).join("");
      if (joined !== clean) translated = joined;
    }
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
        .replace(/^(\d+(?:[.,]\d+)?)\s+из\s+5$/i, "$1 out of 5")
        .replace(/^У вас уже есть аккаунт (.+)\?$/, "Do you already have a $1 account?")
        .replace(/^Да, у меня есть почта и пароль от (.+)$/, "Yes, I have the email and password for $1")
        .replace(/^Выберите, если обычно входите в (.+) через email и пароль\.$/, "Choose this if you normally sign in to $1 with an email and password.")
        .replace(/^Выберите, если нажимаете кнопку «Continue with Apple» \/ «Войти через Apple»\. Пароль от (.+) не нужен\.$/, "Choose this if you use Continue with Apple. Your $1 password is not required.")
        .replace(/^Нет, аккаунта (.+) у меня нет$/, "No, I do not have a $1 account")
        .replace(/^Почта или логин (.+)$/, "$1 email or username")
        .replace(/^Данные аккаунта (.+)$/, "$1 account details")
        .replace(/^Пароль от (.+)$/, "$1 password")
        .replace(/^Оплатить\s*\((.+)\)$/, "Pay ($1)")
        .replace(/^Оплатить\s+(.+)$/, "Pay $1")
        .replace(/^Кредиты Codex от\s+(.+)$/, "Codex credits from $1")
        .replace(/^Пополнить кредиты Codex от\s+(.+?)\s+рублей$/, "Top up Codex credits from $1 RUB")
        .replace(/^(\d+)\s+кредитов$/, "$1 credits")
        .replace(/^(\d+)\s+(?:месяц|месяца|месяцев|мес\.?)$/, "$1 months")
        .replace(/^1 months$/, "1 month")
        .replace(/^(\d+)\s+(?:вариант|варианта|вариантов)$/, "$1 options")
        .replace(/^Проверьте поля:\s*/, "Please check these fields: ")
        .replace(/^Выбрано:\s*/, "Selected: ")
        .replace(/^Оформить\s+(KYC|CVP)$/, "Order $1")
        .replace(/^Ссылка на оплату (.+)$/, "$1 payment link")
        .replace(/^(?:Ссылка|Она) должна начинаться с (https:\/\/\S+)$/, "The link must start with $1")
        .replace(/^Формат:\s*(https:\/\/\S+)$/, "Format: $1")
        .replace(/^(\d+)\s+ключ(?:а|ей)?\s*=\s*(.+)$/, "$1 key = $2")
        .replace(/^(\d+)\s+звезд(?:а|ы)?$/, "$1 stars")
        .replace(/^(\d+)\s+звёзд$/, "$1 stars")
        .replace(/^1 stars$/, "1 star")
        .replace(/^Тариф:\s*/, "Plan: ")
        .replace(/^Заказ:\s*/, "Order: ")
        .replace(/(\d+)\s+(?:месяцев|месяца|месяц)(?=$|[\s·•,.)])/g, (_, count) => count + (count === "1" ? " month" : " months"))
        .replace(/^Эта форма доступна только для заказа (.+)\.$/, "This form is only available for $1 orders.")
        .replace(/^Ссылка (уже )?получена\. Мы оплатим подписку (.+) в ближайшее время, ожидайте\. Если возникнут сложности, менеджер свяжется с вами\.$/, "Your link has been received. We will complete your $2 subscription payment shortly. Our team will contact you if any issues arise.")
        .replace(/^Оплата подтверждена, но свободный код пока не найден\. Обратитесь в поддержку с номером заказа:\s*/, "Payment is confirmed, but no available code was found. Contact support with your order number: ");
    }
    return raw.replace(clean, translated);
  }

  function translateError(value) {
    const translated = translateUiText(value);
    return /[А-Яа-яЁё]/.test(translated)
      ? "Could not complete the request. Please check your details or contact support."
      : translated;
  }

  function replaceTextNode(node) {
    if (node.parentElement?.closest('script, style, textarea, [translate="no"]')) return;
    const raw = String(node.nodeValue || "");
    const translated = translateUiText(raw);
    if (translated !== raw) node.nodeValue = translated;
  }

  function translateElement(element) {
    if (!(element instanceof Element) || element.matches('script, style, [translate="no"]')) return;
    ["aria-label", "aria-description", "placeholder", "title", "alt"].forEach((name) => {
      const value = element.getAttribute(name);
      if (!value) return;
      const exampleNames = name === "placeholder" ? { "Никита": "Alex", "Артём": "Sam" } : {};
      const translated = Object.hasOwn(exampleNames, value) ? exampleNames[value] : translateUiText(value);
      if (translated !== value) element.setAttribute(name, translated);
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

  window.gptishkaI18n = { translateText: translateUiText, translateError, translateElement };

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
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "aria-description", "placeholder", "title", "alt"] });
    const title = document.querySelector('title');
    if (title) new MutationObserver(translateMetadata).observe(title, {childList: true, characterData: true, subtree: true});
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
