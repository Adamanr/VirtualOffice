defmodule Office.ChatTest do
  use ExUnit.Case, async: true
  alias Office.Chat

  test "keeps the last 100 messages" do
    chat =
      Enum.reduce(1..150, Chat.new(), fn i, c ->
        {:ok, m} = Chat.message("p", "P", "global", nil, "msg #{i}")
        Chat.push(c, m)
      end)

    history = Chat.history(chat, nil)
    assert length(history) == 100
    assert hd(history).text == "msg 51"
    assert List.last(history).text == "msg 150"
  end

  test "zone messages only show up in that zone's history" do
    {:ok, g} = Chat.message("p", "P", "global", "kitchen", "hi all")
    {:ok, z} = Chat.message("p", "P", "zone", "kitchen", "hi kitchen")
    chat = Chat.new() |> Chat.push(g) |> Chat.push(z)
    assert [%{text: "hi all"}, %{text: "hi kitchen"}] = Chat.history(chat, "kitchen")
    assert [%{text: "hi all"}] = Chat.history(chat, "hall")
    assert g.zone == nil
  end

  test "rejects empty text and trims long text" do
    assert :error = Chat.message("p", "P", "global", nil, "   ")
    {:ok, m} = Chat.message("p", "P", "global", nil, String.duplicate("a", 900))
    assert String.length(m.text) == 500
  end
end
