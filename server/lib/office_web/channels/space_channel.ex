defmodule OfficeWeb.SpaceChannel do
  use OfficeWeb, :channel

  @impl true
  def join("space:" <> _space_id, _params, socket), do: {:ok, socket}
end
