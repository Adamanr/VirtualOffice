defmodule Office.LiveKit do
  @moduledoc """
  LiveKit access tokens: a JWT signed with the API secret (HS256), `iss` = API
  key, `sub` = participant identity, `video` = room grants.
  See https://docs.livekit.io/home/get-started/authentication/
  """

  @ttl_seconds 6 * 3600

  def enabled?, do: config()[:api_key] not in [nil, ""] and config()[:api_secret] not in [nil, ""]

  def public_url do
    case config()[:public_url] do
      url when url in [nil, ""] -> nil
      url -> url
    end
  end

  @doc "LiveKit room name for a space (one room per space)."
  def room_name(space_id), do: "space-" <> space_id

  @spec token(String.t(), String.t(), String.t(), map()) :: {:ok, String.t()} | {:error, term()}
  def token(identity, name, room, metadata \\ %{}) do
    now = System.system_time(:second)
    cfg = config()

    claims = %{
      "iss" => cfg[:api_key],
      "sub" => identity,
      "name" => name,
      "nbf" => now - 10,
      "exp" => now + @ttl_seconds,
      "jti" => identity <> "-" <> Integer.to_string(now),
      "metadata" => Jason.encode!(metadata),
      "video" => %{
        "room" => room,
        "roomJoin" => true,
        "canPublish" => true,
        "canSubscribe" => true,
        "canPublishData" => true,
        "canUpdateOwnMetadata" => false
      }
    }

    signer = Joken.Signer.create("HS256", cfg[:api_secret])
    Joken.Signer.sign(claims, signer)
  end

  defp config, do: Application.get_env(:office, :livekit, [])
end
