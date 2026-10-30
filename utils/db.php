<?php
require_once __DIR__ . '/errors.php';

$_DB_CONN = null;

function db_init(array $config): void
{
    global $_DB_CONN;

    if ($_DB_CONN !== null)
        return;

    if (!class_exists('PDO') || !in_array('mysql', PDO::getAvailableDrivers())) {
        throw new AdapterInitError("pdo_mysql extension is required but not available", [
            'driver' => 'mysql',
        ]);
    }

    $dsn = sprintf(
        "mysql:host=%s;port=%d;dbname=%s;charset=%s",
        $config['host'],
        $config['port'] ?? 3306,
        $config['database'],
        $config['charset'] ?? 'utf8mb4'
    );

    try {
        $_DB_CONN = new PDO(
            $dsn,
            $config['username'],
            $config['password'],
            $config['options'] ?? [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (\PDOException $e) {
        throw new AdapterInitError($e, [
            'host' => $config['host'] ?? null,
            'database' => $config['database'] ?? null,
        ]);
    }
}

function db_prepare(string $sql, array $params = []): object
{
    global $_DB_CONN;

    if ($_DB_CONN === null)
        throw new AdapterError("Database connection not initialized", [
            'sql' => $sql,
        ]);

    try {
        $stmt = $_DB_CONN->prepare($sql);
        foreach ($params as $i => $value)
            bindParam($stmt, $i + 1, $value);
        $stmt->execute();
        return $stmt;
    } catch (\PDOException $e) {
        throw new AdapterError($e, [
            'sql' => $sql,
        ]);
    }
}

/**
 * Bind values with their native type so numeric columns are compared
 * numerically instead of as strings (PDO defaults every value to PARAM_STR).
 */
function bindParam(\PDOStatement $stmt, $position, $value): void
{
    if ($value === null) {
        $stmt->bindValue($position, null, PDO::PARAM_NULL);
    } elseif (is_int($value) || is_bool($value)) {
        $stmt->bindValue($position, (int) $value, PDO::PARAM_INT);
    } elseif (is_float($value)) {
        if ($value == (int) $value)
            $stmt->bindValue($position, (int) $value, PDO::PARAM_INT);
        else
            $stmt->bindValue($position, (string) $value, PDO::PARAM_STR);
    } else {
        $stmt->bindValue($position, (string) $value, PDO::PARAM_STR);
    }
}

function db_fetch_all(string $sql, array $params = []): array
{
    $stmt = db_prepare($sql, $params);
    return $stmt->fetchAll();
}

function db_fetch_one(string $sql, array $params = []): ?array
{
    $stmt = db_prepare($sql, $params);
    $row = $stmt->fetch();
    return $row ?: null;
}

function db_execute(string $sql, array $params = []): bool
{
    db_prepare($sql, $params);
    return true;
}

function db_close(): void
{
    global $_DB_CONN;
    if ($_DB_CONN !== null) {
        $_DB_CONN = null;
    }
}
