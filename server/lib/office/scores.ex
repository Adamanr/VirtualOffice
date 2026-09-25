defmodule Office.Scores do
  @moduledoc """
  Office Olympics scoreboard of a space: paper-basketball points and bonks,
  best fire-drill time, and medals (yogurt lids, naturally).
  """

  @type score :: %{
          id: String.t(),
          name: String.t(),
          color: String.t(),
          points: non_neg_integer(),
          shots: non_neg_integer(),
          bonks: non_neg_integer(),
          drillMs: non_neg_integer() | nil,
          medals: non_neg_integer()
        }
  @type t :: %{String.t() => score()}

  def new, do: %{}

  defp ensure(scores, id, name, color) do
    Map.update(
      scores,
      id,
      %{id: id, name: name, color: color, points: 0, shots: 0, bonks: 0, drillMs: nil, medals: 0},
      &%{&1 | name: name, color: color}
    )
  end

  @doc "Records a paper-ball throw (points 0/2/3, bonk = hit a colleague)."
  def shot(scores, id, name, color, points, bonk?) do
    scores
    |> ensure(id, name, color)
    |> Map.update!(id, fn s ->
      %{
        s
        | shots: s.shots + 1,
          points: s.points + points,
          bonks: s.bonks + if(bonk?, do: 1, else: 0)
      }
    end)
  end

  @doc "Applies drill results: best time per person and a medal for the fastest."
  def drill_results(scores, entries, profiles) do
    scores =
      Enum.reduce(entries, scores, fn %{id: id, ms: ms}, acc ->
        %{name: name, color: color} = Map.get(profiles, id, %{name: "?", color: "#888888"})

        acc
        |> ensure(id, name, color)
        |> Map.update!(id, fn s ->
          %{s | drillMs: if(s.drillMs, do: min(s.drillMs, ms), else: ms)}
        end)
      end)

    case Enum.min_by(entries, & &1.ms, fn -> nil end) do
      nil -> scores
      %{id: winner} -> Map.update!(scores, winner, &%{&1 | medals: &1.medals + 1})
    end
  end

  @doc "A medal for a swish from three-point range."
  def medal(scores, id), do: Map.update!(scores, id, &%{&1 | medals: &1.medals + 1})

  @doc "Top entries for the scoreboard."
  def top(scores, n \\ 10) do
    scores
    |> Map.values()
    |> Enum.sort_by(&{-&1.points, -&1.medals, &1.drillMs || 999_999_999, &1.name})
    |> Enum.take(n)
  end
end
