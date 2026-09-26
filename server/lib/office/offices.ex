defmodule Office.Offices do
  @moduledoc """
  The list of saved offices (`:data_dir`/offices.json): id, name and when it was
  created / last used. A space whose id is listed here keeps its state on disk
  (see `Office.SpaceStore`) and comes back as it was left; any other id is a
  throwaway room that lives only while someone is inside.
  """

  use GenServer

  @id ~r/\A[a-z0-9]{10}\z/
  @alphabet ~c"abcdefghijklmnopqrstuvwxyz0123456789"

  @type office :: %{id: String.t(), name: String.t(), createdAt: integer(), updatedAt: integer()}

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @spec list() :: [office()]
  def list, do: GenServer.call(__MODULE__, :list)

  @spec get(String.t()) :: office() | nil
  def get(id), do: GenServer.call(__MODULE__, {:get, id})

  def saved?(id), do: get(id) != nil

  @spec create(term()) :: {:ok, office()} | {:error, :bad_name | :limit}
  def create(name), do: GenServer.call(__MODULE__, {:create, name})

  @spec rename(String.t(), term()) :: {:ok, office()} | {:error, :bad_name | :not_found}
  def rename(id, name), do: GenServer.call(__MODULE__, {:rename, id, name})

  @doc "Forgets the office and its saved state. The caller makes sure nobody is inside."
  @spec delete(String.t()) :: :ok | {:error, :not_found}
  def delete(id), do: GenServer.call(__MODULE__, {:delete, id})

  @doc "Marks the office as used just now (the space saved a change)."
  def touch(id), do: GenServer.cast(__MODULE__, {:touch, id})

  # --- Server

  @impl true
  def init(_) do
    {:ok, %{offices: read_index()}}
  end

  @impl true
  def handle_call(:list, _from, state),
    do: {:reply, state.offices |> Map.values() |> Enum.sort_by(& &1.updatedAt, :desc), state}

  def handle_call({:get, id}, _from, state), do: {:reply, Map.get(state.offices, id), state}

  def handle_call({:create, name}, _from, state) do
    max = Application.get_env(:office, :max_offices, 200)

    with {:ok, name} <- clean_name(name),
         true <- map_size(state.offices) < max || {:error, :limit} do
      now = System.system_time(:millisecond)
      office = %{id: new_id(state.offices), name: name, createdAt: now, updatedAt: now}
      state = put_in(state.offices[office.id], office)
      write_index(state.offices)
      {:reply, {:ok, office}, state}
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:rename, id, name}, _from, state) do
    with %{} = office <- Map.get(state.offices, id) || {:error, :not_found},
         {:ok, name} <- clean_name(name) do
      office = %{office | name: name}
      state = put_in(state.offices[id], office)
      write_index(state.offices)
      {:reply, {:ok, office}, state}
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:delete, id}, _from, state) do
    if Map.has_key?(state.offices, id) do
      Office.SpaceStore.delete(id)
      state = %{state | offices: Map.delete(state.offices, id)}
      write_index(state.offices)
      {:reply, :ok, state}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_cast({:touch, id}, state) do
    case state.offices do
      %{^id => office} ->
        state = put_in(state.offices[id], %{office | updatedAt: System.system_time(:millisecond)})
        write_index(state.offices)
        {:noreply, state}

      _ ->
        {:noreply, state}
    end
  end

  # --- helpers

  def valid_id?(id), do: is_binary(id) and id =~ @id

  defp new_id(offices) do
    id = for _ <- 1..10, into: "", do: <<Enum.random(@alphabet)>>
    if Map.has_key?(offices, id), do: new_id(offices), else: id
  end

  defp clean_name(name) when is_binary(name) do
    name = name |> String.replace(~r/[\x00-\x1F\x7F]/u, "") |> String.trim()
    len = String.length(name)
    if len >= 1 and len <= 48, do: {:ok, name}, else: {:error, :bad_name}
  end

  defp clean_name(_), do: {:error, :bad_name}

  defp index_path, do: Path.join(Application.fetch_env!(:office, :data_dir), "offices.json")

  defp read_index do
    with {:ok, json} <- File.read(index_path()),
         {:ok, list} when is_list(list) <- Jason.decode(json) do
      for %{"id" => id, "name" => name} = o <- list, valid_id?(id), into: %{} do
        {id,
         %{
           id: id,
           name: name,
           createdAt: o["createdAt"] || 0,
           updatedAt: o["updatedAt"] || o["createdAt"] || 0
         }}
      end
    else
      _ -> %{}
    end
  end

  defp write_index(offices) do
    path = index_path()
    File.mkdir_p!(Path.dirname(path))
    tmp = path <> ".tmp"
    File.write!(tmp, Jason.encode_to_iodata!(Map.values(offices), pretty: true))
    File.rename!(tmp, path)
  end
end
