import random
from flask import Blueprint, jsonify, request, render_template, abort
from .db import get_db

bp = Blueprint('main', __name__)


# ── HTML shell ────────────────────────────────────────────────────────────────

@bp.route('/')
def index():
    return render_template('index.html')


# ── Entries ───────────────────────────────────────────────────────────────────

@bp.route('/api/entries')
def list_entries():
    q        = request.args.get('q', '').strip()
    language = request.args.get('language', '')
    category = request.args.get('category', '')
    level    = request.args.get('level', '')
    favorite = request.args.get('favorite', '')
    page     = max(1, int(request.args.get('page', 1)))
    per_page = min(200, int(request.args.get('per_page', 50)))
    offset   = (page - 1) * per_page

    db = get_db()

    if q:
        q_fts = q.replace('"', '""')
        base_sql = """
            SELECT e.* FROM entries e
            JOIN entries_fts f ON f.rowid = e.id
            WHERE entries_fts MATCH ?
        """
        params = [f'"{q_fts}"*']
    else:
        base_sql = "SELECT * FROM entries WHERE 1=1"
        params = []

    if language:
        base_sql += " AND language = ?"
        params.append(language)
    if category == '__none__':
        base_sql += " AND (category IS NULL OR category = '')"
    elif category:
        base_sql += " AND category = ?"
        params.append(category)
    if level:
        levels = [int(x) for x in level.split(',') if x.strip().isdigit()]
        if levels:
            placeholders = ','.join('?' * len(levels))
            base_sql += f" AND level IN ({placeholders})"
            params.extend(levels)
    if favorite == '1':
        base_sql += " AND favorite = 1"

    count_sql = f"SELECT COUNT(*) as n FROM ({base_sql})"
    total = db.execute(count_sql, params).fetchone()['n']

    rows = db.execute(base_sql + " ORDER BY lemma COLLATE NOCASE LIMIT ? OFFSET ?",
                      params + [per_page, offset]).fetchall()
    db.close()

    return jsonify({
        'total': total,
        'page': page,
        'per_page': per_page,
        'items': [dict(r) for r in rows],
    })


@bp.route('/api/entries/<int:entry_id>')
def get_entry(entry_id):
    db = get_db()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    db.close()
    if not row:
        abort(404)
    return jsonify(dict(row))


@bp.route('/api/entries', methods=['POST'])
def create_entry():
    data = request.get_json(force=True)
    required = ('raw', 'lemma')
    if not all(data.get(k) for k in required):
        return jsonify({'error': 'raw and lemma are required'}), 400

    db = get_db()
    cur = db.execute(
        """INSERT INTO entries (raw, lemma, word_type, gender, register, language, category, level, favorite)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data['raw'], data['lemma'],
         data.get('word_type'), data.get('gender'), data.get('register'),
         data.get('language', 'Frans'), data.get('category'),
         int(data.get('level', 1)), int(data.get('favorite', 0)))
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return jsonify(dict(row)), 201


@bp.route('/api/entries/<int:entry_id>', methods=['PUT'])
def update_entry(entry_id):
    data = request.get_json(force=True)
    db = get_db()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if not row:
        db.close()
        abort(404)

    fields = {**dict(row), **{k: v for k, v in data.items()
                               if k in ('raw','lemma','word_type','gender','register',
                                        'language','category','level','favorite')}}
    db.execute(
        """UPDATE entries SET raw=?, lemma=?, word_type=?, gender=?, register=?,
           language=?, category=?, level=?, favorite=? WHERE id=?""",
        (fields['raw'], fields['lemma'], fields['word_type'], fields['gender'],
         fields['register'], fields['language'], fields['category'],
         int(fields['level']), int(fields['favorite']), entry_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    db.close()
    return jsonify(dict(row))


@bp.route('/api/entries/<int:entry_id>/answer', methods=['POST'])
def record_answer(entry_id):
    data = request.get_json(force=True)
    correct = bool(data.get('correct', False))

    db = get_db()
    row = db.execute("SELECT level, times_tested, times_correct FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if not row:
        db.close()
        abort(404)

    new_tested  = row['times_tested'] + 1
    new_correct = row['times_correct'] + (1 if correct else 0)
    new_level   = min(row['level'] + 1, 5) if correct else row['level']

    db.execute(
        "UPDATE entries SET times_tested=?, times_correct=?, level=? WHERE id=?",
        (new_tested, new_correct, new_level, entry_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    db.close()
    return jsonify(dict(row))


@bp.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    db = get_db()
    row = db.execute("SELECT id FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if not row:
        db.close()
        abort(404)
    db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    db.commit()
    db.close()
    return '', 204


# ── Languages & categories ────────────────────────────────────────────────────

@bp.route('/api/languages')
def list_languages():
    db = get_db()
    rows = db.execute("""
        SELECT language,
               COUNT(*) as total,
               SUM(favorite) as favorites
        FROM entries
        GROUP BY language
        ORDER BY language
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@bp.route('/api/categories')
def list_categories():
    language = request.args.get('language', '')
    db = get_db()
    sql = """
        SELECT COALESCE(NULLIF(category,''), '__none__') as category,
               COUNT(*) as total,
               SUM(favorite) as favorites
        FROM entries
        {}
        GROUP BY COALESCE(NULLIF(category,''), '__none__')
        ORDER BY category
    """
    if language:
        rows = db.execute(sql.format("WHERE language = ?"), (language,)).fetchall()
    else:
        rows = db.execute(sql.format(""), ()).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


# ── Import ────────────────────────────────────────────────────────────────────

@bp.route('/api/import', methods=['POST'])
def import_entries():
    data = request.get_json(force=True)
    lines    = data.get('lines', [])
    language = data.get('language', 'Frans')
    category = data.get('category', None)

    if not lines:
        return jsonify({'error': 'no lines provided'}), 400

    inserted = 0
    skipped  = 0
    db = get_db()

    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue

        # Parse lemma from raw: everything before first " [" or " /"
        lemma = raw.split(' [')[0].split(' /')[0].strip()
        if not lemma:
            skipped += 1
            continue

        # Detect word_type from tag
        word_type = None
        gender = None
        if '[m]' in raw or '[f]' in raw or '[m/f]' in raw:
            word_type = 'noun'
            if '[m]' in raw: gender = 'm'
            elif '[f]' in raw: gender = 'f'
            else: gender = 'm/f'
        elif '[v]' in raw:
            word_type = 'verb'
        elif '[adj]' in raw:
            word_type = 'adjective'
        elif '[adv]' in raw:
            word_type = 'adverb'
        elif '[expr]' in raw:
            word_type = 'expression'

        # Register from word-level (...)
        import re
        register = None
        m = re.search(r'\[(?:m|f|m/f|v|adj|adv|expr)\]\s*\((\w+)\)', raw)
        if m:
            register = m.group(1)

        db.execute(
            """INSERT INTO entries (raw, lemma, word_type, gender, register, language, category)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (raw, lemma, word_type, gender, register, language, category)
        )
        inserted += 1

    db.commit()
    db.close()
    return jsonify({'inserted': inserted, 'skipped': skipped})


# ── Lessons ───────────────────────────────────────────────────────────────────

@bp.route('/api/lessons')
def list_lessons():
    db = get_db()
    rows = db.execute("SELECT * FROM lessons ORDER BY name").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@bp.route('/api/lessons', methods=['POST'])
def create_lesson():
    data = request.get_json(force=True)
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    db = get_db()
    cur = db.execute(
        """INSERT INTO lessons (name, language, category, levels, amount, direction, repeat_all)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (data['name'], data.get('language'), data.get('category'),
         data.get('levels', '1,2,3,4,5'), int(data.get('amount', 20)),
         data.get('direction', 'vocabulary'), int(data.get('repeat_all', 0)))
    )
    db.commit()
    row = db.execute("SELECT * FROM lessons WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return jsonify(dict(row)), 201


@bp.route('/api/lessons/<int:lesson_id>', methods=['PUT'])
def update_lesson(lesson_id):
    data = request.get_json(force=True)
    db = get_db()
    row = db.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    if not row:
        db.close()
        abort(404)
    fields = {**dict(row), **{k: v for k, v in data.items()
                               if k in ('name','language','category','levels','amount','direction','repeat_all')}}
    db.execute(
        """UPDATE lessons SET name=?, language=?, category=?, levels=?, amount=?, direction=?, repeat_all=?
           WHERE id=?""",
        (fields['name'], fields['language'], fields['category'], fields['levels'],
         int(fields['amount']), fields['direction'], int(fields['repeat_all']), lesson_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    db.close()
    return jsonify(dict(row))


@bp.route('/api/lessons/<int:lesson_id>', methods=['DELETE'])
def delete_lesson(lesson_id):
    db = get_db()
    row = db.execute("SELECT id FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    if not row:
        db.close()
        abort(404)
    db.execute("DELETE FROM lessons WHERE id = ?", (lesson_id,))
    db.commit()
    db.close()
    return '', 204


@bp.route('/api/lessons/<int:lesson_id>/start')
def start_lesson(lesson_id):
    db = get_db()
    lesson = db.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    if not lesson:
        db.close()
        abort(404)
    lesson = dict(lesson)

    sql = "SELECT * FROM entries WHERE 1=1"
    params = []
    if lesson['language']:
        sql += " AND language = ?"
        params.append(lesson['language'])
    if lesson['category']:
        sql += " AND category = ?"
        params.append(lesson['category'])
    levels = [x.strip() for x in lesson['levels'].split(',') if x.strip().isdigit()]
    if levels:
        placeholders = ','.join('?' * len(levels))
        sql += f" AND level IN ({placeholders})"
        params.extend(levels)

    rows = db.execute(sql, params).fetchall()
    db.close()

    entries = [dict(r) for r in rows]
    random.shuffle(entries)
    amount = lesson['amount']
    if amount and amount < len(entries):
        entries = entries[:amount]

    direction = lesson['direction']
    words = []
    for e in entries:
        raw = e['raw']
        parts = raw.split(' / ', 1)
        fr_part = parts[0].strip() if parts else raw
        nl_part = parts[1].strip() if len(parts) > 1 else ''

        if direction == 'vocabulary':
            question, answer = fr_part, nl_part
        elif direction == 'translation':
            question, answer = nl_part, fr_part
        else:  # mixed
            if random.random() < 0.5:
                question, answer = fr_part, nl_part
            else:
                question, answer = nl_part, fr_part

        words.append({'id': e['id'], 'question': question, 'answer': answer})

    return jsonify({'lesson': lesson, 'words': words})
