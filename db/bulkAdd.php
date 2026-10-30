<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/operations.php';

function bulkAddDocs(array $params): array
{
    $collection = requireCollection($params, 'bulkAdd');
    $datas = $params['datas'] ?? [];
    $idGen = $params['id_gen'] ?? true;
    $dbName = $params['db'] ?? null;

    if (!is_array($datas))
        throw new QueryValidationError("Missing required parameter: datas", ['op' => 'bulkAdd']);

    if (empty($datas))
        return [];

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    createTableIfNotExists($collection);

    $docs = [];
    $generated = [];

    foreach ($datas as $i => $doc) {
        if (!is_array($doc))
            $doc = ['value' => $doc];

        if (array_is_list($doc))
            throw new QueryValidationError("Parameter datas must contain objects", ['op' => 'bulkAdd']);

        $doc = filterUnsafeKeys($doc);

        $hadId = array_key_exists('_id', $doc);
        if (!$hadId)
            $doc['_id'] = genId();

        $generated[$i] = !$hadId;
        $docs[$i] = $doc;
    }

    $columns = [];
    foreach ($docs as $doc) {
        foreach (array_keys($doc) as $key) {
            if (!in_array($key, $columns, true))
                $columns[] = $key;
        }
    }

    ensureColumns($collection, array_fill_keys($columns, null));

    $placeholders = '(' . implode(', ', array_fill(0, count($columns), '?')) . ')';
    $valuesSql = implode(', ', array_fill(0, count($docs), $placeholders));

    $flat = [];
    foreach ($docs as $doc) {
        $encoded = encodeDocFields($doc);
        foreach ($columns as $column) {
            $flat[] = array_key_exists($column, $encoded) ? $encoded[$column] : null;
        }
    }

    $columnSql = implode(', ', array_map(fn($c) => escapeIdentifier($c), $columns));
    $sql = "INSERT INTO " . escapeIdentifier($collection) . " ({$columnSql}) VALUES {$valuesSql}";

    try {
        db_execute($sql, $flat);
        header('X-SQL-Query: ' . convertSqlAndParamsToString($sql, $flat));
    } finally {
        db_close();
    }

    $results = [];
    foreach ($docs as $i => $doc) {
        if (!$idGen && $generated[$i])
            unset($doc['_id']);
        $results[] = $doc;
    }

    return $results;
}

try {
    $params = getRequestParams();

    if (isset($params['collection'])) {
        jsonResponse(bulkAddDocs($params));
    } else {
        jsonErrResponse('Missing required parameter: collection', 400);
    }
} catch (Throwable $e) {
    errorResponse($e);
}
