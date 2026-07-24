defmodule ValtheraDB.Conduit do
  use GenServer

  @header_size 12
  @init_db 1
  @execute_json 2
  @close_db 3
  @list_dbs 4
  @ping 5
  @shutdown 6
  @ready 100
  @error 102

  defstruct [:port, :ready, :buffer, :pending, :db_locks, :write_lock]

  def start_link(binary_path, opts \\ []) do
    GenServer.start_link(__MODULE__, binary_path, opts)
  end

  def init(binary_path) do
    port = Port.open({:spawn_executable, to_charlist(binary_path)},
      [:binary, :use_stdio, :exit_status, args: []])

    receive do
      {^port, {:data, data}} ->
        case decode_frame(data) do
          {:ok, frame, rest} ->
            if frame.frame_type != @ready do
              raise "did not receive READY"
            end
            state = %__MODULE__{
              port: port,
              ready: Map.get(frame.payload, "result"),
              buffer: rest,
              pending: %{},
              db_locks: %{},
              write_lock: :global.trans({__MODULE__, self()}, fn -> :ok end)
            }
            {:ok, state}
          _ ->
            raise "failed to read READY frame"
        end
    after
      5000 -> raise "timeout waiting for READY"
    end
  end

  def ready(pid), do: GenServer.call(pid, :ready)

  def db(pid, name), do: %ValtheraDB.Conduit.Db{conduit: pid, name: name}

  def init_db(pid, name, dir, opts \\ %{}) do
    GenServer.call(pid, {:request, name, @init_db, %{"dir" => dir, "opts" => opts}})
    db(pid, name)
  end

  def close_db(pid, name) do
    GenServer.call(pid, {:request, name, @close_db, %{}})
  end

  def list_dbs(pid) do
    GenServer.call(pid, {:request, "", @list_dbs, %{}})
  end

  def ping(pid) do
    GenServer.call(pid, {:request, "", @ping, %{}})
  end

  def execute(pid, db_name, op, body \\ nil) do
    payload = %{"op" => op}
    payload = if body, do: Map.put(payload, "body", body), else: payload
    GenServer.call(pid, {:request, db_name, @execute_json, payload})
  end

  def shutdown(pid) do
    GenServer.call(pid, :shutdown)
  end

  def handle_call(:ready, _from, state) do
    {:reply, state.ready, state}
  end

  def handle_call({:request, db_name, frame_type, payload}, from, state) do
    lock = Map.get(state.db_locks, db_name) || make_ref()
    state = put_in(state.db_locks[db_name], lock)

    ref = make_ref()
    pending = Map.update(state.pending, db_name, [{from, ref}], &(&1 ++ [{from, ref}]))
    state = %{state | pending: pending}

    data = encode_frame(frame_type, db_name, payload)
    Port.command(state.port, data)

    {:noreply, state}
  end

  def handle_call(:shutdown, _from, state) do
    try do
      data = encode_frame(@shutdown, "", %{})
      Port.command(state.port, data)
    rescue
      _ -> :ok
    end
    Port.close(state.port)
    {:stop, :normal, :ok, state}
  end

  def handle_info({port, {:data, data}}, %{port: port} = state) do
    buffer = state.buffer <> data
    state = %{state | buffer: buffer}
    state = process_buffer(state)
    {:noreply, state}
  end

  def handle_info({port, {:exit_status, _}}, %{port: port} = state) do
    for {_, queue} <- state.pending, {from, _} <- queue do
      GenServer.reply(from, {:error, :closed})
    end
    {:stop, :normal, %{state | pending: %{}}}
  end

  defp process_buffer(state) do
    case decode_frame(state.buffer) do
      {:ok, frame, rest} ->
        state = resolve_frame(state, frame)
        process_buffer(%{state | buffer: rest})
      _ ->
        state
    end
  end

  defp resolve_frame(state, frame) do
    case Map.get(state.pending, frame.db_name) do
      [{from, _ref} | rest] ->
        pending = Map.put(state.pending, frame.db_name, rest)
        state = %{state | pending: pending}

        payload = frame.payload
        cond do
          frame.frame_type == @error ->
            code = Map.get(payload, "code", "ERROR")
            message = Map.get(payload, "message", "unknown error")
            GenServer.reply(from, {:error, {code, message}})
          Map.get(payload, "ok") == false ->
            code = Map.get(payload, "code", "ERROR")
            message = Map.get(payload, "message", "unknown error")
            GenServer.reply(from, {:error, {code, message}})
          true ->
            GenServer.reply(from, {:ok, Map.get(payload, "result")})
        end
        state
      _ ->
        state
    end
  end

  defp encode_frame(frame_type, db_name, payload) do
    db_bytes = :binary.bin_to_list(db_name || "")
    payload_bytes = Jason.encode!(payload || %{}) |> :binary.bin_to_list()
    header = <<
      frame_type::unsigned-32-little,
      length(db_bytes)::unsigned-32-little,
      length(payload_bytes)::unsigned-32-little
    >>
    header <> :binary.list_to_bin(db_bytes) <> :binary.list_to_bin(payload_bytes)
  end

  defp decode_frame(buffer) when byte_size(buffer) < @header_size, do: :error

  defp decode_frame(buffer) do
    <<frame_type::unsigned-32-little,
      db_name_len::unsigned-32-little,
      payload_len::unsigned-32-little,
      _rest::binary>> = buffer

    total = @header_size + db_name_len + payload_len
    if byte_size(buffer) < total do
      :error
    else
      <<_::binary-size(@header_size),
        db_name::binary-size(^db_name_len),
        payload_bytes::binary-size(^payload_len),
        rest::binary>> = buffer

      payload = if byte_size(payload_bytes) > 0 do
        Jason.decode!(payload_bytes)
      else
        %{}
      end

      {:ok, %{frame_type: frame_type, db_name: db_name, payload: payload}, rest}
    end
  end
end
