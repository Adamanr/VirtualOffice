defmodule Office.RateLimitTest do
  use ExUnit.Case, async: true
  alias Office.RateLimit

  test "allows a burst, then refills at the given rate" do
    b = RateLimit.new(10, 3, 0)
    {:ok, b} = RateLimit.take(b, 0)
    {:ok, b} = RateLimit.take(b, 0)
    {:ok, b} = RateLimit.take(b, 0)
    assert {:error, b} = RateLimit.take(b, 0)
    # 10 tokens/s -> one token after 100 ms
    assert {:error, b} = RateLimit.take(b, 50)
    assert {:ok, _} = RateLimit.take(b, 100)
  end

  test "never stores more than the burst" do
    b = RateLimit.new(10, 2, 0)
    {:ok, b} = RateLimit.take(b, 60_000)
    {:ok, b} = RateLimit.take(b, 60_000)
    assert {:error, _} = RateLimit.take(b, 60_000)
  end
end
