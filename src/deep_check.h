#pragma once

#include <jansson.h>

int deep_check(json_t *value_obj, json_t *target_obj, json_t *(*get_func)(const json_t *, const char *));
int has_fields_simple(json_t *obj, json_t *fields);
