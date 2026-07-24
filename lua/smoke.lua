#!/usr/bin/env luajit
local conduit = require("conduit")
local ffi = require("ffi")

local function dirname(path)
    return path:match("(.*/)")
end

local script_dir = dirname(arg[0]) or "./"
local root = script_dir .. "../"
local data_dir = root .. "lua/test/data/main"

os.execute("rm -rf " .. data_dir)
os.execute("mkdir -p " .. data_dir)

local platform = "linux-x64"
if ffi.os == "OSX" then
    platform = "darwin-x64"
elseif ffi.os == "Windows" then
    platform = "windows-x64"
end

local bin = root .. "dist/valtheradb-conduit-" .. platform
local f = io.open(bin, "r")
if not f then
    bin = root .. "dist/valtheradb-conduit"
else
    f:close()
end

print("starting conduit from: " .. bin)
local c = conduit.Conduit.new(bin)
print("ready:", c.ready)
print("ping:", c:ping())

local db = c:init("data", data_dir, { numberId = false })
local users = db:collection("users")

local ada = users:add({ name = "Ada", lang = "lua" })
local bob = users:add({ name = "Bob", lang = "perl" })
print("inserted:", ada, bob)

print("collections:", db:get_collections())
print("find Ada:", users:find({ name = "Ada" }))
print("find one Bob:", users:find_one({ name = "Bob" }))

local updated = users:update_one({ name = "Ada" }, { lang = "lua-bridge" })
print("updated Ada:", updated)
print("all users:", users:find())

local removed = users:remove_one({ name = "Bob" })
print("removed Bob:", removed)
print("after remove:", users:find())

print("dbs:", c:list_dbs())
c:shutdown()
print("shutdown ok")
