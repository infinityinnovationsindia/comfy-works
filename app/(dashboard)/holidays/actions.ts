'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function addHoliday(_prev: unknown, formData: FormData) {
  const sb   = admin();
  const cal  = formData.get('calendar_type') as string;
  const date = formData.get('date') as string;
  const name = formData.get('name') as string;
  const type = (formData.get('type') as string) || null;
  if (!cal || !date || !name) return { error: 'Calendar, date and name are required.' };
  const { error } = await sb.from('holidays').insert({ calendar_type: cal, date, name, type });
  if (error) return { error: error.message };
  revalidatePath('/holidays');
  return { success: true };
}

export async function deleteHoliday(id: string) {
  const sb = admin();
  await sb.from('holidays').delete().eq('id', id);
  revalidatePath('/holidays');
}
