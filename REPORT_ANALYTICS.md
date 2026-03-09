# REPORT_ANALYTICS

## Что было до изменений
- Базовая аналитическая инициализация присутствовала (`analytics-init.js`: Yandex + Mail.ru).
- События по ключевым шагам воронки были частично и несистемно распределены по коду.

## Что добавлено / стандартизировано

### Единый helper событий
Файл:
- `assets/js/app.js`

Изменение:
- Добавлен `trackAnalyticsEvent(eventName, payload)`.
- Экспортирован в глобал: `window.gptishkaTrackEvent`.
- Транспорт: `dataLayer` + `ym(...reachGoal...)` + `_tmr`.

### Новые события воронки
Файл:
- `assets/js/app.js`

Добавлены события:
- `faq_open`
- `resume_activation_click`
- `plan_preview_open`
- `checkout_start`
- `payment_method_selected`
- `checkout_redirect`
- `promo_validate_success`
- `promo_validate_fail`

### События виджета поддержки
Файл:
- `assets/js/support-widget.js`

Добавлены события:
- `support_widget_open`
- `support_widget_click`

## Приоритетные метрики для мониторинга
1. `checkout_start -> checkout_redirect` conversion rate.
2. Конверсия по методам оплаты (`payment_method_selected` segmentation).
3. Частота `promo_validate_fail` и ее влияние на drop-off.
4. CTR support-widget из checkout/redeem сценариев.
5. FAQ engagement vs. purchase conversion.

## Рекомендованная схема именования (зафиксирована)
- Формат: `snake_case`, без vendor-specific префиксов внутри бизнес-слоя.
- Все события маршрутизируются через единый helper.

## Что еще добавить в следующей итерации
- `checkout_error` с нормализованным `error_code`.
- `activation_validate_fail` / `activation_validate_success`.
- `lang_switch` с полем `from_lang`/`to_lang`.
- `scroll_depth_25_50_75_100` для рекламного трафика.
