-- Migration: add competitor_benchmarks table
-- Date: 20260501000000

CREATE TABLE IF NOT EXISTS public.competitor_benchmarks (
  id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
  competitor_name VARCHAR(100) NOT NULL,
  metric_name     VARCHAR(100) NOT NULL,
  metric_value    NUMERIC(18, 2) NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  source_url      VARCHAR(500),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT competitor_benchmarks_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_comp_bench_competitor  ON public.competitor_benchmarks (competitor_name);
CREATE INDEX IF NOT EXISTS idx_comp_bench_metric      ON public.competitor_benchmarks (metric_name);
CREATE INDEX IF NOT EXISTS idx_comp_bench_recorded_at ON public.competitor_benchmarks (recorded_at DESC);
