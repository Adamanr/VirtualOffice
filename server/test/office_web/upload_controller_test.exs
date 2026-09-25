defmodule OfficeWeb.UploadControllerTest do
  use ExUnit.Case, async: true
  import Plug.Conn
  import Phoenix.ConnTest
  @endpoint OfficeWeb.Endpoint

  defp upload(content) do
    path = Path.join(System.tmp_dir!(), "upload-#{System.unique_integer([:positive])}")
    File.write!(path, content)
    %Plug.Upload{path: path, filename: "deck.pdf", content_type: "application/pdf"}
  end

  test "stores a PDF and serves it back" do
    conn = post(build_conn(), "/api/uploads", %{"file" => upload("%PDF-1.4 fake")})
    assert %{"url" => "/api/uploads/" <> name = url} = json_response(conn, 200)
    assert name =~ ~r/\.pdf\z/

    conn = get(build_conn(), url)
    assert response(conn, 200) == "%PDF-1.4 fake"
    assert get_resp_header(conn, "content-type") |> hd() =~ "application/pdf"
  end

  test "rejects non-PDF files" do
    conn = post(build_conn(), "/api/uploads", %{"file" => upload("<html>")})
    assert json_response(conn, 422) == %{"error" => "not_a_pdf"}
  end

  test "does not serve arbitrary paths" do
    assert build_conn() |> get("/api/uploads/..%2Fetc%2Fpasswd") |> response(404)
    assert build_conn() |> get("/api/uploads/short.pdf") |> response(404)
  end
end
