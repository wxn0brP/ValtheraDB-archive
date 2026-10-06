#define _POSIX_C_SOURCE 200809L

#include "remove.h"

#include <jansson.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "has_fields.h"
#include "utils.h"

typedef struct
{
    json_t *fields;
    bool one;
} RemoveOptions;

typedef struct
{
    Buffer removed;
    bool first_removed;
    bool already_removed_one;
} RemoveState;

typedef struct
{
    RemoveOptions opts;
    RemoveState state;
    json_error_t error;
} RemoveContext;

static bool append_removed(RemoveContext *ctx, const char *line, size_t line_len)
{
    if (!ctx->state.first_removed && !buf_append(&ctx->state.removed, ","))
        return false;

    ctx->state.first_removed = false;
    return buf_append_len(&ctx->state.removed, line, line_len);
}

static bool might_contain_keys(const char *line, json_t *fields)
{
    const char *key;
    json_t *value;
    
    json_object_foreach(fields, key, value)
    {
        char search_key[512];
        int len = snprintf(search_key, sizeof(search_key), "\"%s\"", key);
        if (len < 0 || len >= (int)sizeof(search_key))
            return false;
        if (!strstr(line, search_key))
            return false;
    }
    
    return true;
}

static bool should_remove_line(RemoveContext *ctx, const char *line)
{
    if (ctx->opts.one && ctx->state.already_removed_one)
        return false;

    if (!might_contain_keys(line, ctx->opts.fields))
        return false;

    json_t *json = json_loads(line, 0, &ctx->error);
    if (!json)
        return false;

    bool should_remove = has_fields_advanced(json, ctx->opts.fields) > 0;
    json_decref(json);
    return should_remove;
}

static bool remove_on_file(const char *file, RemoveContext *ctx)
{
    FILE *in = fopen(file, "r");
    if (!in)
        return true;

    char tmpfile[4100];
    int written = snprintf(tmpfile, sizeof(tmpfile), "%s.tmp", file);
    if (written < 0 || written >= (int)sizeof(tmpfile))
    {
        fclose(in);
        return false;
    }

    FILE *out = fopen(tmpfile, "w");
    if (!out)
    {
        fclose(in);
        return false;
    }

    LineReader lr;
    lr_init(&lr, in);

    WriteBuffer wb;
    wb_init(&wb, out);

    size_t line_len;
    const char *line;
    bool ok = true;

    while ((line = lr_next(&lr, &line_len)) != NULL)
    {
        if (line_len == 0)
            continue;

        if (should_remove_line(ctx, line))
        {
            if (!append_removed(ctx, line, line_len))
            {
                ok = false;
                break;
            }

            if (ctx->opts.one)
                ctx->state.already_removed_one = true;
            continue;
        }

        if (!wb_writeln(&wb, line, line_len))
        {
            ok = false;
            break;
        }
    }

    if (!wb_flush(&wb))
        ok = false;

    if (fclose(in) != 0)
        ok = false;
    if (fclose(out) != 0)
        ok = false;

    if (ok && rename(tmpfile, file) != 0)
        ok = false;

    if (!ok)
        remove(tmpfile);

    return ok;
}

static RemoveContext make_remove_context(json_t *fields, bool one)
{
    RemoveContext ctx = {
        .opts = {
            .fields = fields,
            .one = one,
        },
        .state = {
            .removed = {0},
            .first_removed = true,
            .already_removed_one = false,
        },
    };

    return ctx;
}

char *remove_entries(const char *dir, const char *fields_json, bool one)
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

    RemoveContext ctx = make_remove_context(fields, one);
    bool ok = buf_init_prealloc(&ctx.state.removed, 64 * 1024) && buf_append(&ctx.state.removed, "[");

    size_t file_limit = one && files.len > 0 ? 1 : files.len;
    for (size_t i = 0; ok && i < file_limit; i++)
    {
        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, files.items[i]))
            continue;

        ok = remove_on_file(filepath, &ctx);
    }

    file_list_free(&files);
    json_decref(fields);

    if (!ok || !buf_append(&ctx.state.removed, "]"))
    {
        free(ctx.state.removed.data);
        return NULL;
    }

    return ctx.state.removed.data;
}
