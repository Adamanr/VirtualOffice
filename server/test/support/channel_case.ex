defmodule OfficeWeb.ChannelCase do
  @moduledoc "Test case for channel tests."
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import OfficeWeb.ChannelCase
      @endpoint OfficeWeb.Endpoint
    end
  end
end
