<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/utils.php';

function capabilities(): array
{
    return [
        'version' => ADAPTER_VERSION,
        'transactions' => false,
        'indexes' => true,
        'persistent' => true,
    ];
}

try {
    jsonResponse(capabilities());
} catch (Throwable $e) {
    errorResponse($e);
}
