defmodule Office.Drill do
  @moduledoc """
  Fire drill (a nod to "Stress Relief"). Anyone can pull a fire alarm: the whole
  office flashes red, and everyone has `@duration_ms` to reach the assembly
  point in the hall. The server records who made it and how fast. After a drill
  the alarm needs `@cooldown_ms` to reset. Pure functions over a drill map.
  """

  @duration_ms 45_000
  @cooldown_ms 90_000

  @type entry :: %{id: String.t(), name: String.t(), ms: non_neg_integer()}
  @type t :: %{
          active: boolean(),
          by: String.t() | nil,
          byName: String.t() | nil,
          startedAt: integer(),
          endsAt: integer(),
          cooldownUntil: integer(),
          evacuated: [entry()]
        }

  def new,
    do: %{
      active: false,
      by: nil,
      byName: nil,
      startedAt: 0,
      endsAt: 0,
      cooldownUntil: 0,
      evacuated: []
    }

  @spec pull(t(), String.t(), String.t(), integer()) :: {:ok, t()} | {:error, :busy | :cooldown}
  def pull(%{active: true}, _by, _name, _now), do: {:error, :busy}
  def pull(%{cooldownUntil: until}, _by, _name, now) when now < until, do: {:error, :cooldown}

  def pull(drill, by, name, now) do
    {:ok,
     %{
       drill
       | active: true,
         by: by,
         byName: name,
         startedAt: now,
         endsAt: now + @duration_ms,
         evacuated: []
     }}
  end

  @doc """
  Advances an active drill. `players` are `%{id => %{name, position: {x, z} | nil}}`.
  Returns `{:unchanged, drill}`, `{:updated, drill}` (someone reached the point)
  or `{:finished, drill}` (time is up, or everyone online made it).
  """
  @spec tick(t(), map(), %{position: {number, number}, radius: number} | nil, integer()) ::
          {:unchanged | :updated | :finished, t()}
  def tick(%{active: false} = drill, _players, _assembly, _now), do: {:unchanged, drill}
  def tick(drill, _players, nil, now), do: finish_if(drill, now >= drill.endsAt, now)

  def tick(drill, players, %{position: {ax, az}, radius: r}, now) do
    done = MapSet.new(drill.evacuated, & &1.id)

    arrived =
      for {id, %{name: name, position: {x, z}}} <- players,
          not MapSet.member?(done, id),
          :math.sqrt((x - ax) ** 2 + (z - az) ** 2) <= r,
          do: %{id: id, name: name, ms: now - drill.startedAt}

    drill = %{drill | evacuated: drill.evacuated ++ Enum.sort_by(arrived, & &1.name)}
    everyone = map_size(players) > 0 and length(drill.evacuated) >= map_size(players)

    case finish_if(drill, now >= drill.endsAt or everyone, now) do
      {:unchanged, d} when arrived != [] -> {:updated, d}
      other -> other
    end
  end

  defp finish_if(drill, true, now),
    do: {:finished, %{drill | active: false, cooldownUntil: now + @cooldown_ms}}

  defp finish_if(drill, false, _now), do: {:unchanged, drill}
end
