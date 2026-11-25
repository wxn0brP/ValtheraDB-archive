#define _POSIX_C_SOURCE 200809L

#include "find.h"

#include <jansson.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "has_fields.h"
#include "utils.h"

typedef struct
{
    json_t *fields;
    bool one;
    long offset;
    long limit;
} FindOptions;

typedef struct
{
    ResultArray *results;
    bool ok;
    long matched;
    long emitted;
    json_error_t error;
} FindState;

typedef struct
{
    FindOptions opts;
    FindState state;
} FindContext;

static bool find_page_full(const FindContext *ctx)
{
    return !ctx->opts.one && ctx->opts.limit != -1 && ctx->state.emitted >= ctx->opts.limit;
}

static bool append_match(FindContext *ctx, const char *line, size_t line_len)
{
    ctx->state.matched++;
    if (ctx->state.matched <= ctx->opts.offset)
        return true;

    if (find_page_full(ctx))
        return true;

    if (!result_array_add(ctx->state.results, line, line_len))
        return false;

    ctx->state.emitted++;
    return true;
}

static bool find_on_file(const char *file, FindContext *ctx)
{
    FILE *f = fopen(file, "r");
    if (!f)
        return true;

    LineReader lr;
    lr_init(&lr, f);

    size_t line_len;
    const char *line;

    while ((line = lr_next(&lr, &line_len)) != NULL)
    {
        if (line_len == 0)
            continue;

        json_t *json = json_loads(line, 0, &ctx->state.error);
        if (!json)
            continue;

        if (has_fields_advanced(json, ctx->opts.fields) > 0)
        {
            if (!append_match(ctx, line, line_len))
            {
                ctx->state.ok = false;
                json_decref(json);
                break;
            }

            if (ctx->opts.one)
            {
                json_decref(json);
                break;
            }
        }
        json_decref(json);

        if (find_page_full(ctx))
            break;
    }

    fclose(f);
    return true;
}

static FindContext make_find_context(json_t *fields, bool one, long offset, long limit)
{
    FindContext ctx = {
        .opts = {
            .fields = fields,
            .one = one,
            .offset = offset,
            .limit = limit,
        },
        .state = {
            .results = NULL,
            .ok = true,
            .matched = 0,
            .emitted = 0,
        },
    };

    return ctx;
}

static void *find_internal(const char *dir, const char *fields_json, bool findOne, long offset, long limit)
{
    json_error_t error;

    json_t *fields = json_loads(fields_json, 0, &error);
    if (!fields)
        return result_array_error(VDB_ERR_INVALID_FIELDS_JSON);

    FileList files;
    if (!get_sorted_db_files(dir, &files))
    {
        json_decref(fields);
        return result_array_error(VDB_ERR_DIRECTORY_NOT_FOUND);
    }

    FindContext ctx = make_find_context(fields, findOne, offset, limit);
    
    ctx.state.results = result_array_new();
    if (!ctx.state.results)
    {
        file_list_free(&files);
        json_decref(fields);
        return NULL;
    }

    for (size_t i = 0; ctx.state.ok && i < files.len; i++)
    {
        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, files.items[i]))
            continue;

        find_on_file(filepath, &ctx);
        if (findOne && ctx.state.results->count > 0)
            break;
        if (find_page_full(&ctx))
            break;
    }

    file_list_free(&files);
    json_decref(fields);

    if (!ctx.state.ok)
    {
        result_array_free(ctx.state.results);
        return NULL;
    }

    return ctx.state.results;
}

void *find(const char *dir, const char *fields_json, bool findOne)
{
    return find_internal(dir, fields_json, findOne, 0, -1);
}

void *find_paged(const char *dir, const char *fields_json, int32_t offset, int32_t limit)
{
    if (offset < 0)
        offset = 0;
    if (limit < -1)
        limit = -1;

    return find_internal(dir, fields_json, false, (long)offset, (long)limit);
}

void free_result(void *ptr)
{
    result_array_free((ResultArray *)ptr);
}

int32_t get_result_count(void *ptr)
{
    if (!ptr)
        return 0;
    return (int32_t)((ResultArray *)ptr)->count;
}

const char *get_result_item(void *ptr, int32_t index)
{
    if (!ptr)
        return NULL;
    
    ResultArray *arr = (ResultArray *)ptr;
    if (index < 0 || index >= (int32_t)arr->count)
        return NULL;
    
    return arr->items[index];
}

bool is_error(void *ptr)
{
    if (!ptr)
        return true;
    return ((ResultArray *)ptr)->is_error;
}
