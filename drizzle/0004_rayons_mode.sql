-- Rayons des vêtements et des bijoux, ajoutés aux bases déjà en service (le catalogue de démonstration ne garnit qu'une base vide).
-- Ils sont placés après les rayons existants ; un rayon de même identifiant déjà présent n'est pas touché.
INSERT INTO "categories" ("slug", "name", "description", "family", "position")
SELECT v.slug, v.name, v.description, v.family, (SELECT coalesce(max("position"), -1) FROM "categories") + v.rank
FROM (VALUES
  ('hauts-chemises', 'Hauts & chemises', 'T-shirts, chemises, blouses et pulls.', 'vetements', 1),
  ('robes-jupes', 'Robes & jupes', 'Robes, jupes et ensembles.', 'vetements', 2),
  ('pantalons-shorts', 'Pantalons & shorts', 'Pantalons, jeans et shorts.', 'vetements', 3),
  ('vestes-manteaux', 'Vestes & manteaux', 'Vestes, blousons et manteaux.', 'vetements', 4),
  ('colliers', 'Colliers', 'Colliers et pendentifs.', 'bijoux', 5),
  ('bagues', 'Bagues', 'Bagues, à chaque taille de doigt.', 'bijoux', 6),
  ('bracelets', 'Bracelets', 'Bracelets et joncs.', 'bijoux', 7)
) AS v(slug, name, description, family, rank)
-- Seulement sur une base déjà garnie : sur une base neuve, le catalogue de démonstration crée ces rayons dans le bon ordre.
WHERE EXISTS (SELECT 1 FROM "categories")
ON CONFLICT ("slug") DO NOTHING;
