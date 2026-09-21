-- Uncertain extractions cannot reach apply_exam_analysis, which requires completed.
alter table public.exam_analyses drop constraint exam_analyses_status_check;
alter table public.exam_analyses add constraint exam_analyses_status_check
  check(status in ('uploading','queued','processing','review_required','completed','failed'));
