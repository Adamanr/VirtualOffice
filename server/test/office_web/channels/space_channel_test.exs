defmodule OfficeWeb.SpaceChannelTest do
  use OfficeWeb.ChannelCase

  defp join_as(space, id, name \\ "Tester") do
    {:ok, reply, socket} =
      OfficeWeb.UserSocket
      |> socket()
      |> subscribe_and_join(OfficeWeb.SpaceChannel, "space:" <> space, %{
        "playerId" => id,
        "name" => name,
        "color" => "#4f8cff"
      })

    {reply, socket}
  end

  defp space, do: "test-#{System.unique_integer([:positive])}"

  test "rejects bad join params" do
    assert {:error, %{reason: "bad_params"}} =
             OfficeWeb.UserSocket
             |> socket()
             |> subscribe_and_join(OfficeWeb.SpaceChannel, "space:x", %{
               "playerId" => "short",
               "name" => "A",
               "color" => "#fff"
             })
  end

  test "join returns a snapshot and moves are broadcast in batches" do
    s = space()
    {%{self: "player-aaaa", players: []}, a} = join_as(s, "player-aaaa")
    push(a, "move", %{"s" => [2, 0, 12, 0, 1]})
    assert_broadcast "batch", %{p: [["player-aaaa", 2.0, +0.0, 12.0, +0.0, 1]]}, 500

    {%{players: [%{id: "player-aaaa"}]}, _b} = join_as(s, "player-bbbb")
  end

  test "impossible moves are corrected" do
    {_, a} = join_as(space(), "player-aaaa")
    push(a, "move", %{"s" => [2, 0, 12, 0, 1]})
    push(a, "move", %{"s" => [-15, 0, -9, 0, 1]})
    assert_push "correction", %{s: [2.0, +0.0, 12.0, +0.0, 1]}
  end

  test "unknown events are rejected" do
    {_, a} = join_as(space(), "player-aaaa")
    ref = push(a, "drop_tables", %{})
    assert_reply ref, :error, %{reason: "unknown_event"}
  end

  test "screen occupancy through the channel; freed when the owner leaves" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    {_, b} = join_as(s, "player-bbbb")
    for sock <- [a, b], do: push(sock, "move", %{"s" => [12, 0, -5, 0, 0]})
    Process.sleep(20)

    ref = push(a, "screen_claim", %{"screenId" => "hall_screen", "mode" => "share"})
    assert_reply ref, :ok, %{screen: %{owner: "player-aaaa"}}
    ref = push(b, "screen_claim", %{"screenId" => "hall_screen", "mode" => "share"})
    assert_reply ref, :error, %{reason: "busy"}

    Process.unlink(a.channel_pid)
    close(a)
    assert_broadcast "screen_update", %{screen: %{id: "hall_screen", owner: nil}}, 1000
  end

  test "screens outside your zone are too far" do
    {_, a} = join_as(space(), "player-aaaa")
    push(a, "move", %{"s" => [2, 0, 12, 0, 0]})
    ref = push(a, "screen_claim", %{"screenId" => "hall_screen", "mode" => "share"})
    assert_reply ref, :error, %{reason: "too_far"}
  end

  test "zone chat is only delivered inside the zone" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    {_, b} = join_as(s, "player-bbbb")
    push(a, "move", %{"s" => [12, 0, 10, 0, 0]})
    push(b, "move", %{"s" => [-8, 0, 6, 0, 0]})
    Process.sleep(20)
    push(a, "chat_send", %{"scope" => "zone", "text" => "kitchen only"})
    push(a, "chat_send", %{"scope" => "global", "text" => "everyone"})

    assert_push "chat", %{msg: %{text: "kitchen only", zone: "kitchen"}}
    assert_push "chat", %{msg: %{text: "everyone"}}
    # b is subscribed through the same test process; zone message is pushed exactly once (to a)
    refute_push "chat", %{msg: %{text: "kitchen only"}}
  end

  test "livekit token is a signed JWT for the space room" do
    {_, a} = join_as(space(), "player-aaaa")
    ref = push(a, "livekit_token", %{})
    assert_reply ref, :ok, %{token: token, room: "space-" <> _}
    [_, claims, _] = String.split(token, ".")
    claims = claims |> Base.url_decode64!(padding: false) |> Jason.decode!()
    assert %{"sub" => "player-aaaa", "video" => %{"roomJoin" => true}} = claims
  end

  test "join snapshot includes boards stickers and props" do
    {%{boards: boards, stickers: stickers, props: props}, _} = join_as(space(), "player-aaaa")
    assert is_list(boards)
    assert is_list(stickers)
    assert is_list(props)
  end

  test "whiteboard stroke syncs and unknown prop is rejected" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    # Open space whiteboard near -19.88, 7.75
    push(a, "move", %{"s" => [-19, 0, 7.5, 0, 0]})
    Process.sleep(20)

    board_id =
      Office.Level.get().props
      |> Enum.find_value(fn {id, p} -> if p.type == "whiteboard", do: id end)

    assert board_id

    ref =
      push(a, "board_stroke", %{
        "boardId" => board_id,
        "points" => [0.1, 0.1, 0.5, 0.5],
        "color" => "#1d4ed8",
        "width" => 0.01
      })

    assert_reply ref, :ok
    assert_broadcast "board_stroke", %{stroke: %{boardId: ^board_id}}, 500

    ref =
      push(a, "board_stroke", %{
        "boardId" => "prop_99999",
        "points" => [0, 0, 1, 1],
        "color" => "#000000",
        "width" => 0.01
      })

    assert_reply ref, :error, %{reason: "unknown_prop"}
  end

  test "vending buy updates prop state" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    # Kitchen vending ~6.3, 5.5
    push(a, "move", %{"s" => [6.3, 0, 5.5, 0, 0]})
    Process.sleep(20)

    prop_id =
      Office.Level.get().props
      |> Enum.find_value(fn {id, p} -> if p.type == "vending_machine", do: id end)

    ref = push(a, "prop_use", %{"propId" => prop_id, "action" => "buy", "item" => "чипсы"})
    assert_reply ref, :ok, %{prop: %{id: ^prop_id, lastItem: "чипсы"}}

    assert_broadcast "prop_event",
                     %{
                       prop: %{id: ^prop_id},
                       fx: %{propId: ^prop_id, by: "player-aaaa", action: "buy"}
                     },
                     500
  end

  test "paper ball tossed into a bin scores and is broadcast to everyone" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    {bx, bz} = hd(Office.Level.get().bins).position
    push(a, "move", %{"s" => [bx + 2, 0, bz, 0, 0]})
    Process.sleep(20)
    # Lob from 1.4 m, 2 m away: it crosses the rim height (0.42 m) after ~1.08 s.
    ref = push(a, "toss", %{"origin" => [bx + 2, 1.4, bz], "vel" => [-1.85, 4.4, 0.0]})
    assert_broadcast "toss", %{toss: %{hit: "bin", points: 2, by: "player-aaaa"}}, 500
    assert_broadcast "scores", %{scores: [%{id: "player-aaaa", points: 2, shots: 1}]}, 500
    refute_reply ref, :error, _
  end

  test "throws from far away are rejected" do
    {_, a} = join_as(space(), "player-aaaa")
    push(a, "move", %{"s" => [2, 0, 12, 0, 0]})
    Process.sleep(20)
    ref = push(a, "toss", %{"origin" => [-10, 1.4, 0], "vel" => [1, 1, 1]})
    assert_reply ref, :error, %{reason: "bad_payload"}
  end

  test "pulling the fire alarm starts a drill for everyone; reaching the assembly point counts" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")

    {alarm_id, %{position: {ax, az}}} =
      Enum.find(Office.Level.get().props, fn {_, p} ->
        p.type == "fire_alarm" and p.zone_id == "open_space"
      end)

    push(a, "move", %{"s" => [ax + 0.8, 0, az, 0, 0]})
    Process.sleep(20)
    ref = push(a, "alarm_pull", %{"propId" => alarm_id})
    assert_reply ref, :ok
    assert_broadcast "drill", %{drill: %{active: true, by: "player-aaaa"}}, 500

    ref = push(a, "alarm_pull", %{"propId" => alarm_id})
    assert_reply ref, :error, %{reason: "busy"}

    # Walk (slowly enough for the speed check) is skipped: reconnect-style fresh position.
    {_, b} = join_as(s, "player-bbbb")
    %{position: {px, pz}} = Office.Level.get().assembly
    push(b, "move", %{"s" => [px, 0, pz, 0, 0]})
    assert_broadcast "drill", %{drill: %{evacuated: [%{id: "player-bbbb"}]}}, 1000
  end

  test "stapler in jello toggles for everyone" do
    s = space()
    {_, a} = join_as(s, "player-aaaa")
    {desk_id, %{position: {dx, dz}}} = Enum.at(Office.Level.get().desks, 0)
    push(a, "move", %{"s" => [dx, 0, dz - 1.0, 0, 0]})
    Process.sleep(20)
    push(a, "prank", %{"deskId" => desk_id})
    assert_broadcast "desk_update", %{deskId: ^desk_id, jello: true, by: "player-aaaa"}, 500
    push(a, "prank", %{"deskId" => desk_id})
    assert_broadcast "desk_update", %{deskId: ^desk_id, jello: false}, 500
    {%{jellos: []}, _} = join_as(s, "player-cccc")
  end
end
