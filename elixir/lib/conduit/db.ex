defmodule ValtheraDB.Conduit.Db do
  defstruct [:conduit, :name]

  def execute(%__MODULE__{conduit: pid, name: name}, op, body \\ nil) do
    ValtheraDB.Conduit.execute(pid, name, op, body)
  end

  def collection(%__MODULE__{} = db, name) do
    %ValtheraDB.Conduit.Collection{db: db, name: name}
  end

  def c(%__MODULE__{} = db, name), do: collection(db, name)

  def get_collections(%__MODULE__{} = db), do: execute(db, "getCollections")
  def ensure_collection(%__MODULE__{} = db, name), do: execute(db, "ensureCollection", name)
  def isset_collection(%__MODULE__{} = db, name), do: execute(db, "issetCollection", name)
  def remove_collection(%__MODULE__{} = db, name), do: execute(db, "removeCollection", name)

  def add(%__MODULE__{} = db, query), do: execute(db, "add", query)
  def find(%__MODULE__{} = db, query \\ nil), do: execute(db, "find", query)
  def find_one(%__MODULE__{} = db, query), do: execute(db, "findOne", query)
  def update(%__MODULE__{} = db, query), do: execute(db, "update", query)
  def update_one(%__MODULE__{} = db, query), do: execute(db, "updateOne", query)
  def remove(%__MODULE__{} = db, query), do: execute(db, "remove", query)
  def remove_one(%__MODULE__{} = db, query), do: execute(db, "removeOne", query)
  def update_one_or_add(%__MODULE__{} = db, query), do: execute(db, "updateOneOrAdd", query)
  def toggle_one(%__MODULE__{} = db, query), do: execute(db, "toggleOne", query)

  def close(%__MODULE__{conduit: pid, name: name}) do
    ValtheraDB.Conduit.close_db(pid, name)
  end
end
