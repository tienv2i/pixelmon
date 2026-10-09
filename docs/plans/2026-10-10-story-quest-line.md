# Story & Quest Line — Plan (2026-10-10)

> Trạng thái: **PLAN — chưa triển khai**. Triển khai từ P0 sau khi chốt 2 câu hỏi cuối file.

## 0. Nền dùng được

- `DialogueModal.startDialogue({lines, onComplete})` + typewriter; NPC dialog từ map data.
- Trainer battle + `defeatedTrainers`; inventory/money/pokemon/evolution APIs; `pokemon_events` audit.
- 5 map: player-house-1f → lappet-town → route-1 (+ pokemon-lab, daisy-house).
- Module `debug/` + registry (lệnh `/quest` sau này).
- **Thiếu:** flag system, quest storage, engine objective, UI tracker.

## 1. Data quest = JSON (`packages/shared/data/quests/*.json`, zod `QuestSchema`)

```json
{
  "id": "essen_ch1_lab",
  "chapter": 1,
  "name": { "vi": "…", "en": "…" },
  "giverNpc": "lab_prof",
  "steps": [
    { "id": "talk_prof", "type": "talk", "npc": "lab_prof", "lines": "dlg.lab_intro" },
    { "id": "catch3", "type": "catch", "count": 3 },
    { "id": "beat_rival", "type": "defeat_trainer", "trainer": "rival_route1" },
    { "id": "report", "type": "talk", "npc": "lab_prof" }
  ],
  "rewards": [{ "kind": "money", "amount": 500 }, { "kind": "item", "id": "pokeball", "qty": 5 }],
  "next": ["essen_ch2_gym"]
}
```

- Objective types: `talk` · `defeat_trainer` · `catch` · `defeat_species` · `collect` · `reach` · `evolve` · `level`.
- Dialogue tách `dialogues/*.json` theo key, song ngữ.

## 2. Engine (server-authoritative)

- Storage: `player_quests(user_id, quest_id, step_idx, progress JSONB, status, updated_at)` (migration idempotent).
- `QuestService` (`apps/server/src/modules/quest/`): `acceptQuest`/`advanceOn(event)` hook vào
  `trainer_defeated` (presence), `logCatch`, `use_item`/`applyEvolution`, warp (`reach`), NPC click (`talk`).
- Xong step → push `quest_update` về WorldRoom → client banner + tracker.
- `claimReward` 1 transaction, chống claim 2 lần bằng `status`.
- Client: QuestTracker widget + toast + marker `!/?` trên NPC.
- Debug: `/quest list|accept|step|reset|complete` qua `debug/`.

## 3. Story mẫu — Essen Chapter 1 (dùng đúng 5 map hiện có)

1. `q0_wake` (player-house-1f): mẹ dặn xuống Lappet Town — tutorial di chuyển (`reach`).
2. `q1_lab` (pokemon-lab): bắt 3 Pokémon Route-1 (`catch`) → thưởng 5 Poké Ball + mở Pokédex.
3. `q2_rival` (route-1): đấu rival (`defeat_trainer`) → potion + mở đường.
4. `q3_daisy` (daisy-house): đưa thư (`collect` + `talk`) → Lucky Egg.
5. `q4_gym_prep` (lappet-town): team Lv.12 + 1 evolution (`level` + `evolve`) → hết Ch.1.

## 4. Phases

| Phase | Việc | Xong khi |
|---|---|---|
| P0 | `QuestSchema` + bảng `player_quests` + `QuestService` khung + message `quest_update` | typecheck, `/health` |
| P1 | Hook `talk` / `defeat_trainer` / `reach` | quest 1-step chạy end-to-end |
| P2 | Hook `catch`/`collect`/`evolve`/`level` + `claimReward` | Ch.1 chơi được đầu→cuối |
| P3 | UI tracker + toast + marker NPC | Không mở panel vẫn biết việc tiếp |
| P4 | `/quest` + content Ch.1 song ngữ full | Test full bằng CLI |

**Không làm:** quest phân nhánh/choice (DialogueModal chưa có lựa chọn), daily/repeatable, quest PvP.

## 5. Chờ chốt

1. Tuyến Chapter 1 trên có ổn không (map/NPC/thưởng), hay story khác?
2. Song ngữ ngay từ đầu hay VI trước, EN sau?
