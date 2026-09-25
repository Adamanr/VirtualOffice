defmodule Office.ScreensTest do
  use ExUnit.Case, async: true
  alias Office.{Level, Screens}

  setup do
    {:ok, screens: Screens.new(Level.get())}
  end

  test "one presenter per screen", %{screens: s} do
    assert {:ok, s, [%{owner: "alice", mode: "share"}]} = Screens.claim(s, "hall_screen", "alice", "share")
    assert {:error, :busy} = Screens.claim(s, "hall_screen", "bob", "share")
    assert {:error, :unknown_screen} = Screens.claim(s, "nope", "bob", "share")
  end

  test "only the owner releases; a released screen can be claimed again", %{screens: s} do
    {:ok, s, _} = Screens.claim(s, "hall_screen", "alice", "share")
    assert {:error, :not_owner} = Screens.release(s, "hall_screen", "bob")
    assert {:ok, s, %{owner: nil}} = Screens.release(s, "hall_screen", "alice")
    assert {:ok, _, _} = Screens.claim(s, "hall_screen", "bob", "pdf")
  end

  test "claiming another screen releases the previous one", %{screens: s} do
    {:ok, s, _} = Screens.claim(s, "hall_screen", "alice", "share")
    {:ok, s, changed} = Screens.claim(s, "meeting_room_1_screen", "alice", "share")
    assert [%{id: "hall_screen", owner: nil}, %{id: "meeting_room_1_screen", owner: "alice"}] = changed
    assert [%{id: "meeting_room_1_screen"}] = Screens.active(s)
  end

  test "leaving frees all screens of the player", %{screens: s} do
    {:ok, s, _} = Screens.claim(s, "hall_screen", "alice", "share")
    {:ok, s, _} = Screens.claim(s, "desk_01_monitor", "bob", "share")
    {s, freed} = Screens.release_all(s, "alice")
    assert [%{id: "hall_screen", owner: nil}] = freed
    assert [%{id: "desk_01_monitor", owner: "bob"}] = Screens.active(s)
  end

  test "pdf pages: owner only, clamped to the document", %{screens: s} do
    {:ok, s, _} = Screens.claim(s, "hall_screen", "alice", "pdf")
    pdf = %{url: "/api/uploads/x.pdf", name: "deck.pdf", pages: 10}
    {:ok, s, %{pdf: %{page: 1}}} = Screens.open_pdf(s, "hall_screen", "alice", pdf)
    assert {:error, :not_owner} = Screens.set_page(s, "hall_screen", "bob", 2)
    assert {:ok, s, %{pdf: %{page: 10}}} = Screens.set_page(s, "hall_screen", "alice", 99)
    assert {:ok, _, %{pdf: %{page: 1}}} = Screens.set_page(s, "hall_screen", "alice", -3)
  end

  test "can_use? requires the zone, and reach for desk monitors" do
    level = Level.get()
    hall = Level.screen(level, "hall_screen")
    assert Screens.can_use?(hall, "hall", {10.0, -5.0})
    refute Screens.can_use?(hall, "open_space", {3.0, -5.0})

    desk = Level.screen(level, "desk_01_monitor")
    {x, _, z} = desk.position
    assert Screens.can_use?(desk, "open_space", {x + 1, z})
    refute Screens.can_use?(desk, "open_space", {x + 5, z})
  end
end
