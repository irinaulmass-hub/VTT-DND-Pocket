# Роли и границы доступа D1

Аудит кода на `dc85cd5`. Ниже описаны существующие проверки и целевой контракт для C1/D2. Персональная авторизация пока не реализована.

| Роль | Целевой доступ |
| --- | --- |
| Мастер | Полная кампания, редактор, назначения персонажей и публикация открытий |
| Игрок | Карточка и проекция карты назначенного героя, действия в пределах выданных мастером полномочий |
| Телевизор | Опубликованная общая проекция, только чтение и повторная синхронизация |
| Гость | Подключение и получение назначения, без карточек и закрытых данных кампании |

## Подтверждённые ограничения текущего кода

- `player-login` выбирает героя по имени, а `claim-character` принимает ID и имя от клиента. Выбор кампании через `game` проверяет её существование. Эти механизмы ещё не подтверждают право на героя или кампанию.
- `GET /api/characters`, `GET /api/players` и `request-characters` возвращают полные карточки. Изменения карточек рассылаются обычным клиентам через `CHARACTERS_UPDATE` и `PLAYER_DATA_UPDATE`.
- `GET /api/scenes` выдаёт список сцен, а `/api/maps`, `/api/tiles`, `/api/audio` и `/assets` открывают каталог и ресурсы. В доступном изображении могут находиться закрытые участки. Для персональной карты понадобится проверять выдачу ресурса вместе с проекцией.
- `GET /api/worlds/table` фильтрует тайлы по общей маске и скрывает объекты с `hidden`, но возвращает все жетоны. `WORLD_UPDATE` содержит среднюю позицию партии. Эти данные требуют отдельных проекций для разных героев.
- `POST /api/loot/:id/take` проверяет открытость контейнера, ревизию и наличие персонажа в кампании, но позволяет указать чужой `characterId`. `interact-object` проверяет видимость объекта, но не личность игрока. `interact-lightbox-object` принимает объект состояния и рассылает его без проверки определения объекта.
- `view=table` ограничивает WS-команды и типы событий, но параметр выбирает клиент. Эта роль не защищает HTTP-запросы из того же браузера. Cookie мастера распознаётся HTTP независимо от открытого экрана.
- `sendFullState` использует `sendView`, который фильтрует некоторые объекты и события. Прямые вызовы `ws.send` обходят эту функцию. Каждый такой ответ должен получить явный контракт роли.
- Уже защищены редактор, черновики мира и карт, заметки, библиотека, каталог, приключения и ссылки локаций. Фильтры скрытых объектов и секретных особенностей проверяются существующим интеграционным тестом.

## Порядок реализации

C1 вводит назначение героя мастером и серверное полномочие, привязанное к кампании и ID героя. Имя остаётся отображаемым полем. Смена героя и отзыв назначения прекращают старый доступ, включая уже открытый WS. Телевизор получает отдельное полномочие чтения, чтобы открытие его экрана в браузере мастера не давало клиентскому коду мастерский API.

D2 применяет одну модель полномочий к HTTP, WS, первоначальному снимку, рассылке, повторной синхронизации и ресурсам. Сначала закрываются полные карточки и выбор чужого героя, затем добыча и взаимодействия, затем списки сцен, изображения и персональные проекции мира. До подключения личного тумана проверяется отсутствие скрытых данных во всех этих каналах.

Приёмка C1/D2 должна включать два телефона, ТВ и гостя, подмену ID героя и кампании, отзыв доступа, повторное соединение, HTTP с cookie мастера на телевизоре, прямые WS-ответы и чтение ресурсов по известному URL. Существующие проверки общего экрана не являются приёмкой персональной приватности.

## Реестр HTTP

Проверки ниже извлечены из объявления маршрута. Дополнительные условия в обработчике описаны выше. `requireDm` возвращает перенаправление на вход, `requireNotesDm` — HTTP 401. Отсутствие этих middleware означает, что право мастера на входе не требуется.

| Метод и путь | Проверка на входе | Источник |
| --- | --- | --- |
| `GET /api/campaigns` | Обработчик | `server.js:53` |
| `POST /api/campaigns` | requireDm | `server.js:54` |
| `GET /api/notes` | requireNotesDm | `server.js:80` |
| `PUT /api/notes` | requireNotesDm | `server.js:86` |
| `GET /api/assistant/models` | requireNotesDm | `server.js:103` |
| `POST /api/assistant/chat` | requireNotesDm | `server.js:111` |
| `GET /dm-login` | Обработчик | `server.js:229` |
| `POST /dm-login` | Обработчик | `server.js:243` |
| `GET /dm-logout` | Обработчик | `server.js:253` |
| `POST /api/show` | requireDm | `server.js:855` |
| `POST /api/overlay` | requireDm | `server.js:862` |
| `POST /api/dice-roll` | requireDm | `server.js:868` |
| `POST /api/stopaudio` | requireDm | `server.js:874` |
| `POST /api/blackout` | requireDm | `server.js:875` |
| `POST /api/clear` | requireDm | `server.js:877` |
| `POST /api/clear-scene` | requireDm | `server.js:883` |
| `GET /api/state` | Обработчик | `server.js:888` |
| `GET /api/bestiary/:file` | Обработчик | `server.js:891` |
| `GET /api/maps` | Обработчик | `server.js:906` |
| `GET /api/tiles` | Обработчик | `server.js:911` |
| `GET /api/audio` | Обработчик | `server.js:920` |
| `GET /api/scenes` | Обработчик | `server.js:935` |
| `POST /api/scenes` | requireDm | `server.js:945` |
| `POST /api/characters/automatic` | requireDm | `server.js:964` |
| `GET /api/characters` | Обработчик | `server.js:970` |
| `POST /api/characters` | requireDm | `server.js:974` |
| `PUT /api/characters/:id` | requireDm | `server.js:1002` |
| `POST /api/characters/:id/duplicate` | requireDm | `server.js:1021` |
| `DELETE /api/characters/:id` | requireDm | `server.js:1028` |
| `GET /api/players` | Обработчик | `server.js:1038` |
| `POST /api/players` | requireDm | `server.js:1039` |
| `GET /map-builder` | requireDm | `server.js:1052` |
| `POST /api/map-builder/save` | requireDm | `server.js:1078` |
| `GET /api/map-builder/states` | requireDm | `server.js:1104` |
| `GET /api/map-builder/state` | requireDm | `server.js:1114` |
| `GET /api/map-builder/puzzle` | Обработчик | `server.js:1128` |
| `GET /` | requireDm | `server.js:1139` |
| `GET /remote/player` | Обработчик | `server.js:1141` |
| `GET /player` | Обработчик | `server.js:1142` |
| `GET /tv` | Обработчик | `server.js:1143` |
| `GET /api/health` | Обработчик | `server.js:1144` |
| `GET /api/connection` | requireDm | `server.js:1145` |
| `GET /api/worlds` | requireDm | `worlds.js:66` |
| `POST /api/worlds` | requireDm | `worlds.js:69` |
| `GET /api/worlds/live` | requireDm | `worlds.js:76` |
| `GET /api/worlds/table` | Обработчик | `worlds.js:85` |
| `GET /api/worlds/:id/chunks` | requireDm | `worlds.js:110` |
| `PATCH /api/worlds/:id/chunks` | requireDm | `worlds.js:119` |
| `GET /api/worlds/:id` | requireDm | `worlds.js:132` |
| `PUT /api/worlds/:id` | requireDm | `worlds.js:137` |
| `POST /api/worlds/:id/publish` | requireDm | `worlds.js:147` |
| `POST /api/worlds/live/change` | requireDm | `worlds.js:162` |
| `POST /api/worlds/live/hide` | requireDm | `worlds.js:186` |
| `GET /api/loot` | Обработчик | `loot.js:29` |
| `POST /api/loot` | requireDm | `loot.js:35` |
| `PUT /api/loot/:id` | requireDm | `loot.js:42` |
| `POST /api/loot/:id/take` | Обработчик | `loot.js:59` |
| `GET /api/library` | requireDm | `library.js:15` |
| `POST /api/library` | requireDm | `library.js:16` |
| `PUT /api/library/:id` | requireDm | `library.js:17` |
| `GET /api/catalog` | requireDm | `catalog.js:94` |
| `POST /api/catalog` | requireDm | `catalog.js:97` |
| `POST /api/catalog/:id/import` | requireDm | `catalog.js:121` |
| `GET /api/catalog/:id/:asset(image|background)` | requireDm | `catalog.js:126` |
| `POST /api/characters/:id/rest` | requireDm | `advancement.js:3` |
| `POST /api/characters/:id/advance` | requireDm | `advancement.js:10` |
| `GET /api/adventure` | requireDm | `adventure.js:8` |
| `GET /api/adventure/source.pdf` | requireDm | `adventure.js:13` |
| `PUT /api/adventure/state` | requireDm | `adventure.js:18` |
| `GET /api/locations/links` | requireDm | `location-links.js:18` |
| `POST /api/locations/links` | requireDm | `location-links.js:22` |
| `DELETE /api/locations/links/:id` | requireDm | `location-links.js:38` |

## Реестр входящих WS-команд

Все команды обрабатываются в контексте выбранной кампании. Для ТВ разрешён только `request-sync`.

| Команда | Проверка |
| --- | --- |
| `dm-blind-roll` | Мастер |
| `update-player-data` | Мастер |
| `dm-connect` | Мастер |
| `request-sync` | Условия обработчика, без назначения мастером |
| `blackout` | Мастер |
| `show` | Мастер |
| `show-scene-view` | Мастер |
| `clear` | Мастер |
| `clear-scene` | Мастер |
| `play-audio` | Мастер |
| `stop-audio` | Мастер |
| `send-overlay` | Мастер |
| `update-fog` | Мастер |
| `set-fog-key` | Мастер |
| `set-rings` | Мастер |
| `update-tokens` | Мастер |
| `sync-all-tokens` | Мастер |
| `update-drawing` | Мастер |
| `trigger-feature` | Мастер |
| `reset-feature` | Мастер |
| `update-features` | Мастер |
| `update-objects` | Мастер |
| `interact-lightbox-object` | Условия обработчика, без назначения мастером |
| `interact-object` | Условия обработчика, без назначения мастером |
| `move-object` | Мастер |
| `lock-player` | Мастер |
| `unlock-player` | Мастер |
| `lock-all` | Мастер |
| `unlock-all` | Мастер |
| `dm-set-target` | Мастер |
| `trigger-attack` | Мастер |
| `toggle-grid` | Мастер |
| `player-login` | Условия обработчика, без назначения мастером |
| `move-player-token` | Имя героя в WS |
| `set-target` | Имя героя в WS |
| `player-dice-roll` | Имя героя в WS |
| `request-characters` | Условия обработчика, без назначения мастером |
| `claim-character` | Условия обработчика, без назначения мастером |
| `update-character` | Мастер |
| `open-location` | Мастер, обработка до switch |

## Реализованный шаг C1a

Мастерские `GET/POST /api/player-access` и `DELETE /api/player-access/:characterId` управляют назначениями в текущей кампании. POST принимает `characterId` и однократно возвращает токен приглашения. В файле `player-access.json` хранится его хеш. Новое приглашение заменяет прежнее для этого героя. `GET /api/player-access/current` принимает `Authorization: Bearer <token>` и возвращает ID героя либо HTTP 401. Интерфейсы и WS подключаются в C1b. До этого прежний выбор героя и выдача карточек продолжают действовать.
