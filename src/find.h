#pragma once

#include <stdbool.h>
#include <stdint.h>

void *find(const char *file, const char *fields_s, bool findOne);
void *find_paged(const char *dir, const char *fields_json, int32_t offset, int32_t limit);
void free_result(void *ptr);
int32_t get_result_count(void *ptr);
const char *get_result_item(void *ptr, int32_t index);
bool is_error(void *ptr);
