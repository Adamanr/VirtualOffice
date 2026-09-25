defmodule Office.PropsTest do
  use ExUnit.Case, async: true
  alias Office.{Level, Props}

  setup do
    level = Level.get()

    find = fn type ->
      Enum.find_value(level.props, fn {id, p} -> if p.type == type, do: id end)
    end

    {:ok, level: level, props: Props.new(level), find: find}
  end

  test "appliance outcomes are decided by the server and the device stays busy", %{
    level: l,
    props: p,
    find: find
  } do
    mw = find.("microwave")
    {:ok, p, nil, fx} = Props.use(p, l, mw, "jim", "use", nil, 1_000, fn -> 0.0 end)
    assert %{propId: ^mw, by: "jim", outcome: "popcorn", t: 1_000} = fx
    assert {:error, :busy} = Props.use(p, l, mw, "pam", "use", nil, 2_000)

    assert {:ok, _, _, %{outcome: "soup"}} =
             Props.use(p, l, mw, "pam", "use", nil, 10_000, fn -> 0.99 end)
  end

  test "vending: jam, poke, kick to unjam", %{level: l, props: p, find: find} do
    vm = find.("vending_machine")

    {:ok, p, %{jammed: true, lastItem: "чипсы"}, %{outcome: "jam"}} =
      Props.use(p, l, vm, "jim", "buy", "чипсы", 0, fn -> 0.0 end)

    {:ok, p, %{jammed: true}, %{outcome: "poke"}} =
      Props.use(p, l, vm, "pam", "buy", "вода", 1_000, fn -> 0.9 end)

    {:ok, p, %{jammed: false}, %{outcome: "unjam", item: "чипсы"}} =
      Props.use(p, l, vm, "dwight", "kick", nil, 2_000)

    assert {:ok, _, %{jammed: false}, %{outcome: "drop"}} =
             Props.use(p, l, vm, "jim", "buy", "вода", 3_000, fn -> 0.9 end)
  end

  test "wrong actions and unknown props are rejected", %{level: l, props: p, find: find} do
    assert {:error, :bad_payload} = Props.use(p, l, find.("microwave"), "jim", "kick", nil, 0)
    assert {:error, :unknown_prop} = Props.use(p, l, "prop_nope", "jim", "use", nil, 0)
  end

  test "stapler in jello toggles per desk", %{level: l, props: p} do
    desk = l.desks |> Map.keys() |> hd()
    {:ok, p, true} = Props.toggle_jello(p, l, desk, "jim")
    assert [%{deskId: ^desk, by: "jim"}] = Props.snapshot(p).jellos
    {:ok, p, false} = Props.toggle_jello(p, l, desk, "dwight")
    assert [] = Props.snapshot(p).jellos
    assert {:error, :unknown_prop} = Props.toggle_jello(p, l, "desk_nope", "jim")
  end
end
