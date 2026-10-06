#pragma once

#include <jansson.h>

int check_condition(json_t *obj, const char *op, json_t *condition_obj);
