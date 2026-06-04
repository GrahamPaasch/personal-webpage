# Next Feature Phase: SessionMode-Aware Recommendations & Composition

## Problem Statement

Currently, the PatternPals recommendation engine operates independently of session mode. This causes mismatches:
- A **solo session** still filters patterns for 2+ jugglers and returns empty results
- A **duo session** with 1 participant tries to find patterns for group counts
- Recommendations don't scale patterns to match actual group size
- Composition plans don't account for movement restrictions or role-specific comfort levels

## Opportunities (Priority Order)

### Phase 5: Recommendations Respect SessionMode ⭐⭐⭐
**Impact:** Critical UX win—users see useful recommendations for their actual session type
- **Solo mode:** Recommend solo patterns from pattern library
- **Duo mode:** Recommend duo patterns OR adaptable group patterns with 2-person scaling
- **Group mode:** Current behavior (recommend for exact group size, or scalable group patterns)
- **Composability:** Handle patterns that scale (e.g., 4-person feed → 3-person with adaptation notes)

**Deliverables:**
- Extend `recommendGroupPatterns()` signature to accept `sessionMode: SessionMode`
- Add solo pattern recommendation logic (separate pathway through PATTERN_LIBRARY)
- Add duo pattern scaling logic (find scalable group patterns, compose for 2)
- Integrate into UI: wire `sessionForm.sessionMode` to recommendation engine
- Test: verify solo/duo/group modes all produce non-empty useful recommendations

**Estimated effort:** 2-3 slices (architecture + implementation + testing)

---

### Phase 6: Composition Scaling for Flexible Group Sizes ⭐⭐⭐
**Impact:** Recommendations remain valid as group composition changes
- Pattern variants: "4-3-3 feed" → "3-3 feed" without loss of quality
- Role assignments: "leads" vs "middle" vs "base" adapt to available jugglers
- Movement zones: respect movement comfort in position assignment
- Comfort feedback: "Alice prefers stationary → suggest passing to Bob"

**Deliverables:**
- Extend `buildPositionDifficulties()` to emit scalable position sets
- Add `ScalableCompositionPlan` type (base config + constraints + variants)
- Implement `scaleCompositionTo(plan, targetSize)` with adaptation notes
- Integrate: allow users to add/remove jugglers and recompose without pattern re-selection

**Estimated effort:** 3-4 slices (type design + scaling algorithms + UI)

---

### Phase 7: Roster Health Assessment ⭐⭐
**Impact:** Feedback loop—warn about unbalanced rosters before creating session
- Comfort distribution: "Everyone prefers stationary—patterns will be limited"
- Object compatibility: "All 4 jugglers only comfortable with 3 props—many patterns unavailable"
- Experience balance: "One advanced + 3 beginners—limited patterns with good challenge for all"
- Recommendations given constraints: "Recommend warm-ups first to build comfort"

**Deliverables:**
- Add `assessRosterHealth(group, patterns): RosterHealthAssessment` function
- Compute health score (0-100) and warning flags
- Display in UI: "⚠️ Low comfort diversity—recommend warm-up patterns"
- Link to pattern filters: suggest "line" patterns for low-comfort rosters

**Estimated effort:** 1-2 slices (analysis + display)

---

### Phase 8: Session Outcome Tracking & Learning Loop ⭐
**Impact:** Personalized recommendations based on what actually worked
- Store verdict on attempts: "Pattern succeeded / struggled / broke"
- Weight recommendations: boost patterns similar to successful ones, lower struggled ones
- Personalize: "Alice scored this 8/10 last session → recommend similar patterns"
- Trending: "Your group improved difficulty by 2 levels over 4 sessions"

**Deliverables:**
- Extend `PracticeAttemptEntry` to include user-submitted verdict (1-10 + feedback)
- Add `buildOutcomeWeighting(attempts): WeightMap` function
- Integrate into `recommendGroupPatterns()` scoring
- UI: outcome form after session (+ pattern feedback interface)

**Estimated effort:** 2-3 slices (verdict capture + weighting + UI)

---

## Recommended Starting Point: Phase 5 (Recommendations Respect SessionMode)

**Why first:**
- Unblocks all downstream phases (scaling, health, outcomes all depend on mode-aware recommendations)
- Directly improves user experience (users see useful patterns immediately)
- Builds on completed unification architecture (sessionMode is now canonical)
- Moderate complexity (can be done in 2-3 focused slices)

**User story:**
```
As a solo practice enthusiast, I want recommendations tailored to solo patterns
so that I see achievable, useful patterns instead of empty results.

As a duo group organizer, I want to see which group patterns I can adapt for 2 people
so I don't have to manually search for compatibility.
```

**Acceptance criteria:**
- [ ] Solo sessions show ≥3 solo patterns with scores
- [ ] Duo sessions show ≥3 patterns (duo + scalable groups)
- [ ] Group sessions show ≥5 patterns (current behavior)
- [ ] All recommendations sorted by match score (descending)
- [ ] No empty results for any valid group configuration
- [ ] Integration test verifies modes produce different recommendations

---

## Next Steps

1. **Slice 5A:** Analyze solo/duo patterns in PATTERN_LIBRARY (audit, count, difficulty distribution)
2. **Slice 5B:** Extend `recommendGroupPatterns()` with sessionMode branching + solo/duo pathways
3. **Slice 5C:** Integrate sessionMode into UI recommendation pipeline + test
4. **Slice 5D:** Validate all edge cases + write integration tests

---

## Non-Blockers (Can defer)
- Phase 6-8 can proceed in parallel once Phase 5 infrastructure is in place
- Existing recommendation scoring remains valid for group mode
- API is already session-mode aware (no backend work needed until Phase 8)
