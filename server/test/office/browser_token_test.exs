defmodule Office.BrowserTokenTest do
  use ExUnit.Case, async: true
  alias Office.BrowserToken

  # Same vector as browser/test/token.test.mjs: the Node service must accept it.
  @token "eyJjIjp0cnVlLCJlIjo0MTAyNDQ0ODAwLCJrIjoicGxheWVyLTEiLCJwIjoicGxheWVyLTEiLCJzIjoiZGVza18wMV9tb25pdG9yIiwidSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vIn0.IiiNsNd9lBJco9zfI9atZ4TOjE2NZJ516oW1_VbCIFM"

  test "signs exactly like the browser service expects" do
    payload = %{
      s: "desk_01_monitor",
      p: "player-1",
      c: true,
      k: "player-1",
      u: "https://example.com/",
      e: 4_102_444_800
    }

    assert BrowserToken.sign(payload, "test-secret") == @token
  end

  test "only http(s) URLs" do
    assert BrowserToken.valid_url?("https://github.com/")
    refute BrowserToken.valid_url?("file:///etc/passwd")
    refute BrowserToken.valid_url?("javascript:alert(1)")
    refute BrowserToken.valid_url?("https://user:pw@example.com")
    refute BrowserToken.valid_url?("not a url")
  end
end
