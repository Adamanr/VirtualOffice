defmodule OfficeWeb.SpaceChannel do
  @moduledoc """
  `space:<id>` channel. Every client event is whitelisted and type-checked
  against shared/protocol.json (Office.Protocol), rate limited, and then
  applied to the space process (Office.Space).
  """

  use OfficeWeb, :channel

  alias Office.{Auth, Chat, Level, LiveKit, Movement, Protocol, RateLimit, Screens, Space}
  alias OfficeWeb.Presence

  intercept ["chat"]

  @space_id ~r/\A[A-Za-z0-9_-]{1,64}\z/

  @impl true
  def join("space:" <> space_id, params, socket) do
    with true <- space_id =~ @space_id || {:error, :bad_params},
         {:ok, params} <- Protocol.validate_join(params),
         true <- params["color"] =~ ~r/\A#[0-9a-fA-F]{6}\z/ || {:error, :bad_params},
         {:ok, identity} <- Auth.authorize(params),
         {:ok, snapshot} <- Space.join(space_id, identity.player_id, identity.name, self()) do
      now = now_ms()

      socket =
        assign(socket,
          space_id: space_id,
          player_id: identity.player_id,
          name: identity.name,
          color: params["color"],
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
       Map.merge(snapshot, %{self: identity.player_id, serverTime: System.system_time(:millisecond)}),
       socket}
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

  defp handle_event("screen_claim", %{"screenId" => screen_id, "mode" => mode}, socket) do
    case Level.screen(Level.get(), screen_id) do
      nil ->
        {:reply, error(:unknown_screen), socket}

      screen ->
        if Screens.can_use?(screen, socket.assigns.zone, position(socket)) do
          case Space.claim_screen(socket.assigns.space_id, socket.assigns.player_id, screen_id, mode) do
            {:ok, screen} -> {:reply, {:ok, %{screen: screen}}, socket}
            {:error, reason} -> {:reply, error(reason), socket}
          end
        else
          {:reply, error(:too_far), socket}
        end
    end
  end

  defp handle_event("screen_release", %{"screenId" => screen_id}, socket) do
    result(Space.release_screen(socket.assigns.space_id, socket.assigns.player_id, screen_id), socket)
  end

  defp handle_event("pdf_open", %{"screenId" => id, "url" => url, "name" => name, "pages" => pages}, socket) do
    if url =~ ~r{\A/api/uploads/[A-Za-z0-9_-]+\.pdf\z} and pages in 1..1000 do
      pdf = %{url: url, name: String.slice(name, 0, 120), pages: pages}
      result(Space.open_pdf(socket.assigns.space_id, socket.assigns.player_id, id, pdf), socket)
    else
      {:reply, error(:bad_payload), socket}
    end
  end

  defp handle_event("pdf_page", %{"screenId" => id, "page" => page}, socket) do
    result(Space.set_pdf_page(socket.assigns.space_id, socket.assigns.player_id, id, page), socket)
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

  defp meta(socket) do
    %{
      name: socket.assigns.name,
      color: socket.assigns.color,
      zone: socket.assigns.zone,
      muted: socket.assigns.muted,
      cam: socket.assigns.cam,
      online_at: System.system_time(:second)
    }
  end

  defp result({:ok, _screen}, socket), do: {:reply, :ok, socket}
  defp result({:error, reason}, socket), do: {:reply, error(reason), socket}

  defp error(reason), do: {:error, %{reason: to_string(reason)}}

  defp now_ms, do: System.monotonic_time(:millisecond)
end
