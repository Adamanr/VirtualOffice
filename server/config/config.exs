# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :office,
  generators: [timestamp_type: :utc_datetime],
  level_path: Path.expand("../../shared/level.json", __DIR__),
  uploads_dir: Path.join(System.tmp_dir!(), "office_uploads"),
  # Saved offices: the list and each office's snapshot (DATA_DIR in production).
  data_dir: Path.expand("../data", __DIR__),
  max_players_per_space: 30,
  # Shared browser service (browser/): HMAC secret for its access tokens.
  browser_secret: "dev-browser-secret",
  # Mode of guest auth; OAuth (Google) plugs in via Office.Auth later.
  auth_mode: :guest

# Configure the endpoint
config :office, OfficeWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: OfficeWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Office.PubSub,
  live_view: [signing_salt: "JqIqUc2Q"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
