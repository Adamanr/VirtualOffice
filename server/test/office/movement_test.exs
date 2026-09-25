defmodule Office.MovementTest do
  use ExUnit.Case, async: true
  alias Office.{Level, Movement}

  setup_all do
    {:ok, level: Level.get()}
  end

  test "parse validates shape and anim" do
    assert {:ok, {1.0, +0.0, 2.0, 0.5, 1}} = Movement.parse([1, 0, 2, 0.5, 1])
    assert :error = Movement.parse([1, 0, 2, 0.5, 9])
    assert :error = Movement.parse([1, 0, 2])
  end

  test "first update anywhere in bounds is accepted", %{level: level} do
    assert {:ok, _} = Movement.check(nil, {2.0, 0.0, 12.0, 0.0, 0}, 0, level)
    assert {:reject, :out_of_bounds} = Movement.check(nil, {200.0, 0.0, 0.0, 0.0, 0}, 0, level)
  end

  test "rejects teleports faster than running speed", %{level: level} do
    prev = {{0.0, 0.0, 0.0, 0.0, 0}, 1000}
    # 0.4 m in 66 ms: a normal running step
    assert {:ok, _} = Movement.check(prev, {0.4, 0.0, 0.0, 0.0, 2}, 1066, level)
    # 10 m in 100 ms
    assert {:reject, :too_fast} = Movement.check(prev, {10.0, 0.0, 0.0, 0.0, 2}, 1100, level)
    # 10 m in 2 s is fine (e.g. after a network stall)
    assert {:ok, _} = Movement.check(prev, {10.0, 0.0, 0.0, 0.0, 2}, 3000, level)
  end

  test "normalizes rotation", %{level: level} do
    {:ok, {_, _, _, r, _}} = Movement.check(nil, {0.0, 0.0, 0.0, 3 * :math.pi(), 0}, 0, level)
    assert_in_delta abs(r), :math.pi(), 0.01
  end
end
