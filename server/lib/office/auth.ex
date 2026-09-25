defmodule Office.Auth do
  @moduledoc """
  Identity for socket joins.

  MVP: guests pick a name, the client keeps a random `playerId` in sessionStorage
  so reconnects keep the same identity. OAuth (Google) slots in here later:
  the client will pass a signed session token as `auth` in the join params
  (issued by a `/api/auth/google/callback` controller via `Phoenix.Token`),
  and this module will verify it and return the account's id and name.
  """

  @type identity :: %{kind: :guest | :google, player_id: String.t(), name: String.t()}

  @spec authorize(map()) :: {:ok, identity()} | {:error, :unauthorized | :bad_params}
  def authorize(%{"playerId" => id, "name" => name}) do
    case Application.get_env(:office, :auth_mode, :guest) do
      :guest ->
        with {:ok, id} <- player_id(id), {:ok, name} <- name(name) do
          {:ok, %{kind: :guest, player_id: id, name: name}}
        end

      _other ->
        # Placeholder for :google — verify params["auth"] with Phoenix.Token here.
        {:error, :unauthorized}
    end
  end

  def authorize(_), do: {:error, :bad_params}

  defp player_id(id) when is_binary(id) do
    if id =~ ~r/\A[A-Za-z0-9_-]{8,64}\z/, do: {:ok, id}, else: {:error, :bad_params}
  end

  defp player_id(_), do: {:error, :bad_params}

  defp name(name) when is_binary(name) do
    name = name |> String.trim() |> String.replace(~r/[\x00-\x1F\x7F]/u, "")
    len = String.length(name)
    if len >= 1 and len <= 32, do: {:ok, name}, else: {:error, :bad_params}
  end

  defp name(_), do: {:error, :bad_params}
end
