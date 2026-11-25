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
    ResultArray *results;
    bool already_removed_one;
} RemoveState;

typedef struct
{
    RemoveOptions opts;
    RemoveState state;
    json_error_t error;
} RemoveContext;

static bool should_remove_line(RemoveContext *ctx, const char *line)
{
    if (ctx->opts.one && ctx->state.already_removed_one)
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
            if (!result_array_add(ctx->state.results, line, line_len))
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
            .results = result_array_new(),
            .already_removed_one = false,
        },
    };

    return ctx;
}

void *remove_entries(const char *dir, const char *fields_json, bool one)
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

    RemoveContext ctx = make_remove_context(fields, one);
    if (!ctx.state.results)
    {
        file_list_free(&files);
        json_decref(fields);
        return NULL;
    }

    bool ok = true;
    size_t file_limit = files.len;
    for (size_t i = 0; ok && i < file_limit; i++)
    {
        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, files.items[i]))
            continue;

        ok = remove_on_file(filepath, &ctx);
        if (ctx.state.already_removed_one)
            break;
    }

    file_list_free(&files);
    json_decref(fields);

    if (!ok)
    {
        result_array_free(ctx.state.results);
        return NULL;
    }

    return ctx.state.results;
}
