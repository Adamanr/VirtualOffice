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
end
