# Phase D — Backend dependencies (applied 2026-05-17)

Applied remotely via Supabase MCP `apply_migration` against project `bjbvqvzbzczjbatgmccb`.
Recorded here for audit trail; engine commits below depend on these being live.

## Migrations

| Migration name | Purpose |
|---|---|
| `phase_d_storage_buckets_lm_share_lm_audio` | Created `lm-share` (public, 2MB, PNG) + `lm-audio` (public, 10MB, MP3) buckets |
| `phase_d_lm_calculator_benchmark_rpc` | RPC `lm_calculator_benchmark(p_slug, p_output_id)` → 10-bucket histogram + median/p25/p75 across 180d capture events |
| `phase_d_lm_assessment_answer_distribution_rpc` | RPC `lm_assessment_answer_distribution(p_slug, p_question_id, p_persona)` → per-answer pct + sample_size (skip reveal if < 10) |
| `phase_d_lm_assessment_score_history_rpc` | RPC `lm_assessment_score_history(p_slug, p_email)` → chronological score history for repeat-taker sparkline |
| `phase_d_lm_events_indexes` | Composite indexes on `lm_events(lm_slug, event_type, created_at)`, `assessment_results(assessment_slug, completed_at)`, `assessment_results(assessment_slug, lower(email), completed_at)` |
| `phase_d_lm_events_check_extend` | Extended `lm_events_event_type_check` to allow `complete_celebrate`, `mini_check`, `audio_play` |

## Edge function

- `lm-beacon` v16 deployed: added 3 event types to `VALID_EVENTS` allowlist, added `pickSequenceBySlug` helper, and added Checklist 7-day remainder opt-in enqueue branch in the `capture` handler. Existing default per-format sequence still fires; the 7-day remainder is purely additive and only enqueues when `answers.want_7day_followup === true` AND lm_format includes "checklist".

## Nurture sequence

- `nurture_sequences.slug = 'checklist_7day_remainder'` (id `e32b45de-c7b4-4e69-82a4-df5294b0ed5d`) with one `nurture_emails` row (step 1, delay 168h) using merge token `{{unchecked_items_list}}`.

## Smoke tests

Verified via `curl POST /functions/v1/lm-beacon` that all 3 new event types return `{"ok":true}` and persist to `lm_events`. RPCs return empty rowsets cleanly for unseen slugs (no data yet — they populate as captures roll in).
