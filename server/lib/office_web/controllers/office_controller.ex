defmodule OfficeWeb.OfficeController do
  @moduledoc """
  Saved offices for the start menu: list (with who's inside now), create,
  rename, delete. Guests only in the MVP, so anyone with the site can manage
  them; deleting is refused while someone is inside.
  """

  use OfficeWeb, :controller

  alias Office.{Offices, Space}

  def index(conn, _params), do: json(conn, %{offices: Enum.map(Offices.list(), &wire/1)})

  def show(conn, %{"id" => id}) do
    case Offices.get(id) do
      nil -> error(conn, :not_found)
      office -> json(conn, %{office: wire(office)})
    end
  end

  def create(conn, params) do
    case Offices.create(params["name"]) do
      {:ok, office} -> conn |> put_status(:created) |> json(%{office: wire(office)})
      {:error, reason} -> error(conn, reason)
    end
  end

  def update(conn, %{"id" => id} = params) do
    case Offices.rename(id, params["name"]) do
      {:ok, office} -> json(conn, %{office: wire(office)})
      {:error, reason} -> error(conn, reason)
    end
  end

  def delete(conn, %{"id" => id}) do
    cond do
      Offices.get(id) == nil ->
        error(conn, :not_found)

      Space.online(id) > 0 ->
        error(conn, :not_empty)

      true ->
        # Stop first: a running space saves on the way out.
        Space.stop(id)
        Offices.delete(id)
        send_resp(conn, :no_content, "")
    end
  end

  defp wire(office), do: Map.put(office, :online, Space.online(office.id))

  @status %{
    not_found: :not_found,
    bad_name: :unprocessable_entity,
    limit: :conflict,
    not_empty: :conflict
  }

  defp error(conn, reason),
    do: conn |> put_status(Map.fetch!(@status, reason)) |> json(%{error: reason})
end
