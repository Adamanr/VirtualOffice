defmodule OfficeWeb.HealthController do
  use OfficeWeb, :controller

  def show(conn, _params), do: json(conn, %{ok: true})
end
