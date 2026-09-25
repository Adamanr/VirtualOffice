defmodule Office.Toss do
  @moduledoc """
  Paper basketball. A crumpled paper ball flies on a ballistic arc
  `p(t) = origin + vel·t + ½·g·t²`; the server decides where it ends: in a trash
  bin (2 points, 3 from 6 m and beyond), on a colleague's head (a "bonk") or on
  the floor. Clients animate the very same analytic curve up to `flight`
  seconds, so everyone sees the same shot. Walls are ignored on purpose: it's
  paper, and the arc is readable.
  """

  @g -9.81
  @dt 1 / 240
  @max_time 3.0
  @max_speed 14.0
  @rim_height 0.42
  @rim_radius 0.16
  @head_height 1.45
  @head_radius 0.32
  @ball_floor 0.05
  @three_pointer 6.0

  @type vec :: {float, float, float}
  @type result :: %{
          flight: float,
          land: [float],
          hit: String.t() | nil,
          target: String.t() | nil,
          points: non_neg_integer()
        }

  @doc "Validates a throw from a player standing at `{px, pz}`."
  @spec valid?([number()], [number()], {number(), number()} | nil) :: boolean()
  def valid?([ox, oy, oz], [vx, vy, vz], {px, pz})
      when is_number(ox) and is_number(oy) and is_number(oz) and is_number(vx) and is_number(vy) and
             is_number(vz) do
    :math.sqrt((ox - px) ** 2 + (oz - pz) ** 2) <= 1.5 and oy >= 0.3 and oy <= 2.5 and
      :math.sqrt(vx * vx + vy * vy + vz * vz) <= @max_speed
  end

  def valid?(_, _, _), do: false

  @doc """
  Simulates a throw against `bins` (`%{id, position: {x, z}}`) and `players`
  (`%{id, position: {x, z}}`, the thrower excluded). Bins take precedence.
  """
  @spec simulate(vec(), vec(), [map()], [map()], {{number, number}, {number, number}}) :: result()
  def simulate({ox, _oy, oz} = origin, vel, bins, players, bounds) do
    Stream.iterate(1, &(&1 + 1))
    |> Stream.map(&(&1 * @dt))
    |> Enum.reduce_while({origin, nil}, fn t, {{_, py, _}, _} ->
      {x, y, z} = p = at(origin, vel, t)

      cond do
        bin =
            py >= @rim_height and y < @rim_height and
              Enum.find(bins, &near?(&1, x, z, @rim_radius)) ->
          {bx, bz} = bin.position
          points = if dist2(ox, oz, bx, bz) >= @three_pointer, do: 3, else: 2
          {:halt, {p, done(t, [bx, 0.15, bz], "bin", bin.id, points)}}

        who =
            Enum.find(players, fn %{position: {hx, hz}} ->
              dist3(x, y, z, hx, @head_height, hz) < @head_radius
            end) ->
          {:halt, {p, done(t, [x, y, z], "player", who.id, 0)}}

        not inside?(x, z, bounds) ->
          # Hit an outer wall: drops to the floor right there.
          {cx, cz} = clamp_inside(x, z, bounds)
          {:halt, {p, done(t, [cx, @ball_floor, cz], nil, nil, 0)}}

        y <= @ball_floor or t >= @max_time ->
          {:halt, {p, done(t, [x, max(y, @ball_floor), z], nil, nil, 0)}}

        true ->
          {:cont, {p, nil}}
      end
    end)
    |> elem(1)
  end

  def at({ox, oy, oz}, {vx, vy, vz}, t),
    do: {ox + vx * t, oy + vy * t + 0.5 * @g * t * t, oz + vz * t}

  defp done(t, land, hit, target, points) do
    %{
      flight: Float.round(t, 3),
      land: Enum.map(land, &Float.round(&1 / 1, 3)),
      hit: hit,
      target: target,
      points: points
    }
  end

  defp near?(%{position: {bx, bz}}, x, z, r), do: dist2(x, z, bx, bz) < r
  defp dist2(ax, az, bx, bz), do: :math.sqrt((ax - bx) ** 2 + (az - bz) ** 2)

  defp dist3(ax, ay, az, bx, by, bz),
    do: :math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)

  defp inside?(x, z, {{x0, z0}, {x1, z1}}), do: x >= x0 and x <= x1 and z >= z0 and z <= z1

  defp clamp_inside(x, z, {{x0, z0}, {x1, z1}}),
    do: {x |> max(x0 + 0.2) |> min(x1 - 0.2), z |> max(z0 + 0.2) |> min(z1 - 0.2)}
end
