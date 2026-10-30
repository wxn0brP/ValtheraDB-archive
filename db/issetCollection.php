<?php
require_once __DIR__ . '/../utils/security.php';
require_once __DIR__ . '/../utils/db.php';
require_once __DIR__ . '/../utils/utils.php';

/**
 * Check if collection exists
 */
function issetCollection(string $collection, string $dbName): bool
{
    $sql = "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?";
    $result = db_fetch_all($sql, [$collection, $dbName]);
    return !empty($result) && $result[0]['cnt'] > 0;
}

// Handle direct API call
try {
    $params = getRequestParams();
    $collection = requireCollection($params, 'issetCollection');
    $dbConfig = getDbConfig($params['db'] ?? null);
    db_init($dbConfig);

    $result = issetCollection($collection, (string) $dbConfig['database']);
    db_close();
    jsonResponse($result);
} catch (Throwable $e) {
    error_log('[issetCollection.php] ERROR: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    error_log('[issetCollection.php] Stack trace: ' . $e->getTraceAsString());
    errorResponse($e);
}
