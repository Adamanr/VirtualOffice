defmodule Office.Movement do
  @moduledoc """
  Sanity checks for client-reported player states `[x, y, z, rotY, anim]`.

  The client is authoritative for its own movement (it runs the physics), the
  server only rejects obviously impossible updates: out of bounds, bad anim,
  or faster than running speed plus slack for jitter and sitting down.
  """

  alias Office.Level

  # Run speed is 6 m/s; allow some headroom.
  @max_speed 7.5
  # Covers packet bunching and snapping onto a chair.
  @slack 2.5
  @anims 0..3

  @type state :: {float, float, float, float, integer}

  @spec parse(list()) :: {:ok, state()} | :error
  def parse([x, y, z, r, a])
      when is_number(x) and is_number(y) and is_number(z) and is_number(r) and is_integer(a) do
    if a in @anims, do: {:ok, {x / 1, y / 1, z / 1, r / 1, a}}, else: :error
  end

  def parse(_), do: :error

  @doc """
  Validates `next` against the previous accepted `{state, at_ms}` (or nil).
  Returns `{:ok, state}` or `{:reject, reason}`.
  """
  @spec check({state(), integer()} | nil, state(), integer(), Level.t()) ::
          {:ok, state()} | {:reject, atom()}
  def check(prev, {x, y, z, _r, _a} = next, now_ms, level) do
    cond do
      not Level.in_bounds?(level, x, z) -> {:reject, :out_of_bounds}
      y < -2 or y > 6 -> {:reject, :out_of_bounds}
      too_fast?(prev, next, now_ms) -> {:reject, :too_fast}
      true -> {:ok, normalize(next)}
    end
  end

  defp too_fast?(nil, _next, _now), do: false

  defp too_fast?({{px, _py, pz, _, _}, at}, {x, _y, z, _, _}, now_ms) do
    dt = max(now_ms - at, 0) / 1000
    :math.sqrt((x - px) ** 2 + (z - pz) ** 2) > @max_speed * dt + @slack
  end

  defp normalize({x, y, z, r, a}) do
    r = :math.atan2(:math.sin(r), :math.cos(r))
    {round3(x), round3(y), round3(z), round3(r), a}
  end

  defp round3(v), do: Float.round(v, 3)

  def to_list({x, y, z, r, a}), do: [x, y, z, r, a]
end
