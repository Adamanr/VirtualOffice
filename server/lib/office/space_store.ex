defmodule Office.SpaceStore do
  @moduledoc """
  Snapshots of saved offices on disk (`:data_dir`/spaces/<id>.bin): whatever
  `Office.Space` decides should outlive the process (whiteboards, stickers,
  scores, chat…). Writes are atomic (temp file + rename), so a crash mid-write
  leaves the previous snapshot intact.
  """

  @version 1

  def dir, do: Path.join(Application.fetch_env!(:office, :data_dir), "spaces")

  defp path(id), do: Path.join(dir(), id <> ".bin")

  @spec load(String.t()) :: map() | nil
  def load(id) do
    with {:ok, bin} <- File.read(path(id)),
         {:ok, %{version: @version, data: data}} <- decode(bin) do
      data
    else
      _ -> nil
    end
  end

  @spec save(String.t(), map()) :: :ok | {:error, term()}
  def save(id, data) do
    File.mkdir_p!(dir())
    tmp = path(id) <> ".tmp"

    with :ok <-
           File.write(
             tmp,
             :erlang.term_to_binary(%{version: @version, data: data}, [:compressed])
           ) do
      File.rename(tmp, path(id))
    end
  end

  def delete(id) do
    File.rm(path(id))
    :ok
  end

  defp decode(bin) do
    {:ok, :erlang.binary_to_term(bin, [:safe])}
  rescue
    ArgumentError -> :error
  end
end
