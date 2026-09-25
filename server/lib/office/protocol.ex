defmodule Office.Protocol do
  @moduledoc """
  Channel protocol, compiled from `shared/protocol.json` — the same file the
  client's TypeScript types are generated from. Unknown events are rejected and
  client payloads are type-checked against the declared field types.

  Supported field types (for client payloads): `string`, `number`, `integer`,
  `boolean`, `T[]` of those, string-literal unions like `'a' | 'b'`, `| null`.
  A trailing `?` on a field name marks it optional.
  """

  @path Path.expand("../../../shared/protocol.json", __DIR__)
  @external_resource @path
  @spec_json @path |> File.read!() |> Jason.decode!()

  parse_type = fn type ->
    type
    |> String.split("|")
    |> Enum.map(&String.trim/1)
    |> Enum.map(fn
      "string" ->
        :string

      "number" ->
        :number

      "integer" ->
        :integer

      "boolean" ->
        :boolean

      "null" ->
        nil

      "string[]" ->
        {:list, :string}

      "number[]" ->
        {:list, :number}

      "integer[]" ->
        {:list, :integer}

      "'" <> rest ->
        {:literal, String.trim_trailing(rest, "'")}

      other ->
        raise "Office.Protocol: unsupported client field type #{inspect(other)} in #{@path}"
    end)
  end

  parse_fields = fn fields ->
    Enum.map(fields, fn {name, type} ->
      optional = String.ends_with?(name, "?")
      {String.trim_trailing(name, "?"), not optional, parse_type.(type)}
    end)
  end

  @client_events Map.new(@spec_json["client"], fn {event, %{"payload" => payload}} ->
                   {event, parse_fields.(payload)}
                 end)
  @join_params parse_fields.(@spec_json["join"]["params"])

  @doc "Client events declared in protocol.json."
  def client_events, do: Map.keys(@client_events)

  @doc "Server-pushed events declared in protocol.json."
  def server_events, do: Map.keys(@spec_json["server"])

  def errors, do: @spec_json["errors"]
  def enum(name), do: Map.fetch!(@spec_json["enums"], name)

  @spec validate(String.t(), term()) :: {:ok, map()} | {:error, String.t()}
  def validate(event, payload) do
    case Map.fetch(@client_events, event) do
      {:ok, fields} -> check(fields, payload)
      :error -> {:error, "unknown_event"}
    end
  end

  @spec validate_join(term()) :: {:ok, map()} | {:error, String.t()}
  def validate_join(params) do
    case check(@join_params, params) do
      {:ok, p} -> {:ok, p}
      {:error, _} -> {:error, "bad_params"}
    end
  end

  defp check(fields, payload) when is_map(payload) do
    Enum.reduce_while(fields, {:ok, %{}}, fn {name, required, types}, {:ok, acc} ->
      case Map.fetch(payload, name) do
        {:ok, value} ->
          if Enum.any?(types, &type?(&1, value)),
            do: {:cont, {:ok, Map.put(acc, name, value)}},
            else: {:halt, {:error, "bad_payload"}}

        :error ->
          if required, do: {:halt, {:error, "bad_payload"}}, else: {:cont, {:ok, acc}}
      end
    end)
  end

  defp check(_fields, _payload), do: {:error, "bad_payload"}

  defp type?(:string, v), do: is_binary(v)
  defp type?(:number, v), do: is_number(v)
  defp type?(:integer, v), do: is_integer(v)
  defp type?(:boolean, v), do: is_boolean(v)
  defp type?(nil, v), do: is_nil(v)
  defp type?({:literal, lit}, v), do: v == lit
  defp type?({:list, t}, v), do: is_list(v) and length(v) <= 64 and Enum.all?(v, &type?(t, &1))
end
