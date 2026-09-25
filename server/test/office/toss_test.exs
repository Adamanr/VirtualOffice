defmodule Office.TossTest do
  use ExUnit.Case, async: true
  alias Office.Toss

  @bounds {{-20.0, -15.0}, {20.0, 15.0}}
  @bin %{id: "bin_1", position: {0.0, 0.0}}

  # Velocity that lands a lob from `from` (at height h) exactly on `to` after `t` seconds.
  defp aim({fx, h, fz}, {tx, ty, tz}, t) do
    {(tx - fx) / t, (ty - h + 4.905 * t * t) / t, (tz - fz) / t}
  end

  test "a lob into the bin scores two points" do
    origin = {2.0, 1.4, 0.0}
    r = Toss.simulate(origin, aim(origin, {0.0, 0.3, 0.0}, 1.0), [@bin], [], @bounds)
    assert %{hit: "bin", target: "bin_1", points: 2} = r
  end

  test "from 6 m and beyond it's a three-pointer" do
    origin = {7.0, 1.4, 0.0}
    r = Toss.simulate(origin, aim(origin, {0.0, 0.3, 0.0}, 1.3), [@bin], [], @bounds)
    assert %{hit: "bin", points: 3} = r
  end

  test "a miss lands on the floor" do
    origin = {2.0, 1.4, 0.0}
    r = Toss.simulate(origin, aim(origin, {0.8, 0.05, 0.8}, 1.0), [@bin], [], @bounds)
    assert %{hit: nil, points: 0, land: [_, y, _]} = r
    assert y <= 0.06
    assert_in_delta r.flight, 1.0, 0.1
  end

  test "hitting a colleague's head is a bonk" do
    origin = {0.0, 1.5, 0.0}

    r =
      Toss.simulate(origin, {3.0, 2.5, 0.0}, [], [%{id: "dwight", position: {1.5, 0.0}}], @bounds)

    assert %{hit: "player", target: "dwight", points: 0} = r
  end

  test "a throw into the outer wall drops to the floor inside" do
    r = Toss.simulate({19.0, 1.4, 0.0}, {6.0, 3.0, 0.0}, [], [], @bounds)
    assert %{hit: nil, land: [x, 0.05, _]} = r
    assert x < 20
  end

  test "validates throw origin and speed" do
    assert Toss.valid?([0, 1.4, 0], [3, 3, 0], {0.5, 0.0})
    refute Toss.valid?([5, 1.4, 0], [3, 3, 0], {0.0, 0.0})
    refute Toss.valid?([0, 1.4, 0], [30, 0, 0], {0.0, 0.0})
    refute Toss.valid?([0, 1.4, 0], [3, 3, 0], nil)
  end
end
