defmodule Office.Pong do
  @moduledoc """
  Ping-pong at an office table, simulated on the server (top-down 2D on the
  table plane) and broadcast ~15x/s so everyone watches the same rally.

  The table is `2·@half_w` wide (x) and `2·@half_l` long (z); side "a" defends
  z = -@half_l, side "b" defends z = +@half_l. Each side is a player id, `"bot"`
  (a Dwight-grade opponent when you're alone), or nil. First to 11, win by two.
  """

  @half_w 0.7625
  @half_l 1.37
  @paddle_half 0.2
  @serve_speed 2.4
  @max_speed 7.0
  @speedup 1.07
  @spin 5.0
  @bot_speed 1.7
  @point_pause_ms 1200
  @win_pause_ms 5000
  @bot "bot"

  def half_width, do: @half_w
  def half_length, do: @half_l

  def new(id),
    do: %{
      id: id,
      a: nil,
      b: nil,
      pa: 0.0,
      pb: 0.0,
      ball: [0.0, 0.0, 0.0, 0.0],
      sa: 0,
      sb: 0,
      status: "idle",
      winner: nil,
      serveAt: 0,
      server: "a",
      t: 0
    }

  def humans(p), do: Enum.reject([p.a, p.b], &(&1 in [nil, @bot]))
  def active?(p), do: p.status != "idle"

  @doc "Takes a free (or bot-held) side. Starts a game once both sides are set."
  @spec join(map(), String.t(), integer()) :: {:ok, map(), String.t()} | {:error, :busy}
  def join(p, player, now) do
    cond do
      p.a == player -> {:ok, p, "a"}
      p.b == player -> {:ok, p, "b"}
      p.a in [nil, @bot] -> {:ok, fill(%{p | a: player}, now), "a"}
      p.b in [nil, @bot] -> {:ok, fill(%{p | b: player}, now), "b"}
      true -> {:error, :busy}
    end
  end

  @doc "Leaves the table; a lone remaining human keeps playing against the bot."
  def leave(p, player, now) do
    p = %{p | a: if(p.a == player, do: nil, else: p.a), b: if(p.b == player, do: nil, else: p.b)}
    if humans(p) == [], do: new(p.id), else: fill(p, now)
  end

  # One human → the bot takes the other side. Fresh game when players change.
  defp fill(p, now) do
    p = %{p | a: p.a || @bot, b: p.b || @bot}

    %{
      p
      | sa: 0,
        sb: 0,
        winner: nil,
        status: "point",
        serveAt: now + 1500,
        server: "a",
        ball: [0.0, 0.0, 0.0, 0.0]
    }
  end

  def set_paddle(p, player, x) when is_number(x) do
    x = x |> max(-@half_w) |> min(@half_w) |> Kernel./(1)

    cond do
      p.a == player -> %{p | pa: x}
      p.b == player -> %{p | pb: x}
      true -> p
    end
  end

  @doc "Advances the simulation by `dt` seconds at time `now` (ms). `rand` injectable for tests."
  def step(p, dt, now, rand \\ &:rand.uniform/0)
  def step(%{status: "idle"} = p, _dt, _now, _rand), do: p

  def step(%{status: status} = p, dt, now, rand) when status in ["point", "won"] do
    p = bots(p, dt)

    cond do
      now < p.serveAt -> %{p | t: now}
      status == "won" -> fill(p, now)
      true -> serve(p, now, rand)
    end
  end

  def step(%{status: "playing", ball: [x, z, vx, vz]} = p, dt, now, _rand) do
    p = bots(p, dt)
    nx = x + vx * dt
    nz = z + vz * dt

    # Side cushions (it's our office rules).
    {nx, vx} =
      cond do
        nx > @half_w -> {2 * @half_w - nx, -vx}
        nx < -@half_w -> {-2 * @half_w - nx, -vx}
        true -> {nx, vx}
      end

    cond do
      nz < -@half_l and vz < 0 -> at_end(p, "a", x, z, nx, nz, vx, vz, now)
      nz > @half_l and vz > 0 -> at_end(p, "b", x, z, nx, nz, vx, vz, now)
      true -> %{p | ball: [nx, nz, vx, vz], t: now}
    end
  end

  # Ball reached `side`'s end line: returned by the paddle, or a point for the other side.
  defp at_end(p, side, x, z, nx, nz, vx, vz, now) do
    line = if side == "a", do: -@half_l, else: @half_l
    k = if nz == z, do: 1.0, else: (line - z) / (nz - z)
    cross_x = x + (nx - x) * k
    paddle = if side == "a", do: p.pa, else: p.pb

    if abs(cross_x - paddle) <= @paddle_half do
      speed = min(abs(vz) * @speedup, @max_speed)
      new_vx = (vx + (cross_x - paddle) * @spin) |> max(-3.5) |> min(3.5)
      new_vz = if side == "a", do: speed, else: -speed
      %{p | ball: [cross_x, line, new_vx, new_vz], t: now}
    else
      point(p, if(side == "a", do: "b", else: "a"), now)
    end
  end

  defp point(p, winner_side, now) do
    p = if winner_side == "a", do: %{p | sa: p.sa + 1}, else: %{p | sb: p.sb + 1}
    {hi, lo} = if p.sa >= p.sb, do: {p.sa, p.sb}, else: {p.sb, p.sa}

    if hi >= 11 and hi - lo >= 2 do
      winner = if p.sa > p.sb, do: p.a, else: p.b

      %{
        p
        | status: "won",
          winner: winner,
          serveAt: now + @win_pause_ms,
          ball: [0.0, 0.0, 0.0, 0.0],
          t: now
      }
    else
      # The side that lost the point serves.
      %{
        p
        | status: "point",
          serveAt: now + @point_pause_ms,
          server: if(winner_side == "a", do: "b", else: "a"),
          ball: [0.0, 0.0, 0.0, 0.0],
          t: now
      }
    end
  end

  defp serve(p, now, rand) do
    {z, vz} =
      if p.server == "a", do: {-@half_l + 0.1, @serve_speed}, else: {@half_l - 0.1, -@serve_speed}

    x = if p.server == "a", do: p.pa, else: p.pb
    %{p | status: "playing", ball: [x, z, (rand.() - 0.5) * 1.4, vz], t: now}
  end

  # The bot tracks the ball a bit lazily, so it can be beaten.
  defp bots(p, dt) do
    [bx, _bz, _vx, vz] = p.ball

    move = fn cur, toward ->
      (cur + (toward - cur)) |> max(-@bot_speed * dt) |> min(@bot_speed * dt)
    end

    pa = if p.a == @bot, do: move.(p.pa, if(vz < 0, do: bx, else: 0.0)), else: p.pa
    pb = if p.b == @bot, do: move.(p.pb, if(vz > 0, do: bx, else: 0.0)), else: p.pb
    %{p | pa: pa, pb: pb}
  end

  @doc "Wire format (PongState)."
  def to_wire(p) do
    Map.take(p, [:id, :a, :b, :pa, :pb, :ball, :sa, :sb, :status, :winner, :t])
    |> Map.update!(:ball, fn b -> Enum.map(b, &Float.round(&1 / 1, 3)) end)
    |> Map.update!(:pa, &Float.round(&1 / 1, 3))
    |> Map.update!(:pb, &Float.round(&1 / 1, 3))
  end
end
