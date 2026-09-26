defmodule OfficeWeb.Router do
  use OfficeWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", OfficeWeb do
    pipe_through :api

    get "/health", HealthController, :show
    get "/offices", OfficeController, :index
    post "/offices", OfficeController, :create
    get "/offices/:id", OfficeController, :show
    patch "/offices/:id", OfficeController, :update
    delete "/offices/:id", OfficeController, :delete
    post "/uploads", UploadController, :create
    get "/uploads/:name", UploadController, :show
  end
end
