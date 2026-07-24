defmodule SmokeTest do
  def run do
    root = Path.expand("../../", __DIR__)
    data_dir = Path.join(root, "elixir/test/data/main")
    File.rm_rf!(data_dir)
    File.mkdir_p!(data_dir)

    arch = case to_string(:erlang.system_info(:system_architecture)) do
      "aarch64" <> _ -> "arm64"
      _ -> "x64"
    end
    os = case :os.type() do
      {:unix, :linux} -> "linux"
      {:unix, :darwin} -> "darwin"
      _ -> "windows"
    end
    bin = Path.join(root, "dist/valtheradb-conduit-#{os}-#{arch}")
    bin = if File.exists?(bin), do: bin, else: Path.join(root, "dist/valtheradb-conduit")

    IO.puts("starting conduit from: #{bin}")
    {:ok, pid} = ValtheraDB.Conduit.start_link(bin)
    IO.puts("ready: #{inspect(ValtheraDB.Conduit.ready(pid))}")
    IO.puts("ping: #{inspect(ValtheraDB.Conduit.ping(pid))}")

    db = ValtheraDB.Conduit.init_db(pid, "data", data_dir, %{"numberId" => false})
    users = ValtheraDB.Conduit.Db.collection(db, "users")

    {:ok, ada} = ValtheraDB.Conduit.Collection.add(users, %{"name" => "Ada", "lang" => "elixir"})
    {:ok, bob} = ValtheraDB.Conduit.Collection.add(users, %{"name" => "Bob", "lang" => "haskell"})
    IO.puts("inserted: #{inspect(ada)} #{inspect(bob)}")

    {:ok, cols} = ValtheraDB.Conduit.Db.get_collections(db)
    IO.puts("collections: #{inspect(cols)}")

    {:ok, found} = ValtheraDB.Conduit.Collection.find(users, %{"name" => "Ada"})
    IO.puts("find Ada: #{inspect(found)}")

    {:ok, found_one} = ValtheraDB.Conduit.Collection.find_one(users, %{"name" => "Bob"})
    IO.puts("find one Bob: #{inspect(found_one)}")

    {:ok, updated} = ValtheraDB.Conduit.Collection.update_one(users, %{"name" => "Ada"}, %{"lang" => "elixir-bridge"})
    IO.puts("updated Ada: #{inspect(updated)}")

    {:ok, all} = ValtheraDB.Conduit.Collection.find(users)
    IO.puts("all users: #{inspect(all)}")

    {:ok, removed} = ValtheraDB.Conduit.Collection.remove_one(users, %{"name" => "Bob"})
    IO.puts("removed Bob: #{inspect(removed)}")

    {:ok, after_remove} = ValtheraDB.Conduit.Collection.find(users)
    IO.puts("after remove: #{inspect(after_remove)}")

    {:ok, dbs} = ValtheraDB.Conduit.list_dbs(pid)
    IO.puts("dbs: #{inspect(dbs)}")

    ValtheraDB.Conduit.shutdown(pid)
    IO.puts("shutdown ok")
  end
end

SmokeTest.run()
