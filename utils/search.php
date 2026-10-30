<?php
require_once __DIR__ . '/errors.php';
require_once __DIR__ . '/security.php';

/**
 * Translate a ValtheraDB search object into a MySQL WHERE clause.
 * Keys listed in isUnsafeKey() are ignored, like db-core does.
 */
function buildWhere(array $query, array &$params): string
{
    if (empty($query))
        return '';

    $normalized = [];
    foreach ($query as $key => $value) {
        if (!is_string($key) || isUnsafeKey($key))
            continue;
        $normalized[str_starts_with($key, '$') ? strtolower($key) : $key] = $value;
    }
    $query = $normalized;

    if (array_key_exists('$and', $query) || array_key_exists('$or', $query)) {
        $op = array_key_exists('$and', $query) ? '$and' : '$or';
        $sub = [];

        foreach (requireConditionList($query[$op], $op) as $condition) {
            $where = buildWhere($condition, $params);
            if ($where !== '')
                $sub[] = "({$where})";
        }

        if (empty($sub))
            return $op === '$or' ? '1=0' : '';

        return implode($op === '$and' ? ' AND ' : ' OR ', $sub);
    }

    $parts = [];

    foreach ($query as $key => $value) {
        if (str_starts_with($key, '$'))
            continue;
        buildCondition(escapeIdentifier($key), $value, $params, $parts, '$eq');
    }

    foreach ($query as $key => $value) {
        if (!str_starts_with($key, '$'))
            continue;
        if (in_array($key, [ '$and', '$or', '$not', '$subset' ], true))
            continue;

        foreach (requireConditionMap($value, $key) as $field => $val) {
            if (!is_string($field) || isUnsafeKey($field))
                continue;
            buildCondition(escapeIdentifier($field), $val, $params, $parts, $key);
        }
    }

    if (array_key_exists('$not', $query)) {
        $where = buildWhere(requireConditionMap($query['$not'], '$not'), $params);
        $parts[] = $where === '' ? '1=0' : "NOT ({$where})";
    }

    if (array_key_exists('$subset', $query)) {
        foreach (requireConditionMap($query['$subset'], '$subset') as $field => $val) {
            if (!is_string($field) || isUnsafeKey($field))
                continue;
            buildCondition(escapeIdentifier($field), $val, $params, $parts, '$eq');
        }
    }

    return implode(' AND ', $parts);
}

function requireConditionMap($value, string $op): array
{
    if (!is_array($value))
        throw new QueryValidationError("Operator {$op} expects an object of conditions", [ 'op' => $op ]);

    return $value;
}

function requireConditionList($value, string $op): array
{
    $conditions = requireConditionMap($value, $op);

    foreach ($conditions as $condition) {
        if (!is_array($condition))
            throw new QueryValidationError("Operator {$op} expects an array of conditions", [ 'op' => $op ]);
    }

    return $conditions;
}

function buildCondition(string $col, $value, array &$params, array &$parts, string $op): void
{
    if ($op === '$regex') {
        buildRegexCondition($col, $value, $params, $parts);
        return;
    }

    if (is_array($value)) {
        switch ($op) {
            case '$in':
                handleIn($col, $value, $params, $parts, false);
                break;
            case '$nin':
                handleIn($col, $value, $params, $parts, true);
                break;
            case '$between':
                $parts[] = "{$col} BETWEEN ? AND ?";
                $params[] = $value[0] ?? null;
                $params[] = $value[1] ?? null;
                break;
            case '$arrincall':
                foreach ($value as $v) {
                    $parts[] = "JSON_CONTAINS({$col}, ?) = 1";
                    $params[] = json_encode($v, JSON_UNESCAPED_UNICODE);
                }
                break;
            case '$arrinc':
                if (empty($value)) {
                    $parts[] = '1=0';
                    break;
                }
                $sub = [];
                foreach ($value as $v) {
                    $sub[] = "JSON_CONTAINS({$col}, ?) = 1";
                    $params[] = json_encode($v, JSON_UNESCAPED_UNICODE);
                }
                $parts[] = '(' . implode(' OR ', $sub) . ')';
                break;
            case '$eq':
                $parts[] = "{$col} = ?";
                $params[] = json_encode($value, JSON_UNESCAPED_UNICODE);
                break;
            case '$ne':
                $parts[] = "{$col} <> ?";
                $params[] = json_encode($value, JSON_UNESCAPED_UNICODE);
                break;
            default:
                throw new QueryValidationError("Operator {$op} does not accept an array value", [ 'op' => $op ]);
        }
        return;
    }

    if (in_array($op, [ '$in', '$nin', '$between', '$arrinc', '$arrincall' ], true))
        throw new QueryValidationError("Operator {$op} expects an array value", [ 'op' => $op ]);

    switch ($op) {
        case '$gt':
            $parts[] = "{$col} > ?";
            $params[] = $value;
            break;
        case '$lt':
            $parts[] = "{$col} < ?";
            $params[] = $value;
            break;
        case '$gte':
            $parts[] = "{$col} >= ?";
            $params[] = $value;
            break;
        case '$lte':
            $parts[] = "{$col} <= ?";
            $params[] = $value;
            break;
        case '$eq':
            buildComparison($col, $value, $params, $parts, '=');
            break;
        case '$ne':
            buildComparison($col, $value, $params, $parts, '<>');
            break;
        case '$startswith':
            $parts[] = "{$col} LIKE ?";
            $params[] = $value . '%';
            break;
        case '$endswith':
            $parts[] = "{$col} LIKE ?";
            $params[] = '%' . $value;
            break;
        case '$istartswith':
            $parts[] = "LOWER({$col}) LIKE ?";
            $params[] = strtolower($value) . '%';
            break;
        case '$iendswith':
            $parts[] = "LOWER({$col}) LIKE ?";
            $params[] = '%' . strtolower($value);
            break;
        case '$exists':
            $parts[] = $value ? "{$col} IS NOT NULL" : "{$col} IS NULL";
            break;
        case '$size':
            $parts[] = "(CHAR_LENGTH({$col}) = ? OR JSON_LENGTH({$col}) = ?)";
            $params[] = (int) $value;
            $params[] = (int) $value;
            break;
        case '$idgt':
            $parts[] = "{$col} > ?";
            $params[] = $value;
            break;
        case '$idlt':
            $parts[] = "{$col} < ?";
            $params[] = $value;
            break;
        case '$idgte':
            $parts[] = "{$col} >= ?";
            $params[] = $value;
            break;
        case '$idlte':
            $parts[] = "{$col} <= ?";
            $params[] = $value;
            break;
        case '$type':
            buildTypeCondition($col, $value, $parts);
            break;
        default:
            throw new QueryValidationError("Unsupported search operator: {$op}", [ 'op' => $op ]);
    }
}

function buildTypeCondition(string $col, $value, array &$parts): void
{
    switch (strtolower((string) $value)) {
        case 'null':
            $parts[] = "{$col} IS NULL";
            break;
        case 'boolean':
        case 'bool':
            $parts[] = "({$col} = 0 OR {$col} = 1 OR {$col} = '0' OR {$col} = '1')";
            break;
        case 'number':
        case 'integer':
        case 'int':
        case 'float':
        case 'double':
            $parts[] = "{$col} REGEXP '^-?[0-9]+(\\.[0-9]+)?$'";
            break;
        case 'array':
            $parts[] = "JSON_TYPE({$col}) = 'ARRAY'";
            break;
        case 'object':
            $parts[] = "JSON_TYPE({$col}) = 'OBJECT'";
            break;
        case 'string':
            $parts[] = "{$col} IS NOT NULL AND {$col} NOT REGEXP '^-?[0-9]+(\\.[0-9]+)?$' AND {$col} NOT IN (0, 1) AND JSON_TYPE({$col}) IS NULL";
            break;
    }
}

/**
 * $regex accepts a string (deprecated in db-core), or { source, flags } to
 * represent a RegExp, which JSON cannot carry. Anything else is rejected instead
 * of silently dropping the condition (which would match every row).
 */
function normalizeRegexPattern($value): array
{
    if (is_string($value)) {
        static $warned = false;
        if (!$warned) {
            $warned = true;
            error_log('[ValtheraDB] $regex with a string pattern is deprecated; use {source, flags}');
        }
        return [ $value, '' ];
    }

    if (is_array($value) && isset($value['source']) && is_string($value['source']))
        return [ $value['source'], is_string($value['flags'] ?? null) ? $value['flags'] : '' ];

    throw new QueryValidationError(
        '$regex expects a string pattern or an object with source and flags',
        [ 'op' => 'search' ],
    );
}

function buildRegexCondition(string $col, $value, array &$params, array &$parts): void
{
    [ $pattern, $flags ] = normalizeRegexPattern($value);

    $modifiers = '';
    foreach ([ 'i', 'm', 's' ] as $flag) {
        if (str_contains($flags, $flag))
            $modifiers .= $flag;
    }

    if ($modifiers !== '')
        $pattern = "(?{$modifiers})" . $pattern;

    // JS RegExp is case-sensitive by default, while MySQL REGEXP follows the
    // column collation, so force a binary pattern unless the "i" flag is used.
    if (str_contains($flags, 'i'))
        $parts[] = "{$col} REGEXP ?";
    else
        $parts[] = "{$col} REGEXP CAST(? AS BINARY)";

    $params[] = $pattern;
}

function handleIn(string $col, array $values, array &$params, array &$parts, bool $not): void
{
    if (empty($values)) {
        $parts[] = $not ? '1=1' : '1=0';
        return;
    }

    $placeholders = implode(',', array_fill(0, count($values), '?'));
    $parts[] = "{$col} " . ($not ? 'NOT IN' : 'IN') . " ({$placeholders})";
    foreach ($values as $v)
        $params[] = $v;
}

function buildComparison(string $col, $value, array &$params, array &$parts, string $sqlOp): void
{
    if ($value === null) {
        $parts[] = $sqlOp === '=' ? "{$col} IS NULL" : "{$col} IS NOT NULL";
    } else {
        $parts[] = "{$col} {$sqlOp} ?";
        $params[] = $value;
    }
}
