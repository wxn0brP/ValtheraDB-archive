#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

#define VDB_ERR_INVALID_FIELDS_JSON "2: Invalid fields JSON"
#define VDB_ERR_DIRECTORY_NOT_FOUND "3: Directory not found"

typedef struct
{
    char *data;
    size_t len;
    size_t cap;
} Buffer;

typedef struct
{
    char **items;
    size_t len;
    size_t cap;
} FileList;

typedef struct
{
    char **items;
    size_t count;
    size_t capacity;
    bool is_error;
} ResultArray;

bool buf_init(Buffer *b);
bool buf_init_prealloc(Buffer *b, size_t initial_cap);
bool buf_append_len(Buffer *b, const char *s, size_t slen);
bool buf_append(Buffer *b, const char *s);

ResultArray *result_array_new(void);
ResultArray *result_array_error(const char *error_msg);
bool result_array_add(ResultArray *arr, const char *data, size_t len);
void result_array_free(ResultArray *arr);

typedef struct
{
    char data[262144];
    size_t pos;
    FILE *file;
} WriteBuffer;

bool wb_init(WriteBuffer *wb, FILE *f);
bool wb_write(WriteBuffer *wb, const char *data, size_t len);
bool wb_writeln(WriteBuffer *wb, const char *data, size_t len);
bool wb_flush(WriteBuffer *wb);

typedef struct
{
    char read_buf[262144];
    size_t read_pos;
    size_t read_len;
    bool eof;
    FILE *file;
} LineReader;

bool lr_init(LineReader *lr, FILE *f);
const char *lr_next(LineReader *lr, size_t *out_len);
char *copy_result(const char *s, size_t len);
bool build_path(char *out, size_t out_size, const char *dir, const char *name);
bool get_sorted_db_files(const char *dir, FileList *list);
void file_list_free(FileList *list);
