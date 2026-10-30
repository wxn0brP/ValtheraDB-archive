<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/operations.php';

function countDocs(array $params): int
{
    $collection = requireCollection($params, 'count');
    $search = $params['search'] ?? [];
    $dbName = $params['db'] ?? null;

    if (!is_array($search))
        throw new QueryValidationError("Function-based search is not supported", ['op' => 'count']);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    $sql = "SELECT COUNT(*) AS cnt FROM " . escapeIdentifier($collection);
    $whereParams = [];
    $whereClause = buildWhere($search, $whereParams);
    if ($whereClause !== '')
        $sql .= " WHERE " . $whereClause;

    try {
        $rows = safeFetchAll($sql, $whereParams);
    } finally {
        db_close();
    }

    return (int) ($rows[0]['cnt'] ?? 0);
}

try {
    $params = getRequestParams();

    if (isset($params['collection'])) {
        jsonResponse(countDocs($params));
    } else {
        jsonErrResponse('Missing required parameter: collection', 400);
    }
} catch (Throwable $e) {
    errorResponse($e);
}
