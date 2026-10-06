#pragma once

#include <jansson.h>

int value_in_array(json_t *array, json_t *value);
int all_values_in_array(json_t *array, json_t *values);
int any_values_in_array(json_t *array, json_t *values);
