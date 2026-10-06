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
    Buffer out;
    bool first;
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

    if (!ctx->state.first && !buf_append(&ctx->state.out, ","))
        return false;
    ctx->state.first = false;

    if (!buf_append_len(&ctx->state.out, line, line_len))
        return false;

    ctx->state.emitted++;
    return true;
}

static char *find_on_file(const char *file, FindContext *ctx)
{
    FILE *f = fopen(file, "r");
    if (!f)
        return NULL;

    LineReader lr;
    lr_init(&lr, f);

    size_t line_len;
    const char *line;
    char *match = NULL;

    while ((line = lr_next(&lr, &line_len)) != NULL)
    {
        if (line_len == 0)
            continue;

        json_t *json = json_loads(line, 0, &ctx->state.error);
        if (!json)
            continue;

        if (has_fields_advanced(json, ctx->opts.fields) > 0)
        {
            if (ctx->opts.one)
            {
                match = copy_result(line, line_len);
                if (!match)
                    ctx->state.ok = false;
                json_decref(json);
                break;
            }

            if (!append_match(ctx, line, line_len))
            {
                ctx->state.ok = false;
                json_decref(json);
                break;
            }
        }
        json_decref(json);

        if (find_page_full(ctx))
            break;
    }

    fclose(f);
    return match;
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
            .out = {0},
            .first = true,
            .ok = true,
            .matched = 0,
            .emitted = 0,
        },
    };

    return ctx;
}

static char *find_internal(const char *dir, const char *fields_json, bool findOne, long offset, long limit)
{
    json_error_t error;

    json_t *fields = json_loads(fields_json, 0, &error);
    if (!fields)
        return copy_result(VDB_ERR_INVALID_FIELDS_JSON, strlen(VDB_ERR_INVALID_FIELDS_JSON));

    FileList files;
    if (!get_sorted_db_files(dir, &files))
    {
        json_decref(fields);
        return copy_result(VDB_ERR_DIRECTORY_NOT_FOUND, strlen(VDB_ERR_DIRECTORY_NOT_FOUND));
    }

    FindContext ctx = make_find_context(fields, findOne, offset, limit);

    if (!findOne && (!buf_init_prealloc(&ctx.state.out, 1024 * 1024) || !buf_append(&ctx.state.out, "[")))
        ctx.state.ok = false;

    char *result = NULL;

    for (size_t i = 0; ctx.state.ok && i < files.len; i++)
    {
        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, files.items[i]))
            continue;

        result = find_on_file(filepath, &ctx);
        if (findOne && result)
            break;
        if (find_page_full(&ctx))
            break;
    }

    file_list_free(&files);
    json_decref(fields);

    if (!ctx.state.ok)
    {
        free(ctx.state.out.data);
        free(result);
        return NULL;
    }

    if (findOne)
        return result ? result : copy_result("null", strlen("null"));

    if (!buf_append(&ctx.state.out, "]"))
    {
        free(ctx.state.out.data);
        return NULL;
    }

    return ctx.state.out.data;
}

char *find(const char *dir, const char *fields_json, bool findOne)
{
    return find_internal(dir, fields_json, findOne, 0, -1);
}

char *find_paged(const char *dir, const char *fields_json, int32_t offset, int32_t limit)
{
    if (offset < 0)
        offset = 0;
    if (limit < -1)
        limit = -1;

    return find_internal(dir, fields_json, false, (long)offset, (long)limit);
}

void free_result(char *ptr)
{
    free(ptr);
}
