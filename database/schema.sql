-- MessMind database schema (PostgreSQL)
-- Follows the ER diagram in docs/SRS.md, section 5.4

DROP TABLE IF EXISTS dish_rate_history, waste_logs, check_ins, attendance_records, attendance_predictions,
    slot_dishes, meal_marks, dishes, meal_slots, reliability_profiles, settings, users CASCADE;
DROP TYPE IF EXISTS user_role, slot_type, slot_state, leftover_level CASCADE;

CREATE TYPE user_role AS ENUM ('student', 'staff', 'admin');
CREATE TYPE slot_type AS ENUM ('breakfast', 'lunch', 'dinner');
CREATE TYPE slot_state AS ENUM (
    'scheduled', 'marking_open', 'marking_closed', 'forecast',
    'in_service', 'staged_decision', 'completed', 'waste_logged', 'model_updated'
);
CREATE TYPE leftover_level AS ENUM ('empty', 'almost_empty', 'half_left', 'mostly_full');

CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role    NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- kept separate from users so recalibration never touches account rows (NFR-1)
CREATE TABLE reliability_profiles (
    profile_id        SERIAL PRIMARY KEY,
    user_id           INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    reliability_score DECIMAL(4,3),
    flip_rate         DECIMAL(4,3),
    baseline_rate     DECIMAL(4,3),
    yes_total         INT NOT NULL DEFAULT 0,
    yes_attended      INT NOT NULL DEFAULT 0,
    no_total          INT NOT NULL DEFAULT 0,
    no_attended       INT NOT NULL DEFAULT 0,
    none_total        INT NOT NULL DEFAULT 0,
    none_attended     INT NOT NULL DEFAULT 0,
    -- sum of segment baseline rates over the slots this student left undeclared,
    -- used to compare them with an average student in the same meals
    none_expected     DECIMAL(10,3) NOT NULL DEFAULT 0,
    sample_size       INT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE meal_slots (
    slot_id           SERIAL PRIMARY KEY,
    slot_date         DATE        NOT NULL,
    slot_type         slot_type   NOT NULL,
    marking_closes_at TIMESTAMPTZ NOT NULL,
    service_starts_at TIMESTAMPTZ NOT NULL,
    service_ends_at   TIMESTAMPTZ NOT NULL,
    state             slot_state  NOT NULL DEFAULT 'scheduled',
    recalibrated_at   TIMESTAMPTZ,
    UNIQUE (slot_date, slot_type)
);

CREATE TABLE dishes (
    dish_id          SERIAL PRIMARY KEY,
    name             VARCHAR(80)  NOT NULL UNIQUE,
    unit             VARCHAR(10)  NOT NULL,  -- kg or L
    consumption_rate DECIMAL(6,3) NOT NULL   -- per head
);

-- which dishes are served in a slot, and the plan the kitchen was given
CREATE TABLE slot_dishes (
    slot_id             INT NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    dish_id             INT NOT NULL REFERENCES dishes(dish_id),
    recommended_qty     DECIMAL(8,2),
    first_batch_qty     DECIMAL(8,2),
    held_back_share     DECIMAL(3,2),  -- 0 = held, 1 = all cooked, between = part (null = not decided)
    PRIMARY KEY (slot_id, dish_id)
);

CREATE TABLE meal_marks (
    mark_id       SERIAL PRIMARY KEY,
    user_id       INT     NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    slot_id       INT     NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    intent_to_eat BOOLEAN NOT NULL,
    marked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, slot_id)
);

-- who actually ate (mess card / register). Used only for recalibration.
CREATE TABLE attendance_records (
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    slot_id INT NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, slot_id)
);

CREATE TABLE attendance_predictions (
    prediction_id       SERIAL PRIMARY KEY,
    slot_id             INT NOT NULL UNIQUE REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    stage               INT NOT NULL,
    yes_count           INT NOT NULL,
    no_count            INT NOT NULL,
    none_count          INT NOT NULL,
    yes_part            DECIMAL(8,2) NOT NULL,
    no_part             DECIMAL(8,2) NOT NULL,
    none_part           DECIMAL(8,2) NOT NULL,
    rule_based_estimate DECIMAL(8,2) NOT NULL,
    ml_estimate         DECIMAL(8,2),
    safety_buffer       DECIMAL(4,3) NOT NULL,
    recommended_qty     DECIMAL(8,2) NOT NULL,  -- buffered headcount
    actual_attendance   INT,
    forecast_error      DECIMAL(6,4),
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE check_ins (
    checkin_id SERIAL PRIMARY KEY,
    slot_id    INT NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    count      INT NOT NULL CHECK (count >= 0)  -- cumulative
);

CREATE TABLE waste_logs (
    waste_id       SERIAL PRIMARY KEY,
    slot_id        INT NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    dish_id        INT NOT NULL REFERENCES dishes(dish_id),
    leftover_level leftover_level NOT NULL,
    logged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (slot_id, dish_id)
);

-- every change the waste loop makes to a dish's per-head rate (FR-20)
CREATE TABLE dish_rate_history (
    history_id    SERIAL PRIMARY KEY,
    dish_id       INT NOT NULL REFERENCES dishes(dish_id),
    slot_id       INT NOT NULL REFERENCES meal_slots(slot_id) ON DELETE CASCADE,
    old_rate      DECIMAL(6,3) NOT NULL,
    observed_rate DECIMAL(6,3) NOT NULL,
    new_rate      DECIMAL(6,3) NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tunable parameters (FR-24)
CREATE TABLE settings (
    key   VARCHAR(40) PRIMARY KEY,
    value DECIMAL(6,3) NOT NULL
);

INSERT INTO settings (key, value) VALUES
    ('safety_buffer', 0.08),
    ('first_batch_split', 0.75),
    ('flat_attendance_rate', 0.65),  -- stage 0 baseline
    ('default_reliability', 0.90),   -- stage 0 weight for "eating"
    ('default_flip_rate', 0.10),     -- stage 0 weight for "not eating"
    ('reminder_hours', 3);

CREATE INDEX idx_marks_slot ON meal_marks(slot_id);
CREATE INDEX idx_attendance_slot ON attendance_records(slot_id);
CREATE INDEX idx_checkins_slot ON check_ins(slot_id);
