defmodule Office.ProtocolTest do
  use ExUnit.Case, async: true
  alias Office.Protocol

  test "known events with valid payloads pass" do
    assert {:ok, %{"s" => [1, 0, 2, 0.5, 1]}} =
             Protocol.validate("move", %{"s" => [1, 0, 2, 0.5, 1]})

    assert {:ok, _} =
             Protocol.validate("screen_claim", %{"screenId" => "hall_screen", "mode" => "pdf"})

    assert {:ok, _} = Protocol.validate("livekit_token", %{})
  end

  test "unknown events and bad payloads are rejected" do
    assert {:error, "unknown_event"} = Protocol.validate("hack", %{})
    assert {:error, "bad_payload"} = Protocol.validate("move", %{"s" => "nope"})
    assert {:error, "bad_payload"} = Protocol.validate("move", %{})

    assert {:error, "bad_payload"} =
             Protocol.validate("screen_claim", %{"screenId" => "x", "mode" => "video"})

    assert {:error, "bad_payload"} =
             Protocol.validate("pdf_page", %{"screenId" => "x", "page" => 1.5})

    assert {:error, "bad_payload"} = Protocol.validate("chat_send", "text")
  end

  test "optional fields" do
    assert {:ok, p} =
             Protocol.validate_join(%{
               "playerId" => "abcdefgh",
               "name" => "A",
               "color" => "#ffffff"
             })

    refute Map.has_key?(p, "auth")
  end

  test "the channel handles every client event declared in protocol.json" do
    source = File.read!("lib/office_web/channels/space_channel.ex")

    for event <- Protocol.client_events() do
      assert source =~ ~r/handle_event\(\s*"#{event}"/, "missing handler for #{event}"
    end
  end
end
