<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/db.php';
require_once __DIR__ . '/../utils/utils.php';
require_once __DIR__ . '/../utils/index.php';

function createIndex(array $params): bool
{
    $index = $params['index'] ?? null;
    if (!is_array($index))
        throw new QueryValidationError("Missing required parameter: index", ['op' => 'createIndex']);

    $collection = assertSafeCollectionName(
        resolveCollection($index['collection'] ?? null) ?? requireCollection($params, 'createIndex'),
        'createIndex',
    );
    $fields = filterIndexFields($index['fields'] ?? []);
    $opts = is_array($index['opts'] ?? null) ? $index['opts'] : [];
    $dbName = $params['db'] ?? null;

    if (empty($fields))
        throw new QueryValidationError("Missing required parameter: fields", ['op' => 'createIndex']);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    $name = indexName($collection, $fields, $opts);
    $unique = !empty($opts['unique']) ? 'UNIQUE ' : '';
    $columns = implode(', ', array_map(fn($f) => escapeIdentifier($f), $fields));

    $sql = "CREATE {$unique}INDEX " . escapeIdentifier($name)
        . " ON " . escapeIdentifier($collection) . " ({$columns})";

    try {
        db_execute($sql, []);
    } catch (AdapterError $e) {
        if (str_contains($e->getMessage(), 'Duplicate key name'))
            return false;
        throw $e;
    } finally {
        db_close();
    }

    return true;
}

try {
    $params = getRequestParams();
    jsonResponse(createIndex($params));
} catch (Throwable $e) {
    errorResponse($e);
}
