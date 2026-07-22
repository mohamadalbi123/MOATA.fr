create policy "Anyone can read assistant setup for public diagnostic pages"
on public.assistants
for select
to anon
using (true);
