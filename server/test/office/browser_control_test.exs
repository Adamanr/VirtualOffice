defmodule Office.BrowserControlTest do
  use ExUnit.Case, async: true
  alias Office.BrowserControl

  defp screen(id, mode, owner, url \\ "https://example.com/"),
    do: %{id: id, mode: mode, owner: owner, url: if(mode == "browser", do: url), pdf: nil}

  test "a browser tab ends when its screen is released, taken over or switched" do
    old = %{
      "s1" => screen("s1", "browser", "jim"),
      "s2" => screen("s2", "browser", "pam"),
      "s3" => screen("s3", "share", "dwight")
    }

    assert BrowserControl.ended(old, [screen("s1", nil, nil)]) == ["s1"]
    assert BrowserControl.ended(old, [screen("s1", "browser", "pam")]) == ["s1"]

    assert BrowserControl.ended(old, [screen("s1", "browser", "jim", "https://other.org/")]) == [
             "s1"
           ]

    assert BrowserControl.ended(old, [screen("s1", "pdf", "jim")]) == ["s1"]
    # Not a browser before, or unchanged: nothing to close.
    assert BrowserControl.ended(old, [screen("s3", nil, nil), screen("s2", "browser", "pam")]) ==
             []
  end
end
