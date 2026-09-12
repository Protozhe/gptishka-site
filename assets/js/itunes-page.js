(function () {
  "use strict";

  var isEnglishPage = /^\/en(?:\/|$)/.test(window.location.pathname || "") || new URLSearchParams(window.location.search).get("lang") === "en";

  function setText(selector, value) {
    var element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function applyEnglishCopy() {
    if (!isEnglishPage) return;
    document.documentElement.lang = "en";
    document.title = "iTunes & App Store Gift Cards | GPTishka";
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = "https://gptishka.shop/en/itunes.html";
    var description = document.querySelector('meta[name="description"]');
    if (description) description.content = "US Apple ID gift cards for apps, games, music, iCloud and subscriptions. Choose an amount and receive activation instructions.";

    setText(".service-directory-back span", "Top-ups");
    setText(".service-constructor-brand span", "Gift cards");
    setText(".service-constructor-brand h2", "iTunes & App Store");
    setText("[data-itunes-region] span", "United States");
    setText(".service-filter-group:nth-of-type(1) .service-filter-group__label", "Region");
    setText(".service-filter-group:nth-of-type(2) .service-filter-group__label", "Amount");
    var summaryLabels = document.querySelectorAll(".service-checkout-card__label");
    ["Region", "Amount", "Price"].forEach(function (label, index) {
      if (summaryLabels[index]) summaryLabels[index].textContent = label;
    });
    var summaryRegion = document.querySelector(".service-checkout-card__summary > div:first-child strong");
    if (summaryRegion) summaryRegion.textContent = "United States";
    setText("[data-itunes-order]", "Place order");
    setText(".service-constructor-description h3", "Apple ID Gift Card");
    setText(".service-constructor-description p", "Top up your Apple ID balance for apps, games, music and subscriptions. Choose a gift-card amount for the United States region.");

    var infoSection = document.querySelector(".service-info-section--itunes");
    if (infoSection) infoSection.innerHTML =
      '<div class="service-section-title"><h2>Before you buy a gift card</h2><p>Region, amount and activation details.</p></div>' +
      '<div class="service-info-grid">' +
        '<article class="service-info-card"><h3>What you receive</h3><ul><li>An Apple ID gift-card code for the selected amount.</li><li>The card region is the United States.</li><li>Instructions for adding the funds to your Apple ID balance.</li></ul></article>' +
        '<article class="service-info-card"><h3>What it can be used for</h3><ul><li>Apps and games in the App Store.</li><li>Music, movies and other digital content.</li><li>Eligible subscriptions paid from your Apple ID balance.</li></ul></article>' +
        '<article class="service-info-card"><h3>How to redeem it</h3><ol><li>Make sure your Apple ID region is the United States.</li><li>Receive the code after placing your order.</li><li>Open the App Store and choose to redeem a gift card or code.</li><li>Enter the code and check your account balance.</li></ol></article>' +
        '<article class="service-info-card"><h3>Important terms</h3><ul><li>The card works only with a US Apple ID.</li><li>Check your account region before ordering.</li><li>Once a valid digital code has been delivered, cancellation may no longer be available.</li></ul><p class="service-info-card__legal">See the <a href="/en/refund.html">refund policy</a> and <a href="/en/oferta.html">public offer</a>.</p></article>' +
      '</div>';

    var guideSection = document.querySelector(".itunes-guide-section");
    if (guideSection) guideSection.innerHTML =
      '<div class="service-section-title"><span class="itunes-guide-section__eyebrow">Step-by-step guide</span><h2 id="itunesGuideTitle">Change your Apple ID region and redeem the card</h2><p>Instructions for iPhone: prepare your account, select the United States and add the gift-card balance.</p></div>' +
      '<aside class="itunes-guide-warning" role="note" aria-label="Important requirement before changing region"><span class="itunes-guide-warning__icon" aria-hidden="true">!</span><div><strong>No active subscriptions</strong><p>Your Apple ID must not have an active subscription. If you have a monthly subscription, cancel it and wait until the paid month ends before changing the region.</p></div></aside>' +
      '<div class="itunes-guide-grid">' +
        '<article class="itunes-guide-card"><div class="itunes-guide-card__heading"><span>01</span><div><small>On iPhone</small><h3>Change the region to the United States</h3></div></div><ol class="itunes-guide-steps"><li>Open <strong>Settings</strong>.</li><li>Tap <strong>your name</strong>.</li><li>Open <strong>Media &amp; Purchases</strong>.</li><li>Tap <strong>View Account</strong>.</li><li>Open <strong>Country/Region</strong>.</li><li>Select <strong>Change Country or Region</strong>.</li><li>Choose <strong>United States</strong>.</li><li>Accept Apple\'s terms.</li><li>For <strong>Payment Method</strong>, choose <strong>None</strong>.</li><li>Enter a US billing address. You can <a href="https://randomquestionmaker.com/more-tools/random-us-address" target="_blank" rel="noopener noreferrer">generate one here</a>.</li><li>Fill in Street, City, State and ZIP Code.</li><li>Enter your phone number.</li><li>Tap <strong>Done</strong>.</li><li>Close and reopen the App Store.</li></ol></article>' +
        '<article class="itunes-guide-card"><div class="itunes-guide-card__heading"><span>02</span><div><small>Gift code</small><h3>Redeem the Apple gift card</h3></div></div><ol class="itunes-guide-steps"><li>Open the <strong>App Store</strong>.</li><li>Tap your profile picture.</li><li>Select <strong>Redeem Gift Card or Code</strong>.</li><li>Choose <strong>You can also enter your code manually</strong>.</li><li>Enter the gift-card code and tap <strong>Redeem</strong>.</li><li>The funds will be added to your Apple ID balance.</li></ol><div class="itunes-icloud-prices" aria-label="US iCloud plans"><div class="itunes-icloud-prices__heading"><span aria-hidden="true">☁</span><div><small>United States</small><h3>iCloud+ plans</h3></div></div><ul><li><span>50 GB</span><strong>$0.99</strong></li><li><span>200 GB</span><strong>$2.99</strong></li><li><span>2 TB</span><strong>$9.99</strong></li><li><span>6 TB</span><strong>$29.99</strong></li><li><span>12 TB</span><strong>$59.99</strong></li></ul></div></article>' +
      '</div>';

    var faqSection = document.querySelector(".service-faq-section");
    if (faqSection) faqSection.innerHTML =
      '<div class="service-section-title"><h2>Frequently asked questions</h2><p>Key details about iTunes and App Store gift cards.</p></div><div class="service-faq-list">' +
      '<article class="service-faq-item active"><button class="service-faq-question" type="button">Which region is the card for?<span></span></button><div class="service-faq-answer"><p>It is for an Apple ID with the United States region. Check your account region before ordering.</p></div></article>' +
      '<article class="service-faq-item"><button class="service-faq-question" type="button">Which amounts are available?<span></span></button><div class="service-faq-answer"><p>2, 5, 10, 15, 30 and 50 US dollars.</p></div></article>' +
      '<article class="service-faq-item"><button class="service-faq-question" type="button">What will I receive?<span></span></button><div class="service-faq-answer"><p>A gift-card code for the selected amount and a short activation guide.</p></div></article>' +
      '<article class="service-faq-item"><button class="service-faq-question" type="button">How much does it cost?<span></span></button><div class="service-faq-answer"><p>$2 — 300 ₽, $5 — 750 ₽, $10 — 1,500 ₽, $15 — 2,000 ₽, $30 — 3,800 ₽, $50 — 5,500 ₽.</p></div></article>' +
      '</div>';

    setText("#itunesOrderModalTitle", "iTunes & App Store");
    setText(".chatgpt-order-summary-card__meta", "Apple ID Gift Card");
    var modalChips = document.querySelectorAll(".chatgpt-order-summary-card__chips > span");
    if (modalChips[0]) modalChips[0].textContent = "Region: United States";
    if (modalChips[1]) modalChips[1].innerHTML = 'Amount: <b id="itunesModalDenomination">2 $</b>';
    setText(".chatgpt-order-summary-card__price span", "Price");
    setText(".chatgpt-order-section:nth-of-type(2) .chatgpt-order-section-title", "Where to send the receipt and code");
    setText(".chatgpt-order-section:nth-of-type(2) .chatgpt-order-section__head p", "Enter a valid email address");
    var contactLabel = document.querySelector("#itunesOrderContact")?.closest("label");
    if (contactLabel) {
      var contactTitle = contactLabel.querySelector("span");
      var contactHint = contactLabel.querySelector("small");
      if (contactTitle) contactTitle.textContent = "Email";
      if (contactHint) contactHint.textContent = "The order and secure delivery access will be linked to this address";
    }
    var contactInput = document.getElementById("itunesOrderContact");
    if (contactInput) contactInput.placeholder = "name@email.com";
    setText(".itunes-order-telegram-note", "If Telegram is linked to an account with this email, the bot will automatically send a copy of the paid code there.");
    var commentSummary = document.querySelector("#itunesOrderComment")?.closest("details")?.querySelector("summary");
    if (commentSummary) commentSummary.textContent = "Order comment";
    var commentInput = document.getElementById("itunesOrderComment");
    if (commentInput) {
      commentInput.placeholder = "For example: this is a gift";
      var commentLabel = commentInput.closest("label")?.querySelector("span");
      if (commentLabel) commentLabel.textContent = "Comment";
    }
    setText(".chatgpt-order-section:nth-of-type(3) .chatgpt-order-section-title", "Payment");
    setText(".chatgpt-order-section:nth-of-type(3) .chatgpt-order-section__head p", "Choose a payment gateway");
    var paymentCaptions = document.querySelectorAll(".chatgpt-payment-caption");
    if (paymentCaptions[0]) paymentCaptions[0].textContent = "Fast payments and bank cards";
    if (paymentCaptions[1]) paymentCaptions[1].textContent = "Bank cards and fast payments";
    var deliveryDetails = document.querySelector(".chatgpt-order-processing-details");
    if (deliveryDetails) deliveryDetails.innerHTML = "<summary>How you receive the card</summary><p>After successful payment, the site automatically issues an available code from the admin inventory. The bot also sends it in Telegram when Telegram is linked to the account with this email. The card works only with a US Apple ID.</p>";
    var legal = document.querySelector(".itunes-order-card .chatgpt-order-legal-note");
    if (legal) legal.innerHTML = 'By continuing, you agree to the <a href="/en/oferta.html" target="_blank" rel="noopener">public offer</a> and <a href="/en/politika.html" target="_blank" rel="noopener">privacy policy</a>.';
    setText(".itunes-order-card .chatgpt-order-footer__total span", "Total");
    setText(".itunes-order-card .chatgpt-order-submit", "Proceed to payment");
    setText(".itunes-delivery-card__eyebrow", "Payment confirmed");
    setText(".itunes-delivery-card h3", "Your gift card is ready");
    setText("#itunesDeliveryDescription", "Retrieving an available code from the inventory…");
    setText(".itunes-delivery-card__code span", "Apple Gift Card code");
    setText("#itunesDeliveryCopy", "Copy code");
    setText(".itunes-delivery-card__guide", "Open the activation guide");
    document.querySelectorAll("[data-itunes-modal-close]").forEach(function (button) { button.setAttribute("aria-label", "Close"); });
  }

  applyEnglishCopy();

  var denomination = "2";
  var prices = {
    "2": 300,
    "5": 750,
    "10": 1500,
    "15": 2000,
    "30": 3800,
    "50": 5500
  };
  var denominationButtons = Array.prototype.slice.call(document.querySelectorAll("[data-itunes-denomination]"));
  var constructorPrice = document.getElementById("itunesConstructorPrice");
  var selectedDenomination = document.getElementById("itunesSelectedDenomination");
  var selectedPrice = document.getElementById("itunesSelectedPrice");
  var modalDenomination = document.getElementById("itunesModalDenomination");
  var modalPrice = document.getElementById("itunesModalPrice");
  var modalFooterPrice = document.getElementById("itunesModalFooterPrice");
  var modal = document.getElementById("itunesOrderModal");
  var orderForm = document.getElementById("itunesOrderForm");
  var orderContact = document.getElementById("itunesOrderContact");
  var orderComment = document.getElementById("itunesOrderComment");
  var orderContactError = document.getElementById("itunesOrderContactError");
  var orderStatus = document.getElementById("itunesOrderStatus");
  var submitButton = orderForm ? orderForm.querySelector(".chatgpt-order-submit") : null;
  var deliveryResult = document.getElementById("itunesDeliveryResult");
  var deliveryDescription = document.getElementById("itunesDeliveryDescription");
  var deliveryCode = document.getElementById("itunesDeliveryCode");
  var deliveryCopy = document.getElementById("itunesDeliveryCopy");
  var openButton = document.querySelector("[data-itunes-order]");
  var closeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-itunes-modal-close]"));
  var lastFocusedElement = null;
  var closeTimer = 0;
  var productSlugs = {
    "2": "itunes-us-2",
    "5": "itunes-us-5",
    "10": "itunes-us-10",
    "15": "itunes-us-15",
    "30": "itunes-us-30",
    "50": "itunes-us-50"
  };

  function denominationLabel(value) {
    return String(value || "2") + " $";
  }

  function priceLabel(value) {
    var price = prices[String(value || "2")] || prices["2"];
    return new Intl.NumberFormat(isEnglishPage ? "en-US" : "ru-RU").format(price) + " ₽";
  }

  function updateDenomination(nextValue) {
    denomination = String(nextValue || "2");
    var label = denominationLabel(denomination);
    var price = priceLabel(denomination);
    denominationButtons.forEach(function (button) {
      var active = button.getAttribute("data-itunes-denomination") === denomination;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (constructorPrice) constructorPrice.textContent = price;
    if (selectedDenomination) selectedDenomination.textContent = label;
    if (selectedPrice) selectedPrice.textContent = price;
    if (modalDenomination) modalDenomination.textContent = label;
    if (modalPrice) modalPrice.textContent = price;
    if (modalFooterPrice) modalFooterPrice.textContent = price;
  }

  function openModal() {
    if (!modal) return;
    window.clearTimeout(closeTimer);
    updateDenomination(denomination);
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-itunes-modal-open", "is-product-modal-open");
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
      var title = modal.querySelector("#itunesOrderModalTitle");
      if (title) title.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("is-itunes-modal-open", "is-product-modal-open");
    closeTimer = window.setTimeout(function () {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      var focusTarget = lastFocusedElement && document.contains(lastFocusedElement) ? lastFocusedElement : openButton;
      if (focusTarget && typeof focusTarget.focus === "function") focusTarget.focus({ preventScroll: true });
    }, 190);
  }

  function getFocusableElements() {
    if (!modal) return [];
    return Array.prototype.slice.call(modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")).filter(function (element) {
      return element.offsetWidth || element.offsetHeight || element.getClientRects().length;
    });
  }

  function trapFocus(event) {
    if (!modal || modal.hidden || event.key !== "Tab") return;
    var focusable = getFocusableElements();
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function saveOrderDraft(contact, comment) {
    try {
      localStorage.setItem("gptishka_itunes_order_draft", JSON.stringify({
        contact: contact,
        comment: comment,
        denomination: denomination,
        savedAt: Date.now()
      }));
    } catch (_) {
      // Storage is optional.
    }
  }

  function restoreOrderDraft() {
    try {
      var draft = JSON.parse(localStorage.getItem("gptishka_itunes_order_draft") || "{}");
      if (!draft || typeof draft !== "object") return;
      if (orderContact) orderContact.value = String(draft.contact || "");
      if (orderComment) orderComment.value = String(draft.comment || "");
    } catch (_) {
      // Ignore invalid or unavailable storage.
    }
  }

  function selectedPaymentMethod() {
    var checked = orderForm ? orderForm.querySelector('input[name="paymentMethod"]:checked') : null;
    return checked && checked.value === "enot" ? "enot" : "lava";
  }

  function syncPaymentAria() {
    if (!orderForm) return;
    orderForm.querySelectorAll(".chatgpt-payment-option").forEach(function (option) {
      var input = option.querySelector('input[name="paymentMethod"]');
      option.setAttribute("aria-checked", input && input.checked ? "true" : "false");
    });
  }

  function setCheckoutLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = Boolean(isLoading);
    submitButton.setAttribute("aria-busy", isLoading ? "true" : "false");
    submitButton.textContent = isLoading
      ? (isEnglishPage ? "Creating secure payment…" : "Создаём безопасную оплату…")
      : (isEnglishPage ? "Proceed to payment" : "Перейти к оплате");
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  async function submitOrder(event) {
    event.preventDefault();
    var contact = orderContact ? String(orderContact.value || "").trim().toLowerCase() : "";
    var comment = orderComment ? String(orderComment.value || "").trim() : "";
    if (!isValidEmail(contact)) {
      if (orderContactError) orderContactError.textContent = isEnglishPage ? "Enter a valid email address." : "Укажите корректную электронную почту.";
      if (orderContact) {
        orderContact.classList.add("is-invalid");
        orderContact.setAttribute("aria-invalid", "true");
        orderContact.focus();
      }
      return;
    }

    if (orderContactError) orderContactError.textContent = "";
    if (orderContact) {
      orderContact.classList.remove("is-invalid");
      orderContact.removeAttribute("aria-invalid");
    }
    saveOrderDraft(contact, comment);
    var paymentMethod = selectedPaymentMethod();
    var productSlug = productSlugs[denomination] || productSlugs["2"];
    setCheckoutLoading(true);
    if (orderStatus) orderStatus.textContent = isEnglishPage ? "Creating a secure payment…" : "Создаём безопасную оплату…";

    try {
      var response = await fetch("/api/payments/" + encodeURIComponent(paymentMethod) + "/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          email: contact,
          product_slug: productSlug,
          quantity: 1,
          payment_method: paymentMethod,
          order_details: {
            source: "itunes-checkout",
            capturedAt: new Date().toISOString(),
            selection: {
              product: "iTunes & App Store",
              region: "US",
              denomination: denominationLabel(denomination),
              deliveryMethod: "code",
              paymentMethod: paymentMethod
            },
            contact: { email: contact },
            comment: comment
          }
        })
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var serverError = String(payload && (payload.error || payload.message) || "payment_create_failed");
        if (/out of stock|not available|unavailable/i.test(serverError)) {
          throw new Error("ITUNES_OUT_OF_STOCK");
        }
        throw new Error(serverError);
      }
      var payUrl = String(payload && (payload.pay_url || payload.checkout_url || payload.payment_url) || "").trim();
      var orderId = String(payload && payload.order_id || "").trim();
      var activationToken = String(payload && payload.activation_token || "").trim();
      if (!payUrl) throw new Error("payment_url_missing");
      try {
        if (orderId) localStorage.setItem("gptishka_activation_order_id", orderId);
        if (orderId && activationToken) localStorage.setItem("gptishka_activation_order_token:" + orderId, activationToken);
      } catch (_) {
        // Storage is optional.
      }
      window.location.assign(payUrl);
    } catch (error) {
      setCheckoutLoading(false);
      if (orderStatus) {
        var outOfStock = String(error && error.message || error).indexOf("ITUNES_OUT_OF_STOCK") >= 0;
        orderStatus.textContent = outOfStock
          ? (isEnglishPage ? "This amount is temporarily out of stock. Choose another amount or try again later." : "Коды этого номинала временно закончились. Выберите другой номинал или попробуйте позже.")
          : (isEnglishPage ? "Could not create the payment. Please try another gateway or try again." : "Не удалось создать оплату. Выберите другой шлюз или попробуйте ещё раз.");
      }
      console.error("[itunes] payment create failed", error);
    }
  }

  function getOrderAccessToken(orderId, queryToken) {
    if (queryToken) return queryToken;
    try {
      return String(localStorage.getItem("gptishka_activation_order_token:" + orderId) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function showDeliveryShell() {
    if (orderForm) orderForm.hidden = true;
    if (deliveryResult) deliveryResult.hidden = false;
    openModal();
    if (deliveryResult) deliveryResult.focus && deliveryResult.focus({ preventScroll: true });
  }

  async function loadDeliveredCode(orderId, token) {
    if (!orderId || !deliveryResult) return;
    showDeliveryShell();
    var startedAt = Date.now();
    while (Date.now() - startedAt < 45000) {
      try {
        var url = new URL("/api/orders/" + encodeURIComponent(orderId) + "/activation", window.location.origin);
        if (token) url.searchParams.set("t", token);
        var response = await fetch(url.toString(), { cache: "no-store", headers: { "Accept": "application/json" } });
        var payload = await response.json().catch(function () { return {}; });
        if (response.ok && String(payload && payload.deliveryMode || "").toLowerCase() === "code" && payload.code) {
          var codeValue = String(payload.code).trim();
          if (deliveryDescription) deliveryDescription.textContent = isEnglishPage
            ? "The code was issued automatically after payment. It has also been sent by the bot when Telegram is linked to your account."
            : "Код автоматически выдан после оплаты. Если Telegram привязан к аккаунту, бот уже продублировал его сообщением.";
          if (deliveryCode) {
            deliveryCode.hidden = false;
            var codeStrong = deliveryCode.querySelector("strong");
            if (codeStrong) codeStrong.textContent = codeValue;
          }
          if (deliveryCopy) {
            deliveryCopy.hidden = false;
            deliveryCopy.setAttribute("data-code", codeValue);
          }
          return;
        }
        if (response.status !== 409) throw new Error(String(payload && (payload.error || payload.message) || "delivery_failed"));
      } catch (error) {
        console.warn("[itunes] code delivery pending", error);
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 1800); });
    }
    if (deliveryDescription) deliveryDescription.textContent = isEnglishPage
      ? "Payment is confirmed, but the code is not available yet. Contact support with the order number: " + orderId
      : "Оплата подтверждена, но свободный код пока не найден. Обратитесь в поддержку с номером заказа: " + orderId;
  }

  denominationButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      updateDenomination(button.getAttribute("data-itunes-denomination"));
    });
  });

  if (openButton) openButton.addEventListener("click", openModal);
  if (orderForm) orderForm.addEventListener("submit", submitOrder);
  if (orderForm) orderForm.addEventListener("change", function (event) {
    if (event.target && event.target.matches('input[name="paymentMethod"]')) syncPaymentAria();
  });
  if (orderContact) orderContact.addEventListener("input", function () {
    if (orderContact.value.trim()) {
      orderContact.classList.remove("is-invalid");
      orderContact.removeAttribute("aria-invalid");
      if (orderContactError) orderContactError.textContent = "";
    }
  });
  closeButtons.forEach(function (button) {
    button.addEventListener("click", closeModal);
  });
  if (deliveryCopy) deliveryCopy.addEventListener("click", function () {
    var code = String(deliveryCopy.getAttribute("data-code") || "").trim();
    if (!code) return;
    var copyPromise = navigator.clipboard && typeof navigator.clipboard.writeText === "function"
      ? navigator.clipboard.writeText(code)
      : Promise.reject(new Error("clipboard_unavailable"));
    copyPromise.then(function () {
      deliveryCopy.textContent = isEnglishPage ? "Copied" : "Код скопирован";
      window.setTimeout(function () {
        deliveryCopy.textContent = isEnglishPage ? "Copy code" : "Скопировать код";
      }, 1800);
    }).catch(function () {
      var codeStrong = deliveryCode && deliveryCode.querySelector("strong");
      if (!codeStrong) return;
      var range = document.createRange();
      range.selectNodeContents(codeStrong);
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
    trapFocus(event);
  });

  document.querySelectorAll(".service-faq-question").forEach(function (button) {
    button.addEventListener("click", function () {
      var item = button.closest(".service-faq-item");
      if (!item) return;
      var willOpen = !item.classList.contains("active");
      document.querySelectorAll(".service-faq-item").forEach(function (candidate) {
        candidate.classList.remove("active");
      });
      if (willOpen) item.classList.add("active");
    });
  });

  restoreOrderDraft();
  updateDenomination(denomination);
  syncPaymentAria();

  var returnParams = new URLSearchParams(window.location.search);
  var returnOrderId = String(returnParams.get("order_id") || returnParams.get("orderId") || "").trim();
  var returnToken = getOrderAccessToken(returnOrderId, String(returnParams.get("t") || "").trim());
  if (returnOrderId) loadDeliveredCode(returnOrderId, returnToken);
})();
