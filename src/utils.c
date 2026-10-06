#include "utils.h"

#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

bool buf_init(Buffer *b)
{
    b->cap = 1024;
    b->len = 0;
    b->data = (char *)malloc(b->cap);
    if (!b->data)
        return false;

    b->data[0] = '\0';
    return true;
}

bool buf_init_prealloc(Buffer *b, size_t initial_cap)
{
    if (initial_cap < 1024)
        initial_cap = 1024;
    b->cap = initial_cap;
    b->len = 0;
    b->data = (char *)malloc(b->cap);
    if (!b->data)
        return false;

    b->data[0] = '\0';
    return true;
}

bool wb_init(WriteBuffer *wb, FILE *f)
{
    wb->pos = 0;
    wb->file = f;
    return true;
}

bool wb_flush(WriteBuffer *wb)
{
    if (wb->pos > 0)
    {
        if (fwrite(wb->data, 1, wb->pos, wb->file) != wb->pos)
            return false;
        wb->pos = 0;
    }
    return true;
}

bool wb_write(WriteBuffer *wb, const char *data, size_t len)
{
    if (wb->pos + len >= sizeof(wb->data))
    {
        if (!wb_flush(wb))
            return false;
        if (len >= sizeof(wb->data))
            return fwrite(data, 1, len, wb->file) == len;
    }
    memcpy(wb->data + wb->pos, data, len);
    wb->pos += len;
    return true;
}

bool wb_writeln(WriteBuffer *wb, const char *data, size_t len)
{
    if (wb->pos + len + 1 >= sizeof(wb->data))
    {
        if (!wb_flush(wb))
            return false;
        if (len + 1 >= sizeof(wb->data))
        {
            if (fwrite(data, 1, len, wb->file) != len)
                return false;
            return fputc('\n', wb->file) != EOF;
        }
    }
    memcpy(wb->data + wb->pos, data, len);
    wb->pos += len;
    wb->data[wb->pos++] = '\n';
    return true;
}

bool lr_init(LineReader *lr, FILE *f)
{
    lr->read_pos = 0;
    lr->read_len = 0;
    lr->eof = false;
    lr->file = f;
    return true;
}

const char *lr_next(LineReader *lr, size_t *out_len)
{
    static char line_buf[1048576];
    size_t line_pos = 0;

    while (1)
    {
        if (lr->read_pos < lr->read_len)
        {
            char *start = lr->read_buf + lr->read_pos;
            char *nl = memchr(start, '\n', lr->read_len - lr->read_pos);

            if (nl)
            {
                size_t seg = nl - start;
                if (line_pos + seg >= sizeof(line_buf))
                {
                    lr->read_pos += seg + 1;
                    *out_len = line_pos + seg;
                    return line_buf;
                }
                memcpy(line_buf + line_pos, start, seg);
                line_pos += seg;
                lr->read_pos += seg + 1;

                while (line_pos > 0 && (line_buf[line_pos - 1] == '\r' || line_buf[line_pos - 1] == ' ' || line_buf[line_pos - 1] == '\t'))
                    line_pos--;

                *out_len = line_pos;
                return line_buf;
            }
            else
            {
                size_t seg = lr->read_len - lr->read_pos;
                if (line_pos + seg >= sizeof(line_buf))
                {
                    *out_len = line_pos + seg;
                    lr->read_pos = lr->read_len;
                    return line_buf;
                }
                memcpy(line_buf + line_pos, start, seg);
                line_pos += seg;
                lr->read_pos = lr->read_len;
            }
        }

        if (lr->eof)
        {
            if (line_pos > 0)
            {
                *out_len = line_pos;
                lr->eof = false;
                return line_buf;
            }
            return NULL;
        }

        size_t n = fread(lr->read_buf, 1, sizeof(lr->read_buf), lr->file);
        lr->read_pos = 0;
        lr->read_len = n;
        if (n == 0)
        {
            lr->eof = true;
            continue;
        }
    }
}

static bool buf_reserve(Buffer *b, size_t needed)
{
    if (needed <= b->cap)
        return true;

    size_t new_cap = b->cap;
    while (needed > new_cap)
    {
        if (new_cap > ((size_t)-1) / 2)
            return false;
        new_cap *= 2;
    }

    char *new_data = (char *)realloc(b->data, new_cap);
    if (!new_data)
        return false;

    b->data = new_data;
    b->cap = new_cap;
    return true;
}

bool buf_append_len(Buffer *b, const char *s, size_t slen)
{
    if (b->len > ((size_t)-1) - 1 || slen > ((size_t)-1) - b->len - 1)
        return false;

    if (!buf_reserve(b, b->len + slen + 1))
        return false;

    memcpy(b->data + b->len, s, slen);
    b->len += slen;
    b->data[b->len] = '\0';
    return true;
}

bool buf_append(Buffer *b, const char *s)
{
    return buf_append_len(b, s, strlen(s));
}

char *copy_result(const char *s, size_t len)
{
    char *res = (char *)malloc(len + 1);
    if (!res)
        return NULL;

    memcpy(res, s, len);
    res[len] = '\0';
    return res;
}

static bool has_db_suffix(const char *name)
{
    size_t len = strlen(name);
    return len >= 3 && strcmp(name + len - 3, ".db") == 0;
}

static bool is_numeric_db_name(const char *name)
{
    size_t len = strlen(name);
    if (len <= 3 || !has_db_suffix(name))
        return false;

    for (size_t i = 0; i < len - 3; i++)
    {
        if (name[i] < '0' || name[i] > '9')
            return false;
    }

    return true;
}

static int compare_db_names(const void *a, const void *b)
{
    const char *name_a = *(const char *const *)a;
    const char *name_b = *(const char *const *)b;
    long num_a = strtol(name_a, NULL, 10);
    long num_b = strtol(name_b, NULL, 10);

    if (num_a < num_b)
        return -1;
    if (num_a > num_b)
        return 1;
    return strcmp(name_a, name_b);
}

void file_list_free(FileList *list)
{
    for (size_t i = 0; i < list->len; i++)
        free(list->items[i]);
    free(list->items);
    list->items = NULL;
    list->len = 0;
    list->cap = 0;
}

static bool file_list_push(FileList *list, const char *name)
{
    if (list->len == list->cap)
    {
        size_t new_cap = list->cap == 0 ? 16 : list->cap * 2;
        if (new_cap < list->cap)
            return false;

        char **new_items = (char **)realloc(list->items, new_cap * sizeof(char *));
        if (!new_items)
            return false;

        list->items = new_items;
        list->cap = new_cap;
    }

    char *copy = copy_result(name, strlen(name));
    if (!copy)
        return false;

    list->items[list->len++] = copy;
    return true;
}

bool build_path(char *out, size_t out_size, const char *dir, const char *name)
{
    int written = snprintf(out, out_size, "%s/%s", dir, name);
    return written >= 0 && written < (int)out_size;
}

bool get_sorted_db_files(const char *dir, FileList *list)
{
    list->items = NULL;
    list->len = 0;
    list->cap = 0;

    DIR *d = opendir(dir);
    if (!d)
        return false;

    struct dirent *entry;
    bool ok = true;

    while ((entry = readdir(d)) != NULL)
    {
        if (!is_numeric_db_name(entry->d_name))
            continue;

        char filepath[4096];
        if (!build_path(filepath, sizeof(filepath), dir, entry->d_name))
            continue;

        struct stat st;
        if (stat(filepath, &st) != 0 || !S_ISREG(st.st_mode))
            continue;

        if (!file_list_push(list, entry->d_name))
        {
            ok = false;
            break;
        }
    }

    closedir(d);

    if (!ok)
    {
        file_list_free(list);
        return false;
    }

    qsort(list->items, list->len, sizeof(char *), compare_db_names);
    return true;
}
