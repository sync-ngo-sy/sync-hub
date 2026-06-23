update public.source_documents
set
  source_uri = 'https://drive.google.com/drive/folders/1hvGKw0bAPbh-RXCJgz_7j4SWUsWhIxo-',
  storage_path = null,
  metadata_json = metadata_json || jsonb_build_object(
    'external_source_folder_url',
    'https://drive.google.com/drive/folders/1hvGKw0bAPbh-RXCJgz_7j4SWUsWhIxo-',
    'source_uri_replaced_at',
    timezone('utc', now())
  )
where
  source_uri ilike '/Users/aqassab/%'
  or source_uri ilike 'file:/Users/aqassab/%'
  or source_uri ilike 'file:///Users/aqassab/%'
  or source_uri ilike '%/workspaces/demo/%';
