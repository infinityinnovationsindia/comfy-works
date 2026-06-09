'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// FIX: form action={upsertShift} passes ONE arg (formData), not two.
// Old signature (_prev, formData) caused formData to be undefined → crash.
export async function upsertShift(formData: FormData) {
  const sb  = admin();
  const id  = (formData.get('id') as string|null) || null;
  const data = {
    id:         (formData.get('shift_id') as string).toUpperCase().replace(/\s+/g,'_'),
    name:       formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time:   formData.get('end_time') as string,
    location:   (formData.get('location') as string) || null,
    notes:      (formData.get('notes') as string) || null,
  };
  if (!data.name || !data.start_time || !data.end_time) return { error: 'Name, start and end time required.' };
  const { error } = id
    ? await sb.from('shifts').update({ name:data.name, start_time:data.start_time, end_time:data.end_time, location:data.location, notes:data.notes }).eq('id', id)
    : await sb.from('shifts').insert(data);
  if (error) return { error: error.message };
  revalidatePath('/shifts');
  redirect('/shifts');
}

export async function deleteShift(id: string) {
  const sb = admin();
  // Check if any employees use this shift
  const { count } = await sb.from('employees').select('id', { count: 'exact', head: true }).eq('shift_id', id);
  if (count && count > 0) {
    return { error: `Cannot delete — ${count} employee(s) are on this shift. Reassign them first.` };
  }
  await sb.from('shifts').delete().eq('id', id);
  revalidatePath('/shifts');
  redirect('/shifts');
}
