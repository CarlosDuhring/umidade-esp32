alter table public.plants
  add column if not exists adc_dry integer not null default 2500 check (adc_dry between 0 and 4095),
  add column if not exists adc_wet integer not null default 1250 check (adc_wet between 0 and 4095);

alter table public.plants drop constraint if exists plants_calibration_values_differ;
alter table public.plants add constraint plants_calibration_values_differ check (adc_dry <> adc_wet);
