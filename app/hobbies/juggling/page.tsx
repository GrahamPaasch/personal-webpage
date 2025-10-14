export const metadata = {
  title: 'Juggling',
  description: 'Member of the Texas Juggling Society.',
};

export default function JugglingPage() {
  return (
    <article className="card prose">
      <h1>Juggling</h1>
      <p>
        I’m a core member of the Texas Juggling Society—our practices at{' '}
        <a href="http://www.juggling.place.org/" target="_blank" rel="noreferrer">
          juggling.place.org
        </a>{' '}
        keep me grounded. Juggling sharpens focus, encourages play, and is best with friends.
      </p>
      <p>
        Before moving to Texas I trained almost every day with the{' '}
        <a href="https://madjugglers.com/" target="_blank" rel="noreferrer">
          Madison Area Jugglers
        </a>
        , the club where the idea for{' '}
        <a href="https://madisoncircusspace.com/" target="_blank" rel="noreferrer">
          Madison Circus Space
        </a>{' '}
        was born. I volunteered during the early construction, practiced in the original space five
        or more times a week, and watched the community change lives—including my own. Regular
        juggling practice helped me move past a difficult chapter with Bipolar I; it gave me rhythm,
        agency, and a reason to keep showing up.
      </p>
      <p>
        Wherever you are, I encourage you to visit a local juggling or circus arts club. A few good
        starting points:
      </p>
      <ul>
        <li>
          <a href="https://www.txjuggling.com/" target="_blank" rel="noreferrer">
            Texas Juggling Society (Austin, TX)
          </a>{' '}
          — weekly jams open to all skill levels.
        </li>
        <li>
          <a href="https://madisoncircusspace.com/classes/" target="_blank" rel="noreferrer">
            Madison Circus Space classes and jams
          </a>{' '}
          — a member-funded hub for circus and movement arts.
        </li>
        <li>
          <a href="https://www.madjugglers.com/calendar" target="_blank" rel="noreferrer">
            Madison Area Jugglers practice calendar
          </a>{' '}
          — the meet-up that sparked MCS.
        </li>
      </ul>
      <p>
        If you’re in Austin and curious, come toss a few. If you’re elsewhere, seek out the nearest
        juggling community—you might be surprised by what you find.
      </p>
    </article>
  );
}
