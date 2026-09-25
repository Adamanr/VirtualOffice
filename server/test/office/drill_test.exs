defmodule Office.DrillTest do
  use ExUnit.Case, async: true
  alias Office.{Drill, Scores}

  @assembly %{position: {10.0, 0.0}, radius: 2.0}

  test "pull starts a drill; a second pull is busy; after it ends there is a cooldown" do
    {:ok, d} = Drill.pull(Drill.new(), "michael", "Майкл", 1_000)
    assert d.active and d.byName == "Майкл"
    assert {:error, :busy} = Drill.pull(d, "dwight", "Дуайт", 2_000)

    {:finished, d} = Drill.tick(d, %{}, @assembly, d.endsAt)
    refute d.active
    assert {:error, :cooldown} = Drill.pull(d, "dwight", "Дуайт", d.endsAt + 1)
    assert {:ok, _} = Drill.pull(d, "dwight", "Дуайт", d.cooldownUntil)
  end

  test "records who reached the assembly point and when; finishes when everyone is out" do
    {:ok, d} = Drill.pull(Drill.new(), "michael", "Майкл", 0)

    players = %{
      "jim" => %{name: "Джим", position: {10.5, 0.0}},
      "pam" => %{name: "Пэм", position: {0.0, 0.0}}
    }

    {:updated, d} = Drill.tick(d, players, @assembly, 5_000)
    assert [%{id: "jim", ms: 5_000}] = d.evacuated
    {:unchanged, d} = Drill.tick(d, players, @assembly, 6_000)

    players = put_in(players["pam"].position, {9.0, 1.0})
    {:finished, d} = Drill.tick(d, players, @assembly, 9_000)
    assert [%{id: "jim"}, %{id: "pam", ms: 9_000}] = d.evacuated
  end

  test "the fastest evacuee gets a medal and best times are kept" do
    profiles = %{
      "jim" => %{name: "Джим", color: "#fff000"},
      "pam" => %{name: "Пэм", color: "#000fff"}
    }

    s =
      Scores.drill_results(
        Scores.new(),
        [%{id: "jim", ms: 4_000}, %{id: "pam", ms: 7_000}],
        profiles
      )

    s = Scores.drill_results(s, [%{id: "pam", ms: 3_000}, %{id: "jim", ms: 9_000}], profiles)
    assert %{drillMs: 4_000, medals: 1} = s["jim"]
    assert %{drillMs: 3_000, medals: 1} = s["pam"]
  end
end
