-- Run this in your Supabase SQL editor to add versus tracking to user_stats

ALTER TABLE public.user_stats 
ADD COLUMN IF NOT EXISTS versus_wins integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS versus_losses integer DEFAULT 0;
