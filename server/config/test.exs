import Config

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :office, OfficeWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "iwnt8YRU3k86Oc3mQaeiY2EY4Vu9gQAqp2Dxwj3N3K+87RGf9e6JtkfH0N+IuBLH",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

config :office, browser_notify: false

config :office, uploads_dir: Path.join(System.tmp_dir!(), "office_uploads_test")
