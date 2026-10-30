<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/search.php';
require_once __DIR__ . '/updater.php';
require_once __DIR__ . '/id.php';
require_once __DIR__ . '/findOpts.php';

function createTableIfNotExists(string $collection): void
{
    $sql = 'CREATE TABLE IF NOT EXISTS ' . escapeIdentifier($collection) . ' (_id VARCHAR(64) PRIMARY KEY)';
    db_execute($sql, []);
}

function isColumnNotFoundError(Throwable $e): bool
{
    return str_contains($e->getMessage(), 'Unknown column')
        || str_contains($e->getMessage(), "doesn't exist");
}

function safeFetchAll(string $sql, array $params): array
{
    try {
        return db_fetch_all($sql, $params);
    } catch (Throwable $e) {
        if (isColumnNotFoundError($e)) {
            return [];
        }
        throw $e;
    }
}

function decodeDocFields(array $doc): array
{
    $result = [];
    foreach ($doc as $key => $value) {
        if (is_string($key) && isUnsafeKey($key))
            continue;

        if ($key !== "_id" && is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded))) {
                $value = $decoded;
            } elseif (is_numeric($value)) {
                $value = $value + 0;
            }
        }
        $result[$key] = $value;
    }
    return $result;
}

function encodeDocFields(array $doc): array
{
    foreach ($doc as $key => $value) {
        if (is_string($key) && isUnsafeKey($key)) {
            unset($doc[$key]);
            continue;
        }
        if ($key !== "_id" && (is_array($value) || is_object($value))) {
            $doc[$key] = json_encode($value, JSON_UNESCAPED_UNICODE);
        }
    }
    return $doc;
}

function ensureColumns(string $collection, array $data): void
{
    $sql = 'SHOW COLUMNS FROM ' . escapeIdentifier($collection);
    $columns = db_fetch_all($sql, []);
    $existingColumns = array_column($columns, 'Field');

    foreach (array_keys($data) as $key) {
        if (!is_string($key) || $key === '_id' || isUnsafeKey($key))
            continue;
        if (!in_array($key, $existingColumns)) {
            $alterSql = 'ALTER TABLE ' . escapeIdentifier($collection)
                . ' ADD COLUMN ' . escapeIdentifier($key) . ' TEXT';
            db_execute($alterSql, []);
        }
    }
}

function filterFieldNames($fields): ?array
{
    if ($fields === null)
        return null;

    $list = is_array($fields) ? $fields : [ $fields ];
    $list = array_values(array_filter($list, fn($field) => isSafeField($field)));

    return empty($list) ? null : $list;
}

function filterFieldMap($map): ?array
{
    if (!is_array($map) || empty($map))
        return null;

    $result = [];
    foreach ($map as $outKey => $srcField) {
        if (!is_string($outKey) || !isSafeField($outKey) || !isSafeField($srcField))
            continue;
        $result[$outKey] = $srcField;
    }

    return empty($result) ? null : $result;
}

function filterSortBy($sortBy)
{
    if ($sortBy === null || $sortBy === "random()")
        return $sortBy;

    if (is_array($sortBy)) {
        $result = [];
        foreach ($sortBy as $item) {
            $field = is_array($item) ? ($item["field"] ?? null) : $item;
            if (!isSafeField($field))
                continue;
            $result[] = $item;
        }
        return empty($result) ? null : $result;
    }

    return isSafeField($sortBy) ? $sortBy : null;
}

function add(array $params): array
{
    $collection = requireCollection($params, 'add');
    $data = $params['data'] ?? [];
    $idGen = $params['id_gen'] ?? true;
    $dbName = $params['db'] ?? null;

    if (empty($data))
        throw new QueryValidationError("Missing required parameter: data", ['op' => 'add']);

    if (!is_array($data))
        $data = [$data];

    if (array_is_list($data))
        throw new QueryValidationError("Parameter data must be an object", ['op' => 'add']);

    $data = filterUnsafeKeys($data);

    $hadId = isset($data['_id']);
    if (!$hadId)
        $data['_id'] = genId();

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    createTableIfNotExists($collection);
    ensureColumns($collection, $data);

    $encodedData = encodeDocFields($data);
    $keys = array_keys($encodedData);
    $columns = implode(
        ', ',
        array_map(fn($k) =>
            escapeIdentifier($k), $keys)
    );
    $placeholders = implode(', ', array_fill(0, count($keys), '?'));

    $sql = "INSERT INTO " . escapeIdentifier($collection) . " ({$columns}) VALUES ({$placeholders})";

    db_execute($sql, array_values($encodedData));
    header('X-SQL-Query: ' . convertSqlAndParamsToString($sql, array_values($encodedData)));

    db_close();

    if (!$idGen && !$hadId) {
        unset($data['_id']);
    }

    return $data;
}

function find(array $params): array
{
    $collection = requireCollection($params, 'find');
    $search = $params['search'] ?? [];
    $dbName = $params['db'] ?? null;
    $dbFindOpts = $params['dbFindOpts'] ?? [];
    $findOpts = $params['findOpts'] ?? [];

    if (!is_array($search))
        throw new QueryValidationError("Function-based search is not supported", ['op' => 'find']);

    if (!is_array($dbFindOpts))
        $dbFindOpts = [];

    if (!is_array($findOpts))
        $findOpts = [];

    $limit = $dbFindOpts['limit'] ?? null;
    $offset = $dbFindOpts['offset'] ?? null;
    $sortBy = filterSortBy($dbFindOpts['sortBy'] ?? null);
    $sortAsc = $dbFindOpts['sortAsc'] ?? null;
    $reverse = $dbFindOpts['reverse'] ?? false;
    $groupBy = filterFieldNames($dbFindOpts['groupBy'] ?? null);
    $count = filterFieldMap($dbFindOpts['count'] ?? null);
    $min = filterFieldMap($dbFindOpts['min'] ?? null);
    $max = filterFieldMap($dbFindOpts['max'] ?? null);
    $avg = filterFieldMap($dbFindOpts['avg'] ?? null);
    $sum = filterFieldMap($dbFindOpts['sum'] ?? null);
    $distinct = isSafeField($dbFindOpts['distinct'] ?? null) ? $dbFindOpts['distinct'] : null;

    if ($limit === INF || $limit === 'Infinity') $limit = null;

    $hasAggregation = $groupBy !== null || $count !== null || $min !== null || $max !== null || $avg !== null || $sum !== null;
    $isRandomSort = $sortBy === 'random()';
    $needsPhpReverse = $reverse && $sortBy === null && !$hasAggregation;
    $isMultiSort = is_array($sortBy);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    if ($needsPhpReverse) {
        $sql = "SELECT * FROM " . escapeIdentifier($collection);
        $whereParams = [];
        $whereClause = buildWhere($search, $whereParams);
        if ($whereClause)
            $sql .= " WHERE " . $whereClause;

        $results = safeFetchAll($sql, $whereParams);
        header('X-SQL-Query: ' . convertSqlAndParamsToString($sql, $whereParams));
        db_close();

        $results = array_map(fn($row) => decodeDocFields($row), $results);
        $results = array_reverse($results);

        $effectiveOffset = $offset !== null ? (int) $offset : 0;
        if ($limit !== null && $limit !== -1)
            $results = array_slice($results, $effectiveOffset, (int) $limit);
        elseif ($effectiveOffset > 0)
            $results = array_slice($results, $effectiveOffset);

        if (!empty($findOpts))
            $results = array_map(fn($row) => applyFindOpts($row, $findOpts), $results);

        return $results;
    }

    if ($hasAggregation) {
        $selectParts = [];

        if ($groupBy !== null) {
            $groupByFields = is_array($groupBy) ? $groupBy : [$groupBy];
            foreach ($groupByFields as $f) {
                $selectParts[] = escapeIdentifier($f);
            }
        }

        if ($count)
            foreach ($count as $outKey => $srcField)
                $selectParts[] = "COUNT(" . escapeIdentifier($srcField) . ") AS " . escapeIdentifier($outKey);

        if ($min)
            foreach ($min as $outKey => $srcField)
                $selectParts[] = "MIN(" . escapeIdentifier($srcField) . ") AS " . escapeIdentifier($outKey);

        if ($max)
            foreach ($max as $outKey => $srcField)
                $selectParts[] = "MAX(" . escapeIdentifier($srcField) . ") AS " . escapeIdentifier($outKey);

        if ($avg)
            foreach ($avg as $outKey => $srcField)
                $selectParts[] = "AVG(" . escapeIdentifier($srcField) . ") AS " . escapeIdentifier($outKey);

        if ($sum)
            foreach ($sum as $outKey => $srcField)
                $selectParts[] = "SUM(" . escapeIdentifier($srcField) . ") AS " . escapeIdentifier($outKey);

        $sql = "SELECT " . implode(', ', $selectParts) . " FROM " . escapeIdentifier($collection);
    } else {
        $sql = "SELECT * FROM " . escapeIdentifier($collection);
    }

    $whereParams = [];
    $whereClause = buildWhere($search, $whereParams);
    if ($whereClause)
        $sql .= " WHERE " . $whereClause;

    if ($hasAggregation && $groupBy !== null) {
        $groupByFields = is_array($groupBy) ? $groupBy : [$groupBy];
        $gbParts = array_map(fn($f) => escapeIdentifier($f), $groupByFields);
        $sql .= " GROUP BY " . implode(', ', $gbParts);
    }

    if ($isRandomSort) {
        $sql .= " ORDER BY RAND()";
    } elseif ($isMultiSort) {
        $orderParts = [];
        foreach ($sortBy as $sortItem) {
            $field = is_array($sortItem) ? ($sortItem['field'] ?? '') : $sortItem;
            $asc = is_array($sortItem) ? ($sortItem['asc'] ?? true) : ($sortAsc ?? true);
            if ($reverse) $asc = !$asc;
            $dir = $asc ? 'ASC' : 'DESC';
            $orderParts[] = escapeIdentifier($field) . " {$dir}";
        }
        $sql .= " ORDER BY " . implode(', ', $orderParts);
    } elseif ($sortBy !== null) {
        $effectiveSortAsc = $sortAsc ?? true;
        if ($reverse)
            $effectiveSortAsc = !$effectiveSortAsc;
        $dir = $effectiveSortAsc ? 'ASC' : 'DESC';
        $sql .= " ORDER BY " . escapeIdentifier($sortBy) . " {$dir}";
    }

    if ($limit !== null && $limit !== -1) {
        $sql .= " LIMIT " . intval($limit);
        if ($offset !== null)
            $sql .= " OFFSET " . intval($offset);
    } elseif ($offset !== null && $offset > 0) {
        $sql .= " LIMIT 18446744073709551615 OFFSET " . intval($offset);
    }

    $results = safeFetchAll($sql, $whereParams);
    header('X-SQL-Query: ' . convertSqlAndParamsToString($sql, $whereParams));
    db_close();

    $results = array_map(fn($row) => decodeDocFields($row), $results);

    if ($hasAggregation && $groupBy === null)
        return !empty($results) ? $results[0] : [];

    if ($distinct !== null) {
        $seen = [];
        $deduped = [];
        foreach ($results as $row) {
            $val = $row[$distinct] ?? null;
            $key = is_array($val) ? json_encode($val) : (string) $val;
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $deduped[] = $row;
            }
        }
        $results = $deduped;
    }

    if (!empty($findOpts) && !$hasAggregation)
        $results = array_map(fn($row) => applyFindOpts($row, $findOpts), $results);

    return $results;
}

function update(array $params, bool $one = false): array
{
    $collection = requireCollection($params, 'update');
    $search = $params['search'] ?? [];
    $updater = $params['updater'] ?? [];
    $dbName = $params['db'] ?? null;

    if (!is_array($search))
        throw new QueryValidationError("Function-based search is not supported", ['op' => 'update']);

    if (!is_array($updater))
        throw new QueryValidationError("Function-based updater is not supported", ['op' => 'update']);

    if (empty($updater))
        throw new QueryValidationError("Missing required parameter: updater", ['op' => 'update']);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    $selectSql = "SELECT * FROM " . escapeIdentifier($collection);
    $whereParams = [];
    $whereClause = buildWhere($search, $whereParams);

    if ($whereClause)
        $selectSql .= " WHERE " . $whereClause;

    if ($one)
        $selectSql .= " LIMIT 1";

    $matchingDocs = safeFetchAll($selectSql, $whereParams);

    if (empty($matchingDocs))
        return [];

    $results = [];

    foreach ($matchingDocs as $doc) {
        $doc = decodeDocFields($doc);
        [$newData, $removedKeys] = applyUpdater($doc, $updater);

        $newData['_id'] = $doc['_id'];

        ensureColumns($collection, $newData);

        $keys = array_keys($newData);
        $keyIdIndex = array_search('_id', $keys, true);
        if ($keyIdIndex !== false) {
            unset($keys[$keyIdIndex]);
        }

        // Removed fields still exist as columns; write NULL so $exists:false and
        // later reads agree with what the updater returned.
        foreach (array_keys($removedKeys) as $key) {
            if (array_key_exists($key, $newData))
                continue;
            $newData[$key] = null;
            $keys[] = $key;
        }

        $encodedData = encodeDocFields($newData);

        if (empty($keys)) {
            $updatedDoc = db_fetch_one(
                "SELECT * FROM " . escapeIdentifier($collection) . " WHERE " . escapeIdentifier('_id') . " = ?",
                [$doc['_id']],
            );
            $updatedDoc = decodeDocFields($updatedDoc);
            foreach (array_keys($removedKeys) as $key) {
                unset($updatedDoc[$key]);
            }
            $results[] = $updatedDoc;
            continue;
        }

        $setClause = implode(', ', array_map(fn($k) => escapeIdentifier($k) . " = ?", $keys));
        $updateValues = array_values(array_filter($encodedData, fn($k) => $k !== '_id', ARRAY_FILTER_USE_KEY));

        $updateSql = "UPDATE " . escapeIdentifier($collection) . " SET {$setClause} WHERE " . escapeIdentifier('_id') . " = ?";
        $updateParams = [...$updateValues, $doc['_id']];

        db_execute($updateSql, $updateParams);

        $updatedDoc = db_fetch_one(
            "SELECT * FROM " . escapeIdentifier($collection) . " WHERE " . escapeIdentifier('_id') . " = ?",
            [$doc['_id']],
        );

        $updatedDoc = decodeDocFields($updatedDoc);
        foreach (array_keys($removedKeys) as $key) {
            unset($updatedDoc[$key]);
        }
        $results[] = $updatedDoc;
    }

    db_close();
    if (!empty($updateSql)) {
        header('X-SQL-Query: ' . convertSqlAndParamsToString($updateSql, $updateParams));
    }
    return $results;
}

function updateOne(array $params): ?array
{
    $results = update($params, true);
    return !empty($results) ? $results[0] : null;
}

function remove(array $params, bool $one = false): array
{
    $collection = requireCollection($params, 'remove');
    $search = $params['search'] ?? [];
    $dbName = $params['db'] ?? null;

    if (!is_array($search))
        throw new QueryValidationError("Function-based search is not supported", ['op' => 'remove']);

    $dbConfig = getDbConfig($dbName);
    db_init($dbConfig);

    $selectSql = "SELECT * FROM " . escapeIdentifier($collection);
    $whereParams = [];
    $whereClause = buildWhere($search, $whereParams);

    if ($whereClause)
        $selectSql .= " WHERE " . $whereClause;

    if ($one)
        $selectSql .= " LIMIT 1";

    $matchingDocs = safeFetchAll($selectSql, $whereParams);
    $matchingDocs = array_map(fn($row) => decodeDocFields($row), $matchingDocs);

    if (empty($matchingDocs))
        return [];

    $deleteSql = '';
    $deleteParams = [];
    $deletedDocs = [];

    foreach ($matchingDocs as $doc) {
        $deleteSql = "DELETE FROM " . escapeIdentifier($collection) . " WHERE " . escapeIdentifier('_id') . " = ?";
        $deleteParams = [$doc['_id']];
        db_execute($deleteSql, $deleteParams);
        $deletedDocs[] = $doc;
    }

    db_close();
    header('X-SQL-Query: ' . convertSqlAndParamsToString($deleteSql, $deleteParams));
    return $deletedDocs;
}

function removeOne(array $params): ?array
{
    $results = remove($params, true);
    return !empty($results) ? $results[0] : null;
}
