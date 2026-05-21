'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function upsertShift(_prev: unknown, formData: FormData) {
  const sb  = admin();
  const id  = (formData.get('id') as string|null) || null;
  const data = {
    id:         (formData.get('shift_id') as string).toUpperCase().replace(/s+/g,'_'),
    name:       formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time:   formData.get('end_time') as string,
    location:   (formData.get('location') as string) || null,
    notes:      (formData.get('notes') as string) || null,
  };
  if (!data.name || !data.start_time || !data.end_time) return { error: 'Name, start time and end time are required.' };
  const { error } = id
    ? await sb.from('shifts').update({ name:data.name, start_time:data.start_time, end_time:data.end_time, location:data.location, notes:data.notes }).eq('id', id)
    : await sb.from('shifts').insert(data);
  if (error) return { error: error.message };
  revalidatePath('/shifts');
  redirect('/shifts');
}
