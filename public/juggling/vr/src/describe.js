/**
 * describe.js: the words. What is being shown for a pattern, which numbers are exact, and what
 * the math does not cover. Pure (no DOM), so the wording is unit tested and shared by the on-page
 * panel and the control board inside VR.
 */

import { SOURCE_LABELS, printsAs } from './physics.js';

/** "0.5x". Any speed other than real time is always labelled on screen. */
export function formatSpeed(speed) {
  return (Math.round(speed * 100) / 100).toString() + 'x';
}

export const fmt = {
  seconds: (s) => s.toFixed(3) + ' s',
  metres: (m) => (m < 0.995 ? (m * 100).toFixed(1) + ' cm' : m.toFixed(2) + ' m'),
  cm: (m) => (m * 100).toFixed(1) + ' cm',
  degrees: (d) => d.toFixed(2) + '°',
};

/** How many decimals a number was printed with ("0.23" has two). */
function decimalsOf(text) {
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * A length as its source prints it ("0.23", in metres), shown in this page's units without
 * adding or losing precision: centimetres, or metres when `metres` is set and it is a metre or more.
 */
function printedLength(text, metres) {
  if (metres && Number(text) >= 0.995) return text + ' m';
  return (Number(text) * 100).toFixed(Math.max(decimalsOf(text) - 2, 0)) + ' cm';
}

/**
 * Words for one pattern: what is shown, what is exact, what is not covered. Shared with VR.
 *
 * `rows` is a table. For a uniform pattern with a published row it has three columns: the
 * quantity, the value computed here, and the value its source prints (`header` names the source),
 * so that every difference between the two is in plain sight.
 */
export function describePattern(pattern, collisions) {
  const D = pattern.ballDiameter;
  if (pattern.uniform) {
    const u = pattern.spatial;
    const name = pattern.balls + '-ball ' + u.kind;
    const measured = u.source === 'K96m';
    const unchecked = u.source === 'KL18s';
    const extrapolated = u.source === 'extrapolated';
    const checked = u.source === 'KL18' || measured;
    const p = u.printed;

    let tag = "Kalvan's spatial optimum";
    if (extrapolated) tag = 'No published values: ' + u.source;
    else if (measured) tag = "Kalvan's measured " + u.kind + (u.kind === 'fountain' ? ', hand spacing assumed' : '');
    else if (u.kind === 'fountain') tag = "Kalvan's optimum, hand spacing assumed";
    if (unchecked) tag += ', table row unchecked';

    // [quantity, computed here, printed by the source]. The third cell is dropped below when
    // there is no source to compare with.
    const rows = [
      ['Hand period T', u.T.toFixed(2) + ' s', u.T.toFixed(2) + ' s'],
      [
        'Dwell ratio r',
        u.dwellRatio.toFixed(2) + ' (W = ' + u.W.toFixed(2) + ')',
        measured ? 'about ' + u.dwellRatio.toFixed(2) : 'W = ' + u.W.toFixed(1),
      ],
      ['Flight time f', fmt.seconds(u.flight), ''],
      ['Height above the hands H', fmt.metres(u.H), p && p.H ? printedLength(p.H, true) : ''],
      ['Flight distance F', fmt.cm(u.F), printedLength(u.F.toFixed(2))],
      ['Spacing on one arc D1', u.D1 === null ? 'none (W < 1)' : fmt.cm(u.D1), p && p.D1 ? printedLength(p.D1) : ''],
      [
        u.kind === 'cascade' ? 'Arc separation P' : 'Between the hands P',
        fmt.cm(u.P),
        p && p.P ? printedLength(p.P) : u.D1 === null ? printedLength(u.P.toFixed(2)) + ' (his E)' : '',
      ],
      ['Pattern width F + P', fmt.cm(u.width), p && p.width ? printedLength(p.width) : ''],
      ['Throw error allowed Emax', u.emaxDeg === null ? 'not defined' : fmt.degrees(u.emaxDeg), p && p.emaxDeg ? p.emaxDeg + '°' : ''],
      ['Closest two balls come', fmt.cm(collisions.minDistance), ''],
    ];
    let header = null;
    if (p) header = ['', 'Here', measured ? 'Measured' : unchecked ? 'Snippet' : 'Book'];
    else for (const row of rows) row.length = 2;

    const notes = [];
    if (u.source === 'KL18') {
      notes.push('T and F are from Kalvan and Lewbel’s table of good patterns (the row quoted in juggling_coach). Everything else follows from the formulas, with real gravity.');
    } else if (unchecked) {
      notes.push('Careful: T and F, and the Snippet column, were read from search snippets of Kalvan and Lewbel’s table of good patterns. They have not been checked against the book itself yet. Everything else follows from the formulas, with real gravity.');
    } else if (measured) {
      notes.push('T, F and the dwell ratio r are Kalvan’s measurements of his own pattern, juggled with 7.5 cm balls (the balls here are 6 cm). Everything else follows from the formulas, with real gravity.');
    } else {
      notes.push('Careful: ' + SOURCE_LABELS[u.source] + '.');
    }
    if (p) {
      // Say where the computed numbers and the printed ones part company, and do not guess why.
      const off = [];
      if (p.H && !printsAs(u.H, p.H)) off.push('H');
      if (p.D1 && u.D1 !== null && !printsAs(u.D1, p.D1)) off.push('D1');
      if (p.P && !printsAs(u.P, p.P)) off.push('P');
      if (p.width && !printsAs(u.width, p.width)) off.push('the width');
      if (p.emaxDeg && u.emaxDeg !== null && !printsAs(u.emaxDeg, p.emaxDeg)) off.push('Emax');
      if (measured && off.length) {
        notes.push(
          'Kalvan measured his peak at ' + printedLength(p.H, true) + (u.kind === 'cascade' ? ' above his throw point' : '') + '. The formula H = g f²/8 gives ' +
            fmt.metres(u.H) + ' from his tempo and dwell ratio, with throws and catches at one height (assumption A6 in the notes).'
        );
      } else if (off.length) {
        notes.push(
          'Not reproduced at the printed precision: ' + off.join(', ') + '. ' +
            (off.indexOf('P') >= 0 ? 'P here is Kalvan’s formula for equal clearance at the crossing and on the arc (D2 = D1), applied to the printed T and F. ' : '') +
            (unchecked ? 'The row is unchecked, so a misread snippet is possible; otherwise the cause is not known.' : 'Why the book’s figures differ is not known; see the notes.')
        );
      }
    }
    if (u.D1 === null) {
      notes.push('With 3 balls there is less than one ball in the air per hand, so balls on the same arc never meet. Kalvan’s arc spacing and error limit do not exist here; the arc separation is set by the hand travel E he measured.');
    }
    if (u.kind === 'fountain') {
      notes.push('Kalvan’s math fixes each hand’s arc but not the gap between the hands: he only says the hands stay on their own side of the centre line (width over ' + fmt.cm(2 * u.F) + ' here). The two inside throw points are drawn one D1 apart: our assumption, not his.');
    }
    return {
      title: name,
      short: name,
      tag,
      tagClass: checked ? '' : 'mixed',
      rows,
      header,
      tableClass: header ? 'compare' : '',
      notes,
      collision: null,
      vrStatus: tag,
      vrStatusKind: checked ? 'good' : 'plain',
    };
  }

  const ref = pattern.reference;
  const thrown = pattern.throwTable.filter((t) => t.type !== 'empty' && t.type !== 'hold');
  const pass = pattern.throwTable.find((t) => t.type === 'pass');
  const rows = pattern.throwTable.map((t) => {
    if (t.type === 'empty') return ['0', 'empty hand', ''];
    if (t.type === 'hold') return ['2', 'held', ''];
    return [t.value.toString(36), fmt.seconds(t.flight), fmt.metres(t.height) + (t.type === 'pass' ? ' (handed across ' + fmt.cm(t.distance) + ')' : '')];
  });
  const refName = ref.balls + '-ball ' + ref.kind;
  const notes = [];
  if (thrown.length > 0) {
    notes.push('Flight times and heights are exact (beat ' + pattern.beat.toFixed(3) + ' s, dwell ratio ' + pattern.dwellRatio.toFixed(2) + ', real gravity).');
  } else {
    notes.push('Nothing is thrown in this pattern: a 2 is a ball held in the hand' + (pattern.throws.indexOf(0) >= 0 ? ', and a 0 is an empty hand.' : '.'));
  }
  if (pass) {
    notes.push(
      'A 1 is handed straight across: the hands meet in the middle and the ball crosses the centre line by its own width (' + fmt.cm(pass.distance) + ' at ' +
        pass.speed.toFixed(1) + ' m/s), in ' + (1 - pattern.dwellRatio).toFixed(2) + ' of a beat. That is this page’s convention, not part of Kalvan’s math.'
    );
  }
  notes.push(
    'The spatial optimum is only derived for uniform cascades and fountains. This pattern borrows the hand positions and tempo of Kalvan’s ' + refName +
      // Only a pattern that really throws that high has "that throw" in it.
      (pattern.maxThrow >= 3 ? ', so its highest throw is exactly that throw.' : '.')
  );
  if (ref.source === 'KL18s') {
    notes.push('Careful: the tempo and width of that ' + refName + ' were read from search snippets of the book’s table and are not yet checked against the book.');
  } else if (ref.source === 'extrapolated') {
    notes.push('Careful: there are no published values for a ' + refName + ', so its tempo and spacing are ' + ref.source + '.');
  }
  let collision;
  let vrStatus = 'exact timing, standard layout';
  let vrStatusKind = 'plain';
  if (collisions.collides) {
    const hit = collisions.hits[0];
    collision = {
      bad: true,
      text:
        'Balls would collide on this layout: the ' + hit.first.value.toString(36) + ' and the ' + hit.second.value.toString(36) +
        ' pass ' + fmt.cm(hit.distance) + ' apart (centres), closer than one ' + fmt.cm(D) + ' ball. Red rings mark where. Throwing one of them outside fixes it; that is planned for version 2.',
      short: 'Balls would collide: the ' + hit.first.value.toString(36) + ' and the ' + hit.second.value.toString(36) + ' pass ' + fmt.cm(hit.distance) + ' apart.',
    };
    vrStatus = 'COLLISION: ' + hit.first.value.toString(36) + ' hits ' + hit.second.value.toString(36);
    vrStatusKind = 'warn';
  } else if (collisions.closest) {
    collision = {
      bad: false,
      text: 'No collisions: balls never come closer than ' + fmt.cm(collisions.minDistance) + ' (centres; the ball is ' + fmt.cm(D) + ').',
    };
  } else {
    collision = { bad: false, text: 'No collisions: there are never two balls in the air together.' };
  }
  return {
    title: pattern.text + ' · ' + pattern.balls + (pattern.balls === 1 ? ' ball' : ' balls'),
    short: pattern.text,
    tag: 'Exact timing, standard layout',
    tagClass: 'mixed',
    rows,
    header: ['Throw', 'Flight', 'Height above the hands'],
    tableClass: '',
    notes,
    collision,
    vrStatus,
    vrStatusKind,
  };
}
