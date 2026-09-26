defmodule OfficeWeb.OfficeControllerTest do
  # Offices share one index file: not async.
  use ExUnit.Case
  import Phoenix.ConnTest
  @endpoint OfficeWeb.Endpoint

  alias Office.{Chat, Offices, Space}

  defp create(name) do
    conn = post(build_conn(), "/api/offices", %{"name" => name})
    json_response(conn, 201)["office"]
  end

  defp board_id do
    Office.Level.get().props
    |> Enum.find_value(fn {id, p} -> if p.type == "whiteboard", do: id end)
  end

  test "creates, lists, renames and deletes offices" do
    %{"id" => id, "name" => "Scranton", "online" => 0} = create("  Scranton ")
    assert id =~ ~r/\A[a-z0-9]{10}\z/

    offices = json_response(get(build_conn(), "/api/offices"), 200)["offices"]
    assert Enum.any?(offices, &(&1["id"] == id))

    assert %{"office" => %{"name" => "Scranton"}} =
             json_response(get(build_conn(), "/api/offices/#{id}"), 200)

    conn = patch(build_conn(), "/api/offices/#{id}", %{"name" => "Stamford"})
    assert %{"office" => %{"name" => "Stamford"}} = json_response(conn, 200)

    assert response(delete(build_conn(), "/api/offices/#{id}"), 204)

    assert json_response(get(build_conn(), "/api/offices/#{id}"), 404) == %{
             "error" => "not_found"
           }
  end

  test "rejects bad names" do
    assert json_response(post(build_conn(), "/api/offices", %{"name" => "  "}), 422)

    assert json_response(
             post(build_conn(), "/api/offices", %{"name" => String.duplicate("a", 49)}),
             422
           )

    assert json_response(post(build_conn(), "/api/offices", %{}), 422)
  end

  test "a saved office keeps its whiteboards and chat after the space stops" do
    %{"id" => id} = create("Persistent")
    board = board_id()
    :ok = Space.board_stroke(id, "player-aaaa", board, [0.1, 0.1, 0.5, 0.5], "#1d4ed8", 0.01)
    {:ok, msg} = Chat.message("player-aaaa", "Jim", "global", nil, "bears, beets")
    :ok = Space.post_chat(id, msg)

    Space.stop(id)

    {:ok, snap} = Space.join(id, "player-bbbb", "Pam", "#4f8cff", self())
    assert [%{boardId: ^board, color: "#1d4ed8"}] = snap.boards
    assert [%{text: "bears, beets"}] = snap.chat

    # Nobody may delete an office while someone is inside.
    assert json_response(delete(build_conn(), "/api/offices/#{id}"), 409) == %{
             "error" => "not_empty"
           }

    Space.stop(id)
    assert response(delete(build_conn(), "/api/offices/#{id}"), 204)
    assert Office.SpaceStore.load(id) == nil
  end

  test "throwaway spaces (not in the list) keep nothing" do
    id = "adhoc-#{System.unique_integer([:positive])}"
    :ok = Space.board_stroke(id, "player-aaaa", board_id(), [0.1, 0.1, 0.5, 0.5], "#1d4ed8", 0.01)
    Space.stop(id)
    refute Offices.saved?(id)
    {:ok, snap} = Space.join(id, "player-bbbb", "Pam", "#4f8cff", self())
    assert snap.boards == []
    Space.stop(id)
  end
end
