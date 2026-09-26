defmodule Office.Darts do
  @moduledoc """
  Darts on a standard board. Aim is sent as board coordinates `{u, v}` in
  [-1, 1] (u right, v up, 1 = outer edge of the double ring); the server adds
  a little scatter, scores it and keeps the dart stuck in the board for
  everyone until somebody collects them.
  """

  # Standard sector order, clockwise from the top.
  @sectors [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
  # Radii in mm (double ring outer edge = 170 mm).
  @r_board 170.0
  @max_darts 30
  @scatter 0.05

  @doc "Scores a hit at `{u, v}` (board units). Returns `{points, ring}`."
  @spec score(number(), number()) :: {non_neg_integer(), String.t()}
  def score(u, v) do
    r = :math.sqrt(u * u + v * v) * @r_board
    angle = :math.atan2(u, v) * 180 / :math.pi()
    angle = if angle < 0, do: angle + 360, else: angle
    sector = Enum.at(@sectors, rem(trunc((angle + 9) / 18), 20))

    cond do
      r <= 6.35 -> {50, "bull"}
      r <= 15.9 -> {25, "outer_bull"}
      r >= 99 and r <= 107 -> {sector * 3, "treble"}
      r >= 162 and r <= 170 -> {sector * 2, "double"}
      r > 170 -> {0, "miss"}
      true -> {sector, "single"}
    end
  end

  @doc "Throws a dart aimed at `{u, v}`; returns the new board list and the dart."
  def throw(darts, board_id, player, u, v, rand \\ &:rand.uniform/0) do
    su = clamp(u + (rand.() - 0.5) * 2 * @scatter, 1.25)
    sv = clamp(v + (rand.() - 0.5) * 2 * @scatter, 1.25)
    {points, ring} = score(su, sv)

    dart = %{
      id: Integer.to_string(System.unique_integer([:positive])),
      boardId: board_id,
      by: player,
      u: Float.round(su / 1, 4),
      v: Float.round(sv / 1, 4),
      points: points,
      ring: ring
    }

    {Enum.take([dart | darts], @max_darts), dart}
  end

  defp clamp(x, lim), do: x |> max(-lim) |> min(lim)
end
