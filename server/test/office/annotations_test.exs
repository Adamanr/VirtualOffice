defmodule Office.AnnotationsTest do
  use ExUnit.Case, async: true
  alias Office.Annotations, as: A

  defp stroke(ctx \\ "p1", tool \\ "pen"),
    do: %{
      "ctx" => ctx,
      "tool" => tool,
      "color" => "#e5484d",
      "width" => 0.01,
      "points" => [0.1, 0.1, 0.5, 1.7]
    }

  test "everyone draws; points are clamped to the content" do
    {:ok, s, st} = A.add(A.new(), "sc", "jim", stroke())
    assert %{by: "jim", ctx: "p1", points: [0.1, 0.1, 0.5, 1.0]} = st
    {:ok, s, _} = A.add(s, "sc", "pam", stroke("p2", "highlight"))
    assert length(A.snapshot(s).annotations) == 2
  end

  test "rejects bad strokes" do
    assert {:error, :bad_payload} =
             A.add(A.new(), "sc", "jim", %{stroke() | "tool" => "flamethrower"})

    assert {:error, :bad_payload} = A.add(A.new(), "sc", "jim", %{stroke() | "color" => "red"})
    assert {:error, :bad_payload} = A.add(A.new(), "sc", "jim", %{stroke() | "points" => [0.1]})
  end

  test "undo removes only your latest; clear removes yours or everything" do
    {:ok, s, a} = A.add(A.new(), "sc", "jim", stroke())
    {:ok, s, b} = A.add(s, "sc", "pam", stroke())
    {:ok, s, c} = A.add(s, "sc", "jim", stroke())
    {s, [id]} = A.undo(s, "sc", "jim")
    assert id == c.id
    {s, ids} = A.clear(s, "sc", "pam", false)
    assert ids == [b.id]
    {s, ids} = A.clear(s, "sc", "michael", true)
    assert ids == [a.id]
    assert A.snapshot(s).annotations == []
  end

  test "presenter settings: lock and spotlight; reset forgets everything" do
    {:ok, s, set} = A.set(A.new(), "sc", true, [0.1, 0.2, 0.5, 0.6], "p1")
    assert %{locked: true, spotlight: [0.1, 0.2, 0.5, 0.6]} = set
    assert A.locked?(s, "sc")
    assert {:error, :bad_payload} = A.set(s, "sc", false, [2, 0, 0, 0], "")
    {:ok, s, _} = A.add(s, "sc", "jim", stroke())
    {s, [_]} = A.reset(s, "sc")
    refute A.locked?(s, "sc")
    assert A.snapshot(s) == %{annotations: [], annotSettings: []}
  end
end
