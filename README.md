# Virtual Office

Браузерный 3D-офис: коллеги заходят по ссылке `/s/<spaceId>`, ходят персонажами, слышат друг друга с учётом расстояния и комнат, показывают экран и PDF на больших экранах переговорок. По сути — Google Meet с 3D-пространством.

| Часть | Стек |
|---|---|
| `client/` | Vite, React 19, TypeScript (strict), React Three Fiber, drei, @react-three/rapier, zustand, phoenix.js, livekit-client, pdfjs-dist |
| `server/` | Elixir, Phoenix 1.8: только API, Channels и Presence; состояние в памяти (GenServer на каждый space) |
| медиа | LiveKit (self-hosted SFU); Phoenix выдаёт JWT-токены (Joken, HS256) |
| `infra/` | docker-compose: `livekit-server`, `phoenix`, `caddy` (HTTPS, раздача клиента, reverse proxy) |
| `shared/` | `level.json` (офис, зоны, экраны, столы), `protocol.json` (сообщения канала) + сгенерированный `protocol.gen.ts` |

## Возможности

- **Вход без регистрации**: имя, цвет аватара, выбор микрофона, камеры и динамиков с превью и индикатором уровня. Точка расширения под OAuth — `server/lib/office/auth.ex`.
- **Офис из `level.json`**: open space с 24 столами и мониторами, две изолированные переговорки, большой зал с экраном 5.6 м, кухня-лаунж. Мебель рисуется инстансингом (≈20 draw calls на весь уровень). Можно подставить `office.glb` из Blender (см. ниже).
- **Управление**: WASD, Shift — бег, мышь — орбитальная камера с коллизией о стены, колесо — зум, Tab — вид сверху, E — действие, F — экран крупно, M/V — микрофон и камера, Enter — чат, 1–5 — реакции, пробел — push-to-talk (если включён).
- **Сетевой синк**: 15 Гц только при изменении. Сервер валидирует payload по `protocol.json`, делает rate limit (token bucket) и проверку скорости (при нарушении шлёт `correction`), рассылает изменения одним `batch` на тик. У клиента — буфер интерполяции 100 мс и оценка сдвига часов. Presence хранит зону каждого игрока. При обрыве сокет переподключается сам, без перезагрузки страницы.
- **Голос и видео**: одна LiveKit-комната на space.
  - В open space и на кухне звук пространственный: полная громкость до 2 м, затухание до нуля к 10 м, стереопанорама относительно камеры (Web Audio: GainNode + StereoPannerNode).
  - В изолированных зонах (переговорки, зал) внутри все слышат друг друга на полной громкости, снаружи зону не слышно, и изнутри наружу тоже.
  - Подписка на треки ручная (`autoSubscribe: false`, гистерезис 11/13 м): тянем только тех, кого слышим или видим.
  - Сверху HUD — плашки камер ближайших слышимых людей. Индикатор речи приходит от active speakers LiveKit.
- **Большие экраны**: E → «Показать экран» → `getDisplayMedia` → трек `screen:<screenId>` в LiveKit → `VideoTexture` у всех в той же зоне.
  - Сервер хранит занятость: один докладчик на экран, экран освобождается при уходе или по кнопке «перестать показывать».
  - Клик по экрану или F открывает 2D-оверлей для чтения.
- **PDF**: E → «Показать PDF» или drag&drop. Файл загружается в Phoenix, pdf.js рисует страницу в `CanvasTexture`. Листает только владелец (← →), номер слайда синхронизируется через канал. Оверлей перерисовывает страницу в разрешении экрана.
- **Столы**: E у стола — сесть, камера переходит на монитор. Экран или PDF на мониторе видят те, кто в пределах ~6 м (парное программирование). Esc или WASD — встать.
- **Чат**: общий и локальный (текущая зона — сервер доставляет такие сообщения только находящимся в зоне). Сервер хранит последние 100 сообщений. Эмодзи-реакции над головой.
- **Мягкая деградация**: без камеры, микрофона или LiveKit можно ходить, читать PDF и чат. Медиа переподключается само.

## Архитектура

```
Browser ──HTTPS──► Caddy ─┬─ /            → статический клиент (dist)
                          ├─ /api/*, /socket/* → Phoenix :4000  (REST, Channels, Presence)
                          └─ /lk/*        → LiveKit :7880   (signalling, WebSocket)
Browser ◄──UDP 50000-60000 / TCP 7881 / TURN 3478──► LiveKit (медиа, напрямую)
```

- `Office.Space` (GenServer на каждый space, запускается по требованию, гаснет через минуту без людей): позиции, занятость экранов (`Office.Screens`), история чата (`Office.Chat`). Рассылает `batch` раз в 66 мс.
- `OfficeWeb.SpaceChannel`: валидация (`Office.Protocol` из `shared/protocol.json`), rate limit (`Office.RateLimit`), санити-проверка движения (`Office.Movement`), зоны (`Office.Level` из `shared/level.json`), Presence, токены LiveKit (`Office.LiveKit`).
- Клиент: мутабельное состояние, меняющееся каждый кадр (позиции, буферы интерполяции), живёт вне React (`store/local.ts`, `net/remotes.ts`); zustand хранит то, что показывает UI. Медиа-логика — `media/media.ts`, чистые функции слышимости — `lib/audio.ts`, интерполяция — `lib/interpolation.ts`.

### Протокол: одно место

`shared/protocol.json` — единственный источник правды: события клиента и сервера, поля, общие типы и enum'ы.

- Клиент: `npm run gen:protocol` генерирует `shared/protocol.gen.ts`. `npm run build` проверяет, что файл не устарел.
- Сервер: `Office.Protocol` читает JSON на этапе компиляции (`@external_resource`), отклоняет неизвестные события и проверяет типы полей. ExUnit-тест следит, что у канала есть обработчик каждого события из JSON.

## Локальный запуск (разработка, без Docker)

Нужны Node ≥ 20.19, Elixir ≥ 1.17 / OTP 26+ и (для голоса) `livekit-server`.

```bash
# 1. LiveKit в dev-режиме (ключи devkey/secret совпадают с дефолтами Phoenix в dev).
#    Установка: https://docs.livekit.io/home/self-hosting/local/ (brew install livekit / скрипт get.livekit.io)
livekit-server --dev --bind 0.0.0.0

# 2. Phoenix на :4000
cd server && mix setup && mix phx.server

# 3. Клиент на https://localhost:5173 (самоподписанный сертификат; /api, /socket и /lk проксируются)
cd client && npm install && npm run dev
```

Откройте https://localhost:5173, примите предупреждение о сертификате, нажмите «Создать пространство» и откройте ту же ссылку во второй вкладке или другом браузере.

- Без LiveKit всё, кроме голоса, видео и демонстрации экрана, тоже работает.
- `HTTP=1 npm run dev` запускает Vite без TLS: `http://localhost` — тоже secure context.
- С другого компьютера в LAN: `livekit-server --dev --bind 0.0.0.0 --node-ip <LAN-IP>`, затем откройте `https://<LAN-IP>:5173`. HTTPS обязателен: без него браузер не даст `getUserMedia`/`getDisplayMedia`.
- `?debug` в адресе показывает FPS, draw calls и треугольники.

### Проверка вручную (2 браузера)

1. **Вход**: имя, цвет, выбор устройств — видно превью камеры и индикатор микрофона.
2. **Движение**: вторая вкладка видит перемещения первой плавно, без рывков. Ник над головой, 👥 — список с зонами.
3. **Реконнект**: перезапустите `mix phx.server` — обе вкладки сами вернутся («Переподключение…» → онлайн).
4. **Голос**: подойдите друг к другу в open space — слышно, при удалении звук затихает (к 10 м пропадает), панорама следует за камерой. Зайдите в «Байкал»: снаружи вас не слышно, внутри слышно всех на полной громкости. Индикатор речи — зелёная обводка ника. M/V — мьют и камера (иконка мьюта над головой у других).
5. **Экран**: в переговорке E → «Показать экран» → выбрать окно; вторая вкладка в той же комнате видит поток на стене, вне комнаты — нет. Клик по экрану или F — оверлей. Второй человек не может занять тот же экран. При закрытии вкладки экран освобождается.
6. **PDF**: перетащите PDF в окно, стоя у экрана (или E → «Показать PDF»). ← → листают у всех, у зрителя стрелки не работают.
7. **Стол**: E у стула — сесть, E — меню монитора, «Показать экран на мониторе» — видят только те, кто рядом.
8. **Чат**: Enter — вкладка «Все» и вкладка текущей зоны. 1–5 — реакции над головой.
9. **Нагрузка**: `cd client && npm run bots -- ws://localhost:4000/socket <spaceId> 25` — 25 ботов бродят по open space.

## Тесты

```bash
cd server && mix test   # зоны, Protocol, rate limit, движение, экраны, чат, загрузки, интеграция канала
cd client && npm test   # интерполяция, clock sync, громкость/панорама/изоляция, видимость экранов, геометрия уровня
cd client && npm run typecheck
```

## Запуск в Docker (локально)

```bash
cd infra
cp .env.example .env
# DOMAIN=localhost, LIVEKIT_NODE_IP=127.0.0.1, сгенерируйте ключи и SECRET_KEY_BASE
docker compose up -d --build
```

Затем откройте https://localhost. Caddy выпустит сертификат из своего внутреннего CA: примите предупреждение или выполните `docker compose exec caddy caddy trust`. Все сервисы работают в `network_mode: host` (Linux; на Docker Desktop нужна включённая host-сеть).

## Деплой на VPS

Для 30 человек в одном space: 2 vCPU / 2–4 GB RAM, Linux, Docker. Основная нагрузка — на LiveKit (SFU, CPU и исходящий трафик). Phoenix почти ничего не тратит.

1. **DNS**: A-запись `office.example.com` → IP сервера.
2. **Фаервол** (например, ufw):

   | Порт | Протокол | Зачем |
   |---|---|---|
   | 80, 443 | TCP | HTTP → HTTPS, сайт, WebSocket (Caddy, Let's Encrypt) |
   | 443 | UDP | HTTP/3 (необязательно) |
   | 7881 | TCP | ICE/TCP-фолбэк LiveKit, когда UDP закрыт |
   | 3478 | UDP | встроенный TURN LiveKit (клиенты за симметричным NAT) |
   | 50000–60000 | UDP | медиа WebRTC (ICE/UDP) |

   Порты 4000 (Phoenix) и 7880 (LiveKit signalling) наружу открывать не нужно: к ним ходит только Caddy. Phoenix слушает только 127.0.0.1.

   ```bash
   ufw allow 80,443/tcp && ufw allow 443/udp && ufw allow 7881/tcp && ufw allow 3478/udp && ufw allow 50000:60000/udp
   ```

3. **Конфигурация**:

   ```bash
   git clone <repo> && cd <repo>/infra
   cp .env.example .env
   ```

   | Переменная | Значение |
   |---|---|
   | `DOMAIN` | `office.example.com` |
   | `ACME_EMAIL` | почта для Let's Encrypt |
   | `LIVEKIT_NODE_IP` | **публичный** IP сервера (попадает в ICE-кандидаты) |
   | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `openssl rand -hex 8` / `openssl rand -base64 32` |
   | `LIVEKIT_PUBLIC_URL` | пусто → `wss://$DOMAIN/lk`; или `wss://lk.example.com`, если выносите LiveKit на свой поддомен |
   | `SECRET_KEY_BASE` | `openssl rand -base64 48` |

4. **Запуск**: `docker compose up -d --build`. Проверка: `curl https://office.example.com/api/health` → `{"ok":true}`. Логи — `docker compose logs -f livekit phoenix`.

5. **TURN/TLS (корпоративные сети)**. Если у пользователей закрыт весь UDP и нестандартные TCP-порты, нужен TURN через TLS на 443. Для него нужен отдельный поддомен (например, `turn.example.com`, A-запись на тот же IP) и сертификат. Порт 443 уже занят Caddy, поэтому TURN вешают на 5349 (откройте его) либо ставят L4-мультиплексор. Добавьте в `infra/livekit.yaml`:

   ```yaml
   turn:
     enabled: true
     domain: turn.example.com
     tls_port: 5349
     udp_port: 3478
     cert_file: /certs/turn.example.com.crt
     key_file: /certs/turn.example.com.key
   ```

   Сертификат может выпускать Caddy: добавьте блок `turn.example.com { respond 204 }` в Caddyfile и примонтируйте в livekit его хранилище `caddy_data:/data:ro`. Сертификаты лежат в `/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/turn.example.com/`.

6. **Загрузки PDF** хранятся в volume `uploads` (`/data/uploads`). Автоочистки в MVP нет: при необходимости заведите cron `find … -mtime +7 -delete`.

## Уровень: `shared/level.json`

Координаты — в метрах, Y вверх. Точки на полу задаются как `[x, z]`. `rotationY` задаёт направление «вперёд» объекта: `(sin r, cos r)`.

- `zones`: AABB `min`/`max`, `isolated`, `floorColor`. Зоны проверяются по порядку, первая подходящая побеждает: комнаты перечисляйте раньше open space.
- `walls`: осевые отрезки `from`/`to`, опционально `material: "glass"` и `doors: [{at, width}]` (над проёмом ставится перемычка).
- `desks`: позиция и поворот стола; `screenId` — его монитор.
- `screens`: `kind: "wall" | "desk"`, `zoneId`, `position` `[x, y, z]`, `rotationY` (нормаль экрана), `size` `[w, h]`, `viewDistance` (для мониторов).
- `furniture`: `chair`, `meeting_table`, `cafe_table`, `coffee_table`, `sofa`, `counter`, `plant`, `stage`.

Тот же файл читает сервер: зоны нужны для Presence и зонального чата, экраны — для занятости и проверки «стоишь рядом». Клиентские тесты проверяют согласованность уровня: экраны внутри своих зон, двери свободны от коллайдеров.

### Замена на модель из Blender

1. Экспортируйте `office.glb` и положите в `client/public/office.glb`.
2. В `level.json` укажите `"glb": "/office.glb"`.
3. Меши коллизий назовите `col_*` (например, `col_wall_north`, `col_desk_03`). Они станут невидимыми trimesh-коллайдерами, всё остальное отрисуется как есть. Если GLB не загрузится, клиент откатится на процедурный уровень.
4. Зоны, экраны и столы по-прежнему задаются в `level.json`: расставьте их по координатам модели. Для производительности объединяйте меши по материалам, запекайте свет в текстуры и держите < 150 draw calls.

## Производительность

- Уровень ≈ 20 draw calls (по одному `InstancedMesh` на материал), аватар — 3 draw call. 25 ботов в кадре дают ~90 draw calls.
- Без теней, Lambert и hemisphere-свет, `dpr` ≤ 1.5, fog.
- Ники — DOM (drei `<Html>`) и не расходуют draw calls.
- Видео/PDF-текстуры создаются только для экранов, видимых из вашей зоны. Подписка на медиа — только на слышимых и видимых.
- Бандл: стартовый чанк ~220 КБ gzip. 3D-офис (three, rapier WASM) подгружается, пока человек в лобби; pdf.js — только при показе PDF.
- Сервер: 25 ботов по 15 Гц — один батч на тик на space, десятки процентов одного ядра в dev-режиме.

## Что дальше

- OAuth (Google): `/api/auth/google/callback` → `Phoenix.Token` → параметр `auth` при join → проверка в `Office.Auth`.
- GLB-аватары с анимациями idle/walk/run (Quaternius/Kenney + Mixamo): точка встраивания — `client/src/scene/Avatar.tsx`, сетевое `anim` уже передаётся.
- Видео-текстура камеры над головой, звук демонстрации экрана, запись встреч (LiveKit Egress).
- Хранение PDF в S3, персистентный чат, несколько узлов (Presence и PubSub уже кластерные; Space-процессы надо будет распределить через `:global`/Horde).
