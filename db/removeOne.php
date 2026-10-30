<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/operations.php';

try {
    $params = getRequestParams();

    if (isset($params['collection'])) {
        $result = removeOne($params);
        jsonResponse($result);
    } else {
        jsonErrResponse('Missing required parameter: collection', 400);
    }
} catch (Throwable $e) {
    errorResponse($e);
}
