-- materials.language was never written or read (audit p2-uf-dead-item-and-material-fields):
-- the language of a question lives on the item (items.lang / items.prompt_lang, 0003).
alter table materials drop column if exists language;
