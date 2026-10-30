<?php
require_once __DIR__ . '/errors.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/version.php';

function getDbConfig(?string $dbName = null): array
{
    $configFile = __DIR__ . '/../config.php';
    if (!file_exists($configFile)) {
        throw new AdapterInitError("Configuration file not found: {$configFile}", [
            "config" => $configFile,
        ]);
    }

    $config = require $configFile;
    $dbs = $config["databases"];

    if ($dbName === null || $dbName === '') {
        $dbName = $config['default']['database'] ?? null;
    }

    if ($dbName === null || !isset($dbs[$dbName])) {
        set_forbidden('Database not configured: ' . (string) $dbName);
    }

    $allowedDbs = currentAuthDbs();
    if ($allowedDbs !== null && !in_array($dbName, $allowedDbs, true)) {
        set_forbidden('Database not allowed for this token: ' . $dbName);
    }

    return array_merge(
        $config['default'],
        ['database' => $dbName],
        $dbs[$dbName] ? $dbs[$dbName] : []
    );
}

function escapeIdentifier(string $name): string
{
    return "`" . str_replace("`", "``", $name) . "`";
}

function getRequestParams(): array
{
    $params = [];
    $dbName = null;

    if (!empty($_GET))
        $params = array_merge($params, $_GET);

    if (!empty($_POST))
        $params = array_merge($params, $_POST);

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $rawInput = file_get_contents('php://input');
        $jsonData = json_decode($rawInput, true);
        if (is_array($jsonData)) {
            if (array_key_exists('query', $jsonData)) {
                $dbName = $jsonData['db'] ?? null;
                if (is_array($jsonData['query']))
                    $params = array_merge($params, $jsonData['query']);
                elseif (is_string($jsonData['query']))
                    $params['collection'] = $jsonData['query'];
            } else {
                if (isset($jsonData['db']))
                    $dbName = $jsonData['db'];
                if (isset($jsonData['params']) && is_array($jsonData['params']) && isset($jsonData['params'][0]))
                    $params = array_merge($params, $jsonData['params'][0]);
                elseif (isset($jsonData['params']) && is_array($jsonData['params']))
                    $params = array_merge($params, $jsonData['params']);
            }
            foreach ($jsonData as $key => $value) {
                if (!in_array($key, ['db', 'params', 'keys', 'query'])) {
                    $params[$key] = $value;
                }
            }
        }
    }

    if ($dbName !== null)
        $params['db'] = $dbName;

    // /db/:db/:type?c=<collection> is documented in README
    if (!isset($params['collection']) && isset($params['c']) && is_string($params['c']))
        $params['collection'] = $params['c'];

    return $params;
}

/**
 * A collection may arrive as a plain string or as { collection } (VQueryT.Collection).
 */
function resolveCollection($target): ?string
{
    if (is_string($target))
        return $target;

    if (is_array($target) && isset($target["collection"]) && is_string($target["collection"]))
        return $target["collection"];

    return null;
}

/**
 * Read, normalize and validate the collection from request params.
 */
function requireCollection(array $params, string $op): string
{
    $collection = resolveCollection($params["collection"] ?? null);

    if ($collection === null)
        throw new QueryValidationError("Missing required parameter: collection", [ "op" => $op ]);

    return assertSafeCollectionName($collection, $op);
}

function jsonResponse($data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode(['err' => false, 'result' => $data], JSON_PRETTY_PRINT);
    exit;
}

function jsonErrResponse($data, int $statusCode = 400): void
{
    if ($data instanceof \Throwable)
        errorResponse($data, $statusCode);

    errorResponse(new QueryValidationError((string) $data), $statusCode);
}

/**
 * Emit the error wire used by tools/server:
 * { err, msg, code?, suggestion?, context? }
 */
function errorResponse($err, int $statusCode = 0): void
{
    $error = wrapAdapterError($err)->withContext([
        "adapter" => "php",
        "version" => ADAPTER_VERSION,
    ]);

    http_response_code($statusCode > 0 ? $statusCode : $error->statusCode());
    header('Content-Type: application/json');
    echo json_encode($error->toWire(), JSON_PRETTY_PRINT);
    exit;
}

/**
 * Inline bound values into SQL for the X-SQL-Query debug header.
 * Avoids vsprintf so values containing "%" cannot break the format string.
 */
function convertSqlAndParamsToString(string $sql, array $params): string
{
    $parts = explode("?", $sql);
    if (count($parts) === 1)
        return $sql;

    $result = array_shift($parts);
    foreach ($parts as $i => $part)
        $result .= convertSqlValue($params[$i] ?? null) . $part;

    return str_replace([ "\r", "\n" ], " ", $result);
}

function convertSqlValue($value): string
{
    if ($value === null)
        return "NULL";
    if (is_bool($value))
        return $value ? "1" : "0";
    if (is_int($value) || is_float($value))
        return (string) $value;

    return "'" . str_replace("'", "''", (string) $value) . "'";
}

function assignDataPush($data): array
{
    if (!$data || !is_array($data) || empty($data)) {
        return [];
    }

    $result = [];

    foreach ($data as $key => $value) {
        if (!is_string($key) || isUnsafeKey($key))
            continue;

        if (str_starts_with($key, '$')) {
            if (is_array($value) && !isset($value[0])) {
                foreach ($value as $k => $v) {
                    if (is_string($k) && isUnsafeKey($k))
                        continue;
                    $result[$k] = $v;
                }
            }
        } else {
            $result[$key] = $value;
        }
    }

    return $result;
}
