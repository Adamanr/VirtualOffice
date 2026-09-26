defmodule Office.Level do
  @moduledoc """
  The office layout from `shared/level.json` (zones, screens, desks, bounds).

  Loaded once at boot into `:persistent_term`; the same file drives the client
  renderer, so zone ids and screen ids always agree on both sides.
  """

  defstruct name: nil,
            bounds: nil,
            spawn: nil,
            zones: [],
            screens: %{},
            desks: %{},
            props: %{},
            bins: [],
            assembly: nil

  @type zone :: %{
          id: String.t(),
          name: String.t(),
          isolated: boolean(),
          min: {float, float},
          max: {float, float}
        }
  @type screen :: %{
          id: String.t(),
          kind: String.t(),
          zone_id: String.t(),
          position: {float, float, float},
          view_distance: float | nil
        }
  @type prop :: %{
          id: String.t(),
          type: String.t(),
          position: {float, float},
          zone_id: String.t() | nil
        }
  @type t :: %__MODULE__{}

  @key {__MODULE__, :level}
  @interactive ~w(whiteboard bulletin_board vending_machine coffee_machine water_cooler microwave fridge copier fire_alarm pingpong_table dartboard piano)

  @spec load!(Path.t()) :: t()
  def load!(path), do: path |> File.read!() |> Jason.decode!() |> from_map()

  @doc "Loads the level configured in `:office, :level_path` into persistent_term."
  def install! do
    level = load!(Application.fetch_env!(:office, :level_path))
    :persistent_term.put(@key, level)
    level
  end

  @spec get() :: t()
  def get, do: :persistent_term.get(@key)

  @spec from_map(map()) :: t()
  def from_map(map) do
    zones =
      Enum.map(map["zones"], fn z ->
        %{
          id: z["id"],
          name: z["name"],
          isolated: z["isolated"] == true,
          min: xz(z["min"]),
          max: xz(z["max"])
        }
      end)

    level = %__MODULE__{
      name: map["name"],
      bounds: {xz(map["bounds"]["min"]), xz(map["bounds"]["max"])},
      spawn: xz(map["spawn"]["position"]),
      zones: zones,
      screens:
        Map.new(map["screens"], fn s ->
          [x, y, z] = s["position"]

          {s["id"],
           %{
             id: s["id"],
             kind: s["kind"],
             zone_id: s["zoneId"],
             position: {x / 1, y / 1, z / 1},
             view_distance: s["viewDistance"] && s["viewDistance"] / 1
           }}
        end),
      desks:
        Map.new(map["desks"], fn d -> {d["id"], %{id: d["id"], position: xz(d["position"])}} end),
      props: %{}
    }

    props =
      (map["furniture"] || [])
      |> Enum.with_index()
      |> Enum.reduce(%{}, fn {f, i}, acc ->
        type = f["type"]

        if type in @interactive do
          [x, z] = f["position"]
          id = "prop_#{i}"
          zone_id = zone_at(level, x, z)
          Map.put(acc, id, %{id: id, type: type, position: {x / 1, z / 1}, zone_id: zone_id})
        else
          acc
        end
      end)

    bins =
      for {%{"type" => "trash_bin", "position" => [x, z]}, i} <-
            Enum.with_index(map["furniture"] || []),
          do: %{id: "bin_#{i}", position: {x / 1, z / 1}}

    assembly =
      case get_in(map, ["activities", "assembly"]) do
        %{"position" => pos, "radius" => r} -> %{position: xz(pos), radius: r / 1}
        _ -> nil
      end

    %{level | props: props, bins: bins, assembly: assembly}
  end

  defp xz([x, z]), do: {x / 1, z / 1}

  @doc "Id of the first zone (in file order) whose AABB contains the point, or nil."
  @spec zone_at(t(), number(), number()) :: String.t() | nil
  def zone_at(%__MODULE__{zones: zones}, x, z) do
    Enum.find_value(zones, fn %{id: id, min: {x0, z0}, max: {x1, z1}} ->
      if x >= x0 and x <= x1 and z >= z0 and z <= z1, do: id
    end)
  end

  @spec zone(t(), String.t() | nil) :: zone() | nil
  def zone(%__MODULE__{zones: zones}, id), do: Enum.find(zones, &(&1.id == id))

  @spec screen(t(), String.t()) :: screen() | nil
  def screen(%__MODULE__{screens: screens}, id), do: Map.get(screens, id)

  @spec prop(t(), String.t()) :: prop() | nil
  def prop(%__MODULE__{props: props}, id), do: Map.get(props, id)

  @doc "True if the point is inside the level bounds grown by `margin` meters."
  def in_bounds?(%__MODULE__{bounds: {{x0, z0}, {x1, z1}}}, x, z, margin \\ 1.0) do
    x >= x0 - margin and x <= x1 + margin and z >= z0 - margin and z <= z1 + margin
  end
end
