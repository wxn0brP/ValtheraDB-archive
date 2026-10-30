<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/operations.php';

function findOne(array $params): ?array
{
    $params['dbFindOpts'] ??= [];
    $params['dbFindOpts']['limit'] = 1;
    $results = find($params);
    return !empty($results) ? $results[0] : null;
}

try {
    $params = getRequestParams();

    if (isset($params['collection'])) {
        $result = findOne($params);
        jsonResponse($result);
    } else {
        jsonErrResponse('Missing required parameter: collection', 400);
    }
} catch (Throwable $e) {
    errorResponse($e);
}
