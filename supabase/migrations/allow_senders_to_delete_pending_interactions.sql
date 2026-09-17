create policy "Senders can delete pending interactions"
on public.interactions
for delete
to public
using (auth.uid() = sender_id and status = 'pending');