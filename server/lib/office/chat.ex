defmodule Office.Chat do
  @moduledoc "In-memory chat history of a space: the last `limit` messages."

  defstruct messages: [], limit: 100

  @type message :: %{
          id: String.t(),
          from: String.t(),
          name: String.t(),
          scope: String.t(),
          zone: String.t() | nil,
          text: String.t(),
          ts: integer()
        }

  def new(limit \\ 100), do: %__MODULE__{limit: limit}

  def push(%__MODULE__{messages: msgs, limit: limit} = chat, msg),
    do: %{chat | messages: Enum.take([msg | msgs], limit)}

  @doc "Oldest-first history visible from `zone`: all global messages plus that zone's local ones."
  def history(%__MODULE__{messages: msgs}, zone) do
    msgs
    |> Enum.filter(&(&1.scope == "global" or (&1.zone == zone and zone != nil)))
    |> Enum.reverse()
  end

  @max_len 500

  @doc "Builds a message, trimming text; returns :error for empty text."
  def message(from, name, scope, zone, text) do
    text = text |> String.trim() |> String.slice(0, @max_len)

    if text == "" do
      :error
    else
      {:ok,
       %{
         id: Integer.to_string(System.unique_integer([:positive, :monotonic])),
         from: from,
         name: name,
         scope: scope,
         zone: if(scope == "zone", do: zone),
         text: text,
         ts: System.system_time(:millisecond)
       }}
    end
  end
end
