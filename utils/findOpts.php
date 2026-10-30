<?php
require_once __DIR__ . "/security.php";
require_once __DIR__ . "/updater.php";

/**
 * Split a dotted path; unsafe paths yield an empty list so callers become no-ops.
 */
function resolveFieldPath(string $path): array
{
    $segments = explode(".", $path);

    if (empty($segments) || hasUnsafeSegment($segments))
        return [];

    return $segments;
}

function deleteNested(array &$obj, string $path): void
{
    $segs = resolveFieldPath($path);
    if (empty($segs)) return;
    $cur = &$obj;
    for ($i = 0; $i < count($segs) - 1; $i++) {
        if (!is_array($cur) || !array_key_exists($segs[$i], $cur)) return;
        $cur = &$cur[$segs[$i]];
    }
    if (is_array($cur)) {
        unset($cur[$segs[count($segs) - 1]]);
    }
}

function getNestedValue(array $obj, string $path): array
{
    $segs = resolveFieldPath($path);
    if (empty($segs))
        return [ false, null ];

    $cur = $obj;
    foreach ($segs as $seg) {
        if (!is_array($cur) || !array_key_exists($seg, $cur)) {
            return [ false, null ];
        }
        $cur = $cur[$seg];
    }
    return [ true, $cur ];
}

function setNestedValue(array &$obj, string $path, $value): void
{
    $segs = resolveFieldPath($path);
    if (empty($segs))
        return;

    $cur = &$obj;
    for ($i = 0; $i < count($segs) - 1; $i++) {
        $s = $segs[$i];
        if (!isset($cur[$s]) || !is_array($cur[$s]) || array_is_list($cur[$s])) {
            $cur[$s] = [];
        }
        $cur = &$cur[$s];
    }
    $cur[$segs[count($segs) - 1]] = $value;
}

function applyFindOpts(array $doc, array $findOpts): array
{
    $result = $doc;

    if (!empty($findOpts["exclude"]) && is_array($findOpts["exclude"])) {
        foreach ($findOpts["exclude"] as $field) {
            if (is_string($field)) {
                deleteNested($result, $field);
            }
        }
    }

    if (!empty($findOpts["select"]) && is_array($findOpts["select"])) {
        $filtered = [];
        foreach ($findOpts["select"] as $field) {
            if (!is_string($field)) continue;
            [ $found, $value ] = getNestedValue($result, $field);
            if ($found) {
                setNestedValue($filtered, $field, $value);
            }
        }
        return $filtered;
    }

    return $result;
}
