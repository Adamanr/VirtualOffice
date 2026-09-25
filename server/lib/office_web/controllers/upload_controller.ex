defmodule OfficeWeb.UploadController do
  @moduledoc """
  PDF uploads for presentations (MVP: local disk, `:uploads_dir`).
  Files get random names; only `<random>.pdf` names can be fetched back.
  """

  use OfficeWeb, :controller

  @max_bytes 50_000_000
  @name ~r/\A[A-Za-z0-9_-]{16,64}\.pdf\z/

  def max_bytes, do: @max_bytes

  def create(conn, %{"file" => %Plug.Upload{path: path}}) do
    with {:ok, %{size: size}} when size > 0 and size <= @max_bytes <- File.stat(path),
         true <- pdf?(path) do
      name = random_name() <> ".pdf"
      dir = uploads_dir()
      File.mkdir_p!(dir)
      File.cp!(path, Path.join(dir, name))
      json(conn, %{url: "/api/uploads/" <> name})
    else
      _ -> conn |> put_status(:unprocessable_entity) |> json(%{error: "not_a_pdf"})
    end
  end

  def create(conn, _params), do: conn |> put_status(:bad_request) |> json(%{error: "missing_file"})

  def show(conn, %{"name" => name}) do
    path = Path.join(uploads_dir(), name)

    if name =~ @name and File.regular?(path) do
      conn
      |> put_resp_content_type("application/pdf")
      |> put_resp_header("cache-control", "public, max-age=86400, immutable")
      |> send_file(200, path)
    else
      conn |> put_status(:not_found) |> json(%{error: "not_found"})
    end
  end

  defp pdf?(path) do
    case File.open(path, [:read, :binary], &IO.binread(&1, 5)) do
      {:ok, "%PDF-"} -> true
      _ -> false
    end
  end

  defp random_name, do: :crypto.strong_rand_bytes(18) |> Base.url_encode64(padding: false)

  defp uploads_dir, do: Application.fetch_env!(:office, :uploads_dir)
end
