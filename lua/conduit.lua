local ffi = require("ffi")
local bit = require("bit")

ffi.cdef[[
    int pipe(int pipefd[2]);
    int fork();
    int execvp(const char *file, char *const argv[]);
    int close(int fd);
    int dup2(int oldfd, int newfd);
    ssize_t read(int fd, void *buf, size_t count);
    ssize_t write(int fd, const void *buf, size_t count);
    int waitpid(int pid, int *status, int options);
    void _exit(int status);
]]

local C = ffi.C

local DbNamespace, Db, Collection

local json
do
    local function json_encode(v)
        local t = type(v)
        if t == "nil" then return "null"
        elseif t == "boolean" then return v and "true" or "false"
        elseif t == "number" then return tostring(v)
        elseif t == "string" then
            local escaped = v:gsub('["\\\n\r\t\b\f]', {
                ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n',
                ['\r'] = '\\r', ['\t'] = '\\t', ['\b'] = '\\b', ['\f'] = '\\f',
            })
            return '"' .. escaped .. '"'
        elseif t == "table" then
            local is_array = #v > 0
            local parts = {}
            if is_array then
                for i = 1, #v do
                    parts[i] = json_encode(v[i])
                end
                return "[" .. table.concat(parts, ",") .. "]"
            else
                local keys = {}
                for k in pairs(v) do keys[#keys+1] = k end
                table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)
                for i, k in ipairs(keys) do
                    parts[i] = json_encode(k) .. ":" .. json_encode(v[k])
                end
                return "{" .. table.concat(parts, ",") .. "}"
            end
        else
            return "null"
        end
    end

    local function json_decode(s, pos)
        pos = pos or 1
        while pos <= #s do
            local c = s:sub(pos, pos)
            if c == " " or c == "\t" or c == "\n" or c == "\r" then
                pos = pos + 1
            elseif c == "{" then
                local obj = {}
                pos = pos + 1
                if s:sub(pos, pos) == "}" then return obj, pos + 1 end
                while true do
                    local key, npos
                    key, npos = json_decode(s, pos)
                    if not key or s:sub(npos, npos) ~= ":" then break end
                    pos = npos + 1
                    local val
                    val, pos = json_decode(s, pos)
                    if val == nil then break end
                    obj[key] = val
                    if s:sub(pos, pos) == "}" then return obj, pos + 1 end
                    if s:sub(pos, pos) ~= "," then break end
                    pos = pos + 1
                end
                return obj, pos
            elseif c == "[" then
                local arr = {}
                pos = pos + 1
                if s:sub(pos, pos) == "]" then return arr, pos + 1 end
                while true do
                    local val
                    val, pos = json_decode(s, pos)
                    if val == nil then break end
                    arr[#arr+1] = val
                    if s:sub(pos, pos) == "]" then return arr, pos + 1 end
                    if s:sub(pos, pos) ~= "," then break end
                    pos = pos + 1
                end
                return arr, pos
            elseif c == '"' then
                local str = ""
                pos = pos + 1
                while pos <= #s do
                    local ch = s:sub(pos, pos)
                    if ch == '"' then return str, pos + 1 end
                    if ch == "\\" then
                        pos = pos + 1
                        local esc = s:sub(pos, pos)
                        if esc == '"' then str = str .. '"'
                        elseif esc == '\\' then str = str .. '\\'
                        elseif esc == '/' then str = str .. '/'
                        elseif esc == 'n' then str = str .. '\n'
                        elseif esc == 'r' then str = str .. '\r'
                        elseif esc == 't' then str = str .. '\t'
                        elseif esc == 'b' then str = str .. '\b'
                        elseif esc == 'f' then str = str .. '\f'
                        elseif esc == 'u' then
                            str = str .. '?'
                            pos = pos + 4
                        end
                    else
                        str = str .. ch
                    end
                    pos = pos + 1
                end
                return str, pos
            elseif c == "t" and s:sub(pos, pos+3) == "true" then
                return true, pos + 4
            elseif c == "f" and s:sub(pos, pos+4) == "false" then
                return false, pos + 5
            elseif c == "n" and s:sub(pos, pos+3) == "null" then
                return nil, pos + 4
            elseif c == "-" or c:match("%d") then
                local num_str = s:match("^-?%d+%.?%d*[eE]?[+-]?%d*", pos)
                if num_str then
                    local num = tonumber(num_str)
                    return num, pos + #num_str
                end
            else
                return nil, pos
            end
        end
        return nil, pos
    end

    json = {
        encode = json_encode,
        decode = function(s) local v = json_decode(s); return v end,
    }
end

local INIT_DB      = 1
local EXECUTE_JSON = 2
local CLOSE_DB     = 3
local LIST_DBS     = 4
local PING         = 5
local SHUTDOWN     = 6
local READY        = 100
local RESULT       = 101
local ERROR        = 102
local PONG         = 104

local function encode_frame(frame_type, db_name, payload)
    local db_bytes = db_name or ""
    local payload_bytes = json.encode(payload or {})
    local header = ffi.new("uint32_t[3]")
    header[0] = frame_type
    header[1] = #db_bytes
    header[2] = #payload_bytes
    local buf = ffi.string(header, 12) .. db_bytes .. payload_bytes
    return buf
end

local function read_exact(fd, size)
    local buf = ffi.new("char[?]", size)
    local total = 0
    while total < size do
        local n = C.read(fd, buf + total, size - total)
        if n <= 0 then
            error("unexpected EOF")
        end
        total = total + n
    end
    return ffi.string(buf, size)
end

local function read_frame(fd)
    local header = read_exact(fd, 12)
    local frame_type = bit.tobit(header:byte(1) + header:byte(2)*256 + header:byte(3)*65536 + header:byte(4)*16777216)
    local db_name_len = bit.tobit(header:byte(5) + header:byte(6)*256 + header:byte(7)*65536 + header:byte(8)*16777216)
    local payload_len = bit.tobit(header:byte(9) + header:byte(10)*256 + header:byte(11)*65536 + header:byte(12)*16777216)

    local db_name = ""
    if db_name_len > 0 then
        db_name = read_exact(fd, db_name_len)
    end

    local payload = {}
    if payload_len > 0 then
        local raw = read_exact(fd, payload_len)
        payload = json.decode(raw)
    end

    return { frame_type = frame_type, db_name = db_name, payload = payload }
end

local Conduit = {}
Conduit.__index = Conduit

function Conduit.new(binary_path)
    local stdin_pipe = ffi.new("int[2]")
    local stdout_pipe = ffi.new("int[2]")

    if C.pipe(stdin_pipe) ~= 0 then error("pipe failed") end
    if C.pipe(stdout_pipe) ~= 0 then error("pipe failed") end

    local pid = C.fork()
    if pid < 0 then error("fork failed") end

    if pid == 0 then
        C.close(stdin_pipe[1])
        C.close(stdout_pipe[0])
        C.dup2(stdin_pipe[0], 0)
        C.dup2(stdout_pipe[1], 1)
        C.close(stdin_pipe[0])
        C.close(stdout_pipe[1])

        local argv = ffi.new("char*[2]")
        argv[0] = ffi.cast("char*", binary_path)
        argv[1] = nil
        C.execvp(binary_path, argv)
        C._exit(1)
    end

    C.close(stdin_pipe[0])
    C.close(stdout_pipe[1])

    local self = setmetatable({
        pid = pid,
        stdin_fd = stdin_pipe[1],
        stdout_fd = stdout_pipe[0],
        ready = nil,
        pending = {},
        db_locks = {},
    }, Conduit)

    local ready_frame = read_frame(self.stdout_fd)
    if ready_frame.frame_type ~= READY then
        error("did not receive READY")
    end
    self.ready = ready_frame.payload.result or {}

    return self
end

function Conduit:db(name)
    return DbNamespace.new(self, name)
end

function Conduit:init(name, dir, opts)
    return self:db(name):init(dir, opts)
end

function Conduit:close_db(name)
    return self:_request(name, CLOSE_DB, {})
end

function Conduit:list_dbs()
    return self:_request("", LIST_DBS, {})
end

function Conduit:ping()
    return self:_request("", PING, {})
end

function Conduit:execute(db, op, body)
    local payload = { op = op }
    if body ~= nil then
        payload.body = body
    end
    return self:_request(db, EXECUTE_JSON, payload)
end

function Conduit:shutdown()
    if self.__shutdown then return end
    pcall(function() self:_request("", SHUTDOWN, {}) end)
    self.__shutdown = true
    C.close(self.stdin_fd)
    C.close(self.stdout_fd)
    C.waitpid(self.pid, nil, 0)
end

function Conduit:_request(db_name, frame_type, payload)
    if self.__shutdown then error("conduit is shut down") end

    local data = encode_frame(frame_type, db_name, payload)
    local written = C.write(self.stdin_fd, data, #data)
    if written ~= #data then error("write failed") end

    local frame = read_frame(self.stdout_fd)
    if frame.frame_type == ERROR or (frame.payload.ok ~= nil and frame.payload.ok == false) then
        error(string.format("[%s] %s", frame.payload.code or "ERROR", frame.payload.message or "unknown error"))
    end
    return frame.payload.result
end

DbNamespace = {}
DbNamespace.__index = DbNamespace

function DbNamespace.new(conduit, name)
    return setmetatable({ conduit = conduit, name = name }, DbNamespace)
end

function DbNamespace:init(dir, opts)
    self.conduit:_request(self.name, INIT_DB, { dir = dir, opts = opts or {} })
    return Db.new(self.conduit, self.name)
end

Db = {}
Db.__index = Db

function Db.new(conduit, name)
    return setmetatable({ conduit = conduit, name = name }, Db)
end

function Db:execute(op, body)
    local payload = { op = op }
    if body ~= nil then payload.body = body end
    return self.conduit:_request(self.name, EXECUTE_JSON, payload)
end

function Db:c(name) return Collection.new(self, name) end
function Db:collection(name) return self:c(name) end

function Db:get_collections() return self:execute("getCollections") end
function Db:ensure_collection(name) return self:execute("ensureCollection", name) end
function Db:isset_collection(name) return self:execute("issetCollection", name) end
function Db:remove_collection(name) return self:execute("removeCollection", name) end

function Db:add(query) return self:execute("add", query) end
function Db:find(query) return self:execute("find", query) end
function Db:find_one(query) return self:execute("findOne", query) end
function Db:findOne(query) return self:find_one(query) end
function Db:update(query) return self:execute("update", query) end
function Db:update_one(query) return self:execute("updateOne", query) end
function Db:updateOne(query) return self:update_one(query) end
function Db:remove(query) return self:execute("remove", query) end
function Db:remove_one(query) return self:execute("removeOne", query) end
function Db:removeOne(query) return self:remove_one(query) end
function Db:update_one_or_add(query) return self:execute("updateOneOrAdd", query) end
function Db:updateOneOrAdd(query) return self:update_one_or_add(query) end
function Db:toggle_one(query) return self:execute("toggleOne", query) end
function Db:toggleOne(query) return self:toggle_one(query) end

function Db:close() return self.conduit:close_db(self.name) end

Collection = {}
Collection.__index = Collection

function Collection.new(db, name)
    return setmetatable({ db = db, name = name }, Collection)
end

function Collection:add(data, id_gen)
    if id_gen == nil then id_gen = true end
    return self.db:add({ collection = self.name, data = data, id_gen = id_gen })
end

function Collection:find(search, db_find_opts, find_opts, context)
    return self.db:find({
        collection = self.name,
        search = search or {},
        dbFindOpts = db_find_opts or {},
        findOpts = find_opts or {},
        context = context or {},
    })
end

function Collection:find_one(search, find_opts, context)
    return self.db:find_one({
        collection = self.name,
        search = search or {},
        findOpts = find_opts or {},
        context = context or {},
    })
end
function Collection:findOne(...) return self:find_one(...) end

function Collection:update(search, updater, context)
    return self.db:update({
        collection = self.name,
        search = search,
        updater = updater,
        context = context or {},
    })
end

function Collection:update_one(search, updater, context)
    return self.db:update_one({
        collection = self.name,
        search = search,
        updater = updater,
        context = context or {},
    })
end
function Collection:updateOne(...) return self:update_one(...) end

function Collection:remove(search, context)
    return self.db:remove({
        collection = self.name,
        search = search,
        context = context or {},
    })
end

function Collection:remove_one(search, context)
    return self.db:remove_one({
        collection = self.name,
        search = search,
        context = context or {},
    })
end
function Collection:removeOne(...) return self:remove_one(...) end

function Collection:update_one_or_add(search, updater, add_arg, context, id_gen)
    if id_gen == nil then id_gen = true end
    return self.db:update_one_or_add({
        collection = self.name,
        search = search,
        updater = updater,
        add_arg = add_arg or {},
        context = context or {},
        id_gen = id_gen,
    })
end
function Collection:updateOneOrAdd(...) return self:update_one_or_add(...) end

function Collection:toggle_one(search, data, context)
    return self.db:toggle_one({
        collection = self.name,
        search = search,
        data = data or {},
        context = context or {},
    })
end
function Collection:toggleOne(...) return self:toggle_one(...) end

return {
    Conduit = Conduit,
    Db = Db,
    Collection = Collection,
    INIT_DB = INIT_DB,
    EXECUTE_JSON = EXECUTE_JSON,
    CLOSE_DB = CLOSE_DB,
    LIST_DBS = LIST_DBS,
    PING = PING,
    SHUTDOWN = SHUTDOWN,
    READY = READY,
    RESULT = RESULT,
    ERROR = ERROR,
    PONG = PONG,
}
