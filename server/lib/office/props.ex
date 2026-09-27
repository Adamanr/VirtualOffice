defmodule Office.Props do
  @moduledoc """
  Shared office toys: whiteboard strokes, bulletin stickers, the vending machine,
  kitchen appliances and the stapler-in-jello prank.

  Everything that happens at a prop is decided here (server-side randomness) and
  broadcast as a `PropFx`, so every client plays the same effect: the same
  microwave explosion, the same item falling out of the vending machine.

  Prop ids are `prop_<furniture_index>` from the level. Pure functions; the
  space GenServer owns the state.
  """

  alias Office.Level

  @max_strokes_per_board 400
  @max_points_per_stroke 64
  @max_stickers_per_board 24
  @color ~r/\A#[0-9a-fA-F]{6}\z/
  @upload_img ~r{\A/api/uploads/[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)\z}

  # What can happen when you use an appliance, and how long it stays busy (ms).
  @outcomes %{
    "coffee_machine" => {~w(perfect perfect no_beans scald boiling), 2500},
    "water_cooler" => {~w(gossip), 1200},
    "microwave" => {~w(popcorn fish forever soup), 3500},
    "fridge" => {~w(dwight_lunch yogurt mold cake), 2000},
    "copier" => {~w(ok twss jam avalanche), 2200}
  }
  @vending_jam_chance 0.18

  @type stroke :: %{
          id: String.t(),
          boardId: String.t(),
          from: String.t(),
          points: [number()],
          color: String.t(),
          width: number()
        }
  @type sticker :: %{
          id: String.t(),
          boardId: String.t(),
          url: String.t(),
          x: number(),
          y: number(),
          rot: number(),
          from: String.t()
        }
  @type prop_state :: %{
          id: String.t(),
          jammed: boolean(),
          lastItem: String.t() | nil,
          lastBuyer: String.t() | nil
        }
  @type fx :: %{
          id: String.t(),
          propId: String.t(),
          by: String.t(),
          action: String.t(),
          outcome: String.t(),
          item: String.t() | nil,
          variant: non_neg_integer(),
          t: integer()
        }

  @type t :: %{
          boards: %{String.t() => [stroke()]},
          stickers: %{String.t() => [sticker()]},
          vending: %{String.t() => prop_state()},
          busy: %{String.t() => integer()},
          jello: %{String.t() => String.t()}
        }

  @spec new(Level.t()) :: t()
  def new(%Level{props: props}) do
    vending =
      props
      |> Enum.filter(fn {_id, p} -> p.type == "vending_machine" end)
      |> Map.new(fn {id, _} -> {id, empty_vending(id)} end)

    %{boards: %{}, stickers: %{}, vending: vending, busy: %{}, jello: %{}}
  end

  defp empty_vending(id), do: %{id: id, jammed: false, lastItem: nil, lastBuyer: nil}

  def snapshot(%{boards: boards, stickers: stickers, vending: vending, jello: jello}) do
    %{
      boards: boards |> Map.values() |> List.flatten() |> Enum.reverse(),
      stickers: stickers |> Map.values() |> List.flatten() |> Enum.sort_by(& &1.id),
      props: vending |> Map.values() |> Enum.sort_by(& &1.id),
      jellos:
        jello
        |> Enum.map(fn {desk, by} -> %{deskId: desk, by: by} end)
        |> Enum.sort_by(& &1.deskId)
    }
  end

  # --- whiteboards ---------------------------------------------------------------------------

  @spec add_stroke(t(), Level.t(), String.t(), String.t(), [number()], String.t(), number()) ::
          {:ok, t(), stroke()} | {:error, atom()}
  def add_stroke(state, level, board_id, player, points, color, width) do
    with {:ok, %{type: "whiteboard"}} <- fetch_prop(level, board_id),
         true <- length(points) >= 4 and length(points) <= @max_points_per_stroke * 2,
         true <- rem(length(points), 2) == 0,
         true <- color =~ @color,
         true <- width >= 0.002 and width <= 0.08 do
      stroke = %{
        id: random_id(),
        boardId: board_id,
        from: player,
        points: Enum.map(points, &(&1 |> clamp01() |> Float.round(4))),
        color: color,
        width: width
      }

      # Newest first; the oldest strokes fall off a crowded board.
      strokes = Enum.take([stroke | Map.get(state.boards, board_id, [])], @max_strokes_per_board)
      {:ok, put_in(state.boards[board_id], strokes), stroke}
    else
      {:error, _} = err -> err
      _ -> {:error, :bad_payload}
    end
  end

  @spec clear_board(t(), Level.t(), String.t()) :: {:ok, t()} | {:error, atom()}
  def clear_board(state, level, board_id) do
    with {:ok, %{type: "whiteboard"}} <- fetch_prop(level, board_id) do
      {:ok, %{state | boards: Map.put(state.boards, board_id, [])}}
    else
      {:ok, _} -> {:error, :unknown_prop}
      err -> err
    end
  end

  # --- bulletin boards -----------------------------------------------------------------------

  @spec add_sticker(
          t(),
          Level.t(),
          String.t(),
          String.t(),
          String.t(),
          number(),
          number(),
          number()
        ) ::
          {:ok, t(), [sticker()]} | {:error, atom()}
  def add_sticker(state, level, board_id, player, url, x, y, rot) do
    with {:ok, %{type: "bulletin_board"}} <- fetch_prop(level, board_id),
         true <- url =~ @upload_img,
         true <- x >= 0 and x <= 1 and y >= 0 and y <= 1 do
      list = Map.get(state.stickers, board_id, [])

      if length(list) >= @max_stickers_per_board do
        {:error, :busy}
      else
        sticker = %{
          id: random_id(),
          boardId: board_id,
          url: url,
          x: clamp01(x),
          y: clamp01(y),
          rot: rot - 360 * :math.floor(rot / 360),
          from: player
        }

        list = [sticker | list]
        {:ok, put_in(state.stickers[board_id], list), list}
      end
    else
      {:error, _} = err -> err
      _ -> {:error, :bad_payload}
    end
  end

  @spec remove_sticker(t(), Level.t(), String.t(), String.t()) ::
          {:ok, t(), [sticker()]} | {:error, atom()}
  def remove_sticker(state, level, board_id, sticker_id) do
    with {:ok, %{type: "bulletin_board"}} <- fetch_prop(level, board_id) do
      list = state.stickers |> Map.get(board_id, []) |> Enum.reject(&(&1.id == sticker_id))
      {:ok, put_in(state.stickers[board_id], list), list}
    else
      {:ok, _} -> {:error, :unknown_prop}
      err -> err
    end
  end

  @doc "Moves a sticker (anyone may: it's a cork board) and brings it to the top of the pile."
  @spec move_sticker(t(), Level.t(), String.t(), String.t(), number(), number()) ::
          {:ok, t(), [sticker()]} | {:error, atom()}
  def move_sticker(state, level, board_id, sticker_id, x, y) do
    with {:ok, %{type: "bulletin_board"}} <- fetch_prop(level, board_id),
         list = Map.get(state.stickers, board_id, []),
         %{} = sticker <- Enum.find(list, &(&1.id == sticker_id)) do
      moved = %{sticker | x: clamp01(x), y: clamp01(y)}
      list = [moved | Enum.reject(list, &(&1.id == sticker_id))]
      {:ok, put_in(state.stickers[board_id], list), list}
    else
      {:ok, _} -> {:error, :unknown_prop}
      nil -> {:error, :bad_payload}
      err -> err
    end
  end

  # --- appliances & vending ------------------------------------------------------------------

  @doc """
  Uses a prop. Returns the new state, the vending state (or nil) and the effect
  every client should play. `rand` is injectable for tests.
  """
  @spec use(
          t(),
          Level.t(),
          String.t(),
          String.t(),
          String.t(),
          String.t() | nil,
          integer(),
          (-> float())
        ) ::
          {:ok, t(), prop_state() | nil, fx()} | {:error, atom()}
  def use(state, level, prop_id, player, action, item, now, rand \\ &:rand.uniform/0) do
    with {:ok, prop} <- fetch_prop(level, prop_id),
         :ok <- not_busy(state, prop_id, now) do
      case {prop.type, action} do
        {"vending_machine", action} when action in ["buy", "kick"] ->
          vending(state, prop_id, player, action, item, now, rand)

        {type, "use"} when is_map_key(@outcomes, type) ->
          {outcomes, busy_ms} = @outcomes[type]

          outcome =
            Enum.at(outcomes, trunc(rand.() * length(outcomes)) |> min(length(outcomes) - 1))

          state = put_in(state.busy[prop_id], now + busy_ms)
          {:ok, state, nil, fx(prop_id, player, action, outcome, nil, now, rand)}

        _ ->
          {:error, :bad_payload}
      end
    end
  end

  defp vending(state, prop_id, player, action, item, now, rand) do
    cur = Map.get(state.vending, prop_id) || empty_vending(prop_id)

    {next, outcome} =
      case action do
        "kick" when cur.jammed ->
          {%{cur | jammed: false}, "unjam"}

        "kick" ->
          {cur, "kick"}

        "buy" when cur.jammed ->
          {cur, "poke"}

        "buy" ->
          chosen = item_or_default(item)
          jammed = rand.() < @vending_jam_chance

          {%{cur | jammed: jammed, lastItem: chosen, lastBuyer: player},
           if(jammed, do: "jam", else: "drop")}
      end

    state = %{
      put_in(state.vending[prop_id], next)
      | busy: Map.put(state.busy, prop_id, now + 900)
    }

    {:ok, state, next, fx(prop_id, player, action, outcome, next.lastItem, now, rand)}
  end

  defp not_busy(state, prop_id, now) do
    if Map.get(state.busy, prop_id, 0) > now, do: {:error, :busy}, else: :ok
  end

  defp fx(prop_id, player, action, outcome, item, now, rand) do
    %{
      id: random_id(),
      propId: prop_id,
      by: player,
      action: action,
      outcome: outcome,
      item: item,
      variant: trunc(rand.() * 1000),
      t: now
    }
  end

  defp item_or_default(item) when is_binary(item) and byte_size(item) in 1..80, do: item
  defp item_or_default(_), do: "что-то загадочное"

  # --- stapler in jello ----------------------------------------------------------------------

  @doc "Toggles the jello on a desk's stapler. Returns whether it is now in jello."
  @spec toggle_jello(t(), Level.t(), String.t(), String.t()) ::
          {:ok, t(), boolean()} | {:error, atom()}
  def toggle_jello(state, %Level{desks: desks}, desk_id, player) do
    cond do
      not Map.has_key?(desks, desk_id) ->
        {:error, :unknown_prop}

      Map.has_key?(state.jello, desk_id) ->
        {:ok, %{state | jello: Map.delete(state.jello, desk_id)}, false}

      true ->
        {:ok, %{state | jello: Map.put(state.jello, desk_id, player)}, true}
    end
  end

  # --- helpers -------------------------------------------------------------------------------

  defp fetch_prop(%Level{props: props}, id) do
    case Map.fetch(props, id) do
      {:ok, p} -> {:ok, p}
      :error -> {:error, :unknown_prop}
    end
  end

  defp clamp01(n), do: n |> max(0) |> min(1) |> Kernel./(1)

  defp random_id, do: :crypto.strong_rand_bytes(9) |> Base.url_encode64(padding: false)
end
