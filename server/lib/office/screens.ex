defmodule Office.Screens do
  @moduledoc """
  Occupancy of the big screens and desk monitors of a space (pure functions).

  One presenter per screen; a player presents on at most one screen at a time
  (claiming another releases the previous one). A screen shows either a live
  screen share (`"share"`) or a PDF (`"pdf"`) whose page only the owner flips.
  """

  alias Office.Level

  @type screen :: %{id: String.t(), owner: String.t() | nil, mode: String.t() | nil, pdf: map() | nil}
  @type t :: %{String.t() => screen()}

  # How close to a desk monitor you must stand to present on it.
  @desk_reach 3.0

  @spec new(Level.t()) :: t()
  def new(%Level{screens: defs}), do: Map.new(defs, fn {id, _} -> {id, empty(id)} end)

  defp empty(id), do: %{id: id, owner: nil, mode: nil, pdf: nil}

  @doc "Screens that are in use (the rest are implicitly empty)."
  def active(screens), do: screens |> Map.values() |> Enum.filter(& &1.owner) |> Enum.sort_by(& &1.id)

  @spec claim(t(), String.t(), String.t(), String.t()) ::
          {:ok, t(), [screen()]} | {:error, :unknown_screen | :busy}
  def claim(screens, id, player, mode) when mode in ["share", "pdf"] do
    case Map.fetch(screens, id) do
      :error ->
        {:error, :unknown_screen}

      {:ok, %{owner: owner}} when owner not in [nil, player] ->
        {:error, :busy}

      {:ok, screen} ->
        {screens, released} = release_all(screens, player, except: id)
        pdf = if screen.mode == mode, do: screen.pdf, else: nil
        claimed = %{screen | owner: player, mode: mode, pdf: pdf}
        {:ok, Map.put(screens, id, claimed), released ++ [claimed]}
    end
  end

  @spec release(t(), String.t(), String.t()) :: {:ok, t(), screen()} | {:error, :unknown_screen | :not_owner}
  def release(screens, id, player) do
    case Map.fetch(screens, id) do
      :error -> {:error, :unknown_screen}
      {:ok, %{owner: ^player}} -> {:ok, Map.put(screens, id, empty(id)), empty(id)}
      {:ok, _} -> {:error, :not_owner}
    end
  end

  @doc "Frees every screen held by `player` (e.g. when they leave). Returns the freed screens."
  @spec release_all(t(), String.t(), keyword()) :: {t(), [screen()]}
  def release_all(screens, player, opts \\ []) do
    except = Keyword.get(opts, :except)

    Enum.reduce(screens, {screens, []}, fn
      {id, %{owner: ^player}}, {acc, freed} when id != except ->
        {Map.put(acc, id, empty(id)), [empty(id) | freed]}

      _, acc ->
        acc
    end)
  end

  @spec open_pdf(t(), String.t(), String.t(), map()) :: {:ok, t(), screen()} | {:error, atom()}
  def open_pdf(screens, id, player, %{url: _, name: _, pages: pages} = pdf) when pages >= 1 do
    with {:ok, screen} <- owned(screens, id, player) do
      screen = %{screen | mode: "pdf", pdf: Map.put(pdf, :page, 1)}
      {:ok, Map.put(screens, id, screen), screen}
    end
  end

  @spec set_page(t(), String.t(), String.t(), integer()) :: {:ok, t(), screen()} | {:error, atom()}
  def set_page(screens, id, player, page) do
    with {:ok, %{pdf: %{pages: pages} = pdf} = screen} <- owned(screens, id, player) do
      screen = %{screen | pdf: %{pdf | page: page |> max(1) |> min(pages)}}
      {:ok, Map.put(screens, id, screen), screen}
    else
      {:ok, _no_pdf} -> {:error, :bad_payload}
      error -> error
    end
  end

  defp owned(screens, id, player) do
    case Map.fetch(screens, id) do
      :error -> {:error, :unknown_screen}
      {:ok, %{owner: ^player} = screen} -> {:ok, screen}
      {:ok, _} -> {:error, :not_owner}
    end
  end

  @doc "Whether a player in `zone` at `{x, z}` may present on the screen."
  @spec can_use?(Level.screen(), String.t() | nil, {number(), number()} | nil) :: boolean()
  def can_use?(%{zone_id: zone_id} = screen, zone, pos) do
    zone == zone_id and
      case {screen.kind, pos} do
        {"desk", {x, z}} ->
          {sx, _y, sz} = screen.position
          :math.sqrt((x - sx) ** 2 + (z - sz) ** 2) <= @desk_reach

        {"desk", nil} ->
          false

        _ ->
          true
      end
  end
end
