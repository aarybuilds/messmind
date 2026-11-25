// Degradation ladder from SRS table 3.1: which r, f, b to use for each student
// depending on how much history exists.

const STAGE1_MIN_SLOTS = 7; // completed slots before segment baselines are trusted
const STAGE2_MIN_OBS = 15; // observations before a student's own rates are used
const STAGE3_MIN_SLOTS = 90; // completed slots before the regression layer is trained
const MIN_GROUP_OBS = 3; // e.g. a student must have said "no" 3 times before their own flip rate counts
const PRIOR = 2; // pulls a small sample towards the segment rate

function clamp(p) {
  return Math.min(0.99, Math.max(0.01, p));
}

function globalStage(completedSlots) {
  if (completedSlots >= STAGE3_MIN_SLOTS) return 3;
  if (completedSlots >= STAGE1_MIN_SLOTS) return 1;
  return 0;
}

// attended / total, smoothed towards `fallback` when total is small
function smoothedRate(attended, total, fallback) {
  return clamp((attended + PRIOR * fallback) / (total + PRIOR));
}

// segment = { r, f, b } for this slot's meal type and day of week
// defaults = stage 0 institute-wide rates
function weightsFor(profile, segment, stage, defaults) {
  if (stage === 0 || !segment) {
    return { r: defaults.r, f: defaults.f, b: defaults.b, personal: false };
  }
  if (!profile || profile.sample_size < STAGE2_MIN_OBS) {
    return { ...segment, personal: false };
  }

  const r =
    profile.yes_total >= MIN_GROUP_OBS
      ? smoothedRate(profile.yes_attended, profile.yes_total, segment.r)
      : segment.r;
  const f =
    profile.no_total >= MIN_GROUP_OBS
      ? smoothedRate(profile.no_attended, profile.no_total, segment.f)
      : segment.f;

  // baseline: how this student compares to an average student in the same meals,
  // applied to this meal's segment rate (so breakfast still comes out lower)
  const b =
    profile.none_total >= MIN_GROUP_OBS
      ? clamp(segment.b * ((profile.none_attended + PRIOR) / (Number(profile.none_expected) + PRIOR)))
      : segment.b;

  return { r, f, b, personal: true };
}

// stage reported with a forecast
function forecastStage(stage, personalShare) {
  if (stage === 0) return 0;
  if (stage === 3) return 3;
  return personalShare >= 0.5 ? 2 : 1;
}

module.exports = {
  STAGE1_MIN_SLOTS,
  STAGE2_MIN_OBS,
  STAGE3_MIN_SLOTS,
  clamp,
  globalStage,
  smoothedRate,
  weightsFor,
  forecastStage,
};
