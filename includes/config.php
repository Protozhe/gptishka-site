<?php
declare(strict_types=1);

return [
    'site_url' => (string)(getenv('SITE_URL') ?: 'https://gptishka.shop'),
    'admin_email' => (string)(getenv('ADMIN_EMAIL') ?: 'admin@gptishka.shop'),
    'db' => [
        'host' => (string)(getenv('DB_HOST') ?: ''),
        'port' => (int)(getenv('DB_PORT') ?: 5432),
        'name' => (string)(getenv('DB_NAME') ?: ''),
        'user' => (string)(getenv('DB_USER') ?: ''),
        'password' => (string)(getenv('DB_PASSWORD') ?: ''),
    ],
    'webmoney' => [
        'purse' => (string)(getenv('WEBMONEY_PURSE') ?: ''),
        'secret_key' => (string)(getenv('WEBMONEY_SECRET_KEY') ?: ''),
        'additional_key' => (string)(getenv('WEBMONEY_ADDITIONAL_KEY') ?: ''),
        'test_mode' => filter_var((string)(getenv('WEBMONEY_TEST_MODE') ?: 'true'), FILTER_VALIDATE_BOOL),
    ],
];
