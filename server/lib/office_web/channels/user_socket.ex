defmodule OfficeWeb.UserSocket do
  use Phoenix.Socket

  channel "space:*", OfficeWeb.SpaceChannel

  # Guests connect anonymously; identity is established per space join
  # (see Office.Auth). With OAuth, verify a session token here instead.
  @impl true
  def connect(_params, socket, _connect_info), do: {:ok, socket}

  @impl true
  def id(_socket), do: nil
end
