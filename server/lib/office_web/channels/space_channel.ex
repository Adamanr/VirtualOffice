defmodule OfficeWeb.SpaceChannel do
  @moduledoc """
  `space:<id>` channel. Every client event is whitelisted and type-checked
  against shared/protocol.json (Office.Protocol), rate limited, and then
  applied to the space process (Office.Space).
  """

  use Phoenix.Channel, log_handle_in: false

  alias Office.{
    Auth,
    BrowserToken,
    Chat,
    Level,
    LiveKit,
    Movement,
    Protocol,
    RateLimit,
    Screens,
    Space,
    Toss
  }

  alias OfficeWeb.Presence

  intercept ["chat"]

  @space_id ~r/\A[A-Za-z0-9_-]{1,64}\z/
  # Character look (client/src/lib/look.ts): "1|skin|hair|…"; clients decode it defensively.
  @look ~r/\A[0-9a-z|]{0,160}\z/

  @impl true
  def join("space:" <> space_id, params, socket) do
    with true <- space_id =~ @space_id || {:error, :bad_params},
         {:ok, params} <- Protocol.validate_join(params),
         true <- params["color"] =~ ~r/\A#[0-9a-fA-F]{6}\z/ || {:error, :bad_params},
         true <- (params["look"] || "") =~ @look || {:error, :bad_params},
         {:ok, identity} <- Auth.authorize(params),
         {:ok, snapshot} <-
           Space.join(space_id, identity.player_id, identity.name, params["color"], self()) do
      now = now_ms()

      socket =
        assign(socket,
          space_id: space_id,
          player_id: identity.player_id,
          name: identity.name,
          color: params["color"],
          look: params["look"] || "",
          zone: nil,
          last: nil,
          muted: true,
          cam: false,
          move_bucket: RateLimit.new(20, 30, now),
          event_bucket: RateLimit.new(10, 20, now),
          chat_bucket: RateLimit.new(1, 5, now)
        )

      send(self(), :after_join)

      {:ok,
       Map.merge(snapshot, %{
         self: identity.player_id,
         serverTime: System.system_time(:millisecond)
       }), socket}
    else
      {:error, reason} -> {:error, %{reason: to_string(reason)}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    {:ok, _} = Presence.track(socket, socket.assigns.player_id, meta(socket))
    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  # Another channel took over this player id (client reconnected).
  def handle_info(:replaced, socket), do: {:stop, {:shutdown, :replaced}, socket}

  @impl true
  def handle_in(event, payload, socket) do
    with {:ok, payload} <- Protocol.validate(event, payload),
         {:ok, socket} <- limit(event, socket) do
      handle_event(event, payload, socket)
    else
      {:error, :rate_limited, socket} when event == "move" -> {:noreply, socket}
      {:error, :rate_limited, socket} -> {:reply, error(:rate_limited), socket}
      {:error, reason} -> {:reply, error(reason), socket}
    end
  end

  # --- events

  defp handle_event("move", %{"s" => s}, socket) do
    now = now_ms()

    with {:ok, next} <- Movement.parse(s),
         {:ok, next} <- Movement.check(socket.assigns.last, next, now, Level.get()) do
      Space.move(socket.assigns.space_id, socket.assigns.player_id, next)
      {x, _y, z, _r, _a} = next
      socket = assign(socket, last: {next, now}) |> update_zone(Level.zone_at(Level.get(), x, z))
      {:noreply, socket}
    else
      _rejected ->
        case socket.assigns.last do
          {last, _} -> push(socket, "correction", %{s: Movement.to_list(last)})
          nil -> :ok
        end

        {:noreply, socket}
    end
  end

  defp handle_event("media_state", %{"muted" => muted, "cam" => cam}, socket) do
    socket = assign(socket, muted: muted, cam: cam)
    Presence.update(socket, socket.assigns.player_id, meta(socket))
    {:noreply, socket}
  end

  defp handle_event("set_look", %{"look" => look}, socket) do
    if look =~ @look do
      socket = assign(socket, look: look)
      Presence.update(socket, socket.assigns.player_id, meta(socket))
      {:noreply, socket}
    else
      {:reply, error(:bad_payload), socket}
    end
  end

  defp handle_event("livekit_token", _payload, socket) do
    if LiveKit.enabled?() do
      %{space_id: space_id, player_id: id, name: name, color: color} = socket.assigns
      room = LiveKit.room_name(space_id)
      {:ok, token} = LiveKit.token(id, name, room, %{color: color})
      {:reply, {:ok, %{token: token, url: LiveKit.public_url(), room: room}}, socket}
    else
      {:reply, error(:livekit_disabled), socket}
    end
  end

  defp handle_event("screen_claim", %{"screenId" => screen_id, "mode" => mode} = payload, socket) do
    url = payload["url"]

    case Level.screen(Level.get(), screen_id) do
      nil ->
        {:reply, error(:unknown_screen), socket}

      _ when mode == "browser" and not is_binary(url) ->
        {:reply, error(:bad_payload), socket}

      screen ->
        cond do
          mode == "browser" and not BrowserToken.valid_url?(url) ->
            {:reply, error(:bad_payload), socket}

          not Screens.can_use?(screen, socket.assigns.zone, position(socket)) ->
            {:reply, error(:too_far), socket}

          true ->
            claim_screen(socket, screen_id, mode, url)
        end
    end
  end

  # Watching the shared browser on a screen you can see; only its owner drives it.
  defp handle_event("browser_token", %{"screenId" => screen_id}, socket) do
    %{space_id: space_id, player_id: me, zone: zone} = socket.assigns

    with %{} = screen <- Level.screen(Level.get(), screen_id),
         %{mode: "browser", owner: owner, url: url} when is_binary(owner) <-
           Space.screen_state(space_id, screen_id),
         true <- owner == me or Screens.can_see?(screen, zone, position(socket)) do
      control = owner == me
      token = BrowserToken.issue(screen_id, me, control, owner <> "|" <> url, url)
      {:reply, {:ok, %{token: token, control: control}}, socket}
    else
      false -> {:reply, error(:too_far), socket}
      _ -> {:reply, error(:unknown_screen), socket}
    end
  end

  defp handle_event("screen_release", %{"screenId" => screen_id}, socket) do
    result(
      Space.release_screen(socket.assigns.space_id, socket.assigns.player_id, screen_id),
      socket
    )
  end

  defp handle_event(
         "pdf_open",
         %{"screenId" => id, "url" => url, "name" => name, "pages" => pages},
         socket
       ) do
    if url =~ ~r{\A/api/uploads/[A-Za-z0-9_-]+\.pdf\z} and pages in 1..1000 do
      pdf = %{url: url, name: String.slice(name, 0, 120), pages: pages}
      result(Space.open_pdf(socket.assigns.space_id, socket.assigns.player_id, id, pdf), socket)
    else
      {:reply, error(:bad_payload), socket}
    end
  end

  defp handle_event("pdf_page", %{"screenId" => id, "page" => page}, socket) do
    result(
      Space.set_pdf_page(socket.assigns.space_id, socket.assigns.player_id, id, page),
      socket
    )
  end

  defp handle_event("chat_send", %{"scope" => scope, "text" => text}, socket) do
    %{player_id: id, name: name, zone: zone} = socket.assigns

    with {:ok, bucket} <- RateLimit.take(socket.assigns.chat_bucket, now_ms()),
         {:ok, msg} <- Chat.message(id, name, scope, zone, text) do
      :ok = Space.post_chat(socket.assigns.space_id, msg)
      {:noreply, assign(socket, chat_bucket: bucket)}
    else
      {:error, bucket} -> {:reply, error(:rate_limited), assign(socket, chat_bucket: bucket)}
      :error -> {:reply, error(:bad_payload), socket}
    end
  end

  defp handle_event("react", %{"emoji" => emoji}, socket) when emoji in 1..5 do
    broadcast!(socket, "reaction", %{id: socket.assigns.player_id, emoji: emoji})
    {:noreply, socket}
  end

  defp handle_event("react", _payload, socket), do: {:reply, error(:bad_payload), socket}

  defp handle_event(
         "board_stroke",
         %{"boardId" => board_id, "points" => points, "color" => color, "width" => width},
         socket
       ) do
    with :ok <- near_prop(socket, board_id) do
      result(
        Space.board_stroke(
          socket.assigns.space_id,
          socket.assigns.player_id,
          board_id,
          points,
          color,
          width
        ),
        socket
      )
    end
  end

  defp handle_event("board_clear", %{"boardId" => board_id}, socket) do
    with :ok <- near_prop(socket, board_id) do
      result(Space.board_clear(socket.assigns.space_id, board_id), socket)
    end
  end

  defp handle_event(
         "sticker_add",
         %{"boardId" => board_id, "url" => url, "x" => x, "y" => y, "rot" => rot},
         socket
       ) do
    with :ok <- near_prop(socket, board_id) do
      result(
        Space.sticker_add(
          socket.assigns.space_id,
          socket.assigns.player_id,
          board_id,
          url,
          x,
          y,
          rot
        ),
        socket
      )
    end
  end

  defp handle_event("sticker_remove", %{"boardId" => board_id, "stickerId" => sticker_id}, socket) do
    with :ok <- near_prop(socket, board_id) do
      result(Space.sticker_remove(socket.assigns.space_id, board_id, sticker_id), socket)
    end
  end

  defp handle_event(
         "sticker_move",
         %{"boardId" => board_id, "stickerId" => sticker_id, "x" => x, "y" => y},
         socket
       ) do
    with :ok <- near_prop(socket, board_id) do
      result(Space.sticker_move(socket.assigns.space_id, board_id, sticker_id, x, y), socket)
    end
  end

  defp handle_event("prop_use", %{"propId" => prop_id, "action" => action} = payload, socket) do
    with :ok <- near_prop(socket, prop_id) do
      case Space.prop_use(
             socket.assigns.space_id,
             socket.assigns.player_id,
             prop_id,
             action,
             payload["item"]
           ) do
        {:ok, prop} -> {:reply, {:ok, %{prop: prop}}, socket}
        {:error, reason} -> {:reply, error(reason), socket}
      end
    end
  end

  # Paper basketball: one throw per 0.6 s, from where you stand.
  defp handle_event("toss", %{"origin" => origin, "vel" => vel}, socket) do
    now = now_ms()

    cond do
      (last = socket.assigns[:last_toss]) && now - last < 600 ->
        {:reply, error(:rate_limited), socket}

      not Toss.valid?(origin, vel, position(socket)) ->
        {:reply, error(:bad_payload), socket}

      true ->
        :ok = Space.toss(socket.assigns.space_id, socket.assigns.player_id, origin, vel)
        {:noreply, assign(socket, last_toss: now)}
    end
  end

  defp handle_event("alarm_pull", %{"propId" => prop_id}, socket) do
    with :ok <- near_prop(socket, prop_id),
         %{type: "fire_alarm"} <-
           Level.prop(Level.get(), prop_id) || {:reply, error(:unknown_prop), socket} do
      result(Space.pull_alarm(socket.assigns.space_id, socket.assigns.player_id), socket)
    else
      %{} -> {:reply, error(:unknown_prop), socket}
      reply -> reply
    end
  end

  defp handle_event("pong_join", %{"tableId" => id}, socket) do
    with :ok <- near_prop(socket, id) do
      case Space.pong_join(socket.assigns.space_id, socket.assigns.player_id, id) do
        {:ok, side} -> {:reply, {:ok, %{side: side}}, socket}
        {:error, reason} -> {:reply, error(reason), socket}
      end
    end
  end

  defp handle_event("pong_leave", %{"tableId" => id}, socket),
    do: result(Space.pong_leave(socket.assigns.space_id, socket.assigns.player_id, id), socket)

  defp handle_event("pong_paddle", %{"tableId" => id, "x" => x}, socket) do
    Space.pong_paddle(socket.assigns.space_id, socket.assigns.player_id, id, x)
    {:noreply, socket}
  end

  defp handle_event("dart_throw", %{"boardId" => id, "u" => u, "v" => v}, socket) do
    now = now_ms()

    with :ok <- near_prop(socket, id),
         true <- (abs(u) <= 1.5 and abs(v) <= 1.5) || {:reply, error(:bad_payload), socket},
         true <-
           now - (socket.assigns[:last_dart] || now - 1_000) >= 700 ||
             {:reply, error(:rate_limited), socket} do
      {x, z} = position(socket)

      :ok =
        Space.dart_throw(socket.assigns.space_id, socket.assigns.player_id, id, u, v, [x, 1.6, z])

      {:noreply, assign(socket, last_dart: now)}
    end
  end

  defp handle_event("darts_clear", %{"boardId" => id}, socket) do
    with :ok <- near_prop(socket, id),
         do: result(Space.darts_clear(socket.assigns.space_id, id), socket)
  end

  # Piano: notes go straight to everyone (no state), with their own rate limit.
  defp handle_event("note", %{"propId" => id, "midi" => midi}, socket) when midi in 36..96 do
    with :ok <- near_prop(socket, id),
         {:ok, bucket} <-
           RateLimit.take(
             socket.assigns[:note_bucket] || RateLimit.new(14, 24, now_ms()),
             now_ms()
           ) do
      broadcast!(socket, "note", %{id: socket.assigns.player_id, propId: id, midi: midi})
      {:noreply, assign(socket, note_bucket: bucket)}
    else
      {:error, bucket} -> {:noreply, assign(socket, note_bucket: bucket)}
      reply -> reply
    end
  end

  defp handle_event("note", _payload, socket), do: {:reply, error(:bad_payload), socket}

  defp handle_event("annot_stroke", %{"screenId" => id} = payload, socket),
    do: annotate(socket, id, :add, payload)

  defp handle_event("annot_undo", %{"screenId" => id}, socket),
    do: annotate(socket, id, :undo, nil)

  defp handle_event("annot_clear", %{"screenId" => id, "all" => all}, socket),
    do: annotate(socket, id, :clear, all)

  defp handle_event(
         "annot_settings",
         %{"screenId" => id, "locked" => locked, "spotlight" => spot, "ctx" => ctx},
         socket
       ),
       do: annotate(socket, id, :settings, {locked, spot, ctx})

  # The laser pointer: ~20 updates/s, its own budget, no reply.
  defp handle_event("annot_laser", %{"screenId" => id, "x" => x, "y" => y}, socket) do
    case RateLimit.take(
           socket.assigns[:laser_bucket] || RateLimit.new(25, 40, now_ms()),
           now_ms()
         ) do
      {:ok, bucket} ->
        x = x |> max(0) |> min(1)
        y = y |> max(0) |> min(1)
        socket = assign(socket, laser_bucket: bucket)

        case annotate(socket, id, :laser, {x, y}) do
          {:reply, _error, socket} -> {:noreply, socket}
          other -> other
        end

      {:error, bucket} ->
        {:noreply, assign(socket, laser_bucket: bucket)}
    end
  end

  defp handle_event("prank", %{"deskId" => desk_id}, socket) do
    with %{position: {dx, dz}} <-
           Level.get().desks[desk_id] || {:reply, error(:unknown_prop), socket},
         {x, z} <- position(socket) || {:reply, error(:too_far), socket},
         true <-
           :math.sqrt((x - dx) ** 2 + (z - dz) ** 2) <= 2.2 || {:reply, error(:too_far), socket} do
      result(Space.prank(socket.assigns.space_id, socket.assigns.player_id, desk_id), socket)
    end
  end

  # Zone-local chat only reaches players currently in that zone.
  @impl true
  def handle_out("chat", %{msg: %{scope: "zone", zone: zone}} = payload, socket) do
    if zone == socket.assigns.zone, do: push(socket, "chat", payload)
    {:noreply, socket}
  end

  def handle_out("chat", payload, socket) do
    push(socket, "chat", payload)
    {:noreply, socket}
  end

  # --- helpers

  # Only people who can see a screen draw on it.
  defp annotate(socket, screen_id, op, arg) do
    %{space_id: space_id, player_id: me, zone: zone} = socket.assigns

    case Level.screen(Level.get(), screen_id) do
      nil ->
        {:reply, error(:unknown_screen), socket}

      screen ->
        if Screens.can_see?(screen, zone, position(socket)) do
          result(Space.annotate(space_id, me, screen_id, op, arg), socket)
        else
          {:reply, error(:too_far), socket}
        end
    end
  end

  defp claim_screen(socket, screen_id, mode, url) do
    %{space_id: space_id, player_id: me} = socket.assigns

    case Space.claim_screen(space_id, me, screen_id, mode, url) do
      {:ok, screen} -> {:reply, {:ok, %{screen: screen}}, socket}
      {:error, reason} -> {:reply, error(reason), socket}
    end
  end

  defp limit("move", socket) do
    case RateLimit.take(socket.assigns.move_bucket, now_ms()) do
      {:ok, b} -> {:ok, assign(socket, move_bucket: b)}
      {:error, b} -> {:error, :rate_limited, assign(socket, move_bucket: b)}
    end
  end

  defp limit(_event, socket) do
    case RateLimit.take(socket.assigns.event_bucket, now_ms()) do
      {:ok, b} -> {:ok, assign(socket, event_bucket: b)}
      {:error, b} -> {:error, :rate_limited, assign(socket, event_bucket: b)}
    end
  end

  defp update_zone(%{assigns: %{zone: zone}} = socket, zone), do: socket

  defp update_zone(socket, zone) do
    socket = assign(socket, zone: zone)
    Presence.update(socket, socket.assigns.player_id, meta(socket))
    socket
  end

  defp position(%{assigns: %{last: {{x, _y, z, _r, _a}, _}}}), do: {x, z}
  defp position(_socket), do: nil

  defp near_prop(socket, prop_id) do
    case Level.prop(Level.get(), prop_id) do
      nil ->
        {:reply, error(:unknown_prop), socket}

      %{position: {px, pz}, zone_id: zone_id} ->
        same_zone = zone_id == nil or zone_id == socket.assigns.zone

        case position(socket) do
          {x, z} when same_zone ->
            if :math.sqrt((x - px) ** 2 + (z - pz) ** 2) <= 2.5 do
              :ok
            else
              {:reply, error(:too_far), socket}
            end

          _ ->
            {:reply, error(:too_far), socket}
        end
    end
  end

  defp meta(socket) do
    %{
      name: socket.assigns.name,
      color: socket.assigns.color,
      zone: socket.assigns.zone,
      muted: socket.assigns.muted,
      cam: socket.assigns.cam,
      look: socket.assigns.look,
      online_at: System.system_time(:second)
    }
  end

  defp result(:ok, socket), do: {:reply, :ok, socket}
  defp result({:ok, _}, socket), do: {:reply, :ok, socket}
  defp result({:error, reason}, socket), do: {:reply, error(reason), socket}

  defp error(reason), do: {:error, %{reason: to_string(reason)}}

  defp now_ms, do: System.monotonic_time(:millisecond)
end
