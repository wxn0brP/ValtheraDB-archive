#pragma once

#include <stdbool.h>
#include <stdint.h>

char *find(const char *file, const char *fields_s, bool findOne);
char *find_paged(const char *dir, const char *fields_json, int32_t offset, int32_t limit);
void free_result(char *ptr);
