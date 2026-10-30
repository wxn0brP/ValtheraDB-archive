<?php
require_once __DIR__ . "/security.php";

/**
 * Deterministic MySQL index name, matching the naming used by createIndex/removeIndex.
 */
function indexName(string $collection, array $fields, array $opts = []): string
{
    $name = !empty($opts["name"]) && is_string($opts["name"])
        ? $opts["name"]
        : "vdb_" . implode("_", array_merge([ $collection ], $fields));

    $name = preg_replace("/[^A-Za-z0-9_]/", "_", $name);

    if ($name === "")
        $name = "vdb_index";

    return substr($name, 0, 64);
}

function filterIndexFields($fields): array
{
    if (!is_array($fields))
        $fields = [ $fields ];

    return array_values(array_filter($fields, fn($field) => isSafeField($field)));
}
