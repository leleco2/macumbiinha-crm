-- Commerce Hub: CRM is the source of truth for the Pages storefront.
-- Idempotent additive schema; no destructive changes to existing operations.
CREATE TABLE IF NOT EXISTS catalog_listings (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 slug TEXT NOT NULL UNIQUE,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),
 image_url TEXT NOT NULL DEFAULT '',
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN(0,1)),
 for_wholesale INTEGER NOT NULL DEFAULT 0 CHECK(for_wholesale IN(0,1)),
 tags_json TEXT NOT NULL DEFAULT '[]',
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_visibility ON catalog_listings(published,featured);
CREATE TABLE IF NOT EXISTS product_media (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 850000),
 body BLOB NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoice_documents (
 id TEXT PRIMARY KEY,
 number TEXT NOT NULL DEFAULT '',
 supplier_name TEXT NOT NULL DEFAULT '',
 issue_date TEXT,
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 notes TEXT NOT NULL DEFAULT '',
 original_filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','application/xml')),
 file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 1000000),
 sha256 TEXT NOT NULL,
 uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoice_files (
 invoice_id TEXT PRIMARY KEY REFERENCES invoice_documents(id) ON DELETE CASCADE,
 body BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoice_documents(issue_date DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS site_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_settings(key,value) VALUES
 ('announcement','Macumbiinha · Varejo e atacado'),
 ('hero_title','Seu jeito mora nos detalhes.'),
 ('hero_subtitle','Explore nosso catálogo e consulte a disponibilidade atualizada diretamente no CRM.'),
 ('whatsapp','5521967199869');

-- Imported from the existing storefront. No invented prices or stock.
-- Visible as "sob consulta"; quantity starts at zero until verified by the merchant.
INSERT OR IGNORE INTO products(id,sku,name,category,description,cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,active) VALUES
 (lower(hex(randomblob(16))),'SEDA-SADHU-BLACK','Seda Sadhu Black Longa Large','sedas','Seda preta premium de alta qualidade, queima lenta e uniforme. Ideal para quem busca experiência diferenciada.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SEDA-OCB-BAMBOO','Seda OCB Bamboo Slim King Size','sedas','Feita com fibra de bambu, ultrafina e resistente. Uma das preferidas do mercado.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SEDA-ELEMENTS','Seda Elements King Size Slim','sedas','Clássica e confiável. Papel de arroz com queima perfeita.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'BLUNT-GROLLZ','Blunt Cone G-Rollz Organic','sedas','Cones pré-enrolados de alta qualidade, com design exclusivo.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SEDA-PAPELITO','Seda Papelito King Size Slim','sedas','Marca brasileira consolidada, excelente custo-benefício.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'PITEIRA-VIDRO-NONAME','Piteira de Vidro NoName Longa','piteiras','Piteira de vidro longa com designs variados (personagens, abstratos e full print).',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'PITEIRA-SADHU-MEGA','Piteira Sadhu Mega Large','piteiras','Piteira de papel extra longa, ideal para quem prefere filtro tradicional premium.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'PITEIRA-VIDRO-PARADIZE','Piteira de Vidro Paradize Longa','piteiras','Vidro de qualidade com bocal diferenciado e acabamento premium.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'PITEIRA-PAPELITO','Piteira Papelito Mega Longa Dupla','piteiras','Piteira dupla hiper longa, excelente para revenda.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'DICHAVADOR-4PARTES','Dichavador de Metal 4 Partes','dichavadores','Dichavador robusto de zinco/alumínio com 4 compartimentos e peneira.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'DICHAVADOR-ACRILICO','Dichavador de Acrílico 2 Partes','dichavadores','Modelo econômico e eficiente, ideal para uso diário e revenda.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'DICHAVADOR-ELETRONICO','Dichavador Elétrico','dichavadores','Praticidade máxima. Ideal para quem busca comodidade.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'ISQUEIRO-MACARICO','Isqueiro Maçarico Recarregável','isqueiros','Chama azul intensa, resistente ao vento e recarregável.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'ISQUEIRO-GTI','Isqueiro GTi Mini','isqueiros','Compacto, confiável e com ótimo custo para revenda.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'ISQUEIRO-SADHU','Isqueiro Maçarico Sadhu','isqueiros','Linha premium com design diferenciado e alta performance.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CASE-SADHU-SLIM','Case Impermeável Sadhu Slim','cases','Case resistente à água, perfeita para levar sedas e acessórios com segurança.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CASE-PUFF-LIFE','Case Puff Life Slim','cases','Design moderno e funcional, uma das mais pedidas.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CASE-TO-NA-BE','Case G To Na Bê','cases','Modelo versátil e com ótimo preço para revenda.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'KIT-COMPLETO','Kit Completão Case + Tesoura + Cuia','kits','Kit completo pronto para uso ou presente. Inclui case, tesoura e cuia.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'KIT-SPLIFF','Kit Spliff Sadhu (Seda + Piteira + Tesoura + Cuia)','kits','Tudo que você precisa em um único kit bem montado.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'KIT-TABACARIA','Kit Tabacaria Premier','kits','Seleção de itens essenciais para quem está montando a primeira sessão.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CUIA-SILICONE','Cuia de Silicone','acessorios','Resistente, fácil de limpar e disponível em várias cores.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CINZEIRO-SILICONE','Cinzeiro de Silicone','acessorios','Não queima, fácil de limpar e com designs modernos.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'BANDEJA-METAL','Bandeja de Metal','acessorios','Bandeja resistente com área para cigarro e designs exclusivos.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'TESOURA-METAL','Tesoura de Metal Dobrável','acessorios','Afiação precisa e design compacto. Essencial em qualquer kit.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SEDA-ZOMO-BROWN','Seda Zomo Brown King Size','sedas','Seda marrom natural de alta qualidade, queima lenta e sabor neutro.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SEDA-BEM-BOLADO','Seda Bem Bolado King Size Slim','sedas','Uma das marcas mais populares do Brasil. Excelente para revenda.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'PITEIRA-RAW','Piteira Pré-Enrolada RAW Masterpiece','piteiras','Piteiras pré-enroladas da marca RAW, prontas para uso.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'DICHAVADOR-BEM-BOLADO','Dichavador Bem Bolado 4 Partes','dichavadores','Dichavador de alumínio de alta qualidade com 4 partes e peneira fina.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'ISQUEIRO-RAW','Isqueiro RAW Phoenix','isqueiros','Isqueiro oficial da marca RAW, design exclusivo e confiável.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'CASE-SESSAOZADA','Case Sessãozada Classic','cases','Case clássico e resistente, perfeito para o dia a dia.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'KIT-ROSA','Kit Rosa Menininha','kits','Kit especial com visual rosa, ideal para presente.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'SLICK-SILICONE','Slick de Silicone 5ml / 10ml','acessorios','Container de silicone para extratos e concentrados. Diversas cores.',0,0,0,0,5,1),
 (lower(hex(randomblob(16))),'BOLADOR','Bolador de Cigarro','acessorios','Máquina para enrolar cigarros de forma rápida e uniforme.',0,0,0,0,5,1);

INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-sadhu-black',1,1,0,'["King Size","Premium","Black"]' FROM products WHERE sku='SEDA-SADHU-BLACK';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-ocb-bamboo',1,0,0,'["Orgânica","Slim","Bamboo"]' FROM products WHERE sku='SEDA-OCB-BAMBOO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-elements',1,0,0,'["Clássica","Slim"]' FROM products WHERE sku='SEDA-ELEMENTS';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'blunt-grollz',1,0,1,'["Pré-enrolado","Organic"]' FROM products WHERE sku='BLUNT-GROLLZ';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-papelito',1,0,1,'["Nacional","Slim"]' FROM products WHERE sku='SEDA-PAPELITO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'piteira-vidro-noname',1,1,0,'["Vidro","Longa","Decorada"]' FROM products WHERE sku='PITEIRA-VIDRO-NONAME';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'piteira-sadhu-mega',1,0,1,'["Papel","Mega Large"]' FROM products WHERE sku='PITEIRA-SADHU-MEGA';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'piteira-vidro-paradize',1,0,0,'["Vidro","Premium"]' FROM products WHERE sku='PITEIRA-VIDRO-PARADIZE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'piteira-papelito',1,0,1,'["Papel","Dupla","Longa"]' FROM products WHERE sku='PITEIRA-PAPELITO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'dichavador-4partes',1,1,0,'["Metal","4 Partes"]' FROM products WHERE sku='DICHAVADOR-4PARTES';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'dichavador-acrilico',1,0,1,'["Acrílico","Econômico"]' FROM products WHERE sku='DICHAVADOR-ACRILICO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'dichavador-eletronico',1,0,0,'["Elétrico","Prático"]' FROM products WHERE sku='DICHAVADOR-ELETRONICO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'isqueiro-macarico',1,1,0,'["Maçarico","Recarregável"]' FROM products WHERE sku='ISQUEIRO-MACARICO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'isqueiro-gti',1,0,1,'["Mini","Clássico"]' FROM products WHERE sku='ISQUEIRO-GTI';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'isqueiro-sadhu',1,0,0,'["Premium","Maçarico"]' FROM products WHERE sku='ISQUEIRO-SADHU';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'case-sadhu-slim',1,1,0,'["Impermeável","Slim"]' FROM products WHERE sku='CASE-SADHU-SLIM';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'case-puff-life',1,0,0,'["Premium","Funcional"]' FROM products WHERE sku='CASE-PUFF-LIFE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'case-to-na-be',1,0,1,'["Versátil"]' FROM products WHERE sku='CASE-TO-NA-BE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'kit-completo',1,1,0,'["Completo","Presente"]' FROM products WHERE sku='KIT-COMPLETO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'kit-spliff',1,0,1,'["Essencial"]' FROM products WHERE sku='KIT-SPLIFF';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'kit-tabacaria',1,0,0,'["Iniciante"]' FROM products WHERE sku='KIT-TABACARIA';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'cuia-silicone',1,0,0,'["Silicone","Prático"]' FROM products WHERE sku='CUIA-SILICONE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'cinzeiro-silicone',1,0,0,'["Silicone","Seguro"]' FROM products WHERE sku='CINZEIRO-SILICONE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'bandeja-metal',1,0,0,'["Metal","Prática"]' FROM products WHERE sku='BANDEJA-METAL';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'tesoura-metal',1,0,1,'["Metal","Dobrável"]' FROM products WHERE sku='TESOURA-METAL';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-zomo-brown',1,0,1,'["Brown","Natural","King Size"]' FROM products WHERE sku='SEDA-ZOMO-BROWN';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'seda-bem-bolado',1,0,1,'["Nacional","Slim","Popular"]' FROM products WHERE sku='SEDA-BEM-BOLADO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'piteira-raw',1,0,0,'["RAW","Pré-enrolada"]' FROM products WHERE sku='PITEIRA-RAW';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'dichavador-bem-bolado',1,1,0,'["Alumínio","4 Partes","Premium"]' FROM products WHERE sku='DICHAVADOR-BEM-BOLADO';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'isqueiro-raw',1,0,0,'["RAW","Exclusivo"]' FROM products WHERE sku='ISQUEIRO-RAW';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'case-sessaozada',1,0,0,'["Clássico","Resistente"]' FROM products WHERE sku='CASE-SESSAOZADA';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'kit-rosa',1,0,0,'["Presente","Especial"]' FROM products WHERE sku='KIT-ROSA';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'slick-silicone',1,0,1,'["Silicone","Container"]' FROM products WHERE sku='SLICK-SILICONE';
INSERT OR IGNORE INTO catalog_listings(product_id,slug,published,featured,for_wholesale,tags_json)
 SELECT id,'bolador',1,0,0,'["Prático","Utilidade"]' FROM products WHERE sku='BOLADOR';
