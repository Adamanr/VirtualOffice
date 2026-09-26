defmodule Office.Annotations do
  @moduledoc """
  Drawings on top of shared screens (browser, screen share, PDF): everyone who
  can see a screen draws in their own color; the presenter can clear
  everything, lock drawing for others and put a spotlight on a region.

  Coordinates are normalized to the screen's content (0..1). `ctx` ties a
  drawing to what was shown (PDF page, browser URL), so flipping pages hides
  drawings and coming back shows them again. Pure functions.
  """

  @max_per_screen 300
  @max_points 64
  @color ~r/\A#[0-9a-fA-F]{6}\z/
  @tools ~w(pen highlight rect arrow)

  def new, do: %{strokes: %{}, settings: %{}}

  def default_settings(screen_id),
    do: %{screenId: screen_id, locked: false, spotlight: nil, ctx: ""}

  def settings(state, screen_id),
    do: Map.get(state.settings, screen_id, default_settings(screen_id))

  def locked?(state, screen_id), do: settings(state, screen_id).locked

  @spec add(map(), String.t(), String.t(), map()) :: {:ok, map(), map()} | {:error, :bad_payload}
  def add(state, screen_id, player, %{
        "ctx" => ctx,
        "tool" => tool,
        "color" => color,
        "width" => width,
        "points" => points
      }) do
    n = length(points)

    if tool in @tools and color =~ @color and width >= 0.002 and width <= 0.06 and n >= 4 and
         n <= @max_points * 2 and
         rem(n, 2) == 0 and byte_size(ctx) <= 2100 do
      stroke = %{
        id: Integer.to_string(System.unique_integer([:positive])),
        screenId: screen_id,
        by: player,
        ctx: ctx,
        tool: tool,
        color: color,
        width: width,
        points: Enum.map(points, &(&1 |> max(0) |> min(1) |> Kernel./(1) |> Float.round(4)))
      }

      list = Enum.take([stroke | Map.get(state.strokes, screen_id, [])], @max_per_screen)
      {:ok, put_in(state.strokes[screen_id], list), stroke}
    else
      {:error, :bad_payload}
    end
  end

  @doc "Removes the player's latest drawing on the screen."
  def undo(state, screen_id, player) do
    list = Map.get(state.strokes, screen_id, [])

    case Enum.find(list, &(&1.by == player)) do
      nil -> {state, []}
      s -> {put_in(state.strokes[screen_id], List.delete(list, s)), [s.id]}
    end
  end

  @doc "Clears the player's own drawings, or everyone's (`all?`, presenter only)."
  def clear(state, screen_id, player, all?) do
    {gone, kept} =
      state.strokes |> Map.get(screen_id, []) |> Enum.split_with(&(all? or &1.by == player))

    {put_in(state.strokes[screen_id], kept), Enum.map(gone, & &1.id)}
  end

  @spec set(map(), String.t(), boolean(), [number()] | nil, String.t()) ::
          {:ok, map(), map()} | {:error, :bad_payload}
  def set(state, screen_id, locked, spotlight, ctx) do
    valid_spot =
      spotlight == nil or
        (length(spotlight) == 4 and Enum.all?(spotlight, &(&1 >= 0 and &1 <= 1)))

    if valid_spot and byte_size(ctx) <= 2100 do
      settings = %{
        screenId: screen_id,
        locked: locked,
        spotlight: spotlight && Enum.map(spotlight, &(&1 / 1)),
        ctx: ctx
      }

      {:ok, put_in(state.settings[screen_id], settings), settings}
    else
      {:error, :bad_payload}
    end
  end

  @doc "The screen stopped showing what was drawn on (released, new presenter)."
  def reset(state, screen_id) do
    ids = state.strokes |> Map.get(screen_id, []) |> Enum.map(& &1.id)

    {%{
       strokes: Map.delete(state.strokes, screen_id),
       settings: Map.delete(state.settings, screen_id)
     }, ids}
  end

  def snapshot(state) do
    %{
      annotations: state.strokes |> Map.values() |> Enum.flat_map(&Enum.reverse/1),
      annotSettings: Map.values(state.settings)
    }
  end
end
