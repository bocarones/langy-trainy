-- FR⇄NL Dictionary – SQLite Schema
-- Raw entry preserves formatted output; metadata enables search & filter.

CREATE TABLE entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    raw          TEXT    NOT NULL,          -- the full formatted line as-is
    lemma        TEXT    NOT NULL,          -- bare headword, e.g. "nerf"
    word_type    TEXT    CHECK(word_type IN ('noun','verb','adjective','adverb','expression')),
    gender       TEXT    CHECK(gender IN ('m','f','m/f')),  -- nouns only
    register     TEXT,                      -- word-level label: fam, vulg, soutenu, lit, jur, rég, belg, …
    date_added   TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE INDEX idx_lemma     ON entries(lemma);
CREATE INDEX idx_word_type ON entries(word_type);
CREATE INDEX idx_register  ON entries(register);

-- Full-text search (FTS5) over lemma and raw entry
CREATE VIRTUAL TABLE entries_fts USING fts5(
    lemma,
    raw,
    content='entries',
    content_rowid='id'
);

-- Keep FTS in sync with entries
CREATE TRIGGER entries_fts_insert AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, lemma, raw) VALUES (new.id, new.lemma, new.raw);
END;

CREATE TRIGGER entries_fts_update AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, lemma, raw) VALUES ('delete', old.id, old.lemma, old.raw);
    INSERT INTO entries_fts(rowid, lemma, raw) VALUES (new.id, new.lemma, new.raw);
END;

CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, lemma, raw) VALUES ('delete', old.id, old.lemma, old.raw);
END;

-- Sample entries (one per type from pseudocode)

-- Noun, single sense
INSERT INTO entries (raw, lemma, word_type, gender) VALUES (
  'bibelot [m] - une étagère pleine de __s - chiner des __s aux puces / snuisterij, prulletje - een plank vol snuisterijen - prulletjes zoeken op de vlooienmarkt',
  'bibelot', 'noun', 'm'
);

-- Noun, multiple senses
INSERT INTO entries (raw, lemma, word_type, gender) VALUES (
  'nerf [m] - avoir les __s à fleur de peau - taper sur les __s de quelqu''un ** ce cheval a du __ / (zenuw, irritatie) - de zenuwen tot het uiterste gespannen - iemand op de zenuwen werken ** (pit, kracht) - dat paard heeft pit',
  'nerf', 'noun', 'm'
);

-- Verb, literal + figurative
INSERT INTO entries (raw, lemma, word_type) VALUES (
  'chavirer [v] - le bateau a chaviré ** son cœur a chaviré en la voyant / (kapseizen, omslaan) - de boot is gekapseisd ** (ontroerd raken) - zijn hart sloeg over toen hij haar zag',
  'chavirer', 'verb'
);

-- Adjective, single sense
INSERT INTO entries (raw, lemma, word_type) VALUES (
  'oisif [adj] - mener une vie __ - des mains oisives / lui, werkeloos - een lui leven leiden - handen die niets omhanden hebben',
  'oisif', 'adjective'
);

-- Adverb, register label at word level
INSERT INTO entries (raw, lemma, word_type, register) VALUES (
  'itou [adv] (fam) - moi __ - et toi __ / ook, insgelijks - ik ook - en jij dan',
  'itou', 'adverb', 'fam'
);

-- Noun, register label at word level
INSERT INTO entries (raw, lemma, word_type, gender, register) VALUES (
  'morpion [m] (fam) - attraper des __s ** cet insupportable petit __ / (schaamluis) - schaamluizen hebben ** (uk, joch) - dat vervelende kleine joch',
  'morpion', 'noun', 'm', 'fam'
);
