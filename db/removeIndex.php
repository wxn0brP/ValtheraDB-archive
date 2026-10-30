<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/db.php';
require_once __DIR__ . '/../utils/utils.php';
require_once __DIR__ . '/../utils/index.php';

/**
 * Resolve index names whose column set matches `$fields` exactly.
 */
function findIndexesByFields(string $schema, string $collection, array $fields): array
{
    $sql = "SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        GROUP BY INDEX_NAME
        HAVING cols = ?";

    $rows = db_fetch_all($sql, [$schema, $collection, implode(',', $fields)]);

    return array_column($rows, 'INDEX_NAME');
}

function removeIndex(array $params): bool
{
    $index = $params['index'] ?? null;
    if (!is_array($index))
        throw new QueryValidationError("Missing required parameter: index", ['op' => 'removeIndex']);

    $collection = assertSafeCollectionName(
        resolveCollection($index['collection'] ?? null) ?? requireCollection($params, 'removeIndex'),
        'removeIndex',
    );
    $fields = filterIndexFields($index['fields'] ?? []);
    $opts = is_array($index['opts'] ?? null) ? $index['opts'] : [];
    $dbName = $params['db'] ?? null;

    if (empty($fields))
        throw new QueryValidationError("Missing required parameter: fields", ['op' => 'removeIndex']);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    $schema = $dbConfig['database'];
    $names = findIndexesByFields($schema, $collection, $fields);
    if (empty($names))
        $names = [indexName($collection, $fields, $opts)];

    try {
        foreach ($names as $name) {
            if (strtoupper((string) $name) === 'PRIMARY')
                continue;
            db_execute(
                "DROP INDEX " . escapeIdentifier($name) . " ON " . escapeIdentifier($collection),
                [],
            );
        }
    } finally {
        db_close();
    }

    return true;
}

try {
    $params = getRequestParams();
    jsonResponse(removeIndex($params));
} catch (Throwable $e) {
    errorResponse($e);
}
