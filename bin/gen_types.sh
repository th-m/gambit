#!/bin/bash
npx supabase login && npx supabase gen types typescript --project-id "ymkbbvnqdtxurcgytbbp" --schema public > ./app/types/supabase.ts
