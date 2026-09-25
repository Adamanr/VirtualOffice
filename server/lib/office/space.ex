defmodule Office.Space do
  @moduledoc """
  One process per space: player states, screen occupancy and chat history,
  all in memory. Channel processes push validated updates here; the space
  broadcasts changed player states as one `batch` message per tick (~15 Hz)
  and frees a player's screens when their channel process goes down.
  """

  use GenServer, restart: :transient

  alias Office.{Chat, Level, Screens}

  @tick_ms 66
  @idle_shutdown_ms 60_000

  # --- API

  def start_link(space_id), do: GenServer.start_link(__MODULE__, space_id, name: via(space_id))

  defp via(space_id), do: {:via, Registry, {Office.SpaceRegistry, space_id}}

  def topic(space_id), do: "space:" <> space_id

  @doc "Joins `pid` (a channel process) as `player_id`. Returns a snapshot of the space."
  def join(space_id, player_id, name, pid), do: call(space_id, {:join, player_id, name, pid})

  def move(space_id, player_id, state), do: GenServer.cast(via(space_id), {:move, player_id, state})

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
       chat: Chat.new(),
       idle_timer: schedule_idle(nil)
     }}
  end

  @impl true
  def handle_call({:join, player_id, name, pid}, _from, state) do
    max = Application.get_env(:office, :max_players_per_space, 30)

    case Map.fetch(state.players, player_id) do
      {:ok, old} ->
        # Reconnect: the new channel replaces a stale one (e.g. dropped network).
        Process.demonitor(old.ref, [:flush])
        if old.pid != pid, do: send(old.pid, :replaced)
        player = %{old | pid: pid, ref: Process.monitor(pid), name: name}
        {:reply, {:ok, snapshot(state, player_id)}, put_in(state.players[player_id], player)}

      :error when map_size(state.players) >= max ->
        {:reply, {:error, :full}, state}

      :error ->
        player = %{pid: pid, ref: Process.monitor(pid), name: name, state: nil, dirty: false}
        state = %{state | players: Map.put(state.players, player_id, player), idle_timer: cancel_idle(state.idle_timer)}
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

  def handle_call({:history, zone}, _from, state), do: {:reply, Chat.history(state.chat, zone), state}

  @impl true
  def handle_cast({:move, player_id, player_state}, state) do
    case Map.fetch(state.players, player_id) do
      {:ok, p} -> {:noreply, put_in(state.players[player_id], %{p | state: player_state, dirty: true})}
      :error -> {:noreply, state}
    end
  end

  @impl true
  def handle_info(:tick, state) do
    dirty = for {id, %{dirty: true, state: {x, y, z, r, a}}} <- state.players, do: [id, x, y, z, r, a]

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

  defp snapshot(state, self_id) do
    %{
      players:
        for({id, %{state: s}} <- state.players, id != self_id, s != nil, do: %{id: id, s: Office.Movement.to_list(s)}),
      screens: Screens.active(state.screens),
      chat: Chat.history(state.chat, nil)
    }
  end

  defp broadcast(state, event, payload), do: OfficeWeb.Endpoint.broadcast(topic(state.id), event, payload)

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
