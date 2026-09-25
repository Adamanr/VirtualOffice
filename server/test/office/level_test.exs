defmodule Office.LevelTest do
  use ExUnit.Case, async: true
  alias Office.Level

  setup_all do
    {:ok, level: Level.get()}
  end

  test "resolves zones in file order (rooms before the open space)", %{level: level} do
    assert Level.zone_at(level, -15, -9) == "meeting_room_1"
    assert Level.zone_at(level, -5, -9) == "meeting_room_2"
    assert Level.zone_at(level, 12, -5) == "hall"
    assert Level.zone_at(level, 12, 10) == "kitchen"
    assert Level.zone_at(level, -8, 6) == "open_space"
    assert Level.zone_at(level, 100, 0) == nil
  end

  test "isolated flags", %{level: level} do
    assert Level.zone(level, "meeting_room_1").isolated
    refute Level.zone(level, "open_space").isolated
  end

  test "bounds with margin", %{level: level} do
    assert Level.in_bounds?(level, 20.5, 0)
    refute Level.in_bounds?(level, 25, 0)
  end

  test "screens and desks are loaded", %{level: level} do
    assert %{kind: "wall", zone_id: "hall"} = Level.screen(level, "hall_screen")
    assert %{kind: "desk"} = Level.screen(level, "desk_01_monitor")
    assert map_size(level.desks) == 24
  end
end
