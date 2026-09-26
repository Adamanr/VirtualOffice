defmodule Office.PongTest do
  use ExUnit.Case, async: true
  alias Office.Pong

  defp playing(ball, extra \\ %{}) do
    {:ok, p, "a"} = Pong.join(Pong.new("t"), "jim", 0)
    {:ok, p, "b"} = Pong.join(p, "dwight", 0)
    Map.merge(%{p | status: "playing", ball: ball}, extra)
  end

  test "a lone player gets the bot; a second player replaces it; both leaving resets" do
    {:ok, p, "a"} = Pong.join(Pong.new("t"), "jim", 0)
    assert p.b == "bot" and p.status == "point"
    {:ok, p, "b"} = Pong.join(p, "pam", 0)
    assert {:error, :busy} = Pong.join(p, "dwight", 0)
    p = Pong.leave(p, "pam", 0)
    assert p.b == "bot"
    assert Pong.leave(p, "jim", 0).status == "idle"
  end

  test "serves after the pause" do
    {:ok, p, _} = Pong.join(Pong.new("t"), "jim", 0)
    assert Pong.step(p, 0.066, 1000).status == "point"
    assert %{status: "playing", ball: [_, _, _, vz]} = Pong.step(p, 0.066, 2000, fn -> 0.5 end)
    assert vz > 0
  end

  test "the paddle returns the ball faster, with spin from where it hit" do
    p = playing([0.1, -1.3, 0.0, -3.0], %{pa: 0.0})
    p = Pong.step(p, 0.066, 100)
    assert %{status: "playing", ball: [_, _, vx, vz]} = p
    assert vz > 3.0
    assert vx > 0
  end

  test "missing the ball gives the point to the other side" do
    p = playing([0.6, -1.3, 0.0, -3.0], %{pa: -0.5})
    p = Pong.step(p, 0.066, 100)
    assert %{status: "point", sb: 1, sa: 0} = p
  end

  test "side walls bounce" do
    p = playing([0.75, 0.0, 1.0, 0.5])
    %{ball: [x, _, vx, _]} = Pong.step(p, 0.066, 100)
    assert x <= 0.7625 and vx < 0
  end

  test "first to 11 by two wins" do
    p = playing([0.6, -1.3, 0.0, -3.0], %{pa: -0.5, sb: 10, sa: 3})
    assert %{status: "won", winner: "dwight"} = Pong.step(p, 0.066, 100)
    p = playing([0.6, -1.3, 0.0, -3.0], %{pa: -0.5, sb: 10, sa: 10})
    assert %{status: "point", sb: 11} = Pong.step(p, 0.066, 100)
  end

  test "paddles are clamped to the table and only move for their owner" do
    {:ok, p, _} = Pong.join(Pong.new("t"), "jim", 0)
    assert Pong.set_paddle(p, "jim", 5).pa == 0.7625
    assert Pong.set_paddle(p, "stranger", 0.3).pa == 0.0
  end
end
