<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/db.php';
require_once __DIR__ . '/../utils/utils.php';

function ensureCollectionCheck(string $collection, string $dbName): bool
{
    $checkSql = "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?";
    $result = db_fetch_all($checkSql, [$collection, $dbName]);
    return !empty($result) && $result[0]['cnt'] > 0;
}

function ensureCollection(string $collection, string $dbName): bool
{
    if (ensureCollectionCheck($collection, $dbName)) {
        return false;
    }

    $sql = 'CREATE TABLE IF NOT EXISTS ' . escapeIdentifier($collection) . ' (_id VARCHAR(64) PRIMARY KEY)';
    db_execute($sql, []);
    return true;
}

try {
    $params = getRequestParams();
    $collection = requireCollection($params, 'ensureCollection');
    $dbConfig = getDbConfig($params['db'] ?? null);
    db_init($dbConfig);

    $result = ensureCollection($collection, (string) $dbConfig['database']);
    db_close();
    jsonResponse($result);
} catch (Throwable $e) {
    error_log('[ensureCollection.php] ERROR: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    error_log('[ensureCollection.php] Stack trace: ' . $e->getTraceAsString());
    errorResponse($e);
}
