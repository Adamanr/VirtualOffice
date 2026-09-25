defmodule OfficeWeb.Presence do
  @moduledoc "Who is online in a space, with name, color, zone and media state."
  use Phoenix.Presence, otp_app: :office, pubsub_server: Office.PubSub
end
