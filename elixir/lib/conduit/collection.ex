defmodule ValtheraDB.Conduit.Collection do
  defstruct [:db, :name]

  def add(%__MODULE__{db: db, name: name}, data, id_gen \\ true) do
    ValtheraDB.Conduit.Db.add(db, %{"collection" => name, "data" => data, "id_gen" => id_gen})
  end

  def find(%__MODULE__{db: db, name: name}, search \\ %{}, db_find_opts \\ %{}, find_opts \\ %{}, context \\ %{}) do
    ValtheraDB.Conduit.Db.find(db, %{
      "collection" => name,
      "search" => search,
      "dbFindOpts" => db_find_opts,
      "findOpts" => find_opts,
      "context" => context
    })
  end

  def find_one(%__MODULE__{db: db, name: name}, search \\ %{}, find_opts \\ %{}, context \\ %{}) do
    ValtheraDB.Conduit.Db.find_one(db, %{
      "collection" => name,
      "search" => search,
      "findOpts" => find_opts,
      "context" => context
    })
  end

  def update(%__MODULE__{db: db, name: name}, search, updater, context \\ %{}) do
    ValtheraDB.Conduit.Db.update(db, %{
      "collection" => name, "search" => search, "updater" => updater, "context" => context
    })
  end

  def update_one(%__MODULE__{db: db, name: name}, search, updater, context \\ %{}) do
    ValtheraDB.Conduit.Db.update_one(db, %{
      "collection" => name, "search" => search, "updater" => updater, "context" => context
    })
  end

  def remove(%__MODULE__{db: db, name: name}, search, context \\ %{}) do
    ValtheraDB.Conduit.Db.remove(db, %{"collection" => name, "search" => search, "context" => context})
  end

  def remove_one(%__MODULE__{db: db, name: name}, search, context \\ %{}) do
    ValtheraDB.Conduit.Db.remove_one(db, %{"collection" => name, "search" => search, "context" => context})
  end

  def update_one_or_add(%__MODULE__{db: db, name: name}, search, updater, add_arg \\ %{}, context \\ %{}, id_gen \\ true) do
    ValtheraDB.Conduit.Db.update_one_or_add(db, %{
      "collection" => name, "search" => search, "updater" => updater,
      "add_arg" => add_arg, "context" => context, "id_gen" => id_gen
    })
  end

  def toggle_one(%__MODULE__{db: db, name: name}, search, data \\ %{}, context \\ %{}) do
    ValtheraDB.Conduit.Db.toggle_one(db, %{
      "collection" => name, "search" => search, "data" => data, "context" => context
    })
  end
end
