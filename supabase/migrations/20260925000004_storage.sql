-- ストレージのバケットとポリシー。storage スキーマは Supabase にしかないため、
-- ない環境（素の PostgreSQL での DB テスト）では何もしない。
do $migration$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping storage setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    -- 本人確認書類: 非公開。パスは {user_id}/{ファイル名}
    ('identity-documents', 'identity-documents', false, 10 * 1024 * 1024,
     array['image/jpeg', 'image/png', 'application/pdf']),
    -- スペースの写真: 公開。パスは {host_id}/{space_id}/{ファイル名}
    ('space-photos', 'space-photos', true, 10 * 1024 * 1024,
     array['image/jpeg', 'image/png', 'image/webp']),
    -- 月次明細・請求書 PDF: 非公開。サーバー（service role）だけが読み書きし、署名付き URL で渡す
    ('statements', 'statements', false, 10 * 1024 * 1024, array['application/pdf'])
  on conflict (id) do nothing;

  -- 本人確認書類: 本人がアップロード・閲覧できる。運営はサーバーが発行する
  -- 有効期限の短い署名付き URL で閲覧し、閲覧したことを audit_logs に記録する（フェーズ 3）
  execute $p$
    create policy identity_documents_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'identity-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy identity_documents_select_own on storage.objects for select to authenticated
      using (bucket_id = 'identity-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;

  -- スペースの写真: 閲覧は公開バケットの URL で行う。書き込みは自社のフォルダだけ
  execute $p$
    create policy space_photos_insert_member on storage.objects for insert to authenticated
      with check (
        bucket_id = 'space-photos'
        and public.is_host_member(((storage.foldername(name))[1])::uuid)
      )
  $p$;
  execute $p$
    create policy space_photos_delete_member on storage.objects for delete to authenticated
      using (
        bucket_id = 'space-photos'
        and public.is_host_member(((storage.foldername(name))[1])::uuid)
      )
  $p$;
end
$migration$;
