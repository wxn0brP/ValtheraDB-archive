<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/operations.php';

function toggleOne(array $params): array
{
    $result = removeOne($params);

    if ($result !== null) {
        return [
            'data' => $result,
            'type' => 'removed',
        ];
    }

    $data = array_merge(
        assignDataPush($params['search'] ?? []),
        assignDataPush($params['data'] ?? [])
    );

    $addParams = [
        'collection' => $params['collection'],
        'data' => $data,
        'id_gen' => $params['id_gen'] ?? true,
        'db' => $params['db'] ?? null,
    ];

    $added = add($addParams);

    return [
        'data' => $added,
        'type' => 'added',
    ];
}

try {
    $params = getRequestParams();

    if (isset($params['collection'])) {
        $response = toggleOne($params);
        jsonResponse($response);
    } else {
        jsonErrResponse('Missing required parameter: collection', 400);
    }
} catch (Throwable $e) {
    errorResponse($e);
}
