defmodule Office.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    Office.Level.install!()

    children = [
      OfficeWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:office, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Office.PubSub},
      OfficeWeb.Presence,
      {Registry, keys: :unique, name: Office.SpaceRegistry},
      {DynamicSupervisor, name: Office.SpaceSupervisor, strategy: :one_for_one},
      # Start a worker by calling: Office.Worker.start_link(arg)
      # {Office.Worker, arg},
      # Start to serve requests, typically the last entry
      OfficeWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Office.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    OfficeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
