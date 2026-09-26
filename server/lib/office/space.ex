defmodule Office.Space do
  @moduledoc """
  One process per space: player states, screen occupancy and chat history,
  all in memory. Channel processes push validated updates here; the space
  broadcasts changed player states as one `batch` message per tick (~15 Hz)
  and frees a player's screens when their channel process goes down.

  A saved office (listed in `Office.Offices`) also keeps what people leave
  behind — whiteboards, stickers, the jello prank, the vending machine, scores,
  darts and chat — in `Office.SpaceStore`: loaded on start, written every few
  seconds when it changed and once more when the process stops.
  """

  use GenServer, restart: :transient
  require Logger

  alias Office.{Annotations, Chat, Darts, Drill, Level, Pong, Props, Scores, Screens, Toss}

  @tick_ms 66
  @idle_shutdown_ms 60_000
  @save_ms 5_000

  # --- API

  def start_link(space_id), do: GenServer.start_link(__MODULE__, space_id, name: via(space_id))

  @doc "Stops a running space (saving it first). No-op if it isn't running."
  def stop(space_id) do
    case Registry.lookup(Office.SpaceRegistry, space_id) do
      [{pid, _}] -> GenServer.stop(pid, :normal)
      [] -> :ok
    end
  catch
    :exit, _ -> :ok
  end

  @doc "Players inside right now (0 when the space isn't running)."
  def online(space_id) do
    case Registry.lookup(Office.SpaceRegistry, space_id) do
      [{pid, _}] -> GenServer.call(pid, :online)
      [] -> 0
    end
  catch
    :exit, _ -> 0
  end

  defp via(space_id), do: {:via, Registry, {Office.SpaceRegistry, space_id}}

  def topic(space_id), do: "space:" <> space_id

  @doc "Joins `pid` (a channel process) as `player_id`. Returns a snapshot of the space."
  def join(space_id, player_id, name, color, pid),
    do: call(space_id, {:join, player_id, name, color, pid})

  def move(space_id, player_id, state),
    do: GenServer.cast(via(space_id), {:move, player_id, state})

  def claim_screen(space_id, player_id, screen_id, mode, url \\ nil),
    do: call(space_id, {:screen, :claim, player_id, screen_id, {mode, url}})

  def screen_state(space_id, screen_id), do: call(space_id, {:screen_state, screen_id})

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

  def pong_join(space_id, player_id, table_id),
    do: call(space_id, {:pong_join, player_id, table_id})

  def pong_leave(space_id, player_id, table_id),
    do: call(space_id, {:pong_leave, player_id, table_id})

  def pong_paddle(space_id, player_id, table_id, x),
    do: GenServer.cast(via(space_id), {:pong_paddle, player_id, table_id, x})

  def dart_throw(space_id, player_id, board_id, u, v, from),
    do: call(space_id, {:dart_throw, player_id, board_id, u, v, from})

  def darts_clear(space_id, board_id), do: call(space_id, {:darts_clear, board_id})

  @doc "Drawing on a shared screen: op is :add | :undo | :clear | :settings | :laser."
  def annotate(space_id, player_id, screen_id, op, arg),
    do: call(space_id, {:annotate, player_id, screen_id, op, arg})

  # Starts the space on demand. If it was just shutting down, the registry may
  # still point at the old process for a moment: retry a few times.
  defp call(space_id, msg, attempts \\ 5) do
    ensure_started(space_id)
    GenServer.call(via(space_id), msg)
  catch
    :exit, {:noproc, _} when attempts > 1 ->
      Process.sleep(10)
      call(space_id, msg, attempts - 1)

    :exit, {:normal, _} when attempts > 1 ->
      Process.sleep(10)
      call(space_id, msg, attempts - 1)
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
    # terminate/2 runs on shutdown too: the last changes get saved.
    Process.flag(:trap_exit, true)
    level = Level.get()
    :timer.send_interval(@tick_ms, :tick)
    saved? = Office.Offices.saved?(space_id)
    if saved?, do: :timer.send_interval(@save_ms, :save)

    state =
      %{
        id: space_id,
        level: level,
        players: %{},
        screens: Screens.new(level),
        props: Props.new(level),
        scores: Scores.new(),
        drill: Drill.new(),
        pongs:
          for({id, %{type: "pingpong_table"}} <- level.props, into: %{}, do: {id, Pong.new(id)}),
        darts: %{},
        annots: Annotations.new(),
        chat: Chat.new(),
        idle_timer: schedule_idle(nil),
        saved?: saved?,
        persisted: nil
      }

    state = if saved?, do: restore(state, Office.SpaceStore.load(space_id)), else: state
    {:ok, %{state | persisted: persisted(state)}}
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
        :claim -> Screens.claim(state.screens, screen_id, player_id, elem(arg, 0), elem(arg, 1))
        :release -> Screens.release(state.screens, screen_id, player_id)
        :open_pdf -> Screens.open_pdf(state.screens, screen_id, player_id, arg)
        :set_page -> Screens.set_page(state.screens, screen_id, player_id, arg)
      end

    case result do
      {:ok, screens, changed} ->
        changed = List.wrap(changed)
        Office.BrowserControl.close_ended(state.screens, changed)
        state = reset_annotations(state, changed)
        Enum.each(changed, &broadcast(state, "screen_update", %{screen: &1}))
        reply = Enum.find(changed, &(&1.id == screen_id))
        {:reply, {:ok, reply}, %{state | screens: screens}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call(:online, _from, state), do: {:reply, map_size(state.players), state}

  def handle_call({:screen_state, screen_id}, _from, state),
    do: {:reply, Map.get(state.screens, screen_id), state}

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

  def handle_call({:pong_join, player_id, table_id}, _from, state) do
    with %{} = pong <- state.pongs[table_id],
         {:ok, pong, side} <- Pong.join(pong, player_id, now()) do
      broadcast(state, "pong_state", %{pong: Pong.to_wire(pong)})
      {:reply, {:ok, side}, put_in(state.pongs[table_id], pong)}
    else
      nil -> {:reply, {:error, :unknown_prop}, state}
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:pong_leave, player_id, table_id}, _from, state) do
    case state.pongs[table_id] do
      nil ->
        {:reply, {:error, :unknown_prop}, state}

      pong ->
        pong = Pong.leave(pong, player_id, now())
        broadcast(state, "pong_state", %{pong: Pong.to_wire(pong)})
        {:reply, :ok, put_in(state.pongs[table_id], pong)}
    end
  end

  def handle_call({:dart_throw, player_id, board_id, u, v, from}, _from, state) do
    thrower = Map.fetch!(state.players, player_id)
    {darts, dart} = Darts.throw(Map.get(state.darts, board_id, []), board_id, player_id, u, v)
    broadcast(state, "dart", %{dart: dart, from: from})
    scores = Scores.add_points(state.scores, player_id, thrower.name, thrower.color, dart.points)
    scores = if dart.ring == "bull", do: Scores.medal(scores, player_id), else: scores
    broadcast(state, "scores", %{scores: Scores.top(scores)})
    {:reply, :ok, %{state | darts: Map.put(state.darts, board_id, darts), scores: scores}}
  end

  def handle_call({:annotate, player_id, screen_id, op, arg}, _from, state) do
    owner = get_in(state.screens, [screen_id, :owner])
    presenter? = owner == player_id
    a = state.annots

    cond do
      owner == nil ->
        {:reply, {:error, :unknown_screen}, state}

      op in [:add, :laser] and not presenter? and Annotations.locked?(a, screen_id) ->
        {:reply, {:error, :locked}, state}

      op == :settings and not presenter? ->
        {:reply, {:error, :not_owner}, state}

      true ->
        annotate(state, player_id, screen_id, op, arg, presenter?)
    end
  end

  def handle_call({:darts_clear, board_id}, _from, state) do
    broadcast(state, "darts_clear", %{boardId: board_id})
    {:reply, :ok, %{state | darts: Map.put(state.darts, board_id, [])}}
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
  def handle_cast({:pong_paddle, player_id, table_id, x}, state) do
    case state.pongs[table_id] do
      nil -> {:noreply, state}
      pong -> {:noreply, put_in(state.pongs[table_id], Pong.set_paddle(pong, player_id, x))}
    end
  end

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
    state = state |> tick_drill() |> tick_pongs()

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
        # The owner left the office: their shared-browser tabs end too.
        Office.BrowserControl.close_ended(state.screens, freed)
        state = reset_annotations(state, freed)

        pongs =
          Map.new(state.pongs, fn {id, pong} ->
            if player_id in [pong.a, pong.b] do
              pong = Pong.leave(pong, player_id, now())
              broadcast(state, "pong_state", %{pong: Pong.to_wire(pong)})
              {id, pong}
            else
              {id, pong}
            end
          end)

        state = %{state | pongs: pongs}
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

  def handle_info(:save, state), do: {:noreply, save(state)}

  @impl true
  def terminate(_reason, state) do
    save(state)
    :ok
  end

  # --- persistence

  # What a saved office keeps between visits. Busy appliances, screens, games in
  # progress and the fire drill are moments, not state.
  defp persisted(state) do
    %{
      props: Map.take(state.props, [:boards, :stickers, :vending, :jello]),
      scores: state.scores,
      darts: state.darts,
      chat: state.chat.messages
    }
  end

  defp save(%{saved?: false} = state), do: state

  defp save(state) do
    data = persisted(state)

    if data == state.persisted do
      state
    else
      case Office.SpaceStore.save(state.id, data) do
        :ok ->
          Office.Offices.touch(state.id)
          %{state | persisted: data}

        {:error, reason} ->
          Logger.error("saving office #{state.id} failed: #{inspect(reason)}")
          state
      end
    end
  end

  defp restore(state, nil), do: state

  defp restore(state, saved) do
    sp = Map.get(saved, :props, %{})
    props = state.props
    # Only what still exists in the level (it may have been edited since).
    vending =
      Map.merge(props.vending, Map.take(Map.get(sp, :vending, %{}), Map.keys(props.vending)))

    known = fn map -> Map.filter(map, fn {id, _} -> Map.has_key?(state.level.props, id) end) end

    props = %{
      props
      | boards: known.(Map.get(sp, :boards, %{})),
        stickers: known.(Map.get(sp, :stickers, %{})),
        jello:
          Map.filter(Map.get(sp, :jello, %{}), fn {id, _} ->
            Map.has_key?(state.level.desks, id)
          end),
        vending: vending
    }

    %{
      state
      | props: props,
        scores: Map.get(saved, :scores, state.scores),
        darts: known.(Map.get(saved, :darts, %{})),
        chat: %{state.chat | messages: Map.get(saved, :chat, [])}
    }
  end

  defp annotate(state, player_id, screen_id, op, arg, presenter?) do
    a = state.annots

    case op do
      :add ->
        case Annotations.add(a, screen_id, player_id, arg) do
          {:ok, a, stroke} ->
            broadcast(state, "annot_stroke", %{stroke: stroke})
            {:reply, :ok, %{state | annots: a}}

          {:error, reason} ->
            {:reply, {:error, reason}, state}
        end

      :undo ->
        {a, ids} = Annotations.undo(a, screen_id, player_id)
        if ids != [], do: broadcast(state, "annot_remove", %{screenId: screen_id, ids: ids})
        {:reply, :ok, %{state | annots: a}}

      :clear ->
        {a, ids} = Annotations.clear(a, screen_id, player_id, arg and presenter?)
        if ids != [], do: broadcast(state, "annot_remove", %{screenId: screen_id, ids: ids})
        {:reply, :ok, %{state | annots: a}}

      :settings ->
        {locked, spotlight, ctx} = arg

        case Annotations.set(a, screen_id, locked, spotlight, ctx) do
          {:ok, a, settings} ->
            broadcast(state, "annot_settings", %{settings: settings})
            {:reply, :ok, %{state | annots: a}}

          {:error, reason} ->
            {:reply, {:error, reason}, state}
        end

      :laser ->
        {x, y} = arg
        broadcast(state, "annot_laser", %{screenId: screen_id, id: player_id, x: x, y: y})
        {:reply, :ok, state}
    end
  end

  # New presenter / released screen: its drawings belonged to the old content.
  defp reset_annotations(state, changed) do
    Enum.reduce(changed, state, fn %{id: id, owner: owner, mode: mode}, acc ->
      old = Map.get(acc.screens, id, %{})

      if owner != old[:owner] or mode != old[:mode] or owner == nil do
        {annots, ids} = Annotations.reset(acc.annots, id)
        if ids != [], do: broadcast(acc, "annot_remove", %{screenId: id, ids: ids})
        broadcast(acc, "annot_settings", %{settings: Annotations.default_settings(id)})
        %{acc | annots: annots}
      else
        acc
      end
    end)
  end

  defp tick_pongs(state) do
    now = now()

    Enum.reduce(state.pongs, state, fn
      {_id, %{status: "idle"}}, acc ->
        acc

      {id, pong}, acc ->
        next = Pong.step(pong, @tick_ms / 1000, now)
        broadcast(acc, "pong_state", %{pong: Pong.to_wire(next)})
        acc = put_in(acc.pongs[id], next)

        # A finished game: the (human) winner gets a medal on the Office Olympics board.
        if pong.status != "won" and next.status == "won" and next.winner not in [nil, "bot"] do
          %{name: name, color: color} =
            Map.get(acc.players, next.winner, %{name: "?", color: "#888888"})

          scores =
            acc.scores
            |> Scores.add_points(next.winner, name, color, 0)
            |> Scores.medal(next.winner)

          broadcast(acc, "scores", %{scores: Scores.top(scores)})
          %{acc | scores: scores}
        else
          acc
        end
    end)
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
      pongs: state.pongs |> Map.values() |> Enum.map(&Pong.to_wire/1),
      darts: state.darts |> Map.values() |> List.flatten(),
      annotations: Annotations.snapshot(state.annots).annotations,
      annotSettings: Annotations.snapshot(state.annots).annotSettings,
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
