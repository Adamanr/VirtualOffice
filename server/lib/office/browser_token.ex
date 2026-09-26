defmodule Office.BrowserToken do
  @moduledoc """
  Tokens for the shared-browser service (`/browser`): who may watch or drive
  the browser on a screen. Format (verified by browser/src/token.mjs):

      base64url(json payload) <> "." <> base64url(HMAC-SHA256(secret, first part))

  Payload: `s` screen id, `p` player id, `c` may control, `k` claim key (a new
  claim restarts the tab), `u` start URL, `e` expiry (unix seconds).
  """

  @ttl_seconds 12 * 3600

  def issue(screen_id, player_id, control?, claim_key, start_url) do
    sign(
      %{
        s: screen_id,
        p: player_id,
        c: control?,
        k: claim_key,
        u: start_url,
        e: System.system_time(:second) + @ttl_seconds
      },
      secret()
    )
  end

  def sign(payload, secret) do
    # Sorted keys: a deterministic encoding (checked against the Node service's test vector).
    body =
      payload
      |> Enum.sort_by(fn {k, _} -> to_string(k) end)
      |> Jason.OrderedObject.new()
      |> Jason.encode!()
      |> Base.url_encode64(padding: false)

    mac = :crypto.mac(:hmac, :sha256, secret, body) |> Base.url_encode64(padding: false)
    body <> "." <> mac
  end

  defp secret, do: Application.fetch_env!(:office, :browser_secret)

  @doc "Accepts only absolute http(s) URLs without credentials."
  def valid_url?(url) when is_binary(url) and byte_size(url) <= 2048 do
    case URI.parse(url) do
      %URI{scheme: s, host: h, userinfo: nil}
      when s in ["http", "https"] and is_binary(h) and h != "" ->
        true

      _ ->
        false
    end
  end

  def valid_url?(_), do: false
end
