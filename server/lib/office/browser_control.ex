defmodule Office.BrowserControl do
  @moduledoc """
  Tells the shared-browser service to close a screen's tab when the screen
  stops showing it (released, taken over, new URL, or the owner left the
  office). While the screen stays claimed the tab keeps running even with
  nobody around it, so music or a video keeps playing when you walk away.
  """

  require Logger

  alias Office.BrowserToken

  @doc "Screens (old → changed) whose browser tab must be closed."
  def ended(old_screens, changed) do
    for %{id: id} = new <- changed,
        %{mode: "browser"} = old <- [Map.get(old_screens, id)],
        new.mode != "browser" or new.owner != old.owner or new.url != old.url,
        do: id
  end

  def close_ended(old_screens, changed), do: Enum.each(ended(old_screens, changed), &close/1)

  @doc "Fire-and-forget POST to the browser service."
  def close(screen_id) do
    if Application.get_env(:office, :browser_notify, true) do
      Task.start(fn -> post(screen_id) end)
    end

    :ok
  end

  defp post(screen_id) do
    token = BrowserToken.issue(screen_id, "office", false, "*close*", "")

    url =
      String.to_charlist(
        Application.get_env(:office, :browser_internal_url, "http://127.0.0.1:4100") <>
          "/browser/close"
      )

    body = Jason.encode!(%{token: token})

    case :httpc.request(:post, {url, [], ~c"application/json", body}, [timeout: 5_000], []) do
      {:ok, _} -> :ok
      {:error, reason} -> Logger.debug("browser service close failed: #{inspect(reason)}")
    end
  end
end
