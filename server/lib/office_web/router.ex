defmodule OfficeWeb.Router do
  use OfficeWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", OfficeWeb do
    pipe_through :api

    get "/health", HealthController, :show
  end
end
