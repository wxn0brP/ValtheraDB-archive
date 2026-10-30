<?php
/**
 * Root endpoint parity with tools/server: POST / with the operation in body.op
 * and the database in body.db.
 */
require_once __DIR__ . '/utils/security.php';
require_once __DIR__ . '/utils/utils.php';

try {
    $params = getRequestParams();
    $op = $params['op'] ?? null;

    if (!$op)
        throw new QueryValidationError("op is required", ['op' => 'root']);
    if (!is_string($op) || !preg_match('/^[A-Za-z]+$/', $op))
        throw new QueryValidationError("invalid op", ['op' => $op]);

    $file = __DIR__ . '/db/' . $op . '.php';
    if (!is_file($file))
        throw new UnsupportedOperationError($op, ['op' => $op]);

    // The handler runs its own try/catch and terminates the request.
    require $file;
} catch (Throwable $e) {
    errorResponse($e);
}
