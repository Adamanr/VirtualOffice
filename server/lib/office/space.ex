defmodule Office.Space do
  @moduledoc """
  One process per space: player states, screen occupancy and chat history,
  all in memory. Channel processes push validated updates here; the space
  broadcasts changed player states as one `batch` message per tick (~15 Hz)
  and frees a player's screens when their channel process goes down.
  """

  use GenServer, restart: :transient

  alias Office.{Chat, Drill, Level, Props, Scores, Screens, Toss}

  @tick_ms 66
  @idle_shutdown_ms 60_000

  # --- API

  def start_link(space_id), do: GenServer.start_link(__MODULE__, space_id, name: via(space_id))

  defp via(space_id), do: {:via, Registry, {Office.SpaceRegistry, space_id}}

  def topic(space_id), do: "space:" <> space_id

  @doc "Joins `pid` (a channel process) as `player_id`. Returns a snapshot of the space."
  def join(space_id, player_id, name, color, pid),
    do: call(space_id, {:join, player_id, name, color, pid})

  def move(space_id, player_id, state),
    do: GenServer.cast(via(space_id), {:move, player_id, state})

  def claim_screen(space_id, player_id, screen_id, mode),
    do: call(space_id, {:screen, :claim, player_id, screen_id, mode})

  def release_screen(space_id, player_id, screen_id),
    do: call(space_id, {:screen, :release, player_id, screen_id, nil})

  def open_pdf(space_id, player_id, screen_id, pdf),
    do: call(space_id, {:screen, :open_pdf, player_id, screen_id, pdf})

  def set_pdf_page(space_id, player_id, screen_id, page),
    do: call(space_id, {:screen, :set_page, player_id, screen_id, page})

  def post_chat(space_id, msg), do: call(space_id, {:chat, msg})

  def chat_history(space_id, zone), do: call(space_id, {:history, zone})

  def board_stroke(space_id, player_id, board_id, points, color, width),
    do: call(space_id, {:board_stroke, player_id, board_id, points, color, width})

  def board_clear(space_id, board_id), do: call(space_id, {:board_clear, board_id})

  def sticker_add(space_id, player_id, board_id, url, x, y, rot),
    do: call(space_id, {:sticker_add, player_id, board_id, url, x, y, rot})

  def sticker_remove(space_id, board_id, sticker_id),
    do: call(space_id, {:sticker_remove, board_id, sticker_id})

  def prop_use(space_id, player_id, prop_id, action, item),
    do: call(space_id, {:prop_use, player_id, prop_id, action, item})

  def toss(space_id, player_id, origin, vel), do: call(space_id, {:toss, player_id, origin, vel})

  def pull_alarm(space_id, player_id), do: call(space_id, {:alarm, player_id})

  def prank(space_id, player_id, desk_id), do: call(space_id, {:prank, player_id, desk_id})

  # Starts the space on demand; retries once if it was just shutting down.
  defp call(space_id, msg, retry \\ true) do
    ensure_started(space_id)
    GenServer.call(via(space_id), msg)
  catch
    :exit, _ when retry -> call(space_id, msg, false)
  end

  defp ensure_started(space_id) do
    case Registry.lookup(Office.SpaceRegistry, space_id) do
      [{pid, _}] -> {:ok, pid}
      [] -> DynamicSupervisor.start_child(Office.SpaceSupervisor, {__MODULE__, space_id})
    end
  end

  # --- Server

  @impl true
  def init(space_id) do
    level = Level.get()
    :timer.send_interval(@tick_ms, :tick)

    {:ok,
     %{
       id: space_id,
       level: level,
       players: %{},
       screens: Screens.new(level),
       props: Props.new(level),
       scores: Scores.new(),
       drill: Drill.new(),
       chat: Chat.new(),
       idle_timer: schedule_idle(nil)
     }}
  end

  @impl true
  def handle_call({:join, player_id, name, color, pid}, _from, state) do
    max = Application.get_env(:office, :max_players_per_space, 30)

    case Map.fetch(state.players, player_id) do
      {:ok, old} ->
        # Reconnect: the new channel replaces a stale one (e.g. dropped network).
        Process.demonitor(old.ref, [:flush])
        if old.pid != pid, do: send(old.pid, :replaced)
        player = %{old | pid: pid, ref: Process.monitor(pid), name: name, color: color}
        {:reply, {:ok, snapshot(state, player_id)}, put_in(state.players[player_id], player)}

      :error when map_size(state.players) >= max ->
        {:reply, {:error, :full}, state}

      :error ->
        player = %{
          pid: pid,
          ref: Process.monitor(pid),
          name: name,
          color: color,
          state: nil,
          dirty: false
        }

        state = %{
          state
          | players: Map.put(state.players, player_id, player),
            idle_timer: cancel_idle(state.idle_timer)
        }

        {:reply, {:ok, snapshot(state, player_id)}, state}
    end
  end

  def handle_call({:screen, op, player_id, screen_id, arg}, _from, state) do
    result =
      case op do
        :claim -> Screens.claim(state.screens, screen_id, player_id, arg)
        :release -> Screens.release(state.screens, screen_id, player_id)
        :open_pdf -> Screens.open_pdf(state.screens, screen_id, player_id, arg)
        :set_page -> Screens.set_page(state.screens, screen_id, player_id, arg)
      end

    case result do
      {:ok, screens, changed} ->
        changed = List.wrap(changed)
        Enum.each(changed, &broadcast(state, "screen_update", %{screen: &1}))
        reply = Enum.find(changed, &(&1.id == screen_id))
        {:reply, {:ok, reply}, %{state | screens: screens}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:chat, msg}, _from, state) do
    broadcast(state, "chat", %{msg: msg})
    {:reply, :ok, %{state | chat: Chat.push(state.chat, msg)}}
  end

  def handle_call({:history, zone}, _from, state),
    do: {:reply, Chat.history(state.chat, zone), state}

  def handle_call({:board_stroke, player_id, board_id, points, color, width}, _from, state) do
    case Props.add_stroke(state.props, state.level, board_id, player_id, points, color, width) do
      {:ok, props, stroke} ->
        broadcast(state, "board_stroke", %{stroke: stroke})
        {:reply, :ok, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:board_clear, board_id}, _from, state) do
    case Props.clear_board(state.props, state.level, board_id) do
      {:ok, props} ->
        broadcast(state, "board_clear", %{boardId: board_id})
        {:reply, :ok, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:sticker_add, player_id, board_id, url, x, y, rot}, _from, state) do
    case Props.add_sticker(state.props, state.level, board_id, player_id, url, x, y, rot) do
      {:ok, props, stickers} ->
        broadcast(state, "sticker_update", %{boardId: board_id, stickers: stickers})
        {:reply, :ok, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:sticker_remove, board_id, sticker_id}, _from, state) do
    case Props.remove_sticker(state.props, state.level, board_id, sticker_id) do
      {:ok, props, stickers} ->
        broadcast(state, "sticker_update", %{boardId: board_id, stickers: stickers})
        {:reply, :ok, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:prop_use, player_id, prop_id, action, item}, _from, state) do
    case Props.use(state.props, state.level, prop_id, player_id, action, item, now()) do
      {:ok, props, prop, fx} ->
        broadcast(state, "prop_event", %{prop: prop, fx: fx})
        {:reply, {:ok, prop}, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:toss, player_id, [ox, oy, oz], [vx, vy, vz]}, _from, state) do
    thrower = Map.fetch!(state.players, player_id)

    others =
      for {id, %{state: {x, _y, z, _r, _a}}} <- state.players,
          id != player_id,
          do: %{id: id, position: {x, z}}

    origin = {ox / 1, oy / 1, oz / 1}
    vel = {vx / 1, vy / 1, vz / 1}
    result = Toss.simulate(origin, vel, state.level.bins, others, state.level.bounds)

    toss =
      Map.merge(result, %{
        id: Integer.to_string(System.unique_integer([:positive])),
        by: player_id,
        origin: Tuple.to_list(origin),
        vel: Tuple.to_list(vel),
        t: now()
      })

    broadcast(state, "toss", %{toss: toss})

    scores =
      Scores.shot(
        state.scores,
        player_id,
        thrower.name,
        thrower.color,
        result.points,
        result.hit == "player"
      )

    scores = if result.points == 3, do: Scores.medal(scores, player_id), else: scores
    broadcast(state, "scores", %{scores: Scores.top(scores)})
    {:reply, :ok, %{state | scores: scores}}
  end

  def handle_call({:alarm, player_id}, _from, state) do
    %{name: name} = Map.fetch!(state.players, player_id)

    case Drill.pull(state.drill, player_id, name, now()) do
      {:ok, drill} ->
        broadcast(state, "drill", %{drill: drill})
        {:reply, :ok, %{state | drill: drill}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:prank, player_id, desk_id}, _from, state) do
    case Props.toggle_jello(state.props, state.level, desk_id, player_id) do
      {:ok, props, jello?} ->
        broadcast(state, "desk_update", %{
          deskId: desk_id,
          jello: jello?,
          by: if(jello?, do: player_id)
        })

        {:reply, :ok, %{state | props: props}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_cast({:move, player_id, player_state}, state) do
    case Map.fetch(state.players, player_id) do
      {:ok, p} ->
        {:noreply, put_in(state.players[player_id], %{p | state: player_state, dirty: true})}

      :error ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_info(:tick, state) do
    state = tick_drill(state)

    dirty =
      for {id, %{dirty: true, state: {x, y, z, r, a}}} <- state.players, do: [id, x, y, z, r, a]

    if dirty == [] do
      {:noreply, state}
    else
      broadcast(state, "batch", %{t: System.system_time(:millisecond), p: dirty})
      players = Map.new(state.players, fn {id, p} -> {id, %{p | dirty: false}} end)
      {:noreply, %{state | players: players}}
    end
  end

  def handle_info({:DOWN, ref, :process, _pid, _reason}, state) do
    case Enum.find(state.players, fn {_, p} -> p.ref == ref end) do
      {player_id, _} ->
        {screens, freed} = Screens.release_all(state.screens, player_id)
        Enum.each(freed, &broadcast(state, "screen_update", %{screen: &1}))
        players = Map.delete(state.players, player_id)
        idle = if players == %{}, do: schedule_idle(state.idle_timer), else: state.idle_timer
        {:noreply, %{state | players: players, screens: screens, idle_timer: idle}}

      nil ->
        {:noreply, state}
    end
  end

  def handle_info(:idle_shutdown, state) do
    if state.players == %{}, do: {:stop, :normal, state}, else: {:noreply, state}
  end

  defp tick_drill(%{drill: %{active: false}} = state), do: state

  defp tick_drill(state) do
    players =
      Map.new(state.players, fn {id, p} ->
        pos = with {x, _y, z, _r, _a} <- p.state, do: {x, z}
        {id, %{name: p.name, position: pos}}
      end)
      |> Map.reject(fn {_, p} -> p.position == nil end)

    case Drill.tick(state.drill, players, state.level.assembly, now()) do
      {:unchanged, drill} ->
        %{state | drill: drill}

      {:updated, drill} ->
        broadcast(state, "drill", %{drill: drill})
        %{state | drill: drill}

      {:finished, drill} ->
        profiles = Map.new(state.players, fn {id, p} -> {id, %{name: p.name, color: p.color}} end)
        scores = Scores.drill_results(state.scores, drill.evacuated, profiles)
        broadcast(state, "drill", %{drill: drill})
        broadcast(state, "scores", %{scores: Scores.top(scores)})
        %{state | drill: drill, scores: scores}
    end
  end

  defp now, do: System.system_time(:millisecond)

  defp snapshot(state, self_id) do
    props_snap = Props.snapshot(state.props)

    %{
      players:
        for(
          {id, %{state: s}} <- state.players,
          id != self_id,
          s != nil,
          do: %{id: id, s: Office.Movement.to_list(s)}
        ),
      screens: Screens.active(state.screens),
      chat: Chat.history(state.chat, nil),
      boards: props_snap.boards,
      stickers: props_snap.stickers,
      props: props_snap.props,
      jellos: props_snap.jellos,
      scores: Scores.top(state.scores),
      drill: state.drill
    }
  end

  defp broadcast(state, event, payload),
    do: OfficeWeb.Endpoint.broadcast(topic(state.id), event, payload)

  defp schedule_idle(timer) do
    cancel_idle(timer)
    Process.send_after(self(), :idle_shutdown, @idle_shutdown_ms)
  end

  defp cancel_idle(nil), do: nil

  defp cancel_idle(timer) do
    Process.cancel_timer(timer)
    nil
  end
end
