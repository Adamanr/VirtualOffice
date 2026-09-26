defmodule Office.DartsTest do
  use ExUnit.Case, async: true
  alias Office.Darts

  test "scores like a real board" do
    assert {50, "bull"} = Darts.score(0.0, 0.0)
    assert {25, "outer_bull"} = Darts.score(0.0, 0.07)
    assert {20, "single"} = Darts.score(0.0, 0.4)
    assert {60, "treble"} = Darts.score(0.0, 103 / 170)
    assert {40, "double"} = Darts.score(0.0, 166 / 170)
    assert {6, "single"} = Darts.score(0.4, 0.0)
    assert {3, "single"} = Darts.score(0.0, -0.4)
    assert {11, "single"} = Darts.score(-0.4, 0.0)
    assert {0, "miss"} = Darts.score(0.0, 1.1)
  end

  test "throws scatter a little, stick in the board, and the board keeps the last 30" do
    {darts, dart} = Darts.throw([], "b1", "jim", 0.0, 0.0, fn -> 0.5 end)
    assert %{points: 50, by: "jim", boardId: "b1"} = dart

    darts =
      Enum.reduce(1..40, darts, fn _, acc -> elem(Darts.throw(acc, "b1", "jim", 0.0, 0.5), 0) end)

    assert length(darts) == 30
  end
end
