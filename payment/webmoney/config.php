<?php
declare(strict_types=1);

$includesConfig = __DIR__ . '/../../includes/config.php';
if (is_file($includesConfig)) {
    $rootConfig = require $includesConfig;
    if (is_array($rootConfig) && isset($rootConfig['webmoney']) && is_array($rootConfig['webmoney'])) {
        return [
            'purse' => (string)($rootConfig['webmoney']['purse'] ?? ''),
            'secret_key' => (string)($rootConfig['webmoney']['secret_key'] ?? ''),
            'additional_key' => (string)($rootConfig['webmoney']['additional_key'] ?? ''),
            'test_mode' => (bool)($rootConfig['webmoney']['test_mode'] ?? true),
        ];
    }
}

return [
    'purse' => (string)(getenv('WEBMONEY_PURSE') ?: ''),
    'secret_key' => (string)(getenv('WEBMONEY_SECRET_KEY') ?: ''),
    'additional_key' => (string)(getenv('WEBMONEY_ADDITIONAL_KEY') ?: ''),
    'test_mode' => filter_var((string)(getenv('WEBMONEY_TEST_MODE') ?: 'true'), FILTER_VALIDATE_BOOL),
];
