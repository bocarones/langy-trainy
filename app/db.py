import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'db', 'data.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS entries (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            raw            TEXT    NOT NULL,
            lemma          TEXT    NOT NULL,
            word_type      TEXT    CHECK(word_type IN ('noun','verb','adjective','adverb','expression')),
            gender         TEXT    CHECK(gender IN ('m','f','m/f')),
            register       TEXT,
            language       TEXT    NOT NULL DEFAULT 'Frans',
            category       TEXT,
            level          INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 5),
            favorite       INTEGER NOT NULL DEFAULT 0,
            times_tested   INTEGER NOT NULL DEFAULT 0,
            times_correct  INTEGER NOT NULL DEFAULT 0,
            date_added     TEXT    NOT NULL DEFAULT (date('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_lemma     ON entries(lemma);
        CREATE INDEX IF NOT EXISTS idx_word_type ON entries(word_type);
        CREATE INDEX IF NOT EXISTS idx_register  ON entries(register);
        CREATE INDEX IF NOT EXISTS idx_language  ON entries(language);
        CREATE INDEX IF NOT EXISTS idx_category  ON entries(category);
        CREATE INDEX IF NOT EXISTS idx_level     ON entries(level);

        CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
            lemma,
            raw,
            content='entries',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(rowid, lemma, raw) VALUES (new.id, new.lemma, new.raw);
        END;

        CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, lemma, raw) VALUES ('delete', old.id, old.lemma, old.raw);
            INSERT INTO entries_fts(rowid, lemma, raw) VALUES (new.id, new.lemma, new.raw);
        END;

        CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, lemma, raw) VALUES ('delete', old.id, old.lemma, old.raw);
        END;

        CREATE TABLE IF NOT EXISTS lessons (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            language    TEXT,
            category    TEXT,
            levels      TEXT    NOT NULL DEFAULT '1,2,3,4,5',
            amount      INTEGER NOT NULL DEFAULT 20,
            direction   TEXT    NOT NULL DEFAULT 'vocabulary' CHECK(direction IN ('vocabulary','translation','mixed')),
            repeat_all  INTEGER NOT NULL DEFAULT 0,
            date_added  TEXT    NOT NULL DEFAULT (date('now'))
        );
    """)

    # Migrate existing DB: add columns if they don't exist yet
    existing = {row[1] for row in conn.execute("PRAGMA table_info(entries)")}
    if 'times_tested' not in existing:
        conn.execute("ALTER TABLE entries ADD COLUMN times_tested INTEGER NOT NULL DEFAULT 0")
    if 'times_correct' not in existing:
        conn.execute("ALTER TABLE entries ADD COLUMN times_correct INTEGER NOT NULL DEFAULT 0")
    conn.commit()

    # Seed sample data if empty
    row = conn.execute("SELECT COUNT(*) as n FROM entries").fetchone()
    if row['n'] == 0:
        samples = [
            ("bibelot [m] - une étagère pleine de __s - chiner des __s aux puces / snuisterij, prulletje - een plank vol snuisterijen - prulletjes zoeken op de vlooienmarkt",
             "bibelot", "noun", "m", None, "Frans", None, 1),
            ("nerf [m] - avoir les __s à fleur de peau - taper sur les __s de quelqu'un ** ce cheval a du __ / (zenuw, irritatie) - de zenuwen tot het uiterste gespannen - iemand op de zenuwen werken ** (pit, kracht) - dat paard heeft pit",
             "nerf", "noun", "m", None, "Frans", None, 2),
            ("chavirer [v] - le bateau a chaviré ** son cœur a chaviré en la voyant / (kapseizen, omslaan) - de boot is gekapseisd ** (ontroerd raken) - zijn hart sloeg over toen hij haar zag",
             "chavirer", "verb", None, None, "Frans", None, 1),
            ("oisif [adj] - mener une vie __ - des mains oisives / lui, werkeloos - een lui leven leiden - handen die niets omhanden hebben",
             "oisif", "adjective", None, None, "Frans", "Amis", 3),
            ("itou [adv] (fam) - moi __ - et toi __ / ook, insgelijks - ik ook - en jij dan",
             "itou", "adverb", None, "fam", "Frans", "Amis", 2),
            ("morpion [m] (fam) - attraper des __s ** cet insupportable petit __ / (schaamluis) - schaamluizen hebben ** (uk, joch) - dat vervelende kleine joch",
             "morpion", "noun", "m", "fam", "Frans", None, 1),
            ("à la faveur de - il s'est enfui à la faveur de la nuit / (onder dekking van, dankzij) - hij is ontsnapt onder dekking van de nacht",
             "à la faveur de", "expression", None, None, "Frans", "Notes", 3),
            ("mourir à petit feu - dans la solitude - d'ennui / (langzaam sterven) - in eenzaamheid - van verveling",
             "mourir à petit feu", "expression", None, None, "Frans", "Notes", 2),
            ("bigarré [adj] - une ville bigarrée - un tapis __ / bontgekleurd, veelkleurig - een kleurrijke stad - een bont tapijt",
             "bigarré", "adjective", None, None, "Frans", "Ickabog", 4),
            ("accaparer [v] - le pouvoir - l'attention - son temps / in beslag nemen, accapareren - de macht - de aandacht - zijn tijd",
             "accaparer", "verb", None, None, "Frans", "Ickabog", 1),
        ]
        conn.executemany(
            "INSERT INTO entries (raw, lemma, word_type, gender, register, language, category, level) VALUES (?,?,?,?,?,?,?,?)",
            samples
        )

        lessons = [
            ("Train FR", "Frans", None, "1,2", 20, "vocabulary", 0),
            ("Train NL", "Frans", None, "3,4", 20, "translation", 0),
        ]
        conn.executemany(
            "INSERT INTO lessons (name, language, category, levels, amount, direction, repeat_all) VALUES (?,?,?,?,?,?,?)",
            lessons
        )

    conn.commit()
    conn.close()
