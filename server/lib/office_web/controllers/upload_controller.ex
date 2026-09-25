defmodule OfficeWeb.UploadController do
  @moduledoc """
  PDF and image uploads (MVP: local disk, `:uploads_dir`).
  Files get random names; only matching extensions can be fetched back.
  """

  use OfficeWeb, :controller

  @max_pdf_bytes 50_000_000
  @max_image_bytes 4_000_000
  @pdf_name ~r/\A[A-Za-z0-9_-]{16,64}\.pdf\z/
  @image_name ~r/\A[A-Za-z0-9_-]{16,64}\.(png|jpg|jpeg|webp)\z/

  def max_bytes, do: @max_pdf_bytes

  def create(conn, %{"file" => %Plug.Upload{path: path, content_type: type} = upload}) do
    cond do
      pdf?(path) ->
        store(conn, path, "pdf", "application/pdf", @max_pdf_bytes)

      image?(path, type || upload_content_type(upload)) ->
        store_image(conn, path, type || upload_content_type(upload))

      true ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "unsupported_type"})
    end
  end

  def create(conn, _params),
    do: conn |> put_status(:bad_request) |> json(%{error: "missing_file"})

  def show(conn, %{"name" => name}) do
    path = Path.join(uploads_dir(), name)

    cond do
      name =~ @pdf_name and File.regular?(path) ->
        conn
        |> put_resp_content_type("application/pdf")
        |> put_resp_header("cache-control", "public, max-age=86400, immutable")
        |> send_file(200, path)

      name =~ @image_name and File.regular?(path) ->
        ext = Path.extname(name) |> String.trim_leading(".") |> String.downcase()
        mime = image_mime(ext)

        conn
        |> put_resp_content_type(mime)
        |> put_resp_header("cache-control", "public, max-age=86400, immutable")
        |> send_file(200, path)

      true ->
        conn |> put_status(:not_found) |> json(%{error: "not_found"})
    end
  end

  defp store(conn, path, ext, _mime, max) do
    with {:ok, %{size: size}} when size > 0 and size <= max <- File.stat(path) do
      name = random_name() <> "." <> ext
      dir = uploads_dir()
      File.mkdir_p!(dir)
      File.cp!(path, Path.join(dir, name))
      json(conn, %{url: "/api/uploads/" <> name})
    else
      _ -> conn |> put_status(:unprocessable_entity) |> json(%{error: "too_large"})
    end
  end

  defp store_image(conn, path, type) do
    ext =
      case type do
        "image/png" ->
          "png"

        "image/webp" ->
          "webp"

        "image/jpeg" ->
          "jpg"

        _ ->
          case File.open(path, [:read, :binary], &IO.binread(&1, 12)) do
            {:ok, <<0x89, "PNG", _::binary>>} -> "png"
            {:ok, <<0xFF, 0xD8, 0xFF, _::binary>>} -> "jpg"
            {:ok, <<"RIFF", _::binary-size(4), "WEBP", _::binary>>} -> "webp"
            _ -> nil
          end
      end

    if ext,
      do: store(conn, path, ext, image_mime(ext), @max_image_bytes),
      else: conn |> put_status(:unprocessable_entity) |> json(%{error: "not_an_image"})
  end

  defp pdf?(path) do
    case File.open(path, [:read, :binary], &IO.binread(&1, 5)) do
      {:ok, "%PDF-"} -> true
      _ -> false
    end
  end

  defp image?(path, type) when type in ["image/png", "image/jpeg", "image/webp"],
    do: File.regular?(path)

  defp image?(path, _) do
    case File.open(path, [:read, :binary], &IO.binread(&1, 12)) do
      {:ok, <<0x89, "PNG", _::binary>>} -> true
      {:ok, <<0xFF, 0xD8, 0xFF, _::binary>>} -> true
      {:ok, <<"RIFF", _::binary-size(4), "WEBP", _::binary>>} -> true
      _ -> false
    end
  end

  defp upload_content_type(%Plug.Upload{content_type: t}), do: t

  defp image_mime("png"), do: "image/png"
  defp image_mime("webp"), do: "image/webp"
  defp image_mime(_), do: "image/jpeg"

  defp random_name, do: :crypto.strong_rand_bytes(18) |> Base.url_encode64(padding: false)

  defp uploads_dir, do: Application.fetch_env!(:office, :uploads_dir)
end
