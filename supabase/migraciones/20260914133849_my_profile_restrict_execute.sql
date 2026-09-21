revoke execute on function public.my_profile() from public;
revoke execute on function public.my_profile() from anon;
grant execute on function public.my_profile() to authenticated;