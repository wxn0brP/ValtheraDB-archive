#pragma once

#include <jansson.h>
#include "array_helpers.h"
#include "conditions.h"
#include "deep_check.h"

int has_fields_advanced(json_t *obj, json_t *fields);
