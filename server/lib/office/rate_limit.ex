defmodule Office.RateLimit do
  @moduledoc "Token bucket: `rate` tokens per second, up to `burst` stored."

  @enforce_keys [:rate, :burst, :tokens, :at]
  defstruct [:rate, :burst, :tokens, :at]

  @type t :: %__MODULE__{rate: number(), burst: number(), tokens: float(), at: integer()}

  @spec new(number(), number(), integer()) :: t()
  def new(rate, burst, now_ms), do: %__MODULE__{rate: rate, burst: burst, tokens: burst / 1, at: now_ms}

  @spec take(t(), integer(), number()) :: {:ok, t()} | {:error, t()}
  def take(%__MODULE__{} = b, now_ms, cost \\ 1) do
    elapsed = max(now_ms - b.at, 0) / 1000
    tokens = min(b.burst / 1, b.tokens + elapsed * b.rate)
    b = %{b | tokens: tokens, at: now_ms}
    if tokens >= cost, do: {:ok, %{b | tokens: tokens - cost}}, else: {:error, b}
  end
end
