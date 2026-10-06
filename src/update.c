#define _POSIX_C_SOURCE 200809L

#include "update.h"

#include <jansson.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include "has_fields.h"
#include "utils.h"

typedef struct
{
    json_t *fields;
    json_t *updater;
    bool one;
} UpdateOptions;

typedef struct
{
    Buffer updated;
    bool first_updated;
    bool already_updated_one;
} UpdateState;

typedef struct
{
    UpdateOptions opts;
    UpdateState state;
    json_error_t error;
    const char *error_message;
} UpdateContext;

static bool append_updated_str(UpdateContext *ctx, const char *json_str, size_t json_len)
{
    bool ok = true;
    if (!ctx->state.first_updated)
        ok = buf_append(&ctx->state.updated, ",");

    if (ok)
    {
        ctx->state.first_updated = false;
        ok = buf_append_len(&ctx->state.updated, json_str, json_len);
    }

    return ok;
}

static bool set_field(json_t *obj, const char *key, json_t *value)
{
    return json_object_set(obj, key, value) == 0;
}

static bool apply_nested(
    json_t *target,
    json_t *fields,
    bool (*apply)(UpdateContext *, json_t *, const char *, json_t *),
    UpdateContext *ctx)
{
    const char *key;
    json_t *value;

    json_object_foreach(fields, key, value)
    {
        if (json_is_object(value))
        {
            json_t *child = json_object_get(target, key);
            if (!json_is_object(child))
            {
                child = json_object();
                if (!child || json_object_set_new(target, key, child) != 0)
                {
                    if (child)
                        json_decref(child);
                    return false;
                }
            }

            if (!apply_nested(child, value, apply, ctx))
                return false;
        }
        else if (!apply(ctx, target, key, value))
        {
            return false;
        }
    }

    return true;
}

static bool apply_set(UpdateContext *ctx, json_t *obj, const char *key, json_t *value)
{
    (void)ctx;
    return set_field(obj, key, value);
}

static bool apply_unset(UpdateContext *ctx, json_t *obj, const char *key, json_t *value)
{
    (void)ctx;
    (void)value;
    json_object_del(obj, key);
    return true;
}

static bool apply_inc(UpdateContext *ctx, json_t *obj, const char *key, json_t *value)
{
    json_t *current = json_object_get(obj, key);

    if (!json_is_number(value))
    {
        ctx->error_message = "Increment value must be numeric";
        return false;
    }

    if (!current)
        return set_field(obj, key, value);

    if (!json_is_number(current))
    {
        ctx->error_message = "Cannot increment non-numeric value";
        return false;
    }

    json_t *next;
    if (json_is_integer(current) && json_is_integer(value))
        next = json_integer(json_integer_value(current) + json_integer_value(value));
    else
        next = json_real(json_number_value(current) + json_number_value(value));

    if (!next)
        return false;

    int rc = json_object_set_new(obj, key, next);
    if (rc != 0)
        json_decref(next);

    return rc == 0;
}

static bool apply_dec(UpdateContext *ctx, json_t *obj, const char *key, json_t *value)
{
    json_t *current = json_object_get(obj, key);

    if (!json_is_number(value))
    {
        ctx->error_message = "Decrement value must be numeric";
        return false;
    }

    if (!current)
    {
        json_t *next;
        if (json_is_integer(value))
            next = json_integer(-json_integer_value(value));
        else
            next = json_real(-json_number_value(value));

        if (!next)
            return false;

        int rc = json_object_set_new(obj, key, next);
        if (rc != 0)
            json_decref(next);

        return rc == 0;
    }

    if (!json_is_number(current))
    {
        ctx->error_message = "Cannot decrement non-numeric value";
        return false;
    }

    json_t *next;
    if (json_is_integer(current) && json_is_integer(value))
        next = json_integer(json_integer_value(current) - json_integer_value(value));
    else
        next = json_real(json_number_value(current) - json_number_value(value));

    if (!next)
        return false;

    int rc = json_object_set_new(obj, key, next);
    if (rc != 0)
        json_decref(next);

    return rc == 0;
}

static bool apply_operator(UpdateContext *ctx, json_t *obj, const char *op, json_t *fields)
{
    if (!json_is_object(fields))
    {
        ctx->error_message = "Update operator value must be an object";
        return false;
    }

    if (strcasecmp(op, "$set") == 0)
        return apply_nested(obj, fields, apply_set, ctx);
    if (strcasecmp(op, "$unset") == 0)
        return apply_nested(obj, fields, apply_unset, ctx);
    if (strcasecmp(op, "$inc") == 0)
        return apply_nested(obj, fields, apply_inc, ctx);
    if (strcasecmp(op, "$dec") == 0)
        return apply_nested(obj, fields, apply_dec, ctx);

    ctx->error_message = "Unsupported update operator";
    return false;
}

static bool apply_updater(UpdateContext *ctx, json_t *obj)
{
    const char *key;
    json_t *value;

    json_object_foreach(ctx->opts.updater, key, value)
    {
        if (key[0] == '$')
        {
            if (!apply_operator(ctx, obj, key, value))
                return false;
        }
    }

    json_object_foreach(ctx->opts.updater, key, value)
    {
        if (key[0] != '$' && !set_field(obj, key, value))
            return false;
    }

    return true;
}

static bool update_on_file(const char *file, UpdateContext *ctx)
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

        json_t *json = json_loads(line, 0, &ctx->error);
        if (!json)
            continue;

        if (!(ctx->opts.one && ctx->state.already_updated_one) && has_fields_advanced(json, ctx->opts.fields) > 0)
        {
            if (!apply_updater(ctx, json))
            {
                ok = false;
                json_decref(json);
                break;
            }

            char *dump = json_dumps(json, JSON_COMPACT);
            if (!dump)
            {
                ok = false;
                json_decref(json);
                break;
            }

            size_t dump_len = strlen(dump);
            
            // Single serialization: use for both result buffer and file output
            if (!append_updated_str(ctx, dump, dump_len) || !wb_writeln(&wb, dump, dump_len))
            {
                free(dump);
                ok = false;
                json_decref(json);
                break;
            }

            free(dump);

            if (ctx->opts.one)
                ctx->state.already_updated_one = true;
        }
        else
        {
            ok = wb_writeln(&wb, line, line_len);
        }

        json_decref(json);

        if (!ok)
            break;
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

static UpdateContext make_update_context(json_t *fields, json_t *updater, bool one)
{
    UpdateContext ctx = {
        .opts = {
            .fields = fields,
            .updater = updater,
            .one = one,
        },
        .state = {
            .updated = {0},
            .first_updated = true,
            .already_updated_one = false,
        },
        .error_message = NULL,
    };

    return ctx;
}

char *update_entries(const char *dir, const char *fields_json, const char *updater_json, bool one)
{
    json_error_t error;

    json_t *fields = json_loads(fields_json, 0, &error);
    if (!fields)
        return copy_result(VDB_ERR_INVALID_FIELDS_JSON, strlen(VDB_ERR_INVALID_FIELDS_JSON));

    json_t *updater = json_loads(updater_json, 0, &error);
    if (!updater)
    {
        json_decref(fields);
        return copy_result("4: Invalid updater JSON", strlen("4: Invalid updater JSON"));
    }

    FileList files;
    if (!get_sorted_db_files(dir, &files))
    {
        json_decref(fields);
        json_decref(updater);
        return copy_result(VDB_ERR_DIRECTORY_NOT_FOUND, strlen(VDB_ERR_DIRECTORY_NOT_FOUND));
    }

    UpdateContext ctx = make_update_context(fields, updater, one);
    bool ok = buf_init_prealloc(&ctx.state.updated, 64 * 1024) && buf_append(&ctx.state.updated, "[");

    for (size_t i = 0; ok && i < files.len; i++)
    {
        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, files.items[i]))
            continue;

        ok = update_on_file(filepath, &ctx);
        if (one && ctx.state.already_updated_one)
            break;
    }

    file_list_free(&files);
    json_decref(fields);
    json_decref(updater);

    if (!ok || !buf_append(&ctx.state.updated, "]"))
    {
        free(ctx.state.updated.data);
        if (ctx.error_message)
            return copy_result(ctx.error_message, strlen(ctx.error_message));
        return NULL;
    }

    return ctx.state.updated.data;
}
