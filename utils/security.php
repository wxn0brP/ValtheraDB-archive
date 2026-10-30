<?php
require_once __DIR__ . "/errors.php";

ini_set('display_errors', '0');

$_AUTH_NAME = null;

function setCorsHeaders(): void
{
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    header("Access-Control-Allow-Credentials: true");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

function protectFromDirectAccess(): void
{
    $includedFile = __FILE__;
    $includedFiles = get_included_files();
    $mainScript = array_shift($includedFiles);
    if (realpath($includedFile) === realpath($mainScript)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Direct access forbidden']);
        exit(1);
    }
}

function checkAuth(?string $token = null): ?string
{
    $configFile = __DIR__ . '/../config.php';
    if (!file_exists($configFile)) {
        return null;
    }

    $config = require $configFile;
    $auth = $config['auth'] ?? [];

    foreach ($auth as $name => $entry) {
        $validToken = is_array($entry) ? ($entry['token'] ?? null) : $entry;
        if ($token !== null && $validToken !== null && hash_equals((string) $validToken, (string) $token)) {
            return $name;
        }
    }

    return null;
}

function currentAuthDbs(): ?array
{
    $configFile = __DIR__ . '/../config.php';
    if (!file_exists($configFile)) {
        return [];
    }

    $config = require $configFile;
    $auth = $config['auth'] ?? [];
    $name = currentAuthName();
    if ($name === null || !isset($auth[$name]) || !is_array($auth[$name])) {
        return [];
    }

    return array_key_exists('dbs', $auth[$name]) ? $auth[$name]['dbs'] : [];
}

function currentAuthName(): ?string
{
    global $_AUTH_NAME;
    return $_AUTH_NAME;
}

function set_unauthorized(): void
{
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['err' => true, 'msg' => 'Unauthorized']);
    exit(1);
}

function set_forbidden(string $msg): void
{
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['err' => true, 'msg' => $msg]);
    exit(1);
}

function requireAuth(): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];

    $authHeader =
        $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? $headers['Authorization']
        ?? $headers['authorization']
        ?? null;

    if (empty($authHeader)) {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($contentType, 'application/json') !== false) {
            $rawInput = file_get_contents('php://input');
            $jsonData = json_decode($rawInput, true);
            if (is_array($jsonData)) {
                if (array_key_exists('query', $jsonData))
                    $authHeader = $jsonData['auth'] ?? $jsonData['db'] ?? null;
                else
                    $authHeader = $jsonData['auth'] ?? null;
            }
        }
    }

    if (empty($authHeader))
        set_unauthorized();

    $token = null;

    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    } elseif (!empty($authHeader)) {
        $token = $authHeader;
    }

    $tokenName = checkAuth($token);
    if ($tokenName === null)
        set_unauthorized();

    global $_AUTH_NAME;
    $_AUTH_NAME = $tokenName;

    return $tokenName;
}

/**
 * Keys that must never reach stored data, query output or SQL identifiers.
 * Mirrors isUnsafeKey() from @wxn0brp/db-core/utils/security.
 */
function isUnsafeKey(string $key): bool
{
	return in_array($key, [ "__proto__", "constructor", "prototype" ], true);
}

function hasUnsafeSegment(array $path): bool
{
	foreach ($path as $segment) {
		if (is_string($segment) && isUnsafeKey($segment))
			return true;
	}
	return false;
}

/**
 * A usable field/column name: a non-empty string without unsafe path segments.
 */
function isSafeField($field): bool
{
	if (!is_string($field) || $field === "")
		return false;

	return !hasUnsafeSegment(explode(".", $field));
}

/**
 * Drop top-level unsafe keys from a data/map array.
 */
function filterUnsafeKeys(array $data): array
{
	$filtered = [];
	foreach ($data as $key => $value) {
		if (is_string($key) && isUnsafeKey($key))
			continue;
		$filtered[$key] = $value;
	}
	return $filtered;
}

/**
 * Collection names become SQL identifiers, so reject anything MySQL cannot store
 * (empty, too long, control characters, path separators, dots).
 */
function assertSafeCollectionName(string $collection, string $op = "collection"): string
{
	if ($collection === "")
		throw new QueryValidationError("Missing required parameter: collection", [ "op" => $op ]);

	if (strlen($collection) > 64)
		throw new QueryValidationError("Collection name is too long (max 64 characters)", [
			"op" => $op,
			"collection" => $collection,
		]);

	if (trim($collection) !== $collection || preg_match('/[\x00-\x1F\/\\\\.]/', $collection))
		throw new QueryValidationError("Invalid collection name", [
			"op" => $op,
			"collection" => $collection,
		]);

	return $collection;
}

setCorsHeaders();
protectFromDirectAccess();
requireAuth();
